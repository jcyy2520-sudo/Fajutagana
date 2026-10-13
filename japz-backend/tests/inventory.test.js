// Existing Inventory tests scoped to the extracted API; see docs/EXTRACTION.md.
import "dotenv/config";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// Each suite uses its own signing key, independently of local credentials.
process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");

const database = `japz_inventory_test_${Date.now()}`;
let connection, server, base, sequelize, models, service, availability, orders;
const users = {},
  tokens = {};
const requestId = () => crypto.randomUUID();
before(async () => {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });
  await connection.query(`CREATE DATABASE \`${database}\``);
  for (const key of [
    "DATABASE_URL",
    "MYSQL_URL",
    "MYSQL_PUBLIC_URL",
    "MYSQLHOST",
    "MYSQL_HOST",
  ])
    delete process.env[key];
  process.env.DB_DATABASE = database;
  process.env.NODE_ENV = "test";
  ({ sequelize } = await import("../models/db.js"));
  models = {
    ...(await import("../models/index.js")),
    ...(await import("../models/inventoryModels.js")),
  };
  service = await import("../services/inventoryService.js");
  availability = await import("../services/menuAvailability.js");
  orders = await import("../services/inventoryOrders.js");
  await sequelize.sync({ alter: false });
  for (const role of ["admin", "inventory", "cashier", "kitchen"]) {
    users[role] = await models.User.create({
      name: `${role} test`,
      email: `${role}@test.local`,
      password: await bcrypt.hash(requestId(), 4),
      role,
      status: "approved",
    });
    tokens[role] = jwt.sign(
      { id: users[role].id, role },
      process.env.JWT_SECRET,
    );
  }
  const app = express();
  app.use(express.json());
  app.use((await import("../routes/index.js")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (sequelize) await sequelize.close();
  if (connection) {
    if (!/^japz_inventory_test_\d+$/.test(database))
      throw new Error("Unsafe test database");
    await connection.query(`DROP DATABASE \`${database}\``);
    await connection.end();
  }
});
async function api(role, method, path, body) {
  const result = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: result.status, data: await result.json() };
}
async function prepared(quantity = 10, extras = {}) {
  const category = await models.MenuCategory.create({
    name: requestId(),
    status: "active",
  });
  return models.MenuItem.create({
    name: requestId(),
    categoryId: category.id,
    price: 10,
    stock: quantity,
    ...extras,
  });
}
async function supply(quantity = 10, extras = {}) {
  const item = await service.saveStockItem({
    code: requestId(),
    name: "Test supply",
    kind: "ingredient",
    unit: "g",
    purchaseUnit: "kg",
    unitsPerPurchase: 1000,
    ...extras,
  });
  if (quantity)
    await service.receiveStock(
      {
        requestId: requestId(),
        lines: [
          { stockItemId: item.id, unit: item.unit, quantity, unitCost: 0.1 },
        ],
      },
      users.inventory,
    );
  return models.StockItem.findByPk(item.id);
}
function orderPayload(menu, quantity = 1, extras = {}) {
  return {
    clientRequestId: requestId(),
    orderNumber: `TEST-${requestId()}`,
    subtotal: 10 * quantity,
    discount: 0,
    total: 10 * quantity,
    orderType: "dine-in",
    status: "pending",
    items: [
      {
        id: menu.id,
        name: menu.name,
        price: 10,
        quantity,
        total: 10 * quantity,
      },
    ],
    payment: {
      method: "cash",
      amount: 10 * quantity,
      amountReceived: 10 * quantity,
    },
    ...extras,
  };
}
test("negative and fractional piece quantities are rejected without changing balances", async () => {
  const menu = await prepared(2);
  for (const quantity of [-3, 1.5, 0])
    assert.equal(
      (
        await api(
          "cashier",
          "POST",
          "/api/orders",
          orderPayload(menu, quantity),
        )
      ).status,
      400,
    );
  await menu.reload();
  assert.equal(menu.stock, 2);
  assert.equal(menu.reservedStock, 0);
});
test("receipt history pages remain reachable and invalid page sizes are rejected", async () => {
  const item = await supply(0);
  for (let index = 0; index < 3; index++)
    await service.receiveStock(
      {
        requestId: requestId(),
        lines: [
          { stockItemId: item.id, quantity: 1, unit: "g" },
          { stockItemId: item.id, quantity: 1, unit: "g" },
        ],
      },
      users.inventory,
    );
  const first = (
    await api("inventory", "GET", "/api/inventory/receipts?limit=2&offset=0")
  ).data;
  const next = (
    await api("inventory", "GET", "/api/inventory/receipts?limit=2&offset=2")
  ).data;
  assert.equal(first.length, 2);
  assert.ok(next.length);
  assert.equal(first[0].lines.length, 2);
  assert.equal(
    first.some((receipt) => next.some((other) => receipt.id === other.id)),
    false,
  );
  assert.equal(
    (await api("inventory", "GET", "/api/inventory/receipts?limit=0")).status,
    400,
  );
  assert.equal(
    (await api("inventory", "GET", "/api/inventory/movements?offset=1.5"))
      .status,
    400,
  );
});
test("overselling is rejected atomically, including simultaneous carts", async () => {
  const menu = await prepared(2);
  assert.equal(
    (await api("cashier", "POST", "/api/orders", orderPayload(menu, 3))).status,
    409,
  );
  const results = await Promise.all([
    api("cashier", "POST", "/api/orders", orderPayload(menu, 2)),
    api("cashier", "POST", "/api/orders", orderPayload(menu, 2)),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  await menu.reload();
  assert.equal(menu.stock, 2);
  assert.equal(menu.reservedStock, 2);
});
test("prepared stock is reserved, consumed once and released on pending cancellation", async () => {
  const menu = await prepared(5);
  const created = await orders.createInventoryOrder(
    orderPayload(menu, 2),
    users.cashier,
  );
  await orders.changeOrderStatus(created.order.id, "preparing", users.kitchen);
  await orders.changeOrderStatus(created.order.id, "preparing", users.kitchen);
  await menu.reload();
  assert.equal(menu.stock, 3);
  assert.equal(menu.reservedStock, 0);
  await orders.changeOrderStatus(created.order.id, "cancelled", users.kitchen);
  await menu.reload();
  assert.equal(menu.stock, 3);
  assert.equal(
    await models.StockMovement.count({
      where: { orderId: created.order.id, action: "waste" },
    }),
    1,
  );
  const pending = await orders.createInventoryOrder(
    orderPayload(menu, 2),
    users.cashier,
  );
  await orders.changeOrderStatus(pending.order.id, "cancelled", users.cashier);
  await menu.reload();
  assert.equal(menu.stock, 3);
  assert.equal(menu.reservedStock, 0);
});
test("order retry is idempotent and a reused request cannot change the payload", async () => {
  const menu = await prepared(5),
    payload = orderPayload(menu, 2);
  const first = await orders.createInventoryOrder(payload, users.cashier),
    second = await orders.createInventoryOrder(payload, users.cashier);
  assert.equal(first.order.id, second.order.id);
  await menu.reload();
  assert.equal(menu.reservedStock, 2);
  await assert.rejects(
    () =>
      orders.createInventoryOrder(
        { ...payload, customerName: "Changed" },
        users.cashier,
      ),
    /different change/,
  );
});
test("archived and inactive category items cannot be ordered", async () => {
  const menu = await prepared(5, { archived: true });
  assert.equal(
    (await api("cashier", "POST", "/api/orders", orderPayload(menu))).status,
    409,
  );
  await menu.update({ archived: false });
  await models.MenuCategory.update(
    { status: "inactive" },
    { where: { id: menu.categoryId } },
  );
  assert.equal(
    (await api("cashier", "POST", "/api/orders", orderPayload(menu))).status,
    409,
  );
});
test("receiving converts purchase units, records lot costs, and retries only once", async () => {
  const item = await supply(0),
    payload = {
      requestId: requestId(),
      lines: [
        {
          stockItemId: item.id,
          quantity: 2,
          unit: "kg",
          unitCost: 120,
          batchCode: "Delivery A",
        },
      ],
    };
  const first = await service.receiveStock(payload, users.inventory),
    second = await service.receiveStock(payload, users.inventory);
  assert.equal(first.receipt.id, second.receipt.id);
  await item.reload();
  assert.equal(Number(item.onHand), 2000);
  const batch = await models.StockBatch.findOne({
    where: { stockItemId: item.id },
  });
  assert.equal(Number(batch.unitCost), 0.12);
});
test("parallel receipts preserve every quantity and failed multi-line receipts roll back", async () => {
  const item = await supply(0);
  await Promise.all(
    [2, 3, 3].map((quantity) =>
      service.receiveStock(
        {
          requestId: requestId(),
          lines: [{ stockItemId: item.id, quantity, unit: "g" }],
        },
        users.inventory,
      ),
    ),
  );
  await item.reload();
  assert.equal(Number(item.onHand), 8);
  await assert.rejects(() =>
    service.receiveStock(
      {
        requestId: requestId(),
        lines: [
          { stockItemId: item.id, quantity: 2, unit: "g" },
          { stockItemId: item.id, quantity: -3, unit: "g" },
        ],
      },
      users.inventory,
    ),
  );
  await item.reload();
  assert.equal(Number(item.onHand), 8);
});
async function recipeMenu(item, quantity = 6, extras = {}) {
  const menu = await prepared(0, extras);
  await availability.saveRecipe(
    menu.id,
    {
      label: "Test recipe",
      expectedVersion: 0,
      components: [{ type: "stock", stockItemId: item.id, quantity }],
    },
    users.inventory,
  );
  await availability.saveMenuAvailability(menu.id, { inventoryMode: "recipe" });
  return menu;
}
test("recipe availability and cart limits include shared ingredients and packaging", async () => {
  const item = await supply(10),
    first = await recipeMenu(item),
    second = await recipeMenu(item);
  const result = await availability.menuAvailability();
  assert.equal(result.find((menu) => menu.id === first.id).available, 1);
  const payload = orderPayload(first, 1, {
    subtotal: 20,
    total: 20,
    items: [...orderPayload(first).items, ...orderPayload(second).items],
    payment: { method: "cash", amount: 20, amountReceived: 20 },
  });
  assert.equal(
    (await api("cashier", "POST", "/api/orders", payload)).status,
    409,
  );
  await item.reload();
  assert.equal(Number(item.reserved), 0);
  const packaging = await supply(0, {
    kind: "packaging",
    unit: "pcs",
    purchaseUnit: "box",
    unitsPerPurchase: 50,
  });
  await availability.saveRecipe(
    first.id,
    {
      label: "With takeout packaging",
      expectedVersion: 1,
      components: [
        { type: "stock", stockItemId: item.id, quantity: 6 },
        {
          type: "stock",
          stockItemId: packaging.id,
          quantity: 1,
          useFor: "off-premise",
        },
      ],
    },
    users.inventory,
  );
  assert.equal(
    (await availability.menuAvailability({ orderType: "dine-in" })).find(
      (menu) => menu.id === first.id,
    ).available,
    1,
  );
  assert.equal(
    (await availability.menuAvailability({ orderType: "take-out" })).find(
      (menu) => menu.id === first.id,
    ).available,
    0,
  );
});
test("expiry, batch hold and FEFO control allocations", async () => {
  const item = await supply(0),
    today = service.businessDate(),
    tomorrow = service.businessDate(new Date(Date.now() + 86400000));
  for (const expiryDate of [tomorrow, today])
    await service.receiveStock(
      {
        requestId: requestId(),
        lines: [{ stockItemId: item.id, quantity: 5, unit: "g", expiryDate }],
      },
      users.inventory,
    );
  const menu = await recipeMenu(item, 3),
    created = await orders.createInventoryOrder(
      orderPayload(menu),
      users.cashier,
    );
  const allocation = await models.StockAllocation.findOne({
    where: { orderId: created.order.id },
  });
  const batch = await models.StockBatch.findByPk(
    allocation.supplies[0].batchId,
  );
  assert.equal(batch.expiryDate, today);
  await batch.update({
    expiryDate: service.businessDate(new Date(Date.now() - 86400000)),
  });
  await assert.rejects(
    () =>
      orders.changeOrderStatus(created.order.id, "preparing", users.kitchen),
    /expired/,
  );
  await orders.changeOrderStatus(created.order.id, "cancelled", users.cashier);
  await item.reload();
  assert.equal(Number(item.reserved), 0);
  assert.equal(Number(item.onHand), 10);
  assert.equal(
    (await service.listStockItems()).find((stock) => stock.id === item.id)
      .available,
    5,
  );
});
test("recipe versions, modifiers and combo components affect availability without rewriting history", async () => {
  const item = await supply(20),
    menu = await recipeMenu(item, 2, {
      hasSize: true,
      sizes: ["Small", "Large"],
    });
  await availability.saveRecipe(
    menu.id,
    {
      size: "Large",
      label: "Large recipe",
      expectedVersion: 0,
      components: [{ type: "stock", stockItemId: item.id, quantity: 5 }],
    },
    users.inventory,
  );
  const view = (await availability.menuAvailability()).find(
    (value) => value.id === menu.id,
  );
  assert.equal(
    view.variants.find((value) => value.size === "Small").available,
    10,
  );
  assert.equal(
    view.variants.find((value) => value.size === "Large").available,
    4,
  );
  assert.equal(
    (await api("cashier", "POST", "/api/orders", orderPayload(menu))).status,
    400,
  );
  const combo = await prepared(0);
  await availability.saveRecipe(
    combo.id,
    {
      expectedVersion: 0,
      components: [
        {
          type: "menu",
          menuItemId: menu.id,
          quantity: 2,
          modifiers: { size: "Large" },
        },
      ],
    },
    users.inventory,
  );
  await availability.saveMenuAvailability(combo.id, {
    inventoryMode: "recipe",
  });
  assert.equal(
    (await availability.menuAvailability()).find(
      (value) => value.id === combo.id,
    ).available,
    2,
  );
  await assert.rejects(
    () =>
      availability.saveRecipe(
        menu.id,
        {
          expectedVersion: 1,
          components: [{ type: "menu", menuItemId: combo.id, quantity: 1 }],
        },
        users.inventory,
      ),
    /circular/,
  );
});
test("physical counts detect stale balances, require configured approval and preserve reserved stock", async () => {
  const item = await supply(10, { adjustmentLimit: 2 });
  const batch = await models.StockBatch.findOne({
    where: { stockItemId: item.id },
  });
  await item.reload();
  const payload = {
    requestId: requestId(),
    stockItemId: item.id,
    batchId: batch.id,
    expectedVersion: item.version,
    countedQuantity: 5,
    reason: "Physical count",
  };
  const result = await service.countStock(payload, users.inventory);
  assert.equal(result.count.status, "pending");
  await item.reload();
  assert.equal(Number(item.onHand), 10);
  await service.receiveStock(
    {
      requestId: requestId(),
      lines: [{ stockItemId: item.id, quantity: 1, unit: "g" }],
    },
    users.inventory,
  );
  assert.equal(
    (await service.reviewCount(result.count.id, "approve", users.admin)).count
      .status,
    "stale",
  );
  await item.reload();
  const next = await service.countStock(
    { ...payload, requestId: requestId(), expectedVersion: item.version },
    users.inventory,
  );
  await service.reviewCount(next.count.id, "approve", users.admin);
  await item.reload();
  assert.equal(Number(item.onHand), 6);
  await assert.rejects(
    () =>
      service.countStock(
        { ...payload, requestId: requestId(), expectedVersion: 0 },
        users.inventory,
      ),
    /changed/,
  );
});
test("waste, supplier return and reversal append movements and cannot consume reservations", async () => {
  const item = await supply(10),
    menu = await recipeMenu(item, 6);
  const created = await orders.createInventoryOrder(
    orderPayload(menu),
    users.cashier,
  );
  await assert.rejects(
    () =>
      service.removeStock(
        {
          requestId: requestId(),
          stockItemId: item.id,
          quantity: 5,
          reason: "Damaged",
        },
        users.inventory,
      ),
    /reserved/,
  );
  const report = await service.reportWaste(
    {
      requestId: requestId(),
      stockItemId: item.id,
      quantity: 2,
      reason: "Spilled",
    },
    users.kitchen,
  );
  await item.reload();
  assert.equal(Number(item.onHand), 10);
  await service.reviewWaste(report.report.id, "accept", users.inventory);
  await service.reviewWaste(report.report.id, "accept", users.inventory);
  await item.reload();
  assert.equal(Number(item.onHand), 8);
  await orders.changeOrderStatus(created.order.id, "cancelled", users.cashier);
  await service.removeStock(
    {
      requestId: requestId(),
      stockItemId: item.id,
      quantity: 1,
      reason: "Supplier defect",
    },
    users.inventory,
    "supplier_return",
  );
  const movement = await models.StockMovement.findOne({
    where: { stockItemId: item.id, action: "supplier_return" },
  });
  await service.reverseMovement(
    movement.id,
    { requestId: requestId(), reason: "Return cancelled" },
    users.admin,
  );
  await item.reload();
  assert.equal(Number(item.onHand), 8);
  await assert.rejects(
    () =>
      service.reverseMovement(
        movement.id,
        { requestId: requestId(), reason: "Duplicate" },
        users.admin,
      ),
    /already/,
  );
});
test("settings persist, enforce policy permissions and reject conflicting edits", async () => {
  const initial = (await api("inventory", "GET", "/api/inventory/settings"))
    .data;
  assert.equal(initial.expiryWarningDays, 7);
  assert.equal(
    (
      await api("cashier", "PUT", "/api/inventory/settings", {
        expectedVersion: initial.version,
        expiryWarningDays: 14,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api("inventory", "PUT", "/api/inventory/settings", {
        expectedVersion: initial.version,
        countApproval: "admin_review",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api("inventory", "PUT", "/api/inventory/settings", {
        expectedVersion: initial.version,
        refreshSeconds: "",
      })
    ).status,
    400,
  );
  const updates = await Promise.all(
    [9, 14].map((expiryWarningDays) =>
      api("inventory", "PUT", "/api/inventory/settings", {
        expectedVersion: initial.version,
        expiryWarningDays,
        refreshSeconds: 60,
      }),
    ),
  );
  assert.deepEqual(updates.map((update) => update.status).sort(), [200, 409]);
  const saved = (await api("inventory", "GET", "/api/inventory/settings")).data;
  assert.equal(saved.refreshSeconds, 60);
  assert.equal(
    (await api("inventory", "GET", "/api/inventory/summary")).data
      .expiryWarningDays,
    saved.expiryWarningDays,
  );
  assert.equal(
    (
      await api("admin", "PUT", "/api/inventory/settings", {
        expectedVersion: saved.version,
        countApproval: "admin_review",
        defaultPreparedReorderLevel: 12,
      })
    ).status,
    200,
  );
  const item = await supply(10);
  const batch = await models.StockBatch.findOne({
    where: { stockItemId: item.id },
  });
  await item.reload();
  const counted = await service.countStock(
    {
      requestId: requestId(),
      stockItemId: item.id,
      batchId: batch.id,
      expectedVersion: item.version,
      countedQuantity: 9,
      reason: "Global approval policy",
    },
    users.inventory,
  );
  assert.equal(counted.count.status, "pending");
  await item.reload();
  assert.equal(Number(item.onHand), 10);
  assert.equal(
    (
      await api("inventory", "PUT", `/api/inventory/items/${item.id}`, {
        adjustmentLimit: 999,
      })
    ).status,
    403,
  );
  const current = (await api("admin", "GET", "/api/inventory/settings")).data;
  await api("admin", "PUT", "/api/inventory/settings", {
    expectedVersion: current.version,
    countApproval: "item_limits",
  });
  const created = await api("admin", "POST", "/api/menu-items", {
    name: "Configured default",
    price: 10,
    categoryId: (await prepared()).categoryId,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.item.reorderLevel, 12);
});
test("invalid expiry and report dates are rejected without partial receiving", async () => {
  const item = await supply(0);
  for (const expiryDate of ["2027-02-31", "2027-99-01", "invalid"]) {
    assert.equal(
      (
        await api("inventory", "POST", "/api/inventory/receive", {
          requestId: requestId(),
          lines: [{ stockItemId: item.id, unit: "g", quantity: 3, expiryDate }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          "inventory",
          "GET",
          `/api/inventory/movements?from=${expiryDate}`,
        )
      ).status,
      400,
    );
  }
  await item.reload();
  assert.equal(Number(item.onHand), 0);
});
test("cart checks include shared supplies without reserving them and public menus omit recipes", async () => {
  const item = await supply(10),
    first = await recipeMenu(item, 6),
    second = await recipeMenu(item, 6);
  const payload = {
    items: [
      { id: first.id, quantity: 1 },
      { id: second.id, quantity: 1 },
    ],
    orderType: "dine-in",
  };
  assert.equal(
    (await api("cashier", "POST", "/api/inventory/cart-check", payload)).status,
    409,
  );
  assert.equal(
    (
      await api("cashier", "POST", "/api/inventory/cart-check", {
        ...payload,
        items: payload.items.slice(0, 1),
      })
    ).status,
    200,
  );
  await item.reload();
  assert.equal(Number(item.reserved), 0);
  const publicMenu = await (await fetch(base + "/api/menu-items")).json();
  assert.equal(
    Object.hasOwn(
      publicMenu.find((menu) => menu.id === first.id),
      "recipes",
    ),
    false,
  );
});
test("formatted size prices and combined voucher discounts preserve checkout totals", async () => {
  const menu = await prepared(5, {
    hasSize: true,
    sizes: ["Small - ₱10", "Large - ₱20"],
  });
  const payload = orderPayload(menu, 1, {
    subtotal: 20,
    discount: 2,
    voucherAmount: 3,
    total: 15,
    items: [
      {
        id: menu.id,
        quantity: 1,
        price: 20,
        total: 20,
        modifiers: { size: "Large" },
      },
    ],
    payment: { method: "cash", amount: 15, amountReceived: 20 },
  });
  const created = await api("cashier", "POST", "/api/orders", payload);
  assert.equal(created.status, 201);
  assert.equal(Number(created.data.order.discount), 5);
  assert.equal(
    (
      await api(
        "cashier",
        "POST",
        "/api/orders",
        orderPayload(menu, 1, {
          items: [
            {
              id: menu.id,
              quantity: 1,
              price: 10,
              total: 10,
              modifiers: { size: "Large" },
            },
          ],
        }),
      )
    ).status,
    409,
  );
  await orders.changeOrderStatus(
    created.data.order.id,
    "cancelled",
    users.cashier,
  );
});
test("parallel prepared receipts retain both additions", async () => {
  const menu = await prepared(0);
  await Promise.all(
    [2, 3].map((quantity) =>
      service.preparedStock(
        {
          requestId: requestId(),
          menuItemId: menu.id,
          expectedStock: 0,
          operation: "receive",
          quantity,
          reason: "Prepared today",
        },
        users.inventory,
        true,
      ),
    ),
  );
  await menu.reload();
  assert.equal(menu.stock, 5);
});
test("the additive upgrade accepts the previous schema and does not refill zero prepared stock", async () => {
  const menu = await prepared(0, { defaultStock: 7 });
  const query = sequelize.getQueryInterface();
  await query.removeColumn("menu_items", "inventoryMode");
  await query.removeColumn("menu_items", "reservedStock");
  await query.removeColumn("menu_items", "reorderLevel");
  await query.removeColumn("Orders", "clientRequestId");
  await users.inventory.update({ role: "cashier" });
  await sequelize.query(
    "ALTER TABLE Users MODIFY COLUMN role ENUM('admin','cashier','kitchen') NOT NULL DEFAULT 'cashier'",
  );
  const { upgradeInventorySchema } =
    await import("../services/inventorySchema.js");
  await upgradeInventorySchema();
  await upgradeInventorySchema();
  await sequelize.sync({ alter: false });
  await users.inventory.update({ role: "inventory" });
  await menu.reload();
  assert.equal(menu.stock, 0);
  assert.equal(menu.defaultStock, 7);
  assert.equal(menu.inventoryMode, "prepared");
});
