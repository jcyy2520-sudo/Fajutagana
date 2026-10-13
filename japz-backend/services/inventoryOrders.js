import { sequelize } from "../models/db.js";
import { Order } from "../models/orderModel.js";
import { OrderItem } from "../models/orderItemModel.js";
import { Payment } from "../models/paymentModel.js";
import {
  StockItem,
  StockBatch,
  StockAllocation,
  StockMovement,
} from "../models/inventoryModels.js";
import {
  InventoryError,
  amount,
  id,
  text,
  businessDate,
  roundQuantity,
  inventoryOperation,
  supplyMovement,
  preparedMovement,
} from "./inventoryService.js";
import {
  loadMenuGraph,
  menuRequirements,
  menuOptions,
} from "./menuAvailability.js";
const lock = (transaction) => ({ transaction, lock: transaction.LOCK.UPDATE });
const money = (value, label) => {
  const number = Number(value);
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(number) ||
    number < 0 ||
    number > 99999999.99
  )
    throw new InventoryError(`${label} must be a valid amount.`);
  return Math.round(number * 100) / 100;
};
const fefo = (batches) =>
  [...batches].sort(
    (a, b) =>
      (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999") ||
      new Date(a.receivedAt) - new Date(b.receivedAt) ||
      a.id - b.id,
  );

async function reserveOrder(order, items, user, transaction) {
  const graph = await loadMenuGraph(transaction);
  const plan = menuRequirements(graph, items, order.orderType || "dine-in");
  if (!plan.prepared.size && !plan.supplies.size)
    throw new InventoryError(
      "These recipes have no components for this order type.",
      409,
    );
  const stocks = await StockItem.findAll({
    where: { id: [...plan.supplies.keys()].sort((a, b) => a - b) },
    order: [["id", "ASC"]],
    ...lock(transaction),
  });
  const stockMap = new Map(stocks.map((item) => [item.id, item]));
  const batches = await StockBatch.findAll({
    where: { stockItemId: [...plan.supplies.keys()] },
    order: [["id", "ASC"]],
    ...lock(transaction),
  });
  const prepared = [],
    supplies = [];
  for (const [menuId, quantity] of [...plan.prepared.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const menu = graph.menus.get(menuId);
    if (menu.stock - menu.reservedStock < quantity)
      throw new InventoryError(
        `Only ${menu.stock - menu.reservedStock} ${menu.name} are available. Refresh the cart.`,
        409,
      );
    await preparedMovement(
      menu,
      {
        action: "reserve",
        quantity,
        onHandDelta: 0,
        reservedDelta: quantity,
        reason: `Reserved for ${order.orderNumber}`,
        userId: user.id,
        orderId: order.id,
        operationKey: `order-${order.id}-reserve-menu-${menuId}`,
      },
      transaction,
    );
    prepared.push({ menuItemId: menuId, quantity });
  }
  for (const [stockId, quantity] of [...plan.supplies.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const item = stockMap.get(stockId);
    const usable = fefo(
      batches.filter(
        (batch) =>
          batch.stockItemId === stockId &&
          !batch.quarantined &&
          (!batch.expiryDate || batch.expiryDate >= businessDate()),
      ),
    );
    const available = roundQuantity(
      usable.reduce(
        (sum, batch) => sum + Number(batch.onHand) - Number(batch.reserved),
        0,
      ),
    );
    if (!item || item.archived || available < quantity)
      throw new InventoryError(
        `There is not enough ${item?.name || "recipe stock"} for this cart. Inventory must replenish it.`,
        409,
      );
    let remaining = quantity;
    for (const batch of usable) {
      const reserved = roundQuantity(
        Math.min(remaining, Number(batch.onHand) - Number(batch.reserved)),
      );
      if (reserved <= 0) continue;
      await supplyMovement(
        item,
        batch,
        {
          action: "reserve",
          quantity: reserved,
          onHandDelta: 0,
          reservedDelta: reserved,
          reason: `Reserved for ${order.orderNumber}`,
          userId: user.id,
          orderId: order.id,
          operationKey: `order-${order.id}-reserve-batch-${batch.id}`,
        },
        transaction,
      );
      supplies.push({
        stockItemId: stockId,
        batchId: batch.id,
        quantity: reserved,
      });
      remaining = roundQuantity(remaining - reserved);
      if (!remaining) break;
    }
  }
  await StockAllocation.create(
    {
      orderId: order.id,
      state: "reserved",
      prepared,
      supplies,
      recipes: plan.recipes,
    },
    { transaction },
  );
  return graph;
}

export async function applyOrderInventory(order, target, user, transaction) {
  const allocation = await StockAllocation.findOne({
    where: { orderId: order.id },
    ...lock(transaction),
  });
  // Orders placed before this upgrade already had their stock deducted.
  if (!allocation) return;
  if (allocation.state === "consumed" && target === "cancelled") {
    const original = await StockMovement.findAll({
      where: { orderId: order.id, action: "consume" },
      transaction,
    });
    for (const movement of original) {
      await StockMovement.create(
        {
          ...movement.toJSON(),
          id: undefined,
          createdAt: undefined,
          updatedAt: undefined,
          action: "waste",
          onHandDelta: 0,
          reservedDelta: 0,
          onHandBefore: movement.onHandAfter,
          reservedBefore: movement.reservedAfter,
          reason: `Prepared order ${order.orderNumber} cancelled; stock remains consumed.`,
          userId: user.id,
          operationKey: `order-${order.id}-cancel-waste-${movement.id}`,
        },
        { transaction },
      );
    }
    await allocation.update({ state: "wasted" }, { transaction });
    return;
  }
  if (allocation.state !== "reserved") return;
  const release = target === "cancelled";
  if (!release && !["preparing", "ready", "completed"].includes(target)) return;
  const graph = await loadMenuGraph(transaction);
  const stockIds = [
    ...new Set(allocation.supplies.map((line) => line.stockItemId)),
  ].sort((a, b) => a - b);
  const stocks = await StockItem.findAll({
    where: { id: stockIds },
    order: [["id", "ASC"]],
    ...lock(transaction),
  });
  const stockMap = new Map(stocks.map((item) => [item.id, item]));
  const batches = await StockBatch.findAll({
    where: { id: allocation.supplies.map((line) => line.batchId) },
    order: [["id", "ASC"]],
    ...lock(transaction),
  });
  const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
  // Expired or quarantined reservations must be released and replaced before preparation.
  if (
    !release &&
    allocation.supplies.some((line) => {
      const batch = batchMap.get(line.batchId);
      return (
        !batch ||
        batch.quarantined ||
        (batch.expiryDate && batch.expiryDate < businessDate())
      );
    })
  )
    throw new InventoryError(
      "Reserved stock is expired or on hold. Cancel this pending order, replenish stock, and place it again.",
      409,
    );
  for (const line of allocation.prepared)
    await preparedMovement(
      graph.menus.get(line.menuItemId),
      {
        action: release ? "release" : "consume",
        quantity: line.quantity,
        onHandDelta: release ? 0 : -line.quantity,
        reservedDelta: -line.quantity,
        reason: `${release ? "Released" : "Used"} for ${order.orderNumber}`,
        userId: user.id,
        orderId: order.id,
        operationKey: `order-${order.id}-${release ? "release" : "consume"}-menu-${line.menuItemId}`,
      },
      transaction,
    );
  for (const line of allocation.supplies)
    await supplyMovement(
      stockMap.get(line.stockItemId),
      batchMap.get(line.batchId),
      {
        action: release ? "release" : "consume",
        quantity: line.quantity,
        onHandDelta: release ? 0 : -line.quantity,
        reservedDelta: -line.quantity,
        reason: `${release ? "Released" : "Used"} for ${order.orderNumber}`,
        userId: user.id,
        orderId: order.id,
        operationKey: `order-${order.id}-${release ? "release" : "consume"}-batch-${line.batchId}`,
      },
      transaction,
    );
  await allocation.update(
    { state: release ? "released" : "consumed" },
    { transaction },
  );
}

export async function createInventoryOrder(payload, user) {
  const requestId = payload.clientRequestId || payload.orderNumber;
  return inventoryOperation(
    "order",
    requestId,
    payload,
    user,
    async (transaction) => {
      const { items, payment } = payload;
      if (!Array.isArray(items) || !items.length || !payment)
        throw new InventoryError("Items and payment are required.");
      if (!["cash", "card", "digital"].includes(payment.method))
        throw new InventoryError("Choose a valid payment method.");
      if (payload.status && payload.status !== "pending")
        throw new InventoryError("New orders must start as pending.");
      const orderType = payload.orderType || "dine-in";
      if (!["dine-in", "take-out", "delivery"].includes(orderType))
        throw new InventoryError("Choose a valid order type.");
      const total = money(payload.total, "Total"),
        subtotal = money(payload.subtotal ?? total, "Subtotal"),
        discount = money(payload.discount ?? 0, "Discount");
      const voucherAmount = money(payload.voucherAmount ?? 0, "Voucher amount");
      const effectiveDiscount = Math.min(subtotal, discount + voucherAmount);
      if (
        discount > subtotal ||
        Math.abs(subtotal - effectiveDiscount - total) > 0.01
      )
        throw new InventoryError(
          "The order totals do not match. Refresh the cart.",
        );
      if (money(payment.amount, "Payment") !== total)
        throw new InventoryError(
          "The payment amount does not match the order total.",
        );
      const order = await Order.create(
        {
          orderNumber: text(payload.orderNumber, "Order number", 100),
          clientRequestId: requestId,
          cashierId: user.id,
          customerName: String(payload.customerName || "").slice(0, 255),
          subtotal,
          discount: effectiveDiscount,
          total,
          status: "pending",
          orderType,
          tableNumber: payload.tableNumber || null,
          deliveryAddress: payload.deliveryAddress || null,
          notes: payload.notes || null,
        },
        { transaction },
      );
      const graph = await reserveOrder(order, items, user, transaction);
      let itemsTotal = 0;
      const orderItems = [];
      for (const line of items) {
        const quantity = amount(line.quantity, "pcs"),
          price = money(line.price, "Item price"),
          lineTotal = money(line.total, "Line total");
        const menu = graph.menus.get(id(line.id ?? line.menuItemId));
        let currentPrice = Number(menu.price);
        if (line.modifiers?.size) {
          const sizeIndex = menuOptions(menu, "sizes").indexOf(
              line.modifiers.size,
            ),
            size = menu.sizes?.[sizeIndex];
          const sizePrice =
            typeof size === "string"
              ? Number(size.match(/₱([\d.]+)$/)?.[1])
              : Number(size?.price);
          if (Number.isFinite(sizePrice) && sizePrice > 0)
            currentPrice = sizePrice;
        }
        if (Math.abs(price - currentPrice) > 0.01)
          throw new InventoryError(
            `The price of ${menu.name} changed. Refresh the cart.`,
            409,
          );
        if (Math.abs(price * quantity - lineTotal) > 0.01)
          throw new InventoryError(
            "An item total does not match its quantity and price.",
          );
        itemsTotal += lineTotal;
        orderItems.push(
          await OrderItem.create(
            {
              orderId: order.id,
              menuItemId: id(line.id ?? line.menuItemId),
              name: graph.menus.get(id(line.id ?? line.menuItemId)).name,
              quantity,
              price,
              total: lineTotal,
              modifiers: line.modifiers || null,
            },
            { transaction },
          ),
        );
      }
      if (Math.abs(itemsTotal - subtotal) > 0.01)
        throw new InventoryError("The subtotal does not match the cart.");
      const received =
        payment.amountReceived === null || payment.amountReceived === undefined
          ? null
          : money(payment.amountReceived, "Cash received");
      if (payment.method === "cash" && (received === null || received < total))
        throw new InventoryError("Cash received must cover the total.");
      const paymentRecord = await Payment.create(
        {
          orderId: order.id,
          method: payment.method,
          amount: total,
          amountReceived: received,
          change:
            received === null
              ? null
              : Math.round((received - total) * 100) / 100,
          status: "completed",
        },
        { transaction },
      );
      return {
        message: "Order created successfully",
        order: { ...order.toJSON(), items: orderItems, payment: paymentRecord },
      };
    },
  );
}

export async function changeOrderStatus(orderId, target, user) {
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(id(orderId), lock(transaction));
    if (!order) throw new InventoryError("Order not found.", 404);
    const transitions = {
      pending: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!transitions[target]) throw new InventoryError("Invalid order status.");
    if (order.status === target)
      return { message: "Order status is already up to date.", order };
    if (!transitions[order.status].includes(target))
      throw new InventoryError(
        `An order cannot move from ${order.status} to ${target}.`,
        409,
      );
    if (
      user.role === "cashier" &&
      !(target === "completed" && order.status === "ready") &&
      !(
        target === "cancelled" &&
        order.status === "pending" &&
        order.cashierId === user.id
      )
    )
      throw new InventoryError(
        "Cashiers can cancel their pending orders or complete ready orders.",
        403,
      );
    if (!["admin", "kitchen", "cashier"].includes(user.role))
      throw new InventoryError("This role cannot change order status.", 403);
    await applyOrderInventory(order, target, user, transaction);
    await order.update(
      {
        status: target,
        ...(target === "preparing" && !order.preparedById
          ? { preparedById: user.id }
          : {}),
        ...(target === "completed" ? { completedAt: new Date() } : {}),
      },
      { transaction },
    );
    return { message: "Order status updated successfully", order };
  });
}
