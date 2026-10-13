import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { authAPI } from "../../services/api";
import { errorMessage } from "./data";
import { Header, Field, Notice } from "./shared";
export default function InventoryProfile() {
  const { user, setUser } = useAuth(),
    [name, setName] = useState(user?.name || ""),
    [email, setEmail] = useState(user?.email || ""),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  return (
    <div className="inv-page">
      <Header
        title="My account"
        description="Update your profile or change your password."
      />
      <section className="inv-panel inv-reading">
        <form
          className="inv-panel-body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSuccess(false);
            try {
              const result = await authAPI.updateProfile({
                name,
                email,
                ...(password
                  ? { currentPassword: current, newPassword: password }
                  : {}),
              });
              setUser({ ...user!, ...result.data.user });
              setCurrent("");
              setPassword("");
              setSuccess(true);
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <Notice error>{error}</Notice>}
          {success && <Notice>Profile updated.</Notice>}
          <div className="inv-form-grid">
            <Field label="Name">
              <input
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required={Boolean(password)}
              />
            </Field>
            <Field
              label="New password"
              hint="Leave blank to keep your current password."
            >
              <input
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>
          <button
            style={{ marginTop: 24 }}
            type="submit"
            className="inv-primary"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>
    </div>
  );
}
