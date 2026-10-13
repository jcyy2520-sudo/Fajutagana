import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import api from "../../services/api";
import {
  InventoryContext,
  inventoryApi,
  errorMessage,
  fetchInventoryHistory,
  type Data,
} from "./data";
export default function InventoryData({ children }: { children: ReactNode }) {
  const sequence = useRef(0);
  const [data, setData] = useState<Omit<Data, "refresh">>({
    items: [],
    suppliers: [],
    menu: [],
    counts: [],
    waste: [],
    summary: null,
    settings: null,
    loading: true,
    refreshing: false,
    error: "",
    updated: "",
  });
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setData((previous) => ({ ...previous, refreshing: true }));
    try {
      const responses = await Promise.all(
        [
          "items?archived=true",
          "suppliers",
          "menu",
          "counts",
          "waste-reports",
          "summary",
          "settings",
        ].map(async (path) =>
          ["counts", "waste-reports"].includes(path)
            ? { data: await fetchInventoryHistory(path) }
            : api.get(inventoryApi(path)),
        ),
      );
      if (request !== sequence.current) return;
      setData({
        items: responses[0].data,
        suppliers: responses[1].data,
        menu: responses[2].data,
        counts: responses[3].data,
        waste: responses[4].data,
        summary: responses[5].data,
        settings: responses[6].data,
        loading: false,
        refreshing: false,
        error: "",
        updated: new Date().toISOString(),
      });
    } catch (error) {
      if (request !== sequence.current) return;
      setData((previous) => ({
        ...previous,
        loading: false,
        refreshing: false,
        error: errorMessage(error),
      }));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(
      focus,
      (data.settings?.refreshSeconds || 30) * 1000,
    );
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh, data.settings?.refreshSeconds]);
  return (
    <InventoryContext.Provider value={{ ...data, refresh }}>
      {children}
    </InventoryContext.Provider>
  );
}
