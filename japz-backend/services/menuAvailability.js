import crypto from "node:crypto";
import { sequelize } from "../models/db.js";
import { MenuItem } from "../models/menuItemModel.js";
import { MenuCategory } from "../models/menuCategoryModel.js";
import {
  StockItem,
  StockBatch,
  MenuRecipe,
} from "../models/inventoryModels.js";
import {
  InventoryError,
  amount,
  id,
  text,
  roundQuantity,
  businessDate,
} from "./inventoryService.js";

export const profileKey = (profile) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        profile.size || null,
        profile.flavor || null,
        profile.temperature || null,
      ]),
    )
    .digest("hex");
const lock = (transaction) =>
  transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
export async function loadMenuGraph(transaction) {
  // The menu graph is small and may contain shared combo components. Lock it in one order.
  const categories = await MenuCategory.findAll({
    order: [["id", "ASC"]],
    ...lock(transaction),
  });
  const menus = await MenuItem.findAll({
    order: [["id", "ASC"]],
    ...lock(transaction),
  });
  const recipes = await MenuRecipe.findAll({
    where: { current: true },
    order: [["id", "ASC"]],
    ...lock(transaction),
  });
  return {
    categories: new Map(categories.map((item) => [item.id, item])),
    menus: new Map(menus.map((item) => [item.id, item])),
    recipes,
  };
}
export const menuOptions = (menu, field) =>
  Array.isArray(menu[field])
    ? menu[field].map((option) =>
        typeof option === "string"
          ? option.replace(/\s*-\s*₱[\d.]+$/, "").trim()
          : option.name || option.label || option.size || option.flavor,
      )
    : [];
function validateModifiers(menu, modifiers = {}) {
  const result = {};
  for (const [key, flag, options] of [
    ["size", "hasSize", "sizes"],
    ["flavor", "hasFlavor", "flavors"],
    ["temperature", "hasTemperature", "temperatures"],
  ]) {
    const values = menuOptions(menu, options);
    const value = modifiers[key] || null;
    if (menu[flag] && values.length && (!value || !values.includes(value)))
      throw new InventoryError(`Choose a valid ${key} for ${menu.name}.`);
    if (value && (!menu[flag] || !values.includes(value)))
      throw new InventoryError(`That ${key} is not offered for ${menu.name}.`);
    result[key] = value;
  }
  return result;
}
function recipeFor(graph, menu, modifiers) {
  const candidates = graph.recipes.filter(
    (recipe) =>
      recipe.menuItemId === menu.id &&
      ["size", "flavor", "temperature"].every(
        (key) => !recipe[key] || recipe[key] === modifiers[key],
      ),
  );
  const specificity = (recipe) =>
    ["size", "flavor", "temperature"].filter((key) => recipe[key]).length;
  candidates.sort((a, b) => specificity(b) - specificity(a));
  if (!candidates.length)
    throw new InventoryError(
      `A recipe is required for ${menu.name} with these options.`,
      409,
    );
  if (
    candidates[1] &&
    specificity(candidates[0]) === specificity(candidates[1])
  )
    throw new InventoryError(
      `The recipe options for ${menu.name} overlap. Inventory must refine these profiles.`,
      409,
    );
  return candidates[0];
}
export function menuRequirements(
  graph,
  lines,
  orderType = "dine-in",
  validate = true,
) {
  const prepared = new Map(),
    supplies = new Map(),
    recipes = new Map();
  const add = (map, key, quantity) =>
    map.set(key, roundQuantity((map.get(key) || 0) + quantity));
  const visit = (menuId, quantity, modifiers, path = []) => {
    const menu = graph.menus.get(menuId);
    if (
      !menu ||
      menu.archived ||
      menu.status !== "available" ||
      graph.categories.get(menu.categoryId)?.status !== "active"
    )
      throw new InventoryError(
        `${menu?.name || "This menu item"} is unavailable.`,
        409,
      );
    if (path.includes(menuId) || path.length > 20)
      throw new InventoryError("A recipe contains a circular menu component.");
    const options = validate ? validateModifiers(menu, modifiers) : modifiers;
    if (menu.inventoryMode === "prepared") {
      add(prepared, menu.id, quantity);
      return;
    }
    const recipe = recipeFor(graph, menu, options);
    recipes.set(recipe.id, {
      id: recipe.id,
      menuItemId: menu.id,
      label: recipe.label,
      version: recipe.version,
    });
    for (const component of recipe.components) {
      if (
        component.useFor !== "always" &&
        component.useFor !== orderType &&
        !(component.useFor === "off-premise" && orderType !== "dine-in")
      )
        continue;
      const needed = roundQuantity(component.quantity * quantity);
      if (component.type === "stock")
        add(supplies, component.stockItemId, needed);
      else
        visit(component.menuItemId, needed, component.modifiers || {}, [
          ...path,
          menuId,
        ]);
    }
  };
  if (!Array.isArray(lines) || !lines.length || lines.length > 100)
    throw new InventoryError("Add between one and 100 menu lines.");
  if (!["dine-in", "take-out", "delivery"].includes(orderType))
    throw new InventoryError("Choose a valid order type.");
  for (const line of lines)
    visit(
      id(line.id ?? line.menuItemId),
      amount(line.quantity, "pcs"),
      line.modifiers || {},
    );
  return { prepared, supplies, recipes: [...recipes.values()] };
}

export async function saveRecipe(menuId, payload, user) {
  return sequelize.transaction(async (transaction) => {
    const graph = await loadMenuGraph(transaction),
      menu = graph.menus.get(id(menuId));
    if (!menu || menu.archived)
      throw new InventoryError("Choose an active menu item.");
    const profile = Object.fromEntries(
      ["size", "flavor", "temperature"].map((key) => [
        key,
        payload[key] || null,
      ]),
    );
    // Null means this profile applies to all values of that option.
    for (const [key, flag, options] of [
      ["size", "hasSize", "sizes"],
      ["flavor", "hasFlavor", "flavors"],
      ["temperature", "hasTemperature", "temperatures"],
    ]) {
      if (profile[key]) {
        const values = menuOptions(menu, options);
        if (!menu[flag] || !values.includes(profile[key]))
          throw new InventoryError(`Choose a valid ${key} for this recipe.`);
      }
    }
    if (
      !Array.isArray(payload.components) ||
      !payload.components.length ||
      payload.components.length > 100
    )
      throw new InventoryError("Add between one and 100 recipe components.");
    const stocks = await StockItem.findAll({
      where: {
        id: payload.components
          .filter((component) => component.type === "stock")
          .map((component) => id(component.stockItemId)),
      },
      order: [["id", "ASC"]],
      ...lock(transaction),
    });
    const stockMap = new Map(stocks.map((item) => [item.id, item]));
    const components = payload.components.map((component) => {
      const useFor = component.useFor || "always";
      if (
        !["always", "dine-in", "take-out", "delivery", "off-premise"].includes(
          useFor,
        )
      )
        throw new InventoryError("Choose when each recipe component is used.");
      if (component.type === "stock") {
        const stock = stockMap.get(id(component.stockItemId));
        if (!stock || stock.archived)
          throw new InventoryError(
            "Choose an active ingredient or packaging item.",
          );
        return {
          type: "stock",
          stockItemId: stock.id,
          quantity: amount(component.quantity, stock.unit),
          unit: stock.unit,
          useFor,
        };
      }
      if (component.type !== "menu")
        throw new InventoryError("Choose supply or menu component.");
      const child = graph.menus.get(id(component.menuItemId));
      if (!child || child.archived)
        throw new InventoryError("Choose an active menu component.");
      return {
        type: "menu",
        menuItemId: child.id,
        quantity: amount(component.quantity, "pcs"),
        modifiers: validateModifiers(child, component.modifiers || {}),
        useFor,
      };
    });
    const key = profileKey(profile),
      previous = graph.recipes.find(
        (recipe) => recipe.menuItemId === menu.id && recipe.profileKey === key,
      );
    if (Number(payload.expectedVersion || 0) !== (previous?.version || 0))
      throw new InventoryError(
        "This recipe changed. Refresh before saving.",
        409,
      );
    const candidate = { menuItemId: menu.id, components };
    const allRecipes = graph.recipes
      .filter((recipe) => recipe !== previous)
      .concat(candidate);
    const cycle = (current, path = []) => {
      if (path.includes(current))
        throw new InventoryError(
          "Menu components cannot contain a circular recipe.",
        );
      for (const recipe of allRecipes.filter(
        (value) => value.menuItemId === current,
      ))
        for (const component of recipe.components.filter(
          (value) => value.type === "menu",
        ))
          cycle(component.menuItemId, [...path, current]);
    };
    cycle(menu.id);
    if (previous) await previous.update({ current: false }, { transaction });
    return MenuRecipe.create(
      {
        menuItemId: menu.id,
        label: text(payload.label || "Default recipe", "Recipe name", 120),
        profileKey: key,
        ...profile,
        components,
        version: (previous?.version || 0) + 1,
        current: true,
        userId: user.id,
      },
      { transaction },
    );
  });
}

export async function saveMenuAvailability(menuId, payload) {
  return sequelize.transaction(async (transaction) => {
    const graph = await loadMenuGraph(transaction),
      item = graph.menus.get(id(menuId));
    if (!item) throw new InventoryError("Menu item not found.", 404);
    const changes = {};
    if (payload.status !== undefined) {
      if (!["available", "unavailable"].includes(payload.status))
        throw new InventoryError("Choose available or unavailable.");
      changes.status = payload.status;
    }
    if (payload.archived !== undefined) {
      if (typeof payload.archived !== "boolean")
        throw new InventoryError("Invalid archive status.");
      if (payload.archived && item.reservedStock > 0)
        throw new InventoryError(
          "This menu item is reserved for an order.",
          409,
        );
      changes.archived = payload.archived;
    }
    if (payload.reorderLevel !== undefined)
      changes.reorderLevel = amount(payload.reorderLevel, "pcs", true);
    if (payload.inventoryMode !== undefined) {
      if (!["prepared", "recipe"].includes(payload.inventoryMode))
        throw new InventoryError("Choose prepared stock or recipe stock.");
      if (
        payload.inventoryMode === "recipe" &&
        item.inventoryMode !== "recipe"
      ) {
        if (item.stock > 0 || item.reservedStock > 0)
          throw new InventoryError(
            "Record the remaining prepared stock before switching to recipes.",
            409,
          );
        if (!graph.recipes.some((recipe) => recipe.menuItemId === item.id))
          throw new InventoryError(
            "Save a recipe before enabling recipe stock.",
          );
      }
      changes.inventoryMode = payload.inventoryMode;
    }
    return item.update(changes, { transaction });
  });
}

export async function menuAvailability({
  includeArchived = false,
  includeRecipes = true,
  orderType = "dine-in",
} = {}) {
  const graph = await loadMenuGraph();
  const stocks = await StockItem.findAll(),
    batches = await StockBatch.findAll();
  const balances = new Map(
    stocks.map((item) => [
      item.id,
      {
        item,
        available: roundQuantity(
          batches
            .filter(
              (batch) =>
                batch.stockItemId === item.id &&
                !batch.quarantined &&
                (!batch.expiryDate || batch.expiryDate >= businessDate()),
            )
            .reduce(
              (sum, batch) =>
                sum + Number(batch.onHand) - Number(batch.reserved),
              0,
            ),
        ),
      },
    ]),
  );
  return [...graph.menus.values()]
    .filter((menu) => includeArchived || !menu.archived)
    .map((menu) => {
      const raw = menu.toJSON(),
        variants = [];
      const values = (flag, field) =>
        raw[flag] && raw[field]?.length ? menuOptions(raw, field) : [null];
      for (const size of values("hasSize", "sizes"))
        for (const flavor of values("hasFlavor", "flavors"))
          for (const temperature of values("hasTemperature", "temperatures")) {
            try {
              const plan = menuRequirements(
                graph,
                [
                  {
                    id: menu.id,
                    quantity: 1,
                    modifiers: { size, flavor, temperature },
                  },
                ],
                orderType,
              );
              let available = Number.MAX_SAFE_INTEGER,
                reason = "";
              for (const [menuId, needed] of plan.prepared) {
                const prepared = graph.menus.get(menuId),
                  possible = Math.floor(
                    (prepared.stock - prepared.reservedStock) / needed,
                  );
                if (possible < available) {
                  available = possible;
                  reason =
                    possible <= 0 ? `${prepared.name}: no prepared stock` : "";
                }
              }
              for (const [stockId, needed] of plan.supplies) {
                const balance = balances.get(stockId);
                const possible =
                  !balance || balance.item.archived
                    ? 0
                    : Math.floor(roundQuantity(balance.available / needed));
                if (possible < available) {
                  available = possible;
                  reason =
                    possible <= 0
                      ? `${balance?.item.name || "A recipe supply"}: unavailable`
                      : "";
                }
              }
              if (available === Number.MAX_SAFE_INTEGER) {
                available = 0;
                reason = "This recipe has no components for this order type.";
              }
              variants.push({
                size,
                flavor,
                temperature,
                available: Math.max(0, available),
                reason,
              });
            } catch (error) {
              variants.push({
                size,
                flavor,
                temperature,
                available: 0,
                reason: error.message,
              });
            }
          }
      const available = Math.max(
        0,
        ...variants.map((variant) => variant.available),
      );
      return {
        ...raw,
        onHand: raw.stock,
        available,
        stock: available,
        category: graph.categories.get(menu.categoryId)?.toJSON(),
        variants,
        availabilityReason: available
          ? ""
          : variants[0]?.reason || "Unavailable",
        ...(includeRecipes
          ? {
              recipes: graph.recipes
                .filter((recipe) => recipe.menuItemId === menu.id)
                .map((recipe) => recipe.toJSON()),
            }
          : {}),
      };
    });
}

export async function checkCartAvailability(payload) {
  return sequelize.transaction(async (transaction) => {
    const graph = await loadMenuGraph(transaction),
      plan = menuRequirements(
        graph,
        payload.items,
        payload.orderType || "dine-in",
      );
    if (!plan.prepared.size && !plan.supplies.size)
      throw new InventoryError(
        "No recipe components apply to this order type.",
        409,
      );
    for (const [menuId, needed] of plan.prepared) {
      const menu = graph.menus.get(menuId);
      if (menu.stock - menu.reservedStock < needed)
        throw new InventoryError(
          `Only ${menu.stock - menu.reservedStock} ${menu.name} are available. Update the cart.`,
          409,
        );
    }
    const stocks = await StockItem.findAll({
      where: { id: [...plan.supplies.keys()] },
      order: [["id", "ASC"]],
      ...lock(transaction),
    });
    const batches = await StockBatch.findAll({
      where: { stockItemId: [...plan.supplies.keys()] },
      order: [["id", "ASC"]],
      ...lock(transaction),
    });
    for (const [stockId, needed] of plan.supplies) {
      const item = stocks.find((item) => item.id === stockId);
      const available = roundQuantity(
        batches
          .filter(
            (batch) =>
              batch.stockItemId === stockId &&
              !batch.quarantined &&
              (!batch.expiryDate || batch.expiryDate >= businessDate()),
          )
          .reduce(
            (sum, batch) => sum + Number(batch.onHand) - Number(batch.reserved),
            0,
          ),
      );
      if (!item || item.archived || available < needed)
        throw new InventoryError(
          `There is not enough ${item?.name || "recipe stock"} for this cart and order type. Update the cart or ask Inventory to replenish it.`,
          409,
        );
    }
    return { available: true };
  });
}
