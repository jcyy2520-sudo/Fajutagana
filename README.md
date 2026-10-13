# JAPZ Inventory Management

Inventory-focused extraction of the JAPZ POS team project for code review and an initial GitDiagram System Architecture Diagram. The original application is a modular monolith; this standalone workspace is a documentation and development extraction, not a claim that Inventory was already deployed as a separate service.

## Scope and technologies

Inventory Staff manages ingredients and packaging, suppliers, receiving and unit conversion, lots/batches, prepared quantities, menu recipes and availability, physical counts, waste and supplier returns, movement history, usage reports, and Inventory settings. Admin has additional Inventory approval and policy permissions.

The frontend uses React 19, TypeScript, Vite, React Router, Axios, Lucide icons and Tailwind CSS. The backend uses Node.js, Express, Sequelize and MySQL (`mysql2`), with bcrypt password hashes and JWT authentication. Dependency manifests and lockfiles are included for both applications.

The browser calls the Express API over HTTP in local development. Axios attaches the bearer token; middleware verifies the token and reloads the approved user and role from MySQL. Inventory routes call transactional domain services and Sequelize models. The database stores stock balances, reservations, batches, receipt lines, versioned recipes, counts, loss reports, idempotent operations, settings and append-only movements. Inventory business dates use Asia/Manila.

## Repository map

| Path | Responsibility |
| --- | --- |
| `japz-web/src/features/inventory/` | Existing Inventory screens, data provider, typed records, shared controls, pagination and styles; includes the Kitchen waste reporting boundary component |
| `japz-web/src/hooks/`, `components/`, `services/` | Shared authentication context, protected routes and HTTP transport, scoped to Inventory |
| `japz-web/src/App.tsx`, `pages/Login.tsx` | Standalone route/sign-in adapters; only Inventory and Admin's Inventory view are mounted |
| `japz-backend/routes/inventory.js` | Inventory API under `/api/inventory` |
| `japz-backend/services/inventoryService.js` | Receiving, conversions, balances, counts, waste/returns, reversals, validation and idempotency |
| `japz-backend/services/menuAvailability.js` | Recipe versions, menu availability and whole-cart shared-resource checks |
| `japz-backend/services/inventoryOrders.js` | Direct POS/Kitchen boundary: reserve stock, FEFO allocation, consume, release and post-preparation waste |
| `japz-backend/services/inventorySettings.js`, `inventorySchema.js` | Settings/version policies and additive Inventory schema upgrades |
| `japz-backend/models/` | Inventory models plus only the user/menu/category/order/order-item/payment/log models they require |
| `japz-backend/routes/index.js` | Extracted shared auth, public availability, Admin menu creation, order creation and status-change endpoints |
| `database/schema.sql`, `schema.json` | Schema-only MySQL DDL and machine-readable model/table/column map, generated from included models |
| `config/` | Empty-secret environment templates, never real environment files |
| `docs/EXTRACTION.md`, `SOURCE-MANIFEST.json` | Scope, source provenance, exact-copy hashes, adapter changes and validation limitations |

## Direct interactions with other modules

- **Shared identity/Admin:** approved accounts, login/profile, role checks, count approval, movement reversal and policy settings. Staff administration and public registration/reset-email flows are outside this extraction.
- **Menu administration:** Inventory reads shared categories/items, manages recipes and availability, and tracks prepared menu stock. The included Admin menu-creation endpoint initializes stock at zero and uses the Inventory reorder default. The complete menu editor and category-management UI are outside this repository.
- **Cashier/POS:** order creation calls `createInventoryOrder` to validate a whole cart and atomically reserve stock and record payment data. Shared order/payment models are included because the existing service imports them. No cashier pages or complete payment/checkout module are included.
- **Kitchen:** order-status transitions call `changeOrderStatus`, consume allocation when preparation begins, release pending cancellations, and record waste after preparation. Kitchen can submit waste reports through the Inventory API. `KitchenWaste.tsx` is retained as the direct boundary component but the complete Kitchen layout/display is not mounted here.

MySQL is the only external service required by the included runtime. There is no supplier API, Google Sheets, AI, email provider, payment gateway or forecasting service in Inventory. Supplier contacts and payment methods are records, not evidence of live third-party integrations.

## Local setup

Use Node.js **22.12+** and MySQL 8.x. Run each application from its own folder. The commands below use `npm`; on Windows PowerShell, use `npm.cmd` when script execution policy requires it.

1. Create a **new, empty** database named `japz_inventory` and a MySQL account with access to it. Do not use the main project's `japz_pos` database. No business data is included or seeded.
2. Copy `config/backend.env.example` to `japz-backend/.env`, enter the database credentials privately, and set a random `JWT_SECRET` of at least 32 bytes. Generate a value locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`; paste it into the private file and never commit it. Copy `config/frontend.env.example` to `japz-web/.env` if changing the API location.
3. In `japz-backend`, run:

   ```sh
   npm ci
   npm run schema:init
   npm run create:inventory-user -- --email inventory@example.test --name "Inventory Staff"
   npm start
   ```

   Account creation refuses an existing email and prints a new random password once. Save it privately. Do not run account creation against the team database. `schema:init` creates missing tables and applies the included additive upgrades; it never force-syncs, resets balances or seeds team accounts. Alternatively, import `database/schema.sql` into an empty database instead of `schema:init`.

4. In another terminal, in `japz-web`, run:

   ```sh
   npm ci
   npm run dev
   ```

5. Open `http://localhost:5173/login`. Inventory opens at `/inventory/overview`; an existing approved Admin identity opens `/admin/inventory/overview`. The API defaults to `127.0.0.1:3000`. Set `FRONTEND_ORIGIN` if using a different frontend origin.

For meaningful stock operations, enter suppliers, supplies, receipts and recipes. Prepared menu workflows also require category/menu records supplied by the shared menu boundary. This extraction does not include seed data or the complete Admin menu-management UI.

## Checks and schema refresh

```sh
# From japz-web
npm run build

# From japz-backend
npm run test:inventory
npm run schema:export
```

The 19 retained backend tests create and drop a uniquely named `japz_inventory_test_<timestamp>` database, not the configured application database. Use a dedicated test MySQL account with CREATE/DROP DATABASE permission and run only against a local test server. Test fixture identities and random signing keys are synthetic. Three full-system test cases and one unrelated sales permission assertion were excluded because their APIs are intentionally absent; see the extraction notes.

`schema:export` reads Sequelize model metadata without connecting to MySQL. The SQL contains DDL only, including actual foreign keys and indexes. Some integer identifiers are logical references without model-defined foreign-key constraints; do not infer a physical constraint merely from an `Id` suffix. The model definitions remain the authoritative source.

## GitDiagram use and limitations

- Repository: https://github.com/jcyy2520-sudo/Fajutagana
- GitDiagram: https://gitdiagram.com/jcyy2520-sudo/Fajutagana

Focus the initial architecture on the Inventory React feature, shared auth/HTTP transport, Express Inventory API, domain services, Sequelize and MySQL. Show Admin identity/menu, Cashier order reservation/payment records and Kitchen preparation/waste only as direct boundaries. This repository contains no generated documentation diagrams.

The extraction has new startup/sign-in/routing glue; it does not reproduce the whole system's deployment, account administration or other four modules. No `.env`, credentials, database contents, build outputs, installed dependencies, historical Git objects, deployment settings or previous diagram packages are included. GitDiagram's generated interpretation still needs checking against the code and these scope notes; successful source upload does not verify GitDiagram output or production operation.
