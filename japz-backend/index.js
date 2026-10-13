// New standalone HTTP adapter. Schema initialization is an explicit separate command.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import './models/index.js';
import { sequelize } from './models/db.js';
import router from './routes/index.js';
const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.json({ module: 'inventory', status: 'ok' }));
app.use(router);
app.use((error, _req, res, _next) => { console.error(error.message); res.status(500).json({ error: 'The request could not be completed.' }); });
await sequelize.authenticate();
const server = app.listen(Number(process.env.PORT) || 3000, process.env.HOST || '127.0.0.1', () => console.log('Inventory API ready'));
async function stop() { server.close(async () => { await sequelize.close(); process.exit(0); }); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
