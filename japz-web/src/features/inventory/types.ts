export type Quantity = string | number;
export interface Supplier {
  id: number;
  name: string;
  contact: string;
  email: string;
  phone: string;
  notes: string;
  active: boolean;
}
export interface Batch {
  id: number;
  stockItemId: number;
  code: string;
  onHand: Quantity;
  reserved: Quantity;
  unitCost: Quantity;
  expiryDate: string | null;
  quarantined: boolean;
  receivedAt: string;
}
export interface Supply {
  id: number;
  code: string;
  name: string;
  kind: "ingredient" | "packaging";
  unit: "pcs" | "g" | "ml";
  purchaseUnit: string;
  unitsPerPurchase: Quantity;
  onHand: Quantity;
  reserved: Quantity;
  available: number;
  reorderLevel: Quantity;
  adjustmentLimit: Quantity | null;
  location: string;
  supplierId: number | null;
  supplier?: Supplier;
  archived: boolean;
  version: number;
  batches: Batch[];
  unusable: number;
  status: string;
}
export interface Modifiers {
  size?: string | null;
  flavor?: string | null;
  temperature?: string | null;
}
export interface Component {
  type: "stock" | "menu";
  stockItemId?: number;
  menuItemId?: number;
  quantity: Quantity;
  unit?: string;
  useFor?: string;
  modifiers?: Modifiers;
}
export interface Recipe extends Modifiers {
  id: number;
  label: string;
  menuItemId: number;
  components: Component[];
  version: number;
  current: boolean;
  createdAt: string;
}
export interface Menu {
  id: number;
  name: string;
  categoryId: number;
  category?: { id: number; name: string; status: string };
  status: "available" | "unavailable";
  archived: boolean;
  inventoryMode: "prepared" | "recipe";
  onHand: number;
  stock: number;
  reservedStock: number;
  available: number;
  reorderLevel: number;
  availabilityReason: string;
  hasSize: boolean;
  sizes: string[];
  hasFlavor: boolean;
  flavors: string[];
  hasTemperature: boolean;
  temperatures: string[];
  recipes: Recipe[];
  variants: (Modifiers & { available: number; reason: string })[];
}
export interface Count {
  id: number;
  item: Supply;
  batch: Batch;
  previousQuantity: Quantity;
  countedQuantity: Quantity;
  difference: Quantity;
  reason: string;
  status: string;
  user: { name: string };
  createdAt: string;
}
export interface Waste {
  id: number;
  item: Supply;
  batch?: Batch;
  quantity: Quantity;
  reason: string;
  status: string;
  user: { name: string };
  createdAt: string;
}
export interface Receipt {
  id: number;
  number: string;
  reference: string;
  notes: string;
  supplier?: Supplier;
  user: { name: string };
  receivedAt: string;
  lines: {
    id: number;
    item: Supply;
    batch: Batch;
    quantity: Quantity;
    purchaseQuantity: Quantity;
    purchaseUnit: string;
    conversion: Quantity;
    unitCost: Quantity;
  }[];
}
export interface Movement {
  id: number;
  item?: Supply;
  menuItem?: Menu;
  batch?: Batch;
  order?: { orderNumber: string };
  user: { name: string };
  action: string;
  quantity: Quantity;
  onHandDelta: Quantity;
  reservedDelta: Quantity;
  onHandAfter: Quantity;
  reservedAfter: Quantity;
  unit: string;
  reason: string;
  createdAt: string;
}
export interface Summary {
  itemCount: number;
  low: Supply[];
  out: Supply[];
  preparedLow: Menu[];
  unavailableMenu: Menu[];
  expiring: (Batch & { itemName: string; unit: string })[];
  pendingCounts: number;
  pendingWaste: number;
  stockValue: number;
  date: string;
  expiryWarningDays: number;
}
export interface InventorySettings {
  expiryWarningDays: number;
  refreshSeconds: number;
  defaultPreparedReorderLevel: number;
  countApproval: "item_limits" | "admin_review";
  version: number;
}
