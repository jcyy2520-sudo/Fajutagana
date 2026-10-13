import { usePagination } from "./pagination";
import { createRequestId } from "../../utils/requestId";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import api from "../../services/api";
import {
  useInventory,
  inventoryApi,
  quantity,
  dateTime,
  errorMessage,
} from "./data";
import {
  Header,
  Dialog,
  Field,
  Table,
  Badge,
  Notice,
  SearchField,
  Pagination,
} from "./shared";
import type { Supply, Count, Waste } from "./types";
export function SupplyOperation({
  operation,
  items,
  close,
  done,
}: {
  operation: "counts" | "waste" | "returns" | "waste-reports";
  items: Supply[];
  close: () => void;
  done: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Supply | null>(null),
    [batchId, setBatch] = useState(""),
    [value, setValue] = useState(""),
    [reason, setReason] = useState(""),
    [requestId] = useState(createRequestId());
  const count = operation === "counts",
    report = operation === "waste-reports";
  const title = count
    ? "Record stock count"
    : report
      ? "Report waste"
      : operation === "returns"
        ? "Record supplier return"
        : "Record waste";
  return (
    <Dialog
      title={title}
      description={
        count
          ? "Count a specific batch. The form saves against the balance shown when you select it."
          : report
            ? "Inventory will review this report before changing stock."
            : "Only unreserved stock can be removed. Choose a batch or use the earliest expiry first."
      }
      submitLabel={
        count ? "Record count" : report ? "Submit report" : "Record movement"
      }
      onClose={close}
      onSubmit={async () => {
        await api.post(inventoryApi(operation), {
          requestId,
          stockItemId: selected?.id,
          batchId: batchId || null,
          ...(count
            ? { countedQuantity: value, expectedVersion: selected?.version }
            : { quantity: value }),
          reason,
        });
        await done();
        close();
      }}
    >
      <div className="inv-form-grid">
        <Field wide label="Supply item">
          <select
            required
            value={selected?.id || ""}
            onChange={(e) => {
              const item =
                items.find((item) => item.id === Number(e.target.value)) ||
                null;
              setSelected(item ? structuredClone(item) : null);
              setBatch("");
              setValue("");
            }}
          >
            <option value="">Choose supply item</option>
            {items
              .filter((item) => !item.archived || count)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
          </select>
        </Field>
        <Field wide label="Batch">
          <select
            required={count}
            value={batchId}
            onChange={(e) => {
              setBatch(e.target.value);
              if (count)
                setValue(
                  String(
                    selected?.batches.find(
                      (batch) => batch.id === Number(e.target.value),
                    )?.onHand ?? "",
                  ),
                );
            }}
          >
            <option value="">
              {count
                ? "Choose counted batch"
                : "Any batch (earliest expiry first)"}
            </option>
            {selected?.batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.code} · {quantity(batch.onHand)} on hand /{" "}
                {quantity(batch.reserved)} reserved
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={`${count ? "Counted on hand" : "Quantity"} (${selected?.unit || "base unit"})`}
        >
          <input
            required
            type="number"
            min={count ? 0 : "0.0001"}
            step={selected?.unit === "pcs" ? 1 : "0.0001"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Field
          label={count ? "Recorded batch quantity" : "Recorded supply quantity"}
        >
          <output>
            {quantity(
              count
                ? selected?.batches.find(
                    (batch) => batch.id === Number(batchId),
                  )?.onHand || 0
                : selected?.onHand || 0,
            )}{" "}
            {selected?.unit}
          </output>
        </Field>
        <Field wide label="Reason">
          <textarea
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
      {count && selected?.adjustmentLimit !== null && selected && (
        <p className="inv-recipe-note">
          Differences above {quantity(selected.adjustmentLimit!)}{" "}
          {selected.unit} require Admin approval.
        </p>
      )}
    </Dialog>
  );
}
export function Counts() {
  const { items, counts, refresh } = useInventory(),
    { user } = useAuth();
  const [open, setOpen] = useState(false),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [review, setReview] = useState<{ count: Count; decision: string } | null>(
      null,
    );
  const filtered = counts.filter(
      (count) =>
        (status === "all" || count.status === status) &&
        `${count.item.name} ${count.reason} ${count.batch.code}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
    pagination = usePagination(filtered, search + status);
  return (
    <div className="inv-page">
      <Header
        title="Stock counts"
        description="Compare counted quantities with recorded batch balances. Counts never overwrite later movements."
      >
        <button className="inv-primary" onClick={() => setOpen(true)}>
          Record stock count
        </button>
      </Header>
      <section className="inv-panel">
        <div className="inv-toolbar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search supply, batch or reason"
          />
          <select
            aria-label="Count status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All counts</option>
            {["pending", "applied", "rejected", "stale"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        <Table
          rows={pagination.rows}
          rowKey={(count) => count.id}
          empty="No stock counts recorded"
          columns={[
            {
              title: "Supply / batch",
              render: (count) => (
                <div>
                  <strong>{count.item.name}</strong>
                  <small>{count.batch.code}</small>
                </div>
              ),
            },
            {
              title: "Recorded → counted",
              render: (count) =>
                `${quantity(count.previousQuantity)} → ${quantity(count.countedQuantity)} ${count.item.unit}`,
            },
            {
              title: "Difference",
              render: (count) =>
                `${Number(count.difference) > 0 ? "+" : ""}${quantity(count.difference)} ${count.item.unit}`,
            },
            {
              title: "Reason / by",
              render: (count) => (
                <div>
                  {count.reason}
                  <small>
                    {count.user.name} · {dateTime(count.createdAt)}
                  </small>
                </div>
              ),
            },
            {
              title: "Status",
              render: (count) => (
                <Badge status={count.status}>{count.status}</Badge>
              ),
            },
            {
              title: "Review",
              render: (count) =>
                count.status === "pending" && user?.role === "admin" ? (
                  <div className="inv-actions">
                    <button
                      onClick={() => setReview({ count, decision: "approve" })}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setReview({ count, decision: "reject" })}
                    >
                      Reject
                    </button>
                  </div>
                ) : count.status === "pending" ? (
                  "Admin approval required"
                ) : (
                  "—"
                ),
            },
          ]}
        />
        <Pagination {...pagination} />
      </section>
      {open && (
        <SupplyOperation
          operation="counts"
          items={items}
          close={() => setOpen(false)}
          done={refresh}
        />
      )}
      {review && (
        <Dialog
          title={`${review.decision === "approve" ? "Approve" : "Reject"} count`}
          onClose={() => setReview(null)}
          onSubmit={async () => {
            try {
              await api.put(inventoryApi(`counts/${review.count.id}/review`), {
                decision: review.decision,
              });
            } finally {
              await refresh();
            }
            setReview(null);
          }}
          submitLabel={
            review.decision === "approve" ? "Approve count" : "Reject count"
          }
        >
          <p>
            {review.count.item.name} · {review.count.batch.code}
            <br />
            {quantity(review.count.previousQuantity)} →{" "}
            {quantity(review.count.countedQuantity)} {review.count.item.unit}
          </p>
          <p className="inv-recipe-note">
            Approval applies only if no stock movement has occurred since this
            count was submitted.
          </p>
        </Dialog>
      )}
    </div>
  );
}
export function Losses() {
  const { items, waste, refresh } = useInventory();
  const [operation, setOperation] = useState<"waste" | "returns" | null>(null),
    [review, setReview] = useState<{ report: Waste; decision: string } | null>(
      null,
    ),
    [error, setError] = useState("");
  return (
    <div className="inv-page">
      <Header
        title="Waste & supplier returns"
        description="Record losses and review Kitchen reports. Reservations are protected from removal."
      >
        <button className="inv-primary" onClick={() => setOperation("waste")}>
          Record waste
        </button>
        <button onClick={() => setOperation("returns")}>Supplier return</button>
      </Header>
      {error && <Notice error>{error}</Notice>}
      <section className="inv-panel">
        <div className="inv-panel-heading">
          <h2>Kitchen waste reports</h2>
        </div>
        <Table
          rows={waste}
          rowKey={(report) => report.id}
          empty="No waste reports submitted"
          columns={[
            {
              title: "Supply",
              render: (report) => (
                <div>
                  <strong>{report.item.name}</strong>
                  <small>{report.batch?.code || "Any batch"}</small>
                </div>
              ),
            },
            {
              title: "Quantity",
              render: (report) =>
                `${quantity(report.quantity)} ${report.item.unit}`,
            },
            {
              title: "Reason / by",
              render: (report) => (
                <div>
                  {report.reason}
                  <small>
                    {report.user.name} · {dateTime(report.createdAt)}
                  </small>
                </div>
              ),
            },
            {
              title: "Status",
              render: (report) => (
                <Badge status={report.status}>{report.status}</Badge>
              ),
            },
            {
              title: "Review",
              render: (report) =>
                report.status === "pending" ? (
                  <div className="inv-actions">
                    <button
                      onClick={() => setReview({ report, decision: "accept" })}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => setReview({ report, decision: "reject" })}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  "Reviewed"
                ),
            },
          ]}
        />
      </section>
      <Notice>
        Prepared menu-item waste is recorded in Prepared stock. Cancellation
        after preparation records waste against the order’s consumed stock.
      </Notice>
      {operation && (
        <SupplyOperation
          operation={operation}
          items={items}
          close={() => setOperation(null)}
          done={refresh}
        />
      )}
      {review && (
        <Dialog
          title={
            review.decision === "accept"
              ? "Accept waste report"
              : "Reject waste report"
          }
          onClose={() => setReview(null)}
          onSubmit={async () => {
            try {
              await api.put(
                inventoryApi(`waste-reports/${review.report.id}/review`),
                { decision: review.decision },
              );
              await refresh();
              setReview(null);
              setError("");
            } catch (error) {
              setError(errorMessage(error));
              throw error;
            }
          }}
          submitLabel={
            review.decision === "accept"
              ? "Accept and record waste"
              : "Reject report"
          }
        >
          <p>
            {review.report.item.name} · {quantity(review.report.quantity)}{" "}
            {review.report.item.unit}
          </p>
          <p className="inv-recipe-note">{review.report.reason}</p>
        </Dialog>
      )}
    </div>
  );
}
