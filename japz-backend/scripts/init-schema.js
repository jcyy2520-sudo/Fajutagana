import 'dotenv/config';
import '../models/index.js';
import { sequelize } from '../models/db.js';
import { upgradeInventorySchema } from '../services/inventorySchema.js';
try { await sequelize.authenticate(); await upgradeInventorySchema(); await sequelize.sync({ alter: false }); console.log('Inventory schema initialized; no data seeded.'); }
finally { await sequelize.close(); }
