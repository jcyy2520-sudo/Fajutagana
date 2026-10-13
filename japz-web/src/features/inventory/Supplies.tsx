import { usePagination } from "./pagination";
import { createRequestId } from "../../utils/requestId";
import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import { useInventory, inventoryApi, quantity, currency, today } from "./data";
import { useInventoryBase } from "./data";
import {
  Header,
  Field,
  Dialog,
  Table,
  Badge,
  SearchField,
  Pagination,
} from "./shared";
import type { Supply, Batch } from "./types";
function SupplyEditor({ item, close }: { item?: Supply; close: () => void }) {
  const { user } = useAuth();
  const { suppliers, refresh } = useInventory();
  const [form, setForm] = useState({
    code: item?.code || "",
    name: item?.name || "",
    kind: item?.kind || "ingredient",
    unit: item?.unit || "g",
    purchaseUnit: item?.purchaseUnit || "kg",
    unitsPerPurchase: String(item?.unitsPerPurchase || 1000),
    reorderLevel: String(item?.reorderLevel || 0),
    adjustmentLimit:
      item?.adjustmentLimit === null || !item
        ? ""
        : String(item.adjustmentLimit),
    location: item?.location || "",
    supplierId: String(item?.supplierId || ""),
  });
  const change = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  return (
    <Dialog
      title={item ? "Edit supply item" : "Add supply item"}
      description="Use g, ml or pcs as the base unit. Record quantities through receiving and stock counts."
      onClose={close}
      onSubmit={async () => {
        await api[item ? "put" : "post"](
          inventoryApi(item ? `items/${item.id}` : "items"),
          {
            ...form,
            adjustmentLimit:
              form.adjustmentLimit === "" ? null : form.adjustmentLimit,
            supplierId: form.supplierId || null,
          },
        );
        await refresh();
        close();
      }}
    >
      <div className="inv-form-grid">
        <Field label="Item code">
          <input
            required
            maxLength={64}
            value={form.code}
            onChange={(e) => change("code", e.target.value)}
            placeholder="e.g. ING-001"
          />
        </Field>
        <Field label="Item name">
          <input
            required
            maxLength={160}
            value={form.name}
            onChange={(e) => change("name", e.target.value)}
          />
        </Field>
        <Field label="Type">
          <select
            value={form.kind}
            onChange={(e) => change("kind", e.target.value)}
          >
            <option value="ingredient">Ingredient</option>
            <option value="packaging">Packaging</option>
          </select>
        </Field>
        <Field label="Base unit">
          <select
            value={form.unit}
            onChange={(e) => change("unit", e.target.value)}
          >
            <option value="g">Grams (g)</option>
            <option value="ml">Millilitres (ml)</option>
            <option value="pcs">Pieces (pcs)</option>
          </select>
        </Field>
        <Field
          label="Purchase unit"
          hint="For example: kg, bottle, box or sack."
        >
          <input
            required
            maxLength={40}
            value={form.purchaseUnit}
            onChange={(e) => change("purchaseUnit", e.target.value)}
          />
        </Field>
        <Field
          label={`Base units per ${form.purchaseUnit || "purchase unit"}`}
          hint={`1 ${form.purchaseUnit || "purchase unit"} = ${form.unitsPerPurchase || "…"} ${form.unit}`}
        >
          <input
            type="number"
            required
            min="0.0001"
            step={form.unit === "pcs" ? "1" : "0.0001"}
            value={form.unitsPerPurchase}
            onChange={(e) => change("unitsPerPurchase", e.target.value)}
          />
        </Field>
        <Field label={`Reorder level (${form.unit})`}>
          <input
            type="number"
            required
            min="0"
            step={form.unit === "pcs" ? "1" : "0.0001"}
            value={form.reorderLevel}
            onChange={(e) => change("reorderLevel", e.target.value)}
          />
        </Field>
        <Field
          label={`Count approval limit (${form.unit})`}
          hint="Admin sets this limit. Larger differences require approval; the overall count policy is in Settings."
        >
          <input
            type="number"
            disabled={user?.role !== "admin"}
            min="0"
            step={form.unit === "pcs" ? "1" : "0.0001"}
            value={form.adjustmentLimit}
            onChange={(e) => change("adjustmentLimit", e.target.value)}
          />
        </Field>
        <Field label="Storage location">
          <input
            maxLength={120}
            value={form.location}
            onChange={(e) => change("location", e.target.value)}
          />
        </Field>
        <Field label="Preferred supplier">
          <select
            value={form.supplierId}
            onChange={(e) => change("supplierId", e.target.value)}
          >
            <option value="">No preferred supplier</option>
            {suppliers
              .filter(
                (supplier) =>
                  supplier.active || supplier.id === item?.supplierId,
              )
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
    </Dialog>
  );
}
function Batches({ item, close }: { item: Supply; close: () => void }) {
  const { refresh } = useInventory(),
    [hold, setHold] = useState<Batch | null>(null),
    [reason, setReason] = useState(""),
    [requestId] = useState(createRequestId());
  return hold ? (
    <Dialog
      title={
        hold.quarantined ? "Release batch from hold" : "Place batch on hold"
      }
      onClose={() => setHold(null)}
      onSubmit={async () => {
        await api.post(inventoryApi(`batches/${hold.id}/hold`), {
          requestId,
          quarantined: !hold.quarantined,
          reason,
        });
        await refresh();
        close();
      }}
    >
      <p className="inv-recipe-note">
        {item.name} · {hold.code}. Held stock is excluded from menu
        availability.
      </p>
      <Field label="Reason">
        <textarea
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Dialog>
  ) : (
    <Dialog
      wide
      title={item.name}
      description={`${item.code} · ${item.location || "No storage location recorded"}`}
      onClose={close}
    >
      <dl className="inv-details">
        <div>
          <dt>On hand</dt>
          <dd>
            {quantity(item.onHand)} {item.unit}
          </dd>
        </div>
        <div>
          <dt>Reserved</dt>
          <dd>
            {quantity(item.reserved)} {item.unit}
          </dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>
            {quantity(item.available)} {item.unit}
          </dd>
        </div>
      </dl>
      <Table
        rows={item.batches}
        rowKey={(batch) => batch.id}
        empty="No batches received yet"
        columns={[
          { title: "Batch", render: (batch) => <strong>{batch.code}</strong> },
          {
            title: "On hand / reserved",
            render: (batch) => (
              <span>
                {quantity(batch.onHand)} / {quantity(batch.reserved)}{" "}
                {item.unit}
              </span>
            ),
          },
          {
            title: "Expiry",
            render: (batch) => (
              <span>
                {batch.expiryDate || "Not recorded"}
                {batch.expiryDate && batch.expiryDate < today() && (
                  <small>
                    <Badge status="expired">Expired</Badge>
                  </small>
                )}
              </span>
            ),
          },
          {
            title: "Cost per unit",
            render: (batch) => currency(batch.unitCost),
          },
          {
            title: "Condition",
            render: (batch) => (
              <button
                onClick={() => {
                  setHold(batch);
                  setReason("");
                }}
              >
                {batch.quarantined ? "Release hold" : "Place on hold"}
              </button>
            ),
          },
        ]}
      />
    </Dialog>
  );
}
export default function Supplies() {
  const { items, refresh } = useInventory(),
    base = useInventoryBase();
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [status, setStatus] = useState("active");
  const [editor, setEditor] = useState<Supply | "new" | null>(null),
    [batches, setBatches] = useState<Supply | null>(null),
    [archive, setArchive] = useState<Supply | null>(null);
  const filtered = items.filter(
    (item) =>
      `${item.name} ${item.code} ${item.location || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (kind === "all" || item.kind === kind) &&
      (status === "all" ||
        (status === "active" && !item.archived) ||
        (status === "archived" && item.archived) ||
        status === item.status),
  );
  const pagination = usePagination(filtered, search + kind + status);
  return (
    <div className="inv-page">
      <Header
        title="Ingredients & packaging"
        description="Available quantities exclude reservations, expired batches and stock on hold."
      >
        <button className="inv-primary" onClick={() => setEditor("new")}>
          Add supply item
        </button>
        <Link className="inv-link" to={`${base}/receiving`}>
          Receive stock
        </Link>
      </Header>
      <section className="inv-panel">
        <div className="inv-toolbar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search supplies, codes or locations"
          />
          <select
            aria-label="Supply type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All types</option>
            <option value="ingredient">Ingredients</option>
            <option value="packaging">Packaging</option>
          </select>
          <select
            aria-label="Stock status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active items</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="archived">Archived</option>
            <option value="all">All items</option>
          </select>
        </div>
        <Table
          rows={pagination.rows}
          rowKey={(item) => item.id}
          empty={
            items.length
              ? "No supplies match these filters"
              : "No ingredients or packaging yet"
          }
          columns={[
            {
              title: "Supply",
              render: (item) => (
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.code} · {item.kind}
                  </small>
                </div>
              ),
            },
            {
              title: "On hand",
              className: "inv-number",
              render: (item) => (
                <span>
                  {quantity(item.onHand)} {item.unit}
                </span>
              ),
            },
            {
              title: "Reserved",
              render: (item) => (
                <span>
                  {quantity(item.reserved)} {item.unit}
                </span>
              ),
            },
            {
              title: "Available",
              render: (item) => (
                <div>
                  <strong>
                    {quantity(item.available)} {item.unit}
                  </strong>
                  <small>Reorder at {quantity(item.reorderLevel)}</small>
                </div>
              ),
            },
            {
              title: "Status",
              render: (item) => (
                <Badge status={item.status}>
                  {item.status === "out"
                    ? "Out of stock"
                    : item.status === "healthy"
                      ? "In stock"
                      : item.status === "low"
                        ? "Low stock"
                        : "Archived"}
                </Badge>
              ),
            },
            {
              title: "Actions",
              render: (item) => (
                <div className="inv-actions">
                  <button onClick={() => setBatches(item)}>Batches</button>
                  <button onClick={() => setEditor(item)}>Edit</button>
                  <button onClick={() => setArchive(item)}>
                    {item.archived ? "Restore" : "Archive"}
                  </button>
                </div>
              ),
            },
          ]}
        />
        <Pagination {...pagination} />
      </section>
      {editor && (
        <SupplyEditor
          item={editor === "new" ? undefined : editor}
          close={() => setEditor(null)}
        />
      )}
      {batches && <Batches item={batches} close={() => setBatches(null)} />}
      {archive && (
        <Dialog
          title={
            archive.archived ? "Restore supply item" : "Archive supply item"
          }
          onClose={() => setArchive(null)}
          onSubmit={async () => {
            await api.put(inventoryApi(`items/${archive.id}`), {
              archived: !archive.archived,
            });
            await refresh();
            setArchive(null);
          }}
          submitLabel={archive.archived ? "Restore" : "Archive"}
        >
          <p>
            {archive.name}.{" "}
            {archive.archived
              ? "This item will be available for receiving and recipes."
              : "Its balances and history will remain recorded. Recipes that use it will become unavailable."}
          </p>
        </Dialog>
      )}
    </div>
  );
}
