# Local validation - 2026-10-13 (Asia/Manila)

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Inventory backend | PASS | `npm run test:inventory`: 19 tests passed, zero failures; uses a new timestamp-named test database that is removed afterward |
| Frontend production build | PASS | `npm run build`: TypeScript and Vite succeeded; approximately 397 kB JavaScript before gzip |
| Backend JavaScript syntax | PASS | All included backend `.js` files passed `node --check` |
| Schema export | PASS | 19 tables exported from Sequelize metadata without connecting to a database |
| Schema import | PASS | Generated SQL imported into a new temporary database; all 19 tables created |
| Standalone runtime/auth | PASS | Started the new entry point against temporary fixtures; health, login, current user, profile and logout succeeded |
| Inventory access roles | PASS | Unauthenticated reads returned 401; approved Inventory/Admin could write stock; Cashier/Kitchen writes returned 403 while reads succeeded |
| Backend dependency audit | PASS | `npm audit`: zero reported vulnerabilities |
| Frontend runtime dependency audit | PASS | `npm audit --omit=dev`: zero reported vulnerabilities |
| Frontend full dependency audit | PARTIAL | Five high-severity reports in the Tailwind 3 development chain: braces, chokidar, fast-glob, micromatch and tailwindcss |
| Frontend lint | PARTIAL | Five errors in preserved source patterns: synchronous state update in HistoryReports, two render-time ref writes in shared controls, and explicit-any/mixed component-hook exports in useAuth |
| Publication content | PASS | 73 staged files inspected; no forbidden private/generated/module paths, recognized credential patterns, SQL data statements or matches to long private environment values found; 42 unchanged local source copies verified |
| Browser/full-system/hosted acceptance | Not performed | Build and HTTP tests do not establish rendered UI fidelity, the complete POS integration, hosted operation or GitDiagram output correctness |

The development dependency reports trace to [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory lists no patched braces release as of this check; npm proposes a Tailwind major-version migration. Tailwind 3 was retained to preserve the existing Inventory styling/toolchain and avoid expanding this repository extraction into a framework migration. Installed packages and build output are ignored and not uploaded; manifests/lockfiles are included so this limitation remains reproducible and visible.

The first schema-export attempt hit an ENUM serialization option error in the new export script. After correcting the generator escape option, export and SQL import passed. The original failure was confined to the new offline adapter and never changed the team database.

Publication checks additionally inspect the exact staged tree for private environments, provider credentials, database contents, installed/generated outputs, unrelated module paths and matches to long private values from the original local environment. These are bounded publication checks, not proof of the absence of every possible vulnerability.
