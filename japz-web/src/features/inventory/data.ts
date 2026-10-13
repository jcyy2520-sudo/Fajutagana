import { createContext, useContext } from "react";
import { useLocation } from "react-router-dom";
import type {
  Supply,
  Supplier,
  Menu,
  Count,
  Waste,
  Summary,
  InventorySettings,
} from "./types";
import api from "../../services/api";
export const inventoryApi = (path: string) => `/api/inventory/${path}`;
export async function fetchInventoryHistory<T>(path: string): Promise<T[]> {
  const records: T[] = [];
  let page: T[];
  do {
    page = (
      await api.get<T[]>(inventoryApi(path), {
        params: { limit: 200, offset: records.length },
      })
    ).data;
    records.push(...page);
  } while (page.length === 200);
  return records;
}
export const errorMessage = (error: unknown) => {
  const response = error as {
    response?: { data?: { error?: string; message?: string } };
  };
  return (
    response.response?.data?.error ||
    response.response?.data?.message ||
    "Could not connect to the server. Try again."
  );
};
export const quantity = (value: string | number) =>
  Number(value).toLocaleString("en-PH", { maximumFractionDigits: 4 });
export const currency = (value: string | number) =>
  Number(value).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
export const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );
export function downloadCSV(
  name: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const safe = (value: string | number) => {
    const raw = String(value);
    return `"${(/^[=+@-]/.test(raw) ? "'" + raw : raw).replaceAll('"', '""')}"`;
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [headers, ...rows].map((row) => row.map(safe).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
export interface Data {
  items: Supply[];
  suppliers: Supplier[];
  menu: Menu[];
  counts: Count[];
  waste: Waste[];
  summary: Summary | null;
  settings: InventorySettings | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  updated: string;
  refresh: () => Promise<void>;
}
export const InventoryContext = createContext<Data | null>(null);
export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) throw new Error("Inventory data unavailable");
  return context;
}

export const useInventoryBase = () =>
  useLocation().pathname.startsWith("/admin")
    ? "/admin/inventory"
    : "/inventory";
