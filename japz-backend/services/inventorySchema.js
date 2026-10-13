import { DataTypes } from "sequelize";
import { sequelize } from "../models/db.js";

// Additive upgrades only. Existing balances, orders and accounts remain records of what happened.
export async function upgradeInventorySchema() {
  const query = sequelize.getQueryInterface();
  const tables = (await query.showAllTables()).map((table) =>
    typeof table === "string" ? table : table.tableName,
  );
  const actual = (name) =>
    tables.find((table) => table.toLowerCase() === name.toLowerCase());
  const users = actual("Users");
  if (users) {
    const columns = await query.describeTable(users);
    if (!columns.role.type.includes("inventory")) {
      await sequelize.query(
        `ALTER TABLE ${query.queryGenerator.quoteTable(users)} MODIFY COLUMN role ENUM('admin','cashier','kitchen','inventory') NOT NULL DEFAULT 'cashier'`,
      );
    }
  }
  const addColumns = async (name, columns) => {
    const table = actual(name);
    if (!table) return;
    const existing = await query.describeTable(table);
    for (const [column, definition] of Object.entries(columns)) {
      if (!existing[column]) await query.addColumn(table, column, definition);
    }
  };
  await addColumns("menu_items", {
    inventoryMode: {
      type: DataTypes.ENUM("prepared", "recipe"),
      allowNull: false,
      defaultValue: "prepared",
    },
    reservedStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reorderLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
  });
  await addColumns("Orders", {
    clientRequestId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      unique: true,
    },
  });
}
