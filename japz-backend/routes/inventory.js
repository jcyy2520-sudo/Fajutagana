import express from "express";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { User } from "../models/userModel.js";
import { MenuItem } from "../models/menuItemModel.js";
import { MenuCategory } from "../models/menuCategoryModel.js";
import { Order } from "../models/orderModel.js";
import {
  Supplier,
  StockItem,
  StockBatch,
  StockReceipt,
  StockReceiptLine,
  StockMovement,
  MenuRecipe,
  StockCount,
  WasteReport,
} from "../models/inventoryModels.js";
import { authenticate, allowRoles } from "../middleware/access.js";
import {
  InventoryError,
  id,
  text,
  businessDate,
  validBusinessDate,
  listStockItems,
  saveStockItem,
  receiveStock,
  removeStock,
  countStock,
  reviewCount,
  preparedStock,
  reverseMovement,
  reportWaste,
  reviewWaste,
  inventoryOperation,
  supplyMovement,
} from "../services/inventoryService.js";
import {
  menuAvailability,
  saveRecipe,
  saveMenuAvailability,
  checkCartAvailability,
} from "../services/menuAvailability.js";
import {
  readInventorySettings,
  saveInventorySettings,
} from "../services/inventorySettings.js";

const router = express.Router();
const read = allowRoles("admin", "inventory", "kitchen", "cashier");
const write = allowRoles("admin", "inventory");
const admin = allowRoles("admin");
export function inventoryFailure(res, error) {
  if (error instanceof InventoryError)
    return res.status(error.status).json({ error: error.message });
  if (error.name === "SequelizeUniqueConstraintError")
    return res.status(409).json({
      error: "This item code or request already exists. Refresh and try again.",
    });
  if ([1213, 1205].includes(error.original?.errno))
    return res.status(409).json({
      error: "Another stock operation is in progress. Retry this change.",
    });
  console.error("Inventory operation failed:", error.message);
  return res
    .status(500)
    .json({ error: "The change could not be saved. Please try again." });
}
const run = (action) => async (req, res) => {
  try {
    const result = await action(req, res);
    if (!res.headersSent) res.json(result);
  } catch (error) {
    inventoryFailure(res, error);
  }
};
const actor = { model: User, as: "user", attributes: ["id", "name", "role"] };
const pageOptions = (query, defaultLimit = 200) => {
  const limit = Number(query.limit ?? defaultLimit),
    offset = Number(query.offset ?? 0);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    throw new InventoryError(
      "Choose a page size from 1 to 200 and a valid offset.",
    );
  return { limit, offset };
};
const itemBatch = [
  { model: StockItem, as: "item" },
  { model: StockBatch, as: "batch" },
  actor,
];
const dateRange = (query) => {
  const where = {};
  for (const key of ["from", "to"])
    if (query[key] && !validBusinessDate(query[key]))
      throw new InventoryError("Choose valid report dates.");
  if (query.from && query.to && query.from > query.to)
    throw new InventoryError("The start date must come before the end date.");
  if (query.from || query.to)
    where.createdAt = {
      ...(query.from
        ? { [Op.gte]: new Date(`${query.from}T00:00:00+08:00`) }
        : {}),
      ...(query.to
        ? {
            [Op.lt]: new Date(
              new Date(`${query.to}T00:00:00+08:00`).getTime() + 86400000,
            ),
          }
        : {}),
    };
  return where;
};
router.use(authenticate, read);
router.get(
  "/items",
  run((req) => listStockItems({ archived: req.query.archived === "true" })),
);
router.post(
  "/items",
  write,
  run((req) => saveStockItem(req.body, null, req.user)),
);
router.put(
  "/items/:id",
  write,
  run((req) => saveStockItem(req.body, req.params.id, req.user)),
);
router.get(
  "/settings",
  run(() => readInventorySettings()),
);
router.put(
  "/settings",
  write,
  run((req) => saveInventorySettings(req.body, req.user)),
);
router.get(
  "/suppliers",
  run(() => Supplier.findAll({ order: [["name", "ASC"]] })),
);
const supplierData = (payload) => ({
  name: text(payload.name, "Supplier name"),
  contact: String(payload.contact || "").slice(0, 160),
  email: String(payload.email || "").slice(0, 254),
  phone: String(payload.phone || "").slice(0, 40),
  notes: String(payload.notes || "").slice(0, 2000),
  active: payload.active !== false,
});
router.post(
  "/suppliers",
  write,
  run((req) => Supplier.create(supplierData(req.body))),
);
router.put(
  "/suppliers/:id",
  write,
  run(async (req) => {
    const supplier = await Supplier.findByPk(id(req.params.id));
    if (!supplier) throw new InventoryError("Supplier not found.", 404);
    return supplier.update(supplierData({ ...supplier.toJSON(), ...req.body }));
  }),
);
router.get(
  "/menu",
  run((req) =>
    menuAvailability({
      includeArchived: true,
      orderType: req.query.orderType || "dine-in",
    }),
  ),
);
router.post(
  "/cart-check",
  run((req) => checkCartAvailability(req.body)),
);
router.get(
  "/categories",
  run(() => MenuCategory.findAll({ order: [["name", "ASC"]] })),
);
router.put(
  "/menu/:id",
  write,
  run((req) => saveMenuAvailability(req.params.id, req.body)),
);
router.get(
  "/menu/:id/recipes",
  run((req) =>
    MenuRecipe.findAll({
      where: { menuItemId: id(req.params.id) },
      order: [["createdAt", "DESC"]],
    }),
  ),
);
router.post(
  "/menu/:id/recipes",
  write,
  run((req) => saveRecipe(req.params.id, req.body, req.user)),
);
router.post(
  "/prepared",
  write,
  run((req) =>
    preparedStock(req.body, req.user, req.body.operation === "receive"),
  ),
);
router.post(
  "/receive",
  write,
  run((req) => receiveStock(req.body, req.user)),
);
router.get(
  "/receipts",
  run((req) =>
    StockReceipt.findAll({
      where: dateRange(req.query),
      include: [
        { model: Supplier, as: "supplier" },
        actor,
        {
          model: StockReceiptLine,
          as: "lines",
          include: [
            { model: StockItem, as: "item" },
            { model: StockBatch, as: "batch" },
          ],
        },
      ],
      order: [["id", "DESC"]],
      ...pageOptions(req.query),
    }),
  ),
);
router.post(
  "/waste",
  write,
  run((req) => removeStock(req.body, req.user, "waste")),
);
router.post(
  "/returns",
  write,
  run((req) => removeStock(req.body, req.user, "supplier_return")),
);
router.post(
  "/counts",
  write,
  run((req) => countStock(req.body, req.user)),
);
router.get(
  "/counts",
  write,
  run((req) =>
    StockCount.findAll({
      where: {
        ...dateRange(req.query),
        ...(req.query.status ? { status: req.query.status } : {}),
      },
      include: itemBatch,
      order: [["id", "DESC"]],
      ...pageOptions(req.query),
    }),
  ),
);
router.put(
  "/counts/:id/review",
  admin,
  run(async (req, res) => {
    const result = await reviewCount(
      req.params.id,
      req.body.decision,
      req.user,
    );
    if (result.conflict) res.status(409);
    return result;
  }),
);
router.post(
  "/waste-reports",
  allowRoles("admin", "inventory", "kitchen"),
  run((req) => reportWaste(req.body, req.user)),
);
router.get(
  "/waste-reports",
  allowRoles("admin", "inventory", "kitchen"),
  run((req) =>
    WasteReport.findAll({
      where: {
        ...dateRange(req.query),
        ...(req.user.role === "kitchen" ? { userId: req.user.id } : {}),
      },
      include: itemBatch,
      order: [["id", "DESC"]],
      ...pageOptions(req.query),
    }),
  ),
);
router.put(
  "/waste-reports/:id/review",
  write,
  run((req) => reviewWaste(req.params.id, req.body.decision, req.user)),
);
router.post(
  "/batches/:id/hold",
  write,
  run((req) =>
    inventoryOperation(
      "hold",
      req.body.requestId,
      { ...req.body, batchId: req.params.id },
      req.user,
      async (transaction, key) => {
        const found = await StockBatch.findByPk(id(req.params.id), {
          transaction,
        });
        if (!found) throw new InventoryError("Batch not found.", 404);
        const item = await StockItem.findByPk(found.stockItemId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const batch = await StockBatch.findByPk(found.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (typeof req.body.quarantined !== "boolean")
          throw new InventoryError("Choose hold or release.");
        if (Number(batch.reserved) > 0)
          throw new InventoryError(
            "Resolve this batch’s order reservations before placing it on hold.",
            409,
          );
        await batch.update(
          { quarantined: req.body.quarantined },
          { transaction },
        );
        await supplyMovement(
          item,
          batch,
          {
            action: req.body.quarantined ? "hold" : "unhold",
            quantity: 0,
            onHandDelta: 0,
            reservedDelta: 0,
            userId: req.user.id,
            reason: text(req.body.reason, "Reason", 2000),
            operationKey: key,
          },
          transaction,
        );
        return { batch };
      },
    ),
  ),
);
router.get(
  "/movements",
  write,
  run(async (req) => {
    const { limit, offset } = pageOptions(req.query, 50);
    const where = {
      ...dateRange(req.query),
      ...(req.query.stockItemId
        ? { stockItemId: id(req.query.stockItemId) }
        : {}),
      ...(req.query.menuItemId ? { menuItemId: id(req.query.menuItemId) } : {}),
      ...(req.query.action ? { action: req.query.action } : {}),
    };
    const result = await StockMovement.findAndCountAll({
      where,
      include: [
        ...itemBatch,
        { model: MenuItem, as: "menuItem" },
        {
          model: Order,
          as: "order",
          attributes: ["id", "orderNumber", "status"],
        },
      ],
      order: [["id", "DESC"]],
      limit,
      offset,
    });
    return { rows: result.rows, total: result.count, limit, offset };
  }),
);
router.post(
  "/movements/:id/reverse",
  admin,
  run((req) => reverseMovement(req.params.id, req.body, req.user)),
);
router.get(
  "/summary",
  write,
  run(async () => {
    const items = await listStockItems(),
      menu = await menuAvailability();
    const counts = await StockCount.count({ where: { status: "pending" } }),
      waste = await WasteReport.count({ where: { status: "pending" } });
    const settings = await readInventorySettings();
    const soon = new Date();
    soon.setDate(soon.getDate() + settings.expiryWarningDays);
    const expiring = items.flatMap((item) =>
      item.batches
        .filter(
          (batch) =>
            Number(batch.onHand) > 0 &&
            batch.expiryDate &&
            batch.expiryDate <= businessDate(soon),
        )
        .map((batch) => ({ ...batch, itemName: item.name, unit: item.unit })),
    );
    const value = items.reduce(
      (sum, item) =>
        sum +
        item.batches.reduce(
          (total, batch) =>
            total + Number(batch.onHand) * Number(batch.unitCost),
          0,
        ),
      0,
    );
    return {
      itemCount: items.length,
      low: items.filter((item) => item.status === "low"),
      out: items.filter((item) => item.status === "out"),
      preparedLow: menu.filter(
        (item) =>
          !item.archived &&
          item.inventoryMode === "prepared" &&
          item.status === "available" &&
          item.category?.status === "active" &&
          item.onHand - item.reservedStock <= item.reorderLevel,
      ),
      unavailableMenu: menu.filter(
        (item) => !item.archived && item.available === 0,
      ),
      expiring,
      pendingCounts: counts,
      pendingWaste: waste,
      stockValue: Math.round(value * 100) / 100,
      date: businessDate(),
      expiryWarningDays: settings.expiryWarningDays,
    };
  }),
);
export default router;
