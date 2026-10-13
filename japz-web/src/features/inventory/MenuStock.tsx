import { usePagination } from "./pagination";
import { createRequestId } from "../../utils/requestId";
import { useEffect, useState } from "react";
import api from "../../services/api";
import { useInventory, inventoryApi, quantity, dateTime } from "./data";
import {
  Header,
  Dialog,
  Field,
  Table,
  Badge,
  SearchField,
  Pagination,
  Notice,
} from "./shared";
import type { Menu, Recipe, Component, Modifiers } from "./types";
const options = (menu: Menu, key: keyof Modifiers): string[] => {
  const field =
    key === "size" ? "sizes" : key === "flavor" ? "flavors" : "temperatures";
  const enabled =
    key === "size"
      ? menu.hasSize
      : key === "flavor"
        ? menu.hasFlavor
        : menu.hasTemperature;
  return enabled
    ? (menu[field] || []).map((option) =>
        typeof option === "string"
          ? option.replace(/\s*-\s*₱[\d.]+$/, "").trim()
          : String(
              (option as Record<string, unknown>)[key] ||
                (option as Record<string, unknown>).name,
            ),
      )
    : [];
};
function PreparedOperation({
  menu,
  operation,
  close,
}: {
  menu: Menu;
  operation: "receive" | "count" | "waste";
  close: () => void;
}) {
  const { refresh } = useInventory(),
    [value, setValue] = useState(
      operation === "count" ? String(menu.onHand) : "",
    ),
    [reason, setReason] = useState(""),
    [requestId] = useState(createRequestId());
  return (
    <Dialog
      title={
        operation === "receive"
          ? "Receive prepared stock"
          : operation === "waste"
            ? "Record prepared waste"
            : "Count prepared stock"
      }
      description={`${menu.name} · ${menu.onHand} on hand · ${menu.reservedStock} reserved`}
      onClose={close}
      submitLabel="Record change"
      onSubmit={async () => {
        await api.post(inventoryApi("prepared"), {
          requestId,
          menuItemId: menu.id,
          expectedStock: menu.onHand,
          operation,
          quantity: value,
          reason,
        });
        await refresh();
        close();
      }}
    >
      <div className="inv-form-grid">
        <Field
          wide
          label={
            operation === "count"
              ? "Counted on hand (pcs)"
              : operation === "waste"
                ? "Wasted quantity (pcs)"
                : "Quantity received (pcs)"
          }
        >
          <input
            type="number"
            required
            step="1"
            min={operation === "count" ? 0 : 1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Field wide label="Reason">
          <textarea
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
export function PreparedStock() {
  const { menu } = useInventory(),
    [search, setSearch] = useState(""),
    [operation, setOperation] = useState<{
      menu: Menu;
      type: "receive" | "count" | "waste";
    } | null>(null);
  const filtered = menu.filter(
      (menu) =>
        !menu.archived &&
        menu.inventoryMode === "prepared" &&
        menu.name.toLowerCase().includes(search.toLowerCase()),
    ),
    pagination = usePagination(filtered, search);
  return (
    <div className="inv-page">
      <Header
        title="Prepared stock"
        description="Items counted directly in pieces. Receive, count or record waste; balances no longer reset automatically."
      />
      <section className="inv-panel">
        <div className="inv-toolbar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search prepared menu items"
          />
        </div>
        <Table
          rows={pagination.rows}
          rowKey={(menu) => menu.id}
          empty="No prepared menu items match"
          columns={[
            {
              title: "Menu item",
              render: (menu) => (
                <div>
                  <strong>{menu.name}</strong>
                  <small>{menu.category?.name}</small>
                </div>
              ),
            },
            { title: "On hand", render: (menu) => `${menu.onHand} pcs` },
            {
              title: "Reserved",
              render: (menu) => `${menu.reservedStock} pcs`,
            },
            {
              title: "Available",
              render: (menu) =>
                `${Math.max(0, menu.onHand - menu.reservedStock)} pcs`,
            },
            {
              title: "Reorder level",
              render: (menu) => `${menu.reorderLevel} pcs`,
            },
            {
              title: "Actions",
              render: (menu) => (
                <div className="inv-actions">
                  <button
                    onClick={() => setOperation({ menu, type: "receive" })}
                  >
                    Receive
                  </button>
                  <button onClick={() => setOperation({ menu, type: "count" })}>
                    Count
                  </button>
                  <button onClick={() => setOperation({ menu, type: "waste" })}>
                    Waste
                  </button>
                </div>
              ),
            },
          ]}
        />
        <Pagination {...pagination} />
      </section>
      {operation && (
        <PreparedOperation
          menu={operation.menu}
          operation={operation.type}
          close={() => setOperation(null)}
        />
      )}
    </div>
  );
}
function RecipeEditor({ menu, close }: { menu: Menu; close: () => void }) {
  const { items, menu: allMenu, refresh } = useInventory();
  const defaultRecipe = menu.recipes.find(
    (recipe) => !recipe.size && !recipe.flavor && !recipe.temperature,
  );
  const [selection, setSelection] = useState(
    String(defaultRecipe?.id || "new"),
  );
  const [label, setLabel] = useState(defaultRecipe?.label || "Default recipe"),
    [profile, setProfile] = useState<Modifiers>({
      size: defaultRecipe?.size || null,
      flavor: defaultRecipe?.flavor || null,
      temperature: defaultRecipe?.temperature || null,
    });
  const [components, setComponents] = useState<Component[]>(
    defaultRecipe?.components || [
      { type: "stock", quantity: "", useFor: "always" },
    ],
  );
  const update = (index: number, change: Partial<Component>) =>
    setComponents((previous) =>
      previous.map((component, i) =>
        i === index ? { ...component, ...change } : component,
      ),
    );
  const active = menu.recipes.find((recipe) =>
    ["size", "flavor", "temperature"].every(
      (key) =>
        (recipe[key as keyof Modifiers] || null) ===
        (profile[key as keyof Modifiers] || null),
    ),
  );
  return (
    <Dialog
      wide
      title={`Recipe · ${menu.name}`}
      description="Quantities per one menu item. Use base units for supplies and pieces for menu components."
      submitLabel="Save recipe version"
      onClose={close}
      onSubmit={async () => {
        await api.post(inventoryApi(`menu/${menu.id}/recipes`), {
          label,
          ...profile,
          expectedVersion: active?.version || 0,
          components,
        });
        await refresh();
        close();
      }}
    >
      <div className="inv-form-grid">
        <Field label="Recipe profile">
          <select
            value={selection}
            onChange={(e) => {
              const recipe = menu.recipes.find(
                (recipe) => recipe.id === Number(e.target.value),
              );
              setSelection(e.target.value);
              setLabel(recipe?.label || "New recipe");
              setProfile({
                size: recipe?.size || null,
                flavor: recipe?.flavor || null,
                temperature: recipe?.temperature || null,
              });
              setComponents(
                recipe?.components || [
                  { type: "stock", quantity: "", useFor: "always" },
                ],
              );
            }}
          >
            <option value="new">Add profile</option>
            {menu.recipes.map((recipe) => (
              <option value={recipe.id} key={recipe.id}>
                {recipe.label} · v{recipe.version}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recipe name">
          <input
            required
            maxLength={120}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        {(["size", "flavor", "temperature"] as const)
          .filter((key) => options(menu, key).length > 0)
          .map((key) => (
            <Field key={key} label={key.charAt(0).toUpperCase() + key.slice(1)}>
              <select
                value={profile[key] || ""}
                onChange={(e) =>
                  setProfile({ ...profile, [key]: e.target.value || null })
                }
              >
                <option value="">All {key} options</option>
                {options(menu, key).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          ))}
      </div>
      <p className="inv-recipe-note">
        A specific profile takes precedence over the default. Record extra
        amounts for sizes, flavours and temperatures in their profiles. Use
        take-out or delivery for packaging that is required only for those
        orders.
      </p>
      {components.map((component, index) => {
        const supply = items.find(
            (item) => item.id === Number(component.stockItemId),
          ),
          child = allMenu.find(
            (item) => item.id === Number(component.menuItemId),
          );
        return (
          <div className="inv-line" key={index}>
            <div className="inv-line-top">
              <h3>Component {index + 1}</h3>
              {components.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setComponents(components.filter((_, i) => i !== index))
                  }
                >
                  Remove component
                </button>
              )}
            </div>
            <div className="inv-form-grid">
              <Field label="Component type">
                <select
                  value={component.type}
                  onChange={(e) =>
                    update(index, {
                      type: e.target.value as Component["type"],
                      stockItemId: undefined,
                      menuItemId: undefined,
                      modifiers: {},
                    })
                  }
                >
                  <option value="stock">Ingredient / packaging</option>
                  <option value="menu">Menu component (combo)</option>
                </select>
              </Field>
              <Field label="Item">
                <select
                  required
                  value={
                    component.type === "stock"
                      ? component.stockItemId || ""
                      : component.menuItemId || ""
                  }
                  onChange={(e) => {
                    if (component.type === "stock")
                      update(index, { stockItemId: Number(e.target.value) });
                    else {
                      const child = allMenu.find(
                        (menu) => menu.id === Number(e.target.value),
                      );
                      update(index, {
                        menuItemId: Number(e.target.value),
                        modifiers: child
                          ? Object.fromEntries(
                              (["size", "flavor", "temperature"] as const).map(
                                (key) => [key, options(child, key)[0] || null],
                              ),
                            )
                          : {},
                      });
                    }
                  }}
                >
                  <option value="">Choose component</option>
                  {component.type === "stock"
                    ? items
                        .filter((item) => !item.archived)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.unit})
                          </option>
                        ))
                    : allMenu
                        .filter((item) => !item.archived && item.id !== menu.id)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                </select>
              </Field>
              <Field
                label={`Quantity per serving (${component.type === "stock" ? supply?.unit || "base unit" : "pcs"})`}
              >
                <input
                  required
                  type="number"
                  min="0.0001"
                  step={
                    component.type === "menu" || supply?.unit === "pcs"
                      ? 1
                      : "0.0001"
                  }
                  value={component.quantity}
                  onChange={(e) => update(index, { quantity: e.target.value })}
                />
              </Field>
              <Field label="Used for">
                <select
                  value={component.useFor || "always"}
                  onChange={(e) => update(index, { useFor: e.target.value })}
                >
                  <option value="always">All orders</option>
                  <option value="dine-in">Dine-in only</option>
                  <option value="off-premise">Take-out and delivery</option>
                  <option value="take-out">Take-out only</option>
                  <option value="delivery">Delivery only</option>
                </select>
              </Field>
              {component.type === "menu" &&
                child &&
                (["size", "flavor", "temperature"] as const)
                  .filter((key) => options(child, key).length)
                  .map((key) => (
                    <Field label={`Component ${key}`} key={key}>
                      <select
                        required
                        value={component.modifiers?.[key] || ""}
                        onChange={(e) =>
                          update(index, {
                            modifiers: {
                              ...component.modifiers,
                              [key]: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="">Choose {key}</option>
                        {options(child, key).map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                  ))}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() =>
          setComponents([
            ...components,
            { type: "stock", quantity: "", useFor: "always" },
          ])
        }
      >
        Add component
      </button>
      <p className="inv-recipe-note">
        Saving creates version {(active?.version || 0) + 1}. Existing orders
        retain the quantities and recipe version reserved for them.
      </p>
    </Dialog>
  );
}
function AvailabilityEditor({
  menu,
  close,
}: {
  menu: Menu;
  close: () => void;
}) {
  const { refresh } = useInventory(),
    [status, setStatus] = useState(menu.status),
    [mode, setMode] = useState(menu.inventoryMode),
    [reorder, setReorder] = useState(String(menu.reorderLevel)),
    [archived, setArchived] = useState(menu.archived);
  return (
    <Dialog
      title={`Availability · ${menu.name}`}
      description="Availability also depends on stock, recipe components and the category status."
      onClose={close}
      onSubmit={async () => {
        await api.put(inventoryApi(`menu/${menu.id}`), {
          status,
          inventoryMode: mode,
          reorderLevel: reorder,
          archived,
        });
        await refresh();
        close();
      }}
    >
      <div className="inv-form-grid">
        <Field label="Selling status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Menu["status"])}
          >
            <option value="available">Enabled for sale</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </Field>
        <Field label="Stock source">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Menu["inventoryMode"])}
          >
            <option value="prepared">Prepared stock (pcs)</option>
            <option value="recipe">Recipe ingredients & packaging</option>
          </select>
        </Field>
        <Field label="Prepared stock reorder level (pcs)">
          <input
            type="number"
            required
            min="0"
            step="1"
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
          />
        </Field>
        <Field label="Catalog status">
          <select
            value={archived ? "archived" : "active"}
            onChange={(e) => setArchived(e.target.value === "archived")}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </div>
      <p className="inv-recipe-note">
        Save a recipe before switching to recipe stock. Record any remaining
        prepared quantity first. Menu names, prices and categories are
        maintained by Admin.
      </p>
    </Dialog>
  );
}
function MenuDetail({
  menu,
  history,
  close,
}: {
  menu: Menu;
  history: Recipe[];
  close: () => void;
}) {
  const { items, menu: allMenu } = useInventory();
  return (
    <Dialog
      wide
      title={menu.name}
      description={`${menu.inventoryMode === "recipe" ? "Recipe stock" : "Prepared stock"} · ${menu.category?.name || ""}`}
      onClose={close}
    >
      <h3>Availability by option</h3>
      <Table
        rows={menu.variants}
        rowKey={(_, index?: number) => index || JSON.stringify(_)}
        columns={[
          {
            title: "Options",
            render: (variant) =>
              [variant.size, variant.flavor, variant.temperature]
                .filter(Boolean)
                .join(" / ") || "Standard",
          },
          {
            title: "Available servings",
            render: (variant) => variant.available,
          },
          {
            title: "Reason",
            render: (variant) => variant.reason || "Stock available",
          },
        ]}
      />
      <h3 style={{ marginTop: 24 }}>Recipe history</h3>
      {history.length ? (
        history.map((recipe) => (
          <div className="inv-line" key={recipe.id}>
            <div className="inv-line-top">
              <strong>
                {recipe.label} · v{recipe.version}
              </strong>
              <Badge>{recipe.current ? "Current" : "Previous"}</Badge>
            </div>
            <small>
              {dateTime(recipe.createdAt)} ·{" "}
              {[recipe.size, recipe.flavor, recipe.temperature]
                .filter(Boolean)
                .join(" / ") || "All options"}
            </small>
            <ul className="inv-list">
              {recipe.components.map((component, index) => (
                <li key={index}>
                  <span>
                    {component.type === "stock"
                      ? items.find((item) => item.id === component.stockItemId)
                          ?.name || `Supply #${component.stockItemId}`
                      : allMenu.find((menu) => menu.id === component.menuItemId)
                          ?.name || `Menu #${component.menuItemId}`}
                  </span>
                  <span>
                    {quantity(component.quantity)} {component.unit || "pcs"} ·{" "}
                    {component.useFor || "always"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="inv-recipe-note">
          No recipe saved. This item uses prepared stock.
        </p>
      )}
    </Dialog>
  );
}
export function MenuAvailability() {
  const { menu, updated } = useInventory(),
    [search, setSearch] = useState(""),
    [mode, setMode] = useState("all"),
    [status, setStatus] = useState("active"),
    [orderType, setOrderType] = useState("dine-in");
  const [contextMenu, setContextMenu] = useState<{
      orderType: string;
      menu: Menu[];
    } | null>(null),
    [error, setError] = useState(""),
    [recipe, setRecipe] = useState<Menu | null>(null),
    [edit, setEdit] = useState<Menu | null>(null),
    [detail, setDetail] = useState<{ menu: Menu; history: Recipe[] } | null>(
      null,
    );
  useEffect(() => {
    if (orderType === "dine-in") return;
    let cancelled = false;
    void api
      .get(inventoryApi("menu"), { params: { orderType } })
      .then((response) => {
        if (!cancelled) {
          setContextMenu({ orderType, menu: response.data });
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled)
          setError("Could not refresh availability for this order type.");
      });
    return () => {
      cancelled = true;
    };
  }, [orderType, updated]);
  const selectedMenu =
    orderType === "dine-in"
      ? menu
      : contextMenu?.orderType === orderType
        ? contextMenu.menu
        : [];
  const filtered = selectedMenu.filter(
    (menu) =>
      menu.name.toLowerCase().includes(search.toLowerCase()) &&
      (mode === "all" || mode === menu.inventoryMode) &&
      (status === "all" ||
        (status === "active" && !menu.archived) ||
        (status === "unavailable" && !menu.archived && !menu.available) ||
        (status === "archived" && menu.archived)),
  );
  const pagination = usePagination(
    filtered,
    search + mode + status + orderType,
  );
  return (
    <div className="inv-page">
      <Header
        title="Menu availability"
        description="Check prepared stock and recipes. Serving limits share ingredients across the entire cart."
      />
      {error && <Notice error>{error}</Notice>}
      <section className="inv-panel">
        <div className="inv-toolbar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search menu items"
          />
          <select
            aria-label="Stock source"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="all">All stock sources</option>
            <option value="prepared">Prepared stock</option>
            <option value="recipe">Recipes</option>
          </select>
          <select
            aria-label="Menu status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active menu</option>
            <option value="unavailable">Unavailable</option>
            <option value="archived">Archived</option>
            <option value="all">All menu</option>
          </select>
          <select
            aria-label="Availability order type"
            value={orderType}
            onChange={(e) => {
              setOrderType(e.target.value);
              setError("");
            }}
          >
            <option value="dine-in">Dine-in</option>
            <option value="take-out">Take-out</option>
            <option value="delivery">Delivery</option>
          </select>
        </div>
        <Table
          rows={pagination.rows}
          rowKey={(menu) => menu.id}
          columns={[
            {
              title: "Menu item",
              render: (menu) => (
                <div>
                  <strong>{menu.name}</strong>
                  <small>{menu.category?.name}</small>
                </div>
              ),
            },
            {
              title: "Stock source",
              render: (menu) =>
                menu.inventoryMode === "recipe" ? "Recipe" : "Prepared",
            },
            {
              title: "Available servings",
              render: (menu) => (
                <div>
                  <strong>{menu.available}</strong>
                  <small>
                    {menu.available
                      ? "Maximum of available options"
                      : menu.availabilityReason}
                  </small>
                </div>
              ),
            },
            {
              title: "Status",
              render: (menu) => (
                <Badge
                  status={
                    menu.archived
                      ? "archived"
                      : menu.available
                        ? ""
                        : "unavailable"
                  }
                >
                  {menu.archived
                    ? "Archived"
                    : menu.available
                      ? "Available"
                      : "Unavailable"}
                </Badge>
              ),
            },
            {
              title: "Actions",
              render: (menu) => (
                <div className="inv-actions">
                  <button onClick={() => setEdit(menu)}>Availability</button>
                  <button onClick={() => setRecipe(menu)}>Recipe</button>
                  <button
                    onClick={async () => {
                      try {
                        setDetail({
                          menu,
                          history: (
                            await api.get(
                              inventoryApi(`menu/${menu.id}/recipes`),
                            )
                          ).data,
                        });
                      } catch {
                        setError("Could not load recipe history. Try again.");
                      }
                    }}
                  >
                    Details
                  </button>
                </div>
              ),
            },
          ]}
        />
        <Pagination {...pagination} />
      </section>
      {recipe && (
        <RecipeEditor
          menu={recipe}
          close={() => {
            setRecipe(null);
            setContextMenu(null);
            setOrderType("dine-in");
          }}
        />
      )}
      {edit && (
        <AvailabilityEditor
          menu={edit}
          close={() => {
            setEdit(null);
            setContextMenu(null);
            setOrderType("dine-in");
          }}
        />
      )}
      {detail && (
        <MenuDetail
          menu={detail.menu}
          history={detail.history}
          close={() => setDetail(null)}
        />
      )}
    </div>
  );
}
