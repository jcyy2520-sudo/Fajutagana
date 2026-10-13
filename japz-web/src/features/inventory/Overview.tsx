import { Link } from "react-router-dom";
import { useInventory, quantity, currency } from "./data";
import { useInventoryBase } from "./data";
import { Header, Empty, Badge } from "./shared";
export default function Overview() {
  const { summary } = useInventory(),
    base = useInventoryBase();
  if (!summary)
    return (
      <div className="inv-page">
        <Empty title="Inventory summary unavailable">
          Refresh to load the current balances.
        </Empty>
      </div>
    );
  const stats = [
    ["Supply items", summary.itemCount, "supplies", "View catalog"],
    [
      "Low or out of supply stock",
      summary.low.length + summary.out.length,
      "supplies",
      "Check supplies",
    ],
    [
      "Unavailable menu items",
      summary.unavailableMenu.length,
      "menu",
      "Check availability",
    ],
    [
      "Waiting for review",
      summary.pendingCounts + summary.pendingWaste,
      "counts",
      "Review counts and waste",
    ],
  ] as const;
  return (
    <div className="inv-page">
      <Header
        title="Inventory overview"
        description="Current stock, menu availability, and items that need attention."
      />
      <div className="inv-stats">
        {stats.map(([label, value, path, action]) => (
          <div className="inv-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <Link to={`${base}/${path}`}>{action}</Link>
          </div>
        ))}
      </div>
      <div className="inv-grid">
        <section className="inv-panel">
          <div className="inv-panel-heading">
            <h2>Replenishment</h2>
            <Link className="inv-link" to={`${base}/receiving`}>
              Receive stock
            </Link>
          </div>
          <div className="inv-panel-body">
            {summary.out.length + summary.low.length ? (
              <ul className="inv-list">
                {[...summary.out, ...summary.low].slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.code} · Reorder at {quantity(item.reorderLevel)}{" "}
                        {item.unit}
                      </small>
                    </span>
                    <span>
                      {quantity(item.available)} {item.unit}
                      <br />
                      <Badge status={item.status}>
                        {item.status === "out" ? "Out of stock" : "Low stock"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title={
                  summary.itemCount
                    ? "No supplies below their reorder level"
                    : "Add your ingredients and packaging"
                }
              >
                {summary.itemCount
                  ? "Reorder levels are set for each supply item."
                  : "Create supply items with their base units, then record your opening delivery or count."}
              </Empty>
            )}
          </div>
        </section>
        <section className="inv-panel">
          <div className="inv-panel-heading">
            <h2>Expiry within {summary.expiryWarningDays} days</h2>
            <Link className="inv-link" to={`${base}/supplies`}>
              View batches
            </Link>
          </div>
          <div className="inv-panel-body">
            {summary.expiring.length ? (
              <ul className="inv-list">
                {summary.expiring.slice(0, 8).map((batch) => (
                  <li key={batch.id}>
                    <span>
                      <strong>{batch.itemName}</strong>
                      <small>
                        {batch.code} · {batch.expiryDate}
                      </small>
                    </span>
                    <span>
                      {quantity(batch.onHand)} {batch.unit}
                      <br />
                      <Badge
                        status={
                          batch.expiryDate! < summary.date ? "expired" : "low"
                        }
                      >
                        {batch.expiryDate! < summary.date
                          ? "Expired"
                          : "Expiring soon"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No batches near expiry">
                Expiry dates are recorded when receiving stock.
              </Empty>
            )}
          </div>
        </section>
        <section className="inv-panel">
          <div className="inv-panel-heading">
            <h2>Prepared stock to replenish</h2>
            <Link className="inv-link" to={`${base}/prepared`}>
              View prepared stock
            </Link>
          </div>
          <div className="inv-panel-body">
            {summary.preparedLow.length ? (
              <ul className="inv-list">
                {summary.preparedLow.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>Reorder at {item.reorderLevel} pcs</small>
                    </span>
                    <span>
                      {Math.max(0, item.onHand - item.reservedStock)} pcs
                      <br />
                      <Badge
                        status={
                          item.onHand - item.reservedStock === 0 ? "out" : "low"
                        }
                      >
                        {item.onHand - item.reservedStock === 0
                          ? "Out of stock"
                          : "Low stock"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No prepared items below their reorder level" />
            )}
          </div>
        </section>
        <section className="inv-panel">
          <div className="inv-panel-heading">
            <h2>Menu availability</h2>
            <Link className="inv-link" to={`${base}/menu`}>
              View menu
            </Link>
          </div>
          <div className="inv-panel-body">
            {summary.unavailableMenu.length ? (
              <ul className="inv-list">
                {summary.unavailableMenu.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.availabilityReason}</small>
                    </span>
                    <Badge status="unavailable">Unavailable</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Menu stock is available" />
            )}
          </div>
        </section>
        <section className="inv-panel">
          <div className="inv-panel-heading">
            <h2>Stock value</h2>
            <Link className="inv-link" to={`${base}/reports`}>
              View reports
            </Link>
          </div>
          <div className="inv-panel-body">
            <p style={{ fontSize: 28, fontWeight: 600 }}>
              {currency(summary.stockValue)}
            </p>
            <p className="inv-recipe-note">
              Recorded on-hand quantities × receiving costs. Reserved, held and
              expired stock remain included until a movement removes them.
            </p>
            <ul className="inv-list">
              <li>
                <span>Counts waiting for Admin approval</span>
                <Link className="inv-link" to={`${base}/counts`}>
                  {summary.pendingCounts}
                </Link>
              </li>
              <li>
                <span>Kitchen waste reports waiting for review</span>
                <Link className="inv-link" to={`${base}/losses`}>
                  {summary.pendingWaste}
                </Link>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
