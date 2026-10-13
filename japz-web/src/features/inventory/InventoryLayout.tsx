import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Truck,
  ClipboardCheck,
  Utensils,
  Boxes,
  List,
  ChartNoAxesCombined,
  Users,
  Settings,
  Menu as MenuIcon,
  X,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useInventory, dateTime, useInventoryBase } from "./data";
import { Notice } from "./shared";
import InventoryData from "./InventoryData";
import "./inventory.css";
const links = [
  ["overview", "Overview", LayoutDashboard],
  ["supplies", "Ingredients & packaging", Package],
  ["receiving", "Receiving", Truck],
  ["prepared", "Prepared stock", Boxes],
  ["menu", "Menu availability", Utensils],
  ["counts", "Stock counts", ClipboardCheck],
  ["losses", "Waste & returns", List],
  ["suppliers", "Suppliers", Users],
  ["movements", "Movement history", List],
  ["reports", "Reports", ChartNoAxesCombined],
  ["settings", "Settings", Settings],
] as const;
function Shell() {
  const { user, logout } = useAuth(),
    data = useInventory(),
    base = useInventoryBase(),
    location = useLocation();
  const [openedPath, setOpenedPath] = useState(""),
    open = openedPath === location.pathname,
    setOpen = (value: boolean) => setOpenedPath(value ? location.pathname : ""),
    toggle = useRef<HTMLButtonElement>(null),
    sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    sidebar.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenedPath("");
        toggle.current?.focus();
      }
      if (event.key === "Tab") {
        const focusable = [
          ...(sidebar.current?.querySelectorAll<HTMLElement>("a,button") || []),
        ];
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  return (
    <div className="inv-shell">
      {open && (
        <div
          className="inv-nav-backdrop"
          onClick={() => {
            setOpen(false);
            toggle.current?.focus();
          }}
        />
      )}
      <aside
        ref={sidebar}
        id="inventory-navigation"
        className={`inv-sidebar ${open ? "inv-sidebar-open" : ""}`}
        aria-label="Inventory navigation"
      >
        <div className="inv-brand">
          <img src="/logo.jpg" alt="JAPZ" />
          <div>
            <strong>JAPZ POS</strong>
            <span>Inventory</span>
          </div>
        </div>
        <nav>
          {links.map(([path, label, Icon]) => (
            <NavLink key={path} to={`${base}/${path}`}>
              <Icon />
              {label}
            </NavLink>
          ))}
          <NavLink to={`${base}/guide`}>Inventory guide</NavLink>
          <NavLink to={`${base}/profile`}>My account</NavLink>
        </nav>
        <div className="inv-user">
          <strong>{user?.name}</strong>
          <small>{user?.email}</small>
          <button onClick={() => void logout()}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="inv-main">
        <div className="inv-topbar">
          <button
            ref={toggle}
            className="inv-menu-toggle"
            aria-expanded={open}
            aria-controls="inventory-navigation"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <MenuIcon size={20} />}
          </button>
          <span>
            Inventory{" "}
            <small>
              · Updated {data.updated ? dateTime(data.updated) : "—"}
            </small>
          </span>
          <button
            disabled={data.refreshing}
            onClick={() => void data.refresh()}
            aria-label="Refresh inventory"
          >
            <RefreshCw size={16} />
            <span>{data.refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
        <main className="inv-content" inert={open}>
          {data.error && (
            <div className="inv-page" style={{ paddingBottom: 0 }}>
              <Notice error>
                {data.error}{" "}
                <button onClick={() => void data.refresh()}>Retry</button>
              </Notice>
            </div>
          )}
          {data.loading ? (
            <div className="inv-page" role="status">
              Loading inventory…
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
export default function InventoryLayout() {
  return (
    <InventoryData>
      <Shell />
    </InventoryData>
  );
}
