import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { User } from "../models/index.js";
import { sequelize } from "../models/db.js";
import { upgradeInventorySchema } from "../services/inventorySchema.js";

const value = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const email = value("--email")?.trim().toLowerCase();
const name = value("--name")?.trim() || "Inventory";
sequelize.options.logging = false;
try {
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    name.length > 160
  ) {
    throw new Error("Use --email with a valid address and optionally --name.");
  }
  await sequelize.authenticate();
  await upgradeInventorySchema();
  await sequelize.sync({ alter: false });
  if (await User.findOne({ where: { email } })) {
    throw new Error(
      "That email already has an account. Its password and role were not changed.",
    );
  }
  const password = `Jpz-${crypto.randomBytes(12).toString("base64url")}`;
  const user = await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 12),
    role: "inventory",
    status: "approved",
    assignedCategories: [],
  });
  // Show the generated password once to the person creating the account.
  // Only its bcrypt hash is stored in the database.
  process.stdout.write(
    "INVENTORY_ACCOUNT " +
      JSON.stringify({ email, password, role: user.role, id: user.id }) +
      "\n",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
