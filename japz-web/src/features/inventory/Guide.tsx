import { Header } from "./shared";
export default function Guide() {
  return (
    <div className="inv-page">
      <Header
        title="Inventory guide"
        description="How stock moves through JAPZ POS."
      />
      <div className="inv-reading">
        <section className="inv-panel">
          <div className="inv-panel-body">
            <h2>Set up supplies and menu stock</h2>
            <p>
              Add your actual ingredients and packaging in g, ml or pcs. Set the
              purchase unit and conversion: for example, 1 kg = 1,000 g or 1 box
              = 50 pcs. Enter reorder levels in base units.
            </p>
            <p>
              Record opening quantities through Receiving. Each line creates a
              batch with its received quantity, cost and optional expiry date.
              Stock on hold and expired batches do not contribute to
              availability.
            </p>
            <p>
              Prepared stock counts menu items directly in pieces. Receive or
              count those items in Prepared stock. Use Recipe stock when sales
              must reserve ingredients and packaging. Save real recipes before
              enabling it; existing prepared balances must first be resolved.
            </p>
          </div>
        </section>
        <section className="inv-panel">
          <div className="inv-panel-body">
            <h2>Recipes, options and combos</h2>
            <p>
              A recipe describes the quantities needed for one serving. Add
              profiles for sizes, flavours and temperatures that use different
              amounts. The most specific matching profile is used; a default
              profile applies to other options.
            </p>
            <p>
              Use menu components for combos. The system follows each
              component’s stock source and combines shared ingredients for the
              entire cart. Circular combinations are rejected. Use order-type
              conditions for takeaway packaging.
            </p>
            <p>
              Saving a recipe creates a new version. Open orders retain their
              reserved quantities and recipe version.
            </p>
          </div>
        </section>
        <section className="inv-panel">
          <div className="inv-panel-body">
            <h2>Orders and reservations</h2>
            <p>
              Cashier checkout reserves stock. Kitchen preparation consumes it.
              Cancelling a pending order releases its reservations. Cancelling
              after preparation records waste and keeps the stock consumed.
            </p>
            <p>
              Batches are allocated by earliest expiry, then receiving date. If
              reserved stock expires before preparation, cancel the pending
              order, replace the stock and place the order again.
            </p>
            <p>
              Availability refreshes regularly and on window focus. Checkout
              always checks the whole cart against the current balances.
            </p>
          </div>
        </section>
        <section className="inv-panel">
          <div className="inv-panel-body">
            <h2>Counts, waste and corrections</h2>
            <p>
              Count batches separately. A count compares the physical quantity
              with the balance shown when the form was opened. A later movement
              makes that count stale, so refresh and count again.
            </p>
            <p>
              A supply’s approval limit controls which count differences require
              Admin review. Admin can also require review for every supply count
              in Inventory settings. Prepared-item counts apply immediately.
              Inventory staff can receive stock, record waste and returns, and
              review Kitchen waste reports. Kitchen reports do not remove stock
              until Inventory accepts them.
            </p>
            <p>
              Movement history records who changed stock and why. Admin can
              reverse eligible movements by creating a correction entry.
              Historical records are retained.
            </p>
          </div>
        </section>
        <section className="inv-panel">
          <div className="inv-panel-body">
            <h2>Inventory settings</h2>
            <p>
              Set the expiry warning window and automatic refresh interval in
              Settings. Admin manages supply count approvals, per-item approval
              limits and the default reorder level for new prepared menu items.
              Existing reorder levels stay as recorded.
            </p>
            <p>
              Stock balances do not reset at midnight or on restart. Every
              receiving, count, order allocation, loss and correction remains in
              Movement history.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
