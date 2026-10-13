import { sequelize } from "../models/db.js";
import { InventorySettings } from "../models/inventoryModels.js";
import { InventoryError } from "./inventoryService.js";
export async function readInventorySettings(transaction) {
  const [settings] = await InventorySettings.findOrCreate({
    where: { id: 1 },
    ...(transaction ? { transaction } : {}),
  });
  return settings;
}
export async function saveInventorySettings(payload, user) {
  await readInventorySettings();
  return sequelize.transaction(async (transaction) => {
    const settings = await InventorySettings.findByPk(1, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (payload.expectedVersion !== settings.version)
      throw new InventoryError("Settings changed. Refresh before saving.", 409);
    const changes = {};
    for (const [key, min, max] of [
      ["expiryWarningDays", 1, 90],
      ["refreshSeconds", 15, 120],
      ["defaultPreparedReorderLevel", 0, 1000000],
    ]) {
      if (payload[key] === undefined) continue;
      const value = Number(payload[key]);
      if (!Number.isInteger(value) || value < min || value > max)
        throw new InventoryError(
          `${key === "expiryWarningDays" ? "Expiry warning days" : key === "refreshSeconds" ? "Refresh seconds" : "Prepared reorder level"} must be a whole number from ${min} to ${max}.`,
        );
      if (
        key === "defaultPreparedReorderLevel" &&
        user.role !== "admin" &&
        value !== settings[key]
      )
        throw new InventoryError(
          "Admin controls the default reorder policy.",
          403,
        );
      changes[key] = value;
    }
    if (payload.countApproval !== undefined) {
      if (!["item_limits", "admin_review"].includes(payload.countApproval))
        throw new InventoryError("Choose a valid count approval policy.");
      if (
        user.role !== "admin" &&
        payload.countApproval !== settings.countApproval
      )
        throw new InventoryError("Admin controls count approvals.", 403);
      changes.countApproval = payload.countApproval;
    }
    return settings.update(
      { ...changes, version: settings.version + 1 },
      { transaction },
    );
  });
}
