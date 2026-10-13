import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import {
  inventoryApi,
  errorMessage,
  quantity,
  dateTime,
  fetchInventoryHistory,
} from "./data";
import { Header, Table, Notice, Badge } from "./shared";
import { SupplyOperation } from "./CountsLosses";
import type { Supply, Waste } from "./types";
import "./inventory.css";
export default function KitchenWaste() {
  const [items, setItems] = useState<Supply[]>([]),
    [reports, setReports] = useState<Waste[]>([]),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const [supplies, waste] = await Promise.all([
        api.get(inventoryApi("items")),
        fetchInventoryHistory<Waste>("waste-reports"),
      ]);
      setItems(supplies.data);
      setReports(waste);
      setError("");
    } catch (error) {
      setError(errorMessage(error));
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <div className="inv-page">
      <Header
        title="Report ingredient waste"
        description="Submit spilled, damaged or spoiled supplies for Inventory review."
      >
        <button className="inv-primary" onClick={() => setOpen(true)}>
          Report waste
        </button>
        <button onClick={() => void load()}>Refresh reports</button>
      </Header>
      {error && <Notice error>{error}</Notice>}
      <section className="inv-panel">
        <Table
          rows={reports}
          rowKey={(report) => report.id}
          empty="No waste reports submitted"
          columns={[
            { title: "Supply", render: (report) => report.item.name },
            {
              title: "Quantity",
              render: (report) =>
                `${quantity(report.quantity)} ${report.item.unit}`,
            },
            { title: "Reason", render: (report) => report.reason },
            {
              title: "Submitted",
              render: (report) => dateTime(report.createdAt),
            },
            {
              title: "Status",
              render: (report) => (
                <Badge status={report.status}>{report.status}</Badge>
              ),
            },
          ]}
        />
      </section>
      {open && (
        <SupplyOperation
          operation="waste-reports"
          items={items}
          close={() => setOpen(false)}
          done={load}
        />
      )}
    </div>
  );
}
