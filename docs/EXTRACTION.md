# Inventory extraction notes

## Source and preservation

Source: the local JAPZ project, based on team repository commit `0f912e9ed18fb49eeb8a4b0a8ab16ba50a7f2cda` (`updates/inventory-local-workflow-2026-10-07`). Only reviewed eligible source was copied into a separate checkout of `jcyy2520-sudo/Fajutagana`; no original Git history was imported. The main workspace's source, remote, branch, local documentation and generated artifacts were preserved.

`SOURCE-MANIFEST.json` records SHA-256 values of the exact local source copies and adapted-file reasons. Git may normalize CRLF line endings to LF when storing those files; the hashes describe the original copied bytes before that normalization. Inventory models, router, core domain services, settings/upgrades and all Inventory screens apart from the obsolete Admin dashboard navigation were preserved. Existing framework license notices remain on copied shared files; this extraction does not assert a new blanket license over the team project.

## Adaptations confined to this repository

- Added an Express startup adapter with local binding, explicit frontend CORS origin and separate schema initialization. No full-system startup/seeding was copied.
- Scoped the association registry to Inventory and its User, MenuCategory, MenuItem, Order, OrderItem, Payment and Log dependencies.
- Extracted existing login/logout/current-user/profile, public availability, Admin menu creation and order creation/status routes from the monolithic shared router. No full POS/Kitchen screens, sales, employee, feedback, discounts, vouchers, email, Google Sheets, AI or forecasting modules were copied.
- Retained only `createLog` and `getClientIp` from the logging helper and only `requireJwtSecret` from security configuration.
- Added standalone React routes/sign-in and minimal global styles/HTML. Scoped auth context/HTTP methods and protected-role behavior, and removed the link to the omitted full Admin dashboard. The dedicated Kitchen waste component is included as source evidence for the interaction, without a full Kitchen route/layout.
- Kept MySQL connection variable support; changed hosted TLS certificate verification from false to true in this copy. A hosted database needs a trusted certificate/CA configuration; no hosted deployment was performed.
- Trimmed direct dependency manifests to packages imported by the included runtime and frontend toolchain; generated new lockfiles. No installed package folders are tracked.
- Generated schema DDL and metadata offline from the included Sequelize models. No live data export occurred.

## Test boundary

The original backend suite has 22 cases. This copy retains 19 existing cases, including atomic/concurrent receiving and overselling, idempotency, stock reservation/consumption/release, FEFO/expiry/holds, versioned recipes, counts, waste/returns/reversal, settings conflicts, availability and additive upgrades.

Three cases were omitted in their entirety because they exercise omitted global APIs: `only approved Inventory and Admin can change stock or manage recipes`, `Inventory cannot alter other roles, promotions, business hours or feedback`, and `menu editing cannot overwrite stock; unsafe legacy resets are retired`. The retained cart/public-availability case omits its `/api/sales/summary` permission assertion. No test was changed to accept an incorrect Inventory result. These omissions limit full-system permission/menu-editor coverage and do not claim equivalence to the original suite.

## Runtime and architecture limits

The original is a modular monolith with shared records and transaction boundaries. This checkout is a runnable extraction with documented adapters. The shared User, menu/category, order/order-item and Payment records are retained because Inventory actually reads or writes them, not as complete independent modules.

No existing account, password/hash, supplier/customer information, financial transaction, stock balance or private environment was copied. The application database starts empty. Existing Admin accounts and menu/category data must be supplied separately for those boundary workflows. Only the dedicated Inventory account creation command is included.

Authentication behavior comes from the existing shared application: bearer tokens are held in browser localStorage, tokens expire after seven days, and logout removes the browser token rather than revoking it server-side. This extraction was checked for publishable secrets and dependency vulnerabilities; it is not a production security certification. HTTPS, rate limiting, secure token storage/revocation, backups, hosted MySQL trust and operational deployment remain integration concerns.

Validation results are recorded in `VALIDATION.md`. Source upload and local tests do not prove full-system/hosted behavior, actual multi-user operation, or GitDiagram diagram accuracy.
