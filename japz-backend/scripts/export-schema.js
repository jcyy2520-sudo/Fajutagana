// Export schema from model definitions without connecting to a database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../models/index.js';
import { sequelize } from '../models/db.js';

const generator = sequelize.getQueryInterface().queryGenerator;
const models = sequelize.modelManager.getModelsTopoSortedByForeignKey();
if (!models) throw new Error('Cannot export a schema with circular foreign keys.');
const sql = [
  '-- JAPZ Inventory schema only; generated from the included Sequelize models.',
  '-- No account, supplier, order, stock, credential or other business data.',
  '-- Select a NEW empty MySQL database before running this file.',
  '-- Existing database upgrades use schema:init instead. Do not import into production.',
  '',
];
const summary = [];
for (const model of models.reverse()) {
  const attributes = model.getAttributes();
  const table = model.getTableName();
  sql.push(`-- ${model.name}`);
  sql.push(generator.createTableQuery(table, generator.attributesToSQL(attributes, {
    context: 'createTable', tableName: table,
  }), { ...model.options, uniqueKeys: model.uniqueKeys }));
  for (const index of model.options.indexes || []) {
    sql.push(generator.addIndexQuery(table, { ...index }) + ';');
  }
  sql.push('');
  summary.push({
    model: model.name,
    table,
    ownership: String(table).startsWith('inventory_') ? 'inventory' : 'shared-boundary',
    columns: Object.entries(attributes).map(([name, attr]) => ({
      name, type: attr.type.toSql({ escape: value => generator.escape(value) }), nullable: !attr.primaryKey && attr.allowNull !== false,
      primaryKey: Boolean(attr.primaryKey), unique: Boolean(attr.unique),
      ...(attr.references ? { references: attr.references } : {}),
    })),
    indexes: model.options.indexes,
  });
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
await fs.mkdir(path.join(root, 'database'), { recursive: true });
await fs.writeFile(path.join(root, 'database/schema.sql'), sql.join('\n') + '\n');
await fs.writeFile(path.join(root, 'database/schema.json'), JSON.stringify(summary, null, 2) + '\n');
await sequelize.close();
console.log(`Exported ${summary.length} tables without a database connection.`);
