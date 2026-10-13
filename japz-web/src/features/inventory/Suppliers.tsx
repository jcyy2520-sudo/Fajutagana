import { usePagination } from "./pagination";
import { useState } from "react";
import api from "../../services/api";
import { useInventory, inventoryApi } from "./data";
import {
  Header,
  Table,
  Field,
  Dialog,
  Badge,
  SearchField,
  Pagination,
} from "./shared";
import type { Supplier } from "./types";
function Editor({
  supplier,
  close,
}: {
  supplier?: Supplier;
  close: () => void;
}) {
  const { refresh } = useInventory();
  const [form, setForm] = useState({
    name: supplier?.name || "",
    contact: supplier?.contact || "",
    email: supplier?.email || "",
    phone: supplier?.phone || "",
    notes: supplier?.notes || "",
    active: supplier?.active ?? true,
  });
  return (
    <Dialog
      title={supplier ? "Edit supplier" : "Add supplier"}
      onClose={close}
      onSubmit={async () => {
        await api[supplier ? "put" : "post"](
          inventoryApi(supplier ? `suppliers/${supplier.id}` : "suppliers"),
          form,
        );
        await refresh();
        close();
      }}
    >
      <div className="inv-form-grid">
        {(["name", "contact", "email", "phone"] as const).map((key) => (
          <Field
            key={key}
            label={
              key === "name"
                ? "Supplier name"
                : key === "contact"
                  ? "Contact person"
                  : key === "email"
                    ? "Email"
                    : "Phone"
            }
          >
            <input
              type={key === "email" ? "email" : "text"}
              required={key === "name"}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Field wide label="Notes">
          <textarea
            maxLength={2000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <Field wide label="Supplier status">
          <select
            value={form.active ? "active" : "inactive"}
            onChange={(e) =>
              setForm({ ...form, active: e.target.value === "active" })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>
    </Dialog>
  );
}
export default function Suppliers() {
  const { suppliers } = useInventory(),
    [editor, setEditor] = useState<Supplier | "new" | null>(null),
    [search, setSearch] = useState("");
  const filtered = suppliers.filter((supplier) =>
      `${supplier.name} ${supplier.contact} ${supplier.email}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
    pagination = usePagination(filtered, search);
  return (
    <div className="inv-page">
      <Header
        title="Suppliers"
        description="Contact details and preferred suppliers for receiving. Inactive suppliers retain their history."
      >
        <button className="inv-primary" onClick={() => setEditor("new")}>
          Add supplier
        </button>
      </Header>
      <section className="inv-panel">
        <div className="inv-toolbar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search suppliers"
          />
        </div>
        <Table
          rows={pagination.rows}
          rowKey={(supplier) => supplier.id}
          empty="No suppliers added"
          columns={[
            {
              title: "Supplier",
              render: (supplier) => (
                <div>
                  <strong>{supplier.name}</strong>
                  <small>{supplier.contact || "No contact person"}</small>
                </div>
              ),
            },
            {
              title: "Contact",
              render: (supplier) => (
                <div>
                  {supplier.phone || "No phone"}
                  <small>{supplier.email || "No email"}</small>
                </div>
              ),
            },
            { title: "Notes", render: (supplier) => supplier.notes || "—" },
            {
              title: "Status",
              render: (supplier) => (
                <Badge>{supplier.active ? "Active" : "Inactive"}</Badge>
              ),
            },
            {
              title: "Edit",
              render: (supplier) => (
                <button onClick={() => setEditor(supplier)}>
                  Edit supplier
                </button>
              ),
            },
          ]}
        />
        <Pagination {...pagination} />
      </section>
      {editor && (
        <Editor
          supplier={editor === "new" ? undefined : editor}
          close={() => setEditor(null)}
        />
      )}
    </div>
  );
}
