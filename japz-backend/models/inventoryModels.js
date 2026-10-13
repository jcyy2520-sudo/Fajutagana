import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

const quantity = (defaultValue = 0) => ({
  type: DataTypes.DECIMAL(14, 4),
  allowNull: false,
  defaultValue,
});
const reference = (allowNull = false) => ({
  type: DataTypes.INTEGER,
  allowNull,
});
const options = (tableName) => ({ tableName, timestamps: true });

export const InventorySettings = sequelize.define(
  "InventorySettings",
  {
    expiryWarningDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 7,
    },
    refreshSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
    },
    defaultPreparedReorderLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    countApproval: {
      type: DataTypes.ENUM("item_limits", "admin_review"),
      allowNull: false,
      defaultValue: "item_limits",
    },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  options("inventory_settings"),
);

export const Supplier = sequelize.define(
  "Supplier",
  {
    name: { type: DataTypes.STRING(160), allowNull: false },
    contact: DataTypes.STRING(160),
    email: DataTypes.STRING(254),
    phone: DataTypes.STRING(40),
    notes: DataTypes.TEXT,
    active: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
  },
  options("inventory_suppliers"),
);

export const StockItem = sequelize.define(
  "StockItem",
  {
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    kind: { type: DataTypes.ENUM("ingredient", "packaging"), allowNull: false },
    unit: { type: DataTypes.ENUM("pcs", "g", "ml"), allowNull: false },
    purchaseUnit: { type: DataTypes.STRING(40), allowNull: false },
    unitsPerPurchase: quantity(1),
    onHand: quantity(),
    reserved: quantity(),
    reorderLevel: quantity(),
    adjustmentLimit: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    location: DataTypes.STRING(120),
    supplierId: reference(true),
    archived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    version: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
  },
  options("inventory_items"),
);

export const StockBatch = sequelize.define(
  "StockBatch",
  {
    stockItemId: reference(),
    code: { type: DataTypes.STRING(80), allowNull: false },
    onHand: quantity(),
    reserved: quantity(),
    unitCost: quantity(),
    expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
    quarantined: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    receivedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    ...options("inventory_batches"),
    indexes: [{ fields: ["stockItemId", "expiryDate"] }],
  },
);

export const StockReceipt = sequelize.define(
  "StockReceipt",
  {
    number: { type: DataTypes.STRING(80), unique: true, allowNull: false },
    supplierId: reference(true),
    reference: DataTypes.STRING(120),
    notes: DataTypes.TEXT,
    receivedAt: { type: DataTypes.DATE, allowNull: false },
    userId: reference(),
  },
  options("inventory_receipts"),
);

export const StockReceiptLine = sequelize.define(
  "StockReceiptLine",
  {
    receiptId: reference(),
    stockItemId: reference(),
    batchId: reference(),
    purchaseQuantity: quantity(),
    purchaseUnit: { type: DataTypes.STRING(40), allowNull: false },
    conversion: quantity(1),
    quantity: quantity(),
    unitCost: quantity(),
  },
  options("inventory_receipt_lines"),
);

export const StockMovement = sequelize.define(
  "StockMovement",
  {
    stockItemId: reference(true),
    menuItemId: reference(true),
    batchId: reference(true),
    action: {
      type: DataTypes.ENUM(
        "opening",
        "receive",
        "reserve",
        "consume",
        "release",
        "waste",
        "count",
        "supplier_return",
        "reversal",
        "hold",
        "unhold",
      ),
      allowNull: false,
    },
    quantity: quantity(),
    onHandDelta: quantity(),
    reservedDelta: quantity(),
    onHandBefore: quantity(),
    onHandAfter: quantity(),
    reservedBefore: quantity(),
    reservedAfter: quantity(),
    unit: { type: DataTypes.STRING(8), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    userId: reference(),
    orderId: reference(true),
    receiptId: reference(true),
    reversesId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
    operationKey: {
      type: DataTypes.STRING(191),
      allowNull: false,
      unique: true,
    },
  },
  {
    ...options("inventory_movements"),
    indexes: [
      { fields: ["stockItemId", "createdAt"] },
      { fields: ["orderId"] },
    ],
  },
);

export const MenuRecipe = sequelize.define(
  "MenuRecipe",
  {
    menuItemId: reference(),
    label: { type: DataTypes.STRING(120), allowNull: false },
    profileKey: { type: DataTypes.STRING(191), allowNull: false },
    size: DataTypes.STRING(80),
    flavor: DataTypes.STRING(80),
    temperature: DataTypes.STRING(40),
    components: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    userId: reference(),
  },
  {
    ...options("inventory_recipes"),
    indexes: [
      { unique: true, fields: ["menuItemId", "profileKey", "version"] },
    ],
  },
);

export const StockAllocation = sequelize.define(
  "StockAllocation",
  {
    orderId: { ...reference(), unique: true },
    state: {
      type: DataTypes.ENUM("reserved", "consumed", "released", "wasted"),
      allowNull: false,
    },
    prepared: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    supplies: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    recipes: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  },
  options("inventory_order_allocations"),
);

export const StockCount = sequelize.define(
  "StockCount",
  {
    stockItemId: reference(),
    batchId: reference(),
    expectedVersion: reference(),
    previousQuantity: quantity(),
    countedQuantity: quantity(),
    difference: quantity(),
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "applied", "rejected", "stale"),
      allowNull: false,
    },
    userId: reference(),
    reviewedById: reference(true),
    reviewedAt: DataTypes.DATE,
  },
  options("inventory_counts"),
);

export const WasteReport = sequelize.define(
  "WasteReport",
  {
    stockItemId: reference(),
    batchId: reference(true),
    quantity: quantity(),
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "accepted", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    },
    userId: reference(),
    reviewedById: reference(true),
    reviewedAt: DataTypes.DATE,
  },
  options("inventory_waste_reports"),
);

export const InventoryOperation = sequelize.define(
  "InventoryOperation",
  {
    requestId: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    fingerprint: { type: DataTypes.STRING(64), allowNull: false },
    userId: reference(),
    result: { type: DataTypes.JSON, allowNull: true },
  },
  options("inventory_operations"),
);

StockItem.belongsTo(Supplier, { as: "supplier", foreignKey: "supplierId" });
StockItem.hasMany(StockBatch, {
  as: "batches",
  foreignKey: "stockItemId",
  onDelete: "RESTRICT",
});
StockBatch.belongsTo(StockItem, {
  as: "item",
  foreignKey: "stockItemId",
  onDelete: "RESTRICT",
});
StockReceipt.belongsTo(Supplier, { as: "supplier", foreignKey: "supplierId" });
StockReceipt.hasMany(StockReceiptLine, {
  as: "lines",
  foreignKey: "receiptId",
  onDelete: "RESTRICT",
});
StockReceiptLine.belongsTo(StockItem, {
  as: "item",
  foreignKey: "stockItemId",
  onDelete: "RESTRICT",
});
StockReceiptLine.belongsTo(StockBatch, {
  as: "batch",
  foreignKey: "batchId",
  onDelete: "RESTRICT",
});
StockMovement.belongsTo(StockItem, {
  as: "item",
  foreignKey: "stockItemId",
  onDelete: "RESTRICT",
});
StockMovement.belongsTo(StockBatch, {
  as: "batch",
  foreignKey: "batchId",
  onDelete: "RESTRICT",
});
StockCount.belongsTo(StockItem, {
  as: "item",
  foreignKey: "stockItemId",
  onDelete: "RESTRICT",
});
StockCount.belongsTo(StockBatch, {
  as: "batch",
  foreignKey: "batchId",
  onDelete: "RESTRICT",
});
WasteReport.belongsTo(StockItem, {
  as: "item",
  foreignKey: "stockItemId",
  onDelete: "RESTRICT",
});
WasteReport.belongsTo(StockBatch, {
  as: "batch",
  foreignKey: "batchId",
  onDelete: "RESTRICT",
});
