import crypto from "node:crypto";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { MenuItem } from "../models/menuItemModel.js";
import { MenuCategory } from "../models/menuCategoryModel.js";
import {
  Supplier,
  StockItem,
  StockBatch,
  StockReceipt,
  StockReceiptLine,
  StockMovement,
  MenuRecipe,
  StockAllocation,
  StockCount,
  WasteReport,
  InventoryOperation,
  InventorySettings,
} from "../models/inventoryModels.js";

export class InventoryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const roundQuantity = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
export const businessDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type).value)
    .join("-");
};
export function amount(value, unit = "", allowZero = false) {
  if (
    !["number", "string"].includes(typeof value) ||
    !/^\d+(\.\d{1,4})?$/.test(String(value))
  )
    throw new InventoryError(
      "Enter a valid quantity with at most four decimal places.",
    );
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number > 9999999999 ||
    (allowZero ? number < 0 : number <= 0)
  )
    throw new InventoryError(
      allowZero
        ? "Quantity must be zero or greater."
        : "Quantity must be greater than zero.",
    );
  if (unit === "pcs" && !Number.isInteger(number))
    throw new InventoryError("Pieces must be a whole number.");
  return roundQuantity(number);
}
export function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0)
    throw new InventoryError("Choose a valid item.");
  return number;
}
export function text(value, label, max = 160, required = true) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new InventoryError(
      `${label} is required and must be ${max} characters or fewer.`,
    );
  return value.trim();
}
export const validBusinessDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
const requireReason = (value) => text(value, "A reason", 2000);
const lock = (transaction) => ({ transaction, lock: transaction.LOCK.UPDATE });
const eligible = (batch) =>
  !batch.quarantined &&
  (!batch.expiryDate || batch.expiryDate >= businessDate());
const fifo = (batches) =>
  [...batches].sort(
    (a, b) =>
      (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999") ||
      new Date(a.receivedAt) - new Date(b.receivedAt) ||
      a.id - b.id,
  );
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

export async function inventoryOperation(
  kind,
  requestId,
  payload,
  user,
  action,
) {
  if (typeof requestId !== "string" || !/^[\w-]{8,128}$/.test(requestId))
    throw new InventoryError(
      "A request ID is required. Refresh this form and try again.",
    );
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(payload)))
    .digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await sequelize.transaction(async (transaction) => {
        const previous = await InventoryOperation.findOne({
          where: { requestId },
          ...lock(transaction),
        });
        if (previous) {
          if (
            previous.userId !== user.id ||
            previous.kind !== kind ||
            previous.fingerprint !== fingerprint
          )
            throw new InventoryError(
              "This request ID was already used for a different change.",
              409,
            );
          return previous.result;
        }
        const operation = await InventoryOperation.create(
          { requestId, kind, fingerprint, userId: user.id },
          { transaction },
        );
        const result = JSON.parse(
          JSON.stringify(await action(transaction, requestId)),
        );
        await operation.update({ result }, { transaction });
        return result;
      });
    } catch (error) {
      const retryable =
        error.original?.errno === 1213 ||
        (error.name === "SequelizeUniqueConstraintError" &&
          error.fields?.requestId);
      if (!retryable || attempt === 2) throw error;
    }
  }
}

export async function supplyMovement(item, batch, change, transaction) {
  const before = Number(item.onHand),
    reservedBefore = Number(item.reserved);
  const next = roundQuantity(before + (change.onHandDelta || 0));
  const reservedNext = roundQuantity(
    reservedBefore + (change.reservedDelta || 0),
  );
  const batchNext = roundQuantity(
    Number(batch.onHand) + (change.onHandDelta || 0),
  );
  const batchReserved = roundQuantity(
    Number(batch.reserved) + (change.reservedDelta || 0),
  );
  if (
    next < 0 ||
    reservedNext < 0 ||
    next < reservedNext ||
    batchNext < 0 ||
    batchReserved < 0 ||
    batchNext < batchReserved
  )
    throw new InventoryError(
      `The available quantity of ${item.name} changed. Refresh and try again.`,
      409,
    );
  await batch.update(
    { onHand: batchNext, reserved: batchReserved },
    { transaction },
  );
  await item.update(
    { onHand: next, reserved: reservedNext, version: item.version + 1 },
    { transaction },
  );
  return StockMovement.create(
    {
      ...change,
      stockItemId: item.id,
      batchId: batch.id,
      unit: item.unit,
      onHandBefore: before,
      onHandAfter: next,
      reservedBefore,
      reservedAfter: reservedNext,
    },
    { transaction },
  );
}

export async function preparedMovement(item, change, transaction) {
  const before = item.stock,
    reservedBefore = item.reservedStock || 0;
  const next = before + (change.onHandDelta || 0),
    reservedNext = reservedBefore + (change.reservedDelta || 0);
  if (
    !Number.isInteger(next) ||
    next < 0 ||
    reservedNext < 0 ||
    next < reservedNext
  )
    throw new InventoryError(
      `There is not enough prepared stock for ${item.name}.`,
      409,
    );
  await item.update(
    { stock: next, reservedStock: reservedNext },
    { transaction },
  );
  return StockMovement.create(
    {
      ...change,
      menuItemId: item.id,
      unit: "pcs",
      onHandBefore: before,
      onHandAfter: next,
      reservedBefore,
      reservedAfter: reservedNext,
    },
    { transaction },
  );
}

export async function listStockItems({ archived = false } = {}) {
  const items = await StockItem.findAll({
    where: archived ? {} : { archived: false },
    include: [
      { model: Supplier, as: "supplier" },
      { model: StockBatch, as: "batches" },
    ],
    order: [["name", "ASC"]],
  });
  return items.map((model) => {
    const item = model.toJSON();
    item.available = roundQuantity(
      item.batches
        .filter(eligible)
        .reduce(
          (sum, batch) => sum + Number(batch.onHand) - Number(batch.reserved),
          0,
        ),
    );
    item.unusable = roundQuantity(
      item.batches
        .filter((batch) => !eligible(batch))
        .reduce((sum, batch) => sum + Number(batch.onHand), 0),
    );
    item.nextExpiry =
      fifo(
        item.batches.filter(
          (batch) => eligible(batch) && Number(batch.onHand) > 0,
        ),
      )[0]?.expiryDate || null;
    item.status = item.archived
      ? "archived"
      : item.available <= 0
        ? "out"
        : item.available <= Number(item.reorderLevel)
          ? "low"
          : "healthy";
    return item;
  });
}

export async function saveStockItem(payload, itemId = null, user = null) {
  return sequelize.transaction(async (transaction) => {
    const previous = itemId
      ? await StockItem.findByPk(id(itemId), lock(transaction))
      : null;
    if (itemId && !previous)
      throw new InventoryError("Supply item not found.", 404);
    const merged = { ...(previous?.toJSON() || {}), ...payload };
    const code = text(merged.code, "Item code", 64).toUpperCase();
    const name = text(merged.name, "Item name");
    if (
      !["ingredient", "packaging"].includes(merged.kind) ||
      !["pcs", "g", "ml"].includes(merged.unit)
    )
      throw new InventoryError("Choose the item type and base unit.");
    const purchaseUnit = text(
      merged.purchaseUnit || merged.unit,
      "Purchase unit",
      40,
    );
    const unitsPerPurchase = amount(merged.unitsPerPurchase ?? 1, merged.unit);
    if (purchaseUnit === merged.unit && unitsPerPurchase !== 1)
      throw new InventoryError(
        "When purchase and base units are the same, the conversion must be 1.",
      );
    const reorderLevel = amount(merged.reorderLevel ?? 0, merged.unit, true);
    const adjustmentLimit =
      merged.adjustmentLimit === null ||
      merged.adjustmentLimit === "" ||
      merged.adjustmentLimit === undefined
        ? null
        : amount(merged.adjustmentLimit, merged.unit, true);
    if (
      user &&
      user.role !== "admin" &&
      adjustmentLimit !==
        (previous?.adjustmentLimit === null || !previous
          ? null
          : Number(previous.adjustmentLimit))
    )
      throw new InventoryError(
        "Admin controls count approval limits. Other supply details can be saved without changing that limit.",
        403,
      );
    const supplierId = merged.supplierId ? id(merged.supplierId) : null;
    if (supplierId && !(await Supplier.findByPk(supplierId, { transaction })))
      throw new InventoryError("Supplier not found.");
    if (
      previous &&
      (previous.unit !== merged.unit || previous.kind !== merged.kind) &&
      (await StockMovement.count({
        where: { stockItemId: previous.id },
        transaction,
      }))
    )
      throw new InventoryError(
        "The type and base unit cannot change after stock has been recorded.",
      );
    if (
      previous &&
      previous.unit !== merged.unit &&
      (
        await MenuRecipe.findAll({ where: { current: true }, transaction })
      ).some((recipe) =>
        recipe.components.some(
          (component) => component.stockItemId === previous.id,
        ),
      )
    )
      throw new InventoryError(
        "This supply is used in a recipe. Its base unit cannot change.",
      );
    if (payload.archived !== undefined && typeof payload.archived !== "boolean")
      throw new InventoryError("Invalid archive status.");
    if (previous && payload.archived && Number(previous.reserved) > 0)
      throw new InventoryError(
        "This supply is reserved for an open order. Resolve the order before archiving it.",
        409,
      );
    const data = {
      code,
      name,
      kind: merged.kind,
      unit: merged.unit,
      purchaseUnit,
      unitsPerPurchase,
      reorderLevel,
      adjustmentLimit,
      location: String(merged.location || "")
        .trim()
        .slice(0, 120),
      supplierId,
      archived: Boolean(merged.archived),
    };
    return previous
      ? previous.update(
          { ...data, version: previous.version + 1 },
          { transaction },
        )
      : StockItem.create(data, { transaction });
  });
}

export async function receiveStock(payload, user) {
  return inventoryOperation(
    "receive",
    payload.requestId,
    payload,
    user,
    async (transaction, key) => {
      if (
        !Array.isArray(payload.lines) ||
        !payload.lines.length ||
        payload.lines.length > 100
      )
        throw new InventoryError("Add between one and 100 delivery lines.");
      const supplierId = payload.supplierId ? id(payload.supplierId) : null;
      if (
        supplierId &&
        !(await Supplier.findOne({
          where: { id: supplierId, active: true },
          transaction,
        }))
      )
        throw new InventoryError("Choose an active supplier.");
      const itemIds = [
        ...new Set(payload.lines.map((line) => id(line.stockItemId))),
      ].sort((a, b) => a - b);
      const locked = await StockItem.findAll({
        where: { id: itemIds },
        order: [["id", "ASC"]],
        ...lock(transaction),
      });
      const items = new Map(locked.map((item) => [item.id, item]));
      const receivedAt = payload.receivedAt
        ? new Date(payload.receivedAt)
        : new Date();
      if (!Number.isFinite(receivedAt.getTime()) || receivedAt > new Date())
        throw new InventoryError(
          "Choose a valid receiving date that is not in the future.",
        );
      const receipt = await StockReceipt.create(
        {
          number: `RCV-${businessDate().replaceAll("-", "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
          supplierId,
          reference: String(payload.reference || "").slice(0, 120),
          notes: String(payload.notes || "").slice(0, 2000),
          receivedAt,
          userId: user.id,
        },
        { transaction },
      );
      for (const [index, line] of payload.lines.entries()) {
        const item = items.get(Number(line.stockItemId));
        if (!item || item.archived)
          throw new InventoryError(
            "Choose an active supply item for each line.",
          );
        const baseUnit = line.unit === item.unit;
        if (!baseUnit && line.unit !== item.purchaseUnit)
          throw new InventoryError(
            `Use ${item.unit} or ${item.purchaseUnit} for ${item.name}.`,
          );
        const purchaseQuantity = amount(
          line.quantity,
          baseUnit ? item.unit : "",
        );
        const conversion = baseUnit ? 1 : Number(item.unitsPerPurchase);
        const quantity = amount(
          roundQuantity(purchaseQuantity * conversion),
          item.unit,
        );
        const unitCost = amount(line.unitCost ?? 0, "", true) / conversion;
        let expiryDate = line.expiryDate || null;
        if (
          expiryDate &&
          (!validBusinessDate(expiryDate) ||
            expiryDate < businessDate(receivedAt))
        )
          throw new InventoryError(
            "An expiry date must be valid and on or after the receiving date.",
          );
        const batch = await StockBatch.create(
          {
            stockItemId: item.id,
            code: String(
              line.batchCode || `${receipt.number}-${index + 1}`,
            ).slice(0, 80),
            receivedAt,
            expiryDate,
            quarantined: Boolean(line.quarantined),
            unitCost: roundQuantity(unitCost),
          },
          { transaction },
        );
        await supplyMovement(
          item,
          batch,
          {
            action: "receive",
            quantity,
            onHandDelta: quantity,
            reservedDelta: 0,
            reason: `Received on ${receipt.number}${payload.reference ? ` (${payload.reference})` : ""}`,
            userId: user.id,
            receiptId: receipt.id,
            operationKey: `${key}-${index}`,
          },
          transaction,
        );
        await StockReceiptLine.create(
          {
            receiptId: receipt.id,
            stockItemId: item.id,
            batchId: batch.id,
            purchaseQuantity,
            purchaseUnit: line.unit,
            conversion,
            quantity,
            unitCost: roundQuantity(unitCost),
          },
          { transaction },
        );
      }
      return {
        receipt: await StockReceipt.findByPk(receipt.id, {
          include: [
            {
              model: StockReceiptLine,
              as: "lines",
              include: [
                { model: StockItem, as: "item" },
                { model: StockBatch, as: "batch" },
              ],
            },
          ],
          transaction,
        }),
      };
    },
  );
}

export async function removeStock(payload, user, action = "waste") {
  if (!["waste", "supplier_return"].includes(action))
    throw new InventoryError("Invalid stock operation.");
  return inventoryOperation(
    action,
    payload.requestId,
    payload,
    user,
    async (transaction, key) => {
      const item = await StockItem.findByPk(
        id(payload.stockItemId),
        lock(transaction),
      );
      if (!item) throw new InventoryError("Supply item not found.", 404);
      const quantity = amount(payload.quantity, item.unit),
        reason = requireReason(payload.reason);
      const batches = await StockBatch.findAll({
        where: {
          stockItemId: item.id,
          ...(payload.batchId ? { id: id(payload.batchId) } : {}),
        },
        order: [["id", "ASC"]],
        ...lock(transaction),
      });
      if (
        roundQuantity(
          batches.reduce(
            (sum, batch) => sum + Number(batch.onHand) - Number(batch.reserved),
            0,
          ),
        ) < quantity
      )
        throw new InventoryError(
          "This quantity includes stock reserved for orders or exceeds the recorded balance.",
          409,
        );
      let remaining = quantity;
      for (const batch of fifo(batches)) {
        const removed = roundQuantity(
          Math.min(remaining, Number(batch.onHand) - Number(batch.reserved)),
        );
        if (removed <= 0) continue;
        await supplyMovement(
          item,
          batch,
          {
            action,
            quantity: removed,
            onHandDelta: -removed,
            reservedDelta: 0,
            reason,
            userId: user.id,
            operationKey: `${key}-${batch.id}`,
          },
          transaction,
        );
        remaining = roundQuantity(remaining - removed);
        if (!remaining) break;
      }
      return {
        item,
        message: `${quantity} ${item.unit} recorded as ${action === "waste" ? "waste" : "a supplier return"}.`,
      };
    },
  );
}

export async function countStock(payload, user) {
  return inventoryOperation(
    "count",
    payload.requestId,
    payload,
    user,
    async (transaction, key) => {
      const item = await StockItem.findByPk(
        id(payload.stockItemId),
        lock(transaction),
      );
      if (!item) throw new InventoryError("Supply item not found.", 404);
      const batch = await StockBatch.findOne({
        where: { id: id(payload.batchId), stockItemId: item.id },
        ...lock(transaction),
      });
      if (!batch)
        throw new InventoryError("Choose the batch that was counted.");
      if (
        !Number.isInteger(payload.expectedVersion) ||
        item.version !== payload.expectedVersion
      )
        throw new InventoryError(
          "Stock changed while this count was open. Refresh the balances and count again.",
          409,
        );
      const countedQuantity = amount(payload.countedQuantity, item.unit, true),
        reason = requireReason(payload.reason);
      if (countedQuantity < Number(batch.reserved))
        throw new InventoryError(
          "The count is below the quantity reserved for open orders. Resolve those reservations first.",
          409,
        );
      const difference = roundQuantity(countedQuantity - Number(batch.onHand));
      const settings = await InventorySettings.findByPk(1, { transaction });
      const approval =
        user.role !== "admin" &&
        (settings?.countApproval === "admin_review" ||
          (item.adjustmentLimit !== null &&
            Math.abs(difference) > Number(item.adjustmentLimit)));
      const count = await StockCount.create(
        {
          stockItemId: item.id,
          batchId: batch.id,
          expectedVersion: item.version,
          previousQuantity: batch.onHand,
          countedQuantity,
          difference,
          reason,
          userId: user.id,
          status: approval ? "pending" : "applied",
          reviewedById: approval ? null : user.id,
          reviewedAt: approval ? null : new Date(),
        },
        { transaction },
      );
      if (!approval)
        await supplyMovement(
          item,
          batch,
          {
            action: "count",
            quantity: Math.abs(difference),
            onHandDelta: difference,
            reservedDelta: 0,
            reason,
            userId: user.id,
            operationKey: key,
          },
          transaction,
        );
      return {
        count,
        message: approval
          ? "Count submitted for Admin approval. The balance has not changed."
          : "Count recorded.",
      };
    },
  );
}

export async function reviewCount(countId, decision, user) {
  if (!["approve", "reject"].includes(decision))
    throw new InventoryError("Choose approve or reject.");
  return sequelize.transaction(async (transaction) => {
    const count = await StockCount.findByPk(id(countId), lock(transaction));
    if (!count) throw new InventoryError("Count not found.", 404);
    if (count.status !== "pending")
      return { count, message: "This count has already been reviewed." };
    if (decision === "reject")
      return {
        count: await count.update(
          { status: "rejected", reviewedById: user.id, reviewedAt: new Date() },
          { transaction },
        ),
      };
    const item = await StockItem.findByPk(count.stockItemId, lock(transaction));
    const batch = await StockBatch.findByPk(count.batchId, lock(transaction));
    if (
      item.version !== count.expectedVersion ||
      Number(count.countedQuantity) < Number(batch.reserved)
    ) {
      await count.update(
        { status: "stale", reviewedById: user.id, reviewedAt: new Date() },
        { transaction },
      );
      return {
        count,
        conflict: true,
        message:
          "Stock changed after this count was submitted. A new count is required.",
      };
    }
    await supplyMovement(
      item,
      batch,
      {
        action: "count",
        quantity: Math.abs(Number(count.difference)),
        onHandDelta: Number(count.difference),
        reservedDelta: 0,
        reason: count.reason,
        userId: user.id,
        operationKey: `approved-count-${count.id}`,
      },
      transaction,
    );
    await count.update(
      { status: "applied", reviewedById: user.id, reviewedAt: new Date() },
      { transaction },
    );
    return { count };
  });
}

export async function preparedStock(payload, user, add = false) {
  return inventoryOperation(
    "prepared",
    payload.requestId,
    payload,
    user,
    async (transaction, key) => {
      const item = await MenuItem.findByPk(
        id(payload.menuItemId),
        lock(transaction),
      );
      if (!item || item.inventoryMode !== "prepared")
        throw new InventoryError(
          "Choose a menu item that uses prepared stock.",
        );
      if (
        !add &&
        (!Number.isInteger(payload.expectedStock) ||
          payload.expectedStock !== item.stock)
      )
        throw new InventoryError(
          "Prepared stock changed. Refresh before recording this change.",
          409,
        );
      const waste = payload.operation === "waste";
      if (!["receive", "count", "waste"].includes(payload.operation))
        throw new InventoryError("Choose receive, count or waste.");
      const quantity = amount(payload.quantity, "pcs", !add && !waste);
      const delta = add ? quantity : waste ? -quantity : quantity - item.stock;
      await preparedMovement(
        item,
        {
          action: add ? "receive" : waste ? "waste" : "count",
          quantity: Math.abs(delta),
          onHandDelta: delta,
          reservedDelta: 0,
          reason: requireReason(payload.reason),
          userId: user.id,
          operationKey: key,
        },
        transaction,
      );
      return { item };
    },
  );
}

export async function reverseMovement(movementId, payload, user) {
  return inventoryOperation(
    "reversal",
    payload.requestId,
    payload,
    user,
    async (transaction, key) => {
      const original = await StockMovement.findByPk(
        id(movementId),
        lock(transaction),
      );
      if (
        !original ||
        !["opening", "receive", "count", "waste", "supplier_return"].includes(
          original.action,
        ) ||
        Number(original.reservedDelta) !== 0 ||
        Number(original.onHandDelta) === 0
      )
        throw new InventoryError(
          "This movement cannot be reversed here. Use the order workflow for reservations and consumption.",
        );
      if (
        await StockMovement.count({
          where: { reversesId: original.id },
          transaction,
        })
      )
        throw new InventoryError("This movement was already reversed.", 409);
      const change = {
        action: "reversal",
        quantity: original.quantity,
        onHandDelta: -Number(original.onHandDelta),
        reservedDelta: 0,
        reason: requireReason(payload.reason),
        userId: user.id,
        reversesId: original.id,
        operationKey: key,
      };
      let movement;
      if (original.stockItemId) {
        const item = await StockItem.findByPk(
          original.stockItemId,
          lock(transaction),
        );
        const batch = await StockBatch.findByPk(
          original.batchId,
          lock(transaction),
        );
        movement = await supplyMovement(item, batch, change, transaction);
      } else {
        const item = await MenuItem.findByPk(
          original.menuItemId,
          lock(transaction),
        );
        movement = await preparedMovement(item, change, transaction);
      }
      return { movement };
    },
  );
}

export async function reportWaste(payload, user) {
  return inventoryOperation(
    "waste_report",
    payload.requestId,
    payload,
    user,
    async (transaction) => {
      const item = await StockItem.findByPk(id(payload.stockItemId), {
        transaction,
      });
      if (!item || item.archived)
        throw new InventoryError("Choose an active supply item.");
      const batchId = payload.batchId ? id(payload.batchId) : null;
      if (
        batchId &&
        !(await StockBatch.findOne({
          where: { id: batchId, stockItemId: item.id },
          transaction,
        }))
      )
        throw new InventoryError("Batch not found.");
      return {
        report: await WasteReport.create(
          {
            stockItemId: item.id,
            batchId,
            quantity: amount(payload.quantity, item.unit),
            reason: requireReason(payload.reason),
            userId: user.id,
          },
          { transaction },
        ),
      };
    },
  );
}

export async function reviewWaste(reportId, decision, user) {
  return sequelize.transaction(async (transaction) => {
    const report = await WasteReport.findByPk(id(reportId), lock(transaction));
    if (!report) throw new InventoryError("Waste report not found.", 404);
    if (report.status !== "pending") return { report };
    if (!["accept", "reject"].includes(decision))
      throw new InventoryError("Choose accept or reject.");
    if (decision === "accept") {
      const item = await StockItem.findByPk(
        report.stockItemId,
        lock(transaction),
      );
      const batches = await StockBatch.findAll({
        where: {
          stockItemId: item.id,
          ...(report.batchId ? { id: report.batchId } : {}),
        },
        order: [["id", "ASC"]],
        ...lock(transaction),
      });
      let remaining = Number(report.quantity);
      if (
        batches.reduce(
          (sum, batch) => sum + Number(batch.onHand) - Number(batch.reserved),
          0,
        ) < remaining
      )
        throw new InventoryError(
          "There is not enough unreserved stock to accept this report.",
          409,
        );
      for (const batch of fifo(batches)) {
        const quantity = roundQuantity(
          Math.min(remaining, Number(batch.onHand) - Number(batch.reserved)),
        );
        if (quantity <= 0) continue;
        await supplyMovement(
          item,
          batch,
          {
            action: "waste",
            quantity,
            onHandDelta: -quantity,
            reservedDelta: 0,
            reason: report.reason,
            userId: user.id,
            operationKey: `waste-report-${report.id}-${batch.id}`,
          },
          transaction,
        );
        remaining = roundQuantity(remaining - quantity);
        if (!remaining) break;
      }
    }
    await report.update(
      {
        status: decision === "accept" ? "accepted" : "rejected",
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
      { transaction },
    );
    return { report };
  });
}
