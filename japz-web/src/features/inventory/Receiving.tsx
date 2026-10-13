import { usePagination } from "./pagination";
import { createRequestId } from "../../utils/requestId";
import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import {
  useInventory,
  inventoryApi,
  quantity,
  currency,
  dateTime,
  errorMessage,
  fetchInventoryHistory,
} from "./data";
import {
  Header,
  Dialog,
  Field,
  Table,
  Notice,
  SearchField,
  Pagination,
} from "./shared";
import type { Receipt } from "./types";
interface Line {
  key: string;
  stockItemId: string;
  quantity: string;
  unit: string;
  unitCost: string;
  batchCode: string;
  expiryDate: string;
  quarantined: boolean;
}
const newLine = (): Line => ({
  key: createRequestId(),
  stockItemId: "",
  quantity: "",
  unit: "",
  unitCost: "",
  batchCode: "",
  expiryDate: "",
  quarantined: false,
});
function Delivery({
  close,
  done,
}: {
  close: () => void;
  done: () => Promise<void>;
}) {
  const { items, suppliers, refresh } = useInventory();
  const [requestId] = useState(createRequestId()),
    [supplierId, setSupplier] = useState(""),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState(""),
    [lines, setLines] = useState<Line[]>([newLine()]);
  const change = (key: string, changes: Partial<Line>) =>
    setLines((previous) =>
      previous.map((line) =>
        line.key === key ? { ...line, ...changes } : line,
      ),
    );
  return (
    <Dialog
      wide
      title="Receive delivery"
      description="Record what arrived. Quantities and costs are converted to each supply’s base unit."
      onClose={close}
      submitLabel="Record delivery"
      onSubmit={async () => {
        await api.post(inventoryApi("receive"), {
          requestId,
          supplierId: supplierId || null,
          reference,
          notes,
          lines: lines.map((line) => ({
            stockItemId: line.stockItemId,
            quantity: line.quantity,
            unit: line.unit,
            unitCost: line.unitCost || 0,
            batchCode: line.batchCode,
            expiryDate: line.expiryDate,
            quarantined: line.quarantined,
          })),
        });
        await refresh();
        await done();
        close();
      }}
    >
      <div className="inv-form-grid">
        <Field label="Supplier">
          <select
            value={supplierId}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">No supplier / opening balance</option>
            {suppliers
              .filter((supplier) => supplier.active)
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Invoice or reference">
          <input
            maxLength={120}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      </div>
      <p className="inv-recipe-note">
        Use this form for opening quantities too. A delivery remains in
        receiving history after it is recorded.
      </p>
      {lines.map((line, index) => {
        const item = items.find((item) => item.id === Number(line.stockItemId)),
          conversion =
            item && line.unit !== item.unit ? Number(item.unitsPerPurchase) : 1;
        return (
          <div className="inv-line" key={line.key}>
            <div className="inv-line-top">
              <h3>Delivery line {index + 1}</h3>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLines(lines.filter((value) => value.key !== line.key))
                  }
                >
                  Remove line
                </button>
              )}
            </div>
            <div className="inv-form-grid">
              <Field wide label="Supply item">
                <select
                  required
                  value={line.stockItemId}
                  onChange={(e) => {
                    const selected = items.find(
                      (item) => item.id === Number(e.target.value),
                    );
                    change(line.key, {
                      stockItemId: e.target.value,
                      unit: selected?.purchaseUnit || "",
                      quantity: "",
                      unitCost: "",
                    });
                  }}
                >
                  <option value="">Choose a supply</option>
                  {items
                    .filter((item) => !item.archived)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Quantity">
                <input
                  required
                  type="number"
                  min="0.0001"
                  step={
                    item?.unit === "pcs" && line.unit === item.unit
                      ? 1
                      : "0.0001"
                  }
                  value={line.quantity}
                  onChange={(e) =>
                    change(line.key, { quantity: e.target.value })
                  }
                />
              </Field>
              <Field
                label="Receiving unit"
                hint={
                  item
                    ? `Base quantity: ${quantity(Number(line.quantity) * conversion)} ${item.unit}`
                    : ""
                }
              >
                <select
                  required
                  value={line.unit}
                  onChange={(e) => change(line.key, { unit: e.target.value })}
                >
                  <option value="">Choose unit</option>
                  {item &&
                    [...new Set([item.purchaseUnit, item.unit])].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                </select>
              </Field>
              <Field label={`Cost per ${line.unit || "receiving unit"} (₱)`}>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={line.unitCost}
                  onChange={(e) =>
                    change(line.key, { unitCost: e.target.value })
                  }
                  placeholder="0 if not recorded"
                />
              </Field>
              <Field label="Batch / lot code">
                <input
                  maxLength={80}
                  value={line.batchCode}
                  onChange={(e) =>
                    change(line.key, { batchCode: e.target.value })
                  }
                  placeholder="Leave blank to generate"
                />
              </Field>
              <Field label="Expiry date">
                <input
                  type="date"
                  value={line.expiryDate}
                  onChange={(e) =>
                    change(line.key, { expiryDate: e.target.value })
                  }
                />
              </Field>
              <Field label="Condition">
                <span className="inv-check">
                  <input
                    type="checkbox"
                    checked={line.quarantined}
                    onChange={(e) =>
                      change(line.key, { quarantined: e.target.checked })
                    }
                  />
                  Place on hold for inspection
                </span>
              </Field>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => setLines([...lines, newLine()])}>
        Add delivery line
      </button>
      <div style={{ marginTop: 18 }}>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </Field>
      </div>
    </Dialog>
  );
}
export default function Receiving() {
  const [receipts, setReceipts] = useState<Receipt[]>([]),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [delivery, setDelivery] = useState(false),
    [detail, setDetail] = useState<Receipt | null>(null);
  const load = useCallback(async () => {
    try {
      setReceipts(await fetchInventoryHistory<Receipt>("receipts"));
      setError("");
    } catch (error) {
      setError(errorMessage(error));
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const filtered = receipts.filter((receipt) =>
      `${receipt.number} ${receipt.reference} ${receipt.supplier?.name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
    pagination = usePagination(filtered, search);
  return (
    <div className="inv-page">
      <Header
        title="Receiving"
        description="Deliveries, purchase conversions and batch records."
      >
        <button className="inv-primary" onClick={() => setDelivery(true)}>
          Receive delivery
        </button>
        <button onClick={() => void load()}>Refresh history</button>
      </Header>
      {error && <Notice error>{error}</Notice>}
      <section className="inv-panel">
        <div className="inv-toolbar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search receipt, supplier or invoice"
          />
        </div>
        <Table
          rows={pagination.rows}
          rowKey={(receipt) => receipt.id}
          empty="No deliveries recorded"
          columns={[
            {
              title: "Receipt",
              render: (receipt) => (
                <div>
                  <strong>{receipt.number}</strong>
                  <small>{receipt.reference || "No invoice reference"}</small>
                </div>
              ),
            },
            {
              title: "Supplier",
              render: (receipt) =>
                receipt.supplier?.name || "Opening balance / not recorded",
            },
            {
              title: "Received",
              render: (receipt) => dateTime(receipt.receivedAt),
            },
            { title: "Recorded by", render: (receipt) => receipt.user.name },
            { title: "Lines", render: (receipt) => receipt.lines.length },
            {
              title: "Details",
              render: (receipt) => (
                <button onClick={() => setDetail(receipt)}>View receipt</button>
              ),
            },
          ]}
        />
        <Pagination {...pagination} />
      </section>
      {delivery && <Delivery close={() => setDelivery(false)} done={load} />}
      {detail && (
        <Dialog
          wide
          title={detail.number}
          description={`${detail.supplier?.name || "No supplier"} · ${dateTime(detail.receivedAt)} · ${detail.reference || "No reference"}`}
          onClose={() => setDetail(null)}
        >
          <Table
            rows={detail.lines}
            rowKey={(line) => line.id}
            columns={[
              { title: "Supply", render: (line) => line.item.name },
              {
                title: "Received",
                render: (line) =>
                  `${quantity(line.purchaseQuantity)} ${line.purchaseUnit}`,
              },
              {
                title: "Base quantity",
                render: (line) =>
                  `${quantity(line.quantity)} ${line.item.unit}`,
              },
              {
                title: "Batch / expiry",
                render: (line) => (
                  <div>
                    {line.batch.code}
                    <small>
                      {line.batch.expiryDate || "No expiry recorded"}
                    </small>
                  </div>
                ),
              },
              {
                title: "Line cost",
                render: (line) =>
                  currency(Number(line.quantity) * Number(line.unitCost)),
              },
            ]}
          />
          <p className="inv-recipe-note">
            {detail.notes || "No delivery notes."}
          </p>
        </Dialog>
      )}
    </div>
  );
}
