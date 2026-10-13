import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import api from "../../services/api";
import {
  useInventory,
  useInventoryBase,
  inventoryApi,
  errorMessage,
} from "./data";
import { Header, Field, Notice, Empty } from "./shared";
import type { InventorySettings } from "./types";
function SettingsForm({ initial }: { initial: InventorySettings }) {
  const { user } = useAuth(),
    { refresh } = useInventory(),
    base = useInventoryBase();
  const [form, setForm] = useState({
    expiryWarningDays: String(initial.expiryWarningDays),
    refreshSeconds: String(initial.refreshSeconds),
    defaultPreparedReorderLevel: String(initial.defaultPreparedReorderLevel),
    countApproval: initial.countApproval,
  });
  const [version, setVersion] = useState(initial.version),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const admin = user?.role === "admin";
  const changed =
    Number(form.expiryWarningDays) !== initial.expiryWarningDays ||
    Number(form.refreshSeconds) !== initial.refreshSeconds ||
    Number(form.defaultPreparedReorderLevel) !==
      initial.defaultPreparedReorderLevel ||
    form.countApproval !== initial.countApproval;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        setSuccess(false);
        try {
          const result = await api.put(inventoryApi("settings"), {
            ...form,
            expectedVersion: version,
          });
          setVersion(result.data.version);
          await refresh();
          setSuccess(true);
        } catch (error) {
          setError(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && (
        <Notice error>
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const current = (await api.get(inventoryApi("settings")))
                  .data as InventorySettings;
                setForm({
                  expiryWarningDays: String(current.expiryWarningDays),
                  refreshSeconds: String(current.refreshSeconds),
                  defaultPreparedReorderLevel: String(
                    current.defaultPreparedReorderLevel,
                  ),
                  countApproval: current.countApproval,
                });
                setVersion(current.version);
                await refresh();
                setError("");
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Use current settings
          </button>
        </Notice>
      )}
      {success && <Notice>Inventory settings saved.</Notice>}
      <div className="inv-settings-grid">
        <div>
          <section className="inv-panel">
            <div className="inv-panel-heading">
              <h2>Alerts & refresh</h2>
            </div>
            <div className="inv-panel-body">
              <div className="inv-form-grid">
                <Field
                  label="Expiry warning window"
                  hint="Batches within this many days appear on the overview. Expired batches are always excluded from availability."
                >
                  <div className="inv-input-unit">
                    <input
                      aria-label="Expiry warning days"
                      type="number"
                      required
                      min="1"
                      max="90"
                      step="1"
                      value={form.expiryWarningDays}
                      onChange={(e) =>
                        setForm({ ...form, expiryWarningDays: e.target.value })
                      }
                    />
                    <span>days</span>
                  </div>
                </Field>
                <Field
                  label="Refresh interval"
                  hint="Inventory balances refresh automatically and when the window regains focus."
                >
                  <select
                    value={form.refreshSeconds}
                    onChange={(e) =>
                      setForm({ ...form, refreshSeconds: e.target.value })
                    }
                  >
                    {[15, 30, 60, 120].map((value) => (
                      <option key={value} value={value}>
                        {value} seconds
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </section>
          <section className="inv-panel">
            <div className="inv-panel-heading">
              <h2>Count approvals & reorder defaults</h2>
            </div>
            <div className="inv-panel-body">
              {!admin && (
                <p className="inv-recipe-note">
                  Admin manages these policies. Your operational preferences can
                  be saved separately.
                </p>
              )}
              <div className="inv-form-grid">
                <Field
                  wide
                  label="Supply count approval policy"
                  hint="Applies to ingredients and packaging. Admin counts apply immediately; Inventory counts follow this policy."
                >
                  <select
                    disabled={!admin}
                    value={form.countApproval}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        countApproval: e.target
                          .value as InventorySettings["countApproval"],
                      })
                    }
                  >
                    <option value="item_limits">
                      Use each supply’s approval limit
                    </option>
                    <option value="admin_review">
                      Admin reviews every Inventory count
                    </option>
                  </select>
                </Field>
                <Field
                  label="New prepared-item reorder level"
                  hint="Applies to new menu items. Existing item levels stay as recorded."
                >
                  <div className="inv-input-unit">
                    <input
                      aria-label="Default prepared reorder level"
                      disabled={!admin}
                      type="number"
                      required
                      min="0"
                      max="1000000"
                      step="1"
                      value={form.defaultPreparedReorderLevel}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          defaultPreparedReorderLevel: e.target.value,
                        })
                      }
                    />
                    <span>pcs</span>
                  </div>
                </Field>
              </div>
            </div>
          </section>
        </div>
        <aside>
          <section className="inv-panel">
            <div className="inv-panel-heading">
              <h2>Per-item settings</h2>
            </div>
            <div className="inv-panel-body">
              <p className="inv-recipe-note">
                Units, purchase conversions, storage locations and reorder
                levels belong to each supply item.
              </p>
              <Link className="inv-link" to={`${base}/supplies`}>
                Edit ingredients & packaging
              </Link>
              <p className="inv-recipe-note">
                Recipes and prepared stock sources are selected per menu item.
              </p>
              <Link className="inv-link" to={`${base}/menu`}>
                Edit menu stock sources
              </Link>
            </div>
          </section>
          <section className="inv-panel">
            <div className="inv-panel-heading">
              <h2>Stock workflow</h2>
            </div>
            <div className="inv-panel-body">
              <ul className="inv-list">
                <li>
                  <span>Order accepted</span>
                  <strong>Reserve stock</strong>
                </li>
                <li>
                  <span>Preparation starts</span>
                  <strong>Consume stock</strong>
                </li>
                <li>
                  <span>Pending order cancelled</span>
                  <strong>Release stock</strong>
                </li>
                <li>
                  <span>Prepared order cancelled</span>
                  <strong>Record waste</strong>
                </li>
              </ul>
              <p className="inv-recipe-note">
                Balances do not reset at midnight or when the server restarts.
                Counts and receiving record every quantity change.
              </p>
              <Link className="inv-link" to={`${base}/guide`}>
                Read inventory guide
              </Link>
            </div>
          </section>
        </aside>
      </div>
      <div className="inv-settings-save">
        <span>
          {changed
            ? "Changes have not been saved."
            : "Settings are up to date."}
        </span>
        <button
          type="submit"
          className="inv-primary"
          disabled={busy || !changed}
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
export default function Settings() {
  const { settings } = useInventory();
  return (
    <div className="inv-page">
      <Header
        title="Inventory settings"
        description="Stock alerts, refresh timing and control policies for every inventory workspace."
      />
      {settings ? (
        <SettingsForm initial={settings} />
      ) : (
        <Empty title="Settings unavailable">
          Refresh inventory to load the current settings.
        </Empty>
      )}
    </div>
  );
}
