import { createRequestId } from "../../utils/requestId";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import api from "../../services/api";
import {
  useInventory,
  inventoryApi,
  quantity,
  currency,
  dateTime,
  errorMessage,
  downloadCSV,
} from "./data";
import { Header, Field, Dialog, Table, Notice } from "./shared";
import type { Movement } from "./types";
const actionName = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const columns = [
  "Date (Manila)",
  "Supply / menu",
  "Batch",
  "Action",
  "Quantity",
  "Unit",
  "On hand change",
  "Reserved change",
  "On hand after",
  "Reserved after",
  "Reason",
  "Order",
  "Recorded by",
];
const movementRows = (rows: Movement[]) =>
  rows.map((row) => [
    dateTime(row.createdAt),
    row.item?.name || row.menuItem?.name || "",
    row.batch?.code || "",
    actionName(row.action),
    row.quantity,
    row.unit,
    row.onHandDelta,
    row.reservedDelta,
    row.onHandAfter,
    row.reservedAfter,
    row.reason,
    row.order?.orderNumber || "",
    row.user.name,
  ]);
async function fetchAllMovements(params: Record<string, string>) {
  let offset = 0,
    total = 1;
  const rows: Movement[] = [];
  while (offset < total) {
    const result = await api.get(inventoryApi("movements"), {
      params: { ...params, limit: 200, offset },
    });
    rows.push(...result.data.rows);
    total = result.data.total;
    offset += result.data.rows.length;
    if (!result.data.rows.length) break;
  }
  return rows;
}
export function Movements() {
  const { items, menu } = useInventory(),
    { user } = useAuth();
  const [filters, setFilters] = useState({
      from: "",
      to: "",
      action: "",
      stockItemId: "",
      menuItemId: "",
    }),
    [page, setPage] = useState(0),
    [rows, setRows] = useState<Movement[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reverse, setReverse] = useState<Movement | null>(null),
    [reason, setReason] = useState(""),
    [requestId, setRequestId] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api.get(inventoryApi("movements"), {
        params: { ...filters, limit: 30, offset: page * 30 },
      });
      setRows(result.data.rows);
      setTotal(result.data.total);
      setError("");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [filters, page]);
  useEffect(() => {
    void load();
  }, [load]);
  const change = (key: keyof typeof filters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(0);
  };
  return (
    <div className="inv-page">
      <Header
        title="Movement history"
        description="Every stock change records its quantity, reason, user and resulting balance."
      >
        <button onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              downloadCSV(
                "japz-stock-movements.csv",
                columns,
                movementRows(await fetchAllMovements(filters)),
              );
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          Export CSV
        </button>
      </Header>
      {error && <Notice error>{error}</Notice>}
      <section className="inv-panel">
        <div className="inv-toolbar">
          <Field label="From">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => change("from", e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={filters.to}
              onChange={(e) => change("to", e.target.value)}
            />
          </Field>
          <Field label="Supply">
            <select
              value={filters.stockItemId}
              onChange={(e) => change("stockItemId", e.target.value)}
            >
              <option value="">All supplies</option>
              {items.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Menu">
            <select
              value={filters.menuItemId}
              onChange={(e) => change("menuItemId", e.target.value)}
            >
              <option value="">All menu items</option>
              {menu.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Action">
            <select
              value={filters.action}
              onChange={(e) => change("action", e.target.value)}
            >
              <option value="">All movements</option>
              {[
                "receive",
                "reserve",
                "consume",
                "release",
                "count",
                "waste",
                "supplier_return",
                "reversal",
                "hold",
                "unhold",
              ].map((action) => (
                <option value={action} key={action}>
                  {actionName(action)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Table
          rows={rows}
          rowKey={(row) => row.id}
          empty={busy ? "Loading movements…" : "No stock movements recorded"}
          columns={[
            {
              title: "Supply / menu",
              render: (row) => (
                <div>
                  <strong>{row.item?.name || row.menuItem?.name}</strong>
                  <small>
                    {row.batch?.code || "Prepared stock"}
                    {row.order ? ` · ${row.order.orderNumber}` : ""}
                  </small>
                </div>
              ),
            },
            {
              title: "Action",
              render: (row) => (
                <div>
                  {actionName(row.action)}
                  <small>
                    {quantity(row.quantity)} {row.unit}
                  </small>
                </div>
              ),
            },
            {
              title: "Balance change",
              render: (row) => (
                <div>
                  {Number(row.onHandDelta) > 0 ? "+" : ""}
                  {quantity(row.onHandDelta)} {row.unit}
                  <small>
                    Reserved {Number(row.reservedDelta) > 0 ? "+" : ""}
                    {quantity(row.reservedDelta)}
                  </small>
                </div>
              ),
            },
            {
              title: "Balance after",
              render: (row) => (
                <div>
                  {quantity(row.onHandAfter)} {row.unit}
                  <small>{quantity(row.reservedAfter)} reserved</small>
                </div>
              ),
            },
            {
              title: "Reason / by",
              render: (row) => (
                <div>
                  {row.reason}
                  <small>
                    {row.user.name} · {dateTime(row.createdAt)}
                  </small>
                </div>
              ),
            },
            {
              title: "Correction",
              render: (row) =>
                user?.role === "admin" &&
                ["receive", "count", "waste", "supplier_return"].includes(
                  row.action,
                ) &&
                Number(row.onHandDelta) !== 0 ? (
                  <button
                    onClick={() => {
                      setReverse(row);
                      setReason("");
                      setRequestId(createRequestId());
                    }}
                  >
                    Reverse
                  </button>
                ) : (
                  "—"
                ),
            },
          ]}
        />
        <div className="inv-pagination">
          <span>{total} movements</span>
          <div>
            <button
              disabled={page === 0 || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(total / 30))}
            </span>
            <button
              disabled={(page + 1) * 30 >= total || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {reverse && (
        <Dialog
          title="Reverse stock movement"
          description="Admin correction creates a new movement. The original record stays in history."
          onClose={() => setReverse(null)}
          onSubmit={async () => {
            await api.post(inventoryApi(`movements/${reverse.id}/reverse`), {
              requestId,
              reason,
            });
            await load();
            setReverse(null);
          }}
          submitLabel="Record reversal"
        >
          <p className="inv-recipe-note">
            {reverse.item?.name || reverse.menuItem?.name} ·{" "}
            {actionName(reverse.action)} · {quantity(reverse.onHandDelta)}{" "}
            {reverse.unit}
          </p>
          <Field label="Correction reason">
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </Dialog>
      )}
    </div>
  );
}
export function Reports() {
  const { items, menu, summary } = useInventory();
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [movements, setMovements] = useState<Movement[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false);
  const active = items.filter((item) => !item.archived);
  const prepared = menu.filter(
    (item) => !item.archived && item.inventoryMode === "prepared",
  );
  const usage = items
    .map((item) => {
      const own = movements.filter((row) => row.item?.id === item.id);
      return {
        item,
        consumed: own
          .filter((row) => row.action === "consume")
          .reduce((sum, row) => sum + Number(row.quantity), 0),
        waste: own
          .filter((row) => row.action === "waste")
          .reduce((sum, row) => sum + Number(row.quantity), 0),
        returns: own
          .filter((row) => row.action === "supplier_return")
          .reduce((sum, row) => sum + Number(row.quantity), 0),
      };
    })
    .filter((row) => row.consumed || row.waste || row.returns);
  const stockRows = active.map((item) => [
    item.code,
    item.name,
    item.kind,
    item.unit,
    item.onHand,
    item.reserved,
    item.available,
    item.unusable,
    item.reorderLevel,
    item.location || "",
    item.batches.reduce(
      (sum, batch) => sum + Number(batch.onHand) * Number(batch.unitCost),
      0,
    ),
  ]);
  return (
    <div className="inv-page">
      <Header
        title="Inventory reports"
        description="Current stock value and recorded usage by supply. Exports keep quantities in each item’s base unit."
      >
        <button
          onClick={() =>
            downloadCSV(
              "japz-current-stock.csv",
              [
                "Code",
                "Item",
                "Type",
                "Unit",
                "On hand",
                "Reserved",
                "Available",
                "Expired or held",
                "Reorder level",
                "Location",
                "Value PHP",
              ],
              stockRows,
            )
          }
        >
          Export current stock
        </button>
      </Header>
      <div className="inv-stats">
        <div className="inv-stat">
          <span>Recorded stock value</span>
          <strong style={{ fontSize: 24 }}>
            {currency(summary?.stockValue || 0)}
          </strong>
        </div>
        <div className="inv-stat">
          <span>Supply items</span>
          <strong>{active.length}</strong>
        </div>
        <div className="inv-stat">
          <span>Low or out of stock</span>
          <strong>
            {summary ? summary.low.length + summary.out.length : "—"}
          </strong>
        </div>
        <div className="inv-stat">
          <span>Expiring or expired batches</span>
          <strong>{summary?.expiring.length ?? "—"}</strong>
        </div>
      </div>
      <section className="inv-panel">
        <div className="inv-panel-heading">
          <h2>Current balances</h2>
        </div>
        <Table
          rows={active}
          rowKey={(item) => item.id}
          empty="Add supplies to generate stock reports"
          columns={[
            {
              title: "Supply",
              render: (item) => (
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.code}</small>
                </div>
              ),
            },
            {
              title: "On hand",
              render: (item) => `${quantity(item.onHand)} ${item.unit}`,
            },
            {
              title: "Available",
              render: (item) => `${quantity(item.available)} ${item.unit}`,
            },
            {
              title: "Expired / held",
              render: (item) => `${quantity(item.unusable)} ${item.unit}`,
            },
            {
              title: "Recorded value",
              render: (item) =>
                currency(
                  item.batches.reduce(
                    (sum, batch) =>
                      sum + Number(batch.onHand) * Number(batch.unitCost),
                    0,
                  ),
                ),
            },
          ]}
        />
      </section>
      <section className="inv-panel">
        <div className="inv-panel-heading">
          <h2>Prepared stock balances</h2>
          <button
            onClick={() =>
              downloadCSV(
                "japz-prepared-stock.csv",
                [
                  "Menu item",
                  "On hand pcs",
                  "Reserved pcs",
                  "Available pcs",
                  "Reorder level pcs",
                ],
                prepared.map((item) => [
                  item.name,
                  item.onHand,
                  item.reservedStock,
                  Math.max(0, item.onHand - item.reservedStock),
                  item.reorderLevel,
                ]),
              )
            }
          >
            Export prepared stock
          </button>
        </div>
        <Table
          rows={prepared}
          rowKey={(item) => item.id}
          empty="No prepared menu items"
          columns={[
            { title: "Menu item", render: (item) => item.name },
            { title: "On hand", render: (item) => `${item.onHand} pcs` },
            {
              title: "Reserved",
              render: (item) => `${item.reservedStock} pcs`,
            },
            {
              title: "Available",
              render: (item) =>
                `${Math.max(0, item.onHand - item.reservedStock)} pcs`,
            },
            {
              title: "Reorder level",
              render: (item) => `${item.reorderLevel} pcs`,
            },
          ]}
        />
      </section>
      <section className="inv-panel">
        <div className="inv-panel-heading">
          <h2>Usage, waste & returns</h2>
        </div>
        <div className="inv-toolbar">
          <Field label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setLoaded(false);
              }}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setLoaded(false);
              }}
            />
          </Field>
          <button
            className="inv-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setMovements(await fetchAllMovements({ from, to }));
                setLoaded(true);
                setError("");
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Loading…" : "Generate report"}
          </button>
          {loaded && (
            <button
              onClick={() =>
                downloadCSV(
                  "japz-inventory-usage.csv",
                  [
                    "Supply",
                    "Unit",
                    "Consumed",
                    "Waste recorded",
                    "Supplier returns",
                  ],
                  usage.map((row) => [
                    row.item.name,
                    row.item.unit,
                    row.consumed,
                    row.waste,
                    row.returns,
                  ]),
                )
              }
            >
              Export usage CSV
            </button>
          )}
        </div>
        {error && <Notice error>{error}</Notice>}
        {loaded ? (
          <Table
            rows={usage}
            rowKey={(row) => row.item.id}
            empty="No usage, waste or returns in this period"
            columns={[
              { title: "Supply", render: (row) => row.item.name },
              {
                title: "Consumed",
                render: (row) => `${quantity(row.consumed)} ${row.item.unit}`,
              },
              {
                title: "Waste recorded",
                render: (row) => `${quantity(row.waste)} ${row.item.unit}`,
              },
              {
                title: "Supplier returns",
                render: (row) => `${quantity(row.returns)} ${row.item.unit}`,
              },
            ]}
          />
        ) : (
          <p className="inv-panel-body">
            Choose dates and generate the report. Leave dates blank for all
            recorded movements.
          </p>
        )}
        <p
          className="inv-panel-body"
          style={{ color: "#656963", fontSize: 12 }}
        >
          Waste includes cancelled prepared orders. Corrections remain visible
          as reversal movements; use the movement export to reconcile them.
        </p>
      </section>
    </div>
  );
}
