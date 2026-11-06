# S/4HANA Sandbox

A self-contained mock SAP S/4HANA-style system for demos, UI prototyping, and integration testing. It ships with realistic master and transactional data, six OData V2 services, and a Fiori-inspired web application. There is no build step and no external database — everything runs from a single JSON file.

> This is an unofficial sandbox. It is not affiliated with, endorsed by, or connected to SAP. Do not use it for production data or as a reference for SAP compliance.

## Highlights

- **6 OData V2 services / 15 entity sets / 1,278 seeded records** covering business partners, products, sales orders, purchase orders, billing documents, and journal entries.
- **Fiori-style UI** with launchpad, list reports, object pages, global search, API explorer, and a system status page.
- **Write support** through OData (create, update, replace, delete, deep insert, cascade delete) and a focused UI write scope.
- **Deterministic demo data** generated with a fixed-seed PRNG, then persisted to JSON.
- **Basic authentication** with full-access and read-only demo users. Anonymous access is convenient on localhost and can be disabled.
- **No build tooling.** Plain HTML, CSS, and ES modules. Only `express` and `cors` at runtime.

## Quick start

Requirements: **Node.js 18 or newer** (tested on Node 20).

```bash
npm install
npm start
```

Open <http://127.0.0.1:4004/>.

On first start the server creates `data/database.json` from the seed. Subsequent starts reuse the file, so changes survive restarts.

```text
UI              http://127.0.0.1:4004/
OData catalog   http://127.0.0.1:4004/sap/opu/odata/sap
Health          http://127.0.0.1:4004/api/health
```

## Demo users

Authentication is HTTP Basic. Anonymous requests are accepted by default.

| User | Password | Roles | Capabilities |
| --- | --- | --- | --- |
| *(anonymous)* | — | `SAP_ALL` while anonymous writes are enabled | Read and write |
| `DEVELOPER` | `Password1` | `SAP_ALL` | Read, write, reset |
| `DEMO` | `Demo1234` | `READ_ONLY` | Read only |
| `AUDITOR` | `Audit1234` | `READ_ONLY` | Read only |

The UI has a sign-in dialog in the user menu. Credentials are stored in `localStorage` as a Basic auth header for convenience; this is appropriate only for a local sandbox.

> **Before sharing the server:** set `S4_ALLOW_ANONYMOUS_WRITE=false` or keep the default bind address `127.0.0.1`.

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the server on `127.0.0.1:4004`. |
| `npm run dev` | Start with Node's watch mode (restarts on backend changes). |
| `npm run seed` | Rebuild the data file from the deterministic seed and print record counts. |
| `npm test` | Run the Node test runner suite (unit + HTTP integration). |

## Configuration

Environment variables are read when the process starts.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4004` | HTTP port. |
| `HOST` | `127.0.0.1` | Bind address. Set `0.0.0.0` only when you intend to expose the sandbox. |
| `S4_DATA_FILE` | `data/database.json` | Path to the JSON data file. Relative paths resolve from the current working directory. |
| `S4_ALLOW_ANONYMOUS_WRITE` | `true` | Set to `false` so unauthenticated requests are read-only. |
| `S4_ALLOW_RESET` | `true` | Set to `false` to disable `POST /api/reset` and the UI reset action. |

Example:

```bash
PORT=5000 S4_DATA_FILE=./tmp/sandbox.json S4_ALLOW_ANONYMOUS_WRITE=false npm start
```

## Web UI

The UI uses hash routing and needs no server-side rendering.

| Route | Page |
| --- | --- |
| `#/` | Launchpad with KPIs, apps, and recent sales orders |
| `#/list/:service/:entity` | List report with search, filters, sorting, paging, CSV export |
| `#/object/:service/:entity/:encodedKey` | Object page with sections and related records |
| `#/explorer` | OData API explorer with editable URL and formatted response |
| `#/system` | Runtime, dataset, and service information |

UI write scope is intentionally narrower than the API:

| Object | Create | Edit | Delete |
| --- | --- | --- | --- |
| Business partner | Yes | Yes | Yes |
| Sales order | Yes | No | No |
| Purchase order | No | No | No |
| Billing document | No | No | No |
| Journal entry | No | No | No |

The full OData API remains available to scripts and integrations for the supported operations.

## OData services

Base URL: `/sap/opu/odata/sap`

| Service | Entity sets | Records |
| --- | --- | --- |
| `API_BUSINESS_PARTNER` | `A_BusinessPartner`, `A_BusinessPartnerAddress`, `A_BusinessPartnerRole`, `A_Customer`, `A_Supplier` | 62 + 77 + 67 + 40 + 19 |
| `API_PRODUCT_SRV` | `A_Product` | 52 |
| `API_SALES_ORDER_SRV` | `A_SalesOrder`, `A_SalesOrderItem`, `A_SalesOrderScheduleLine` | 68 + 166 + 166 |
| `API_PURCHASEORDER_PROCESS_SRV` | `A_PurchaseOrder`, `A_PurchaseOrderItem` | 40 + 79 |
| `API_BILLING_DOCUMENT_SRV` | `A_BillingDocument`, `A_BillingDocumentItem` | 45 + 97 |
| `API_JOURNAL_ENTRY_SRV` | `A_JournalEntry`, `A_JournalEntryItem` | 85 + 215 |

Useful endpoints:

```text
GET  /sap/opu/odata/sap                              Service catalog
GET  /sap/opu/odata/sap/API_SALES_ORDER_SRV          Entity sets in a service
GET  /sap/opu/odata/sap/API_SALES_ORDER_SRV/$metadata EDMX metadata
GET  /sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder
GET  /sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('0000001001')
GET  /sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('0000001001')/to_Items
GET  /sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('0000001001')/to_Items/$count
POST /sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder
```

### Query options

| Option | Support |
| --- | --- |
| `$filter` | Comparison (`eq`, `ne`, `gt`, `ge`, `lt`, `le`), logical (`and`, `or`, `not`), parentheses, string functions, date parts, numeric functions, `null` |
| `$select` | Comma-separated property names. Keys are always included. |
| `$orderby` | Multiple properties, `asc` / `desc`, numeric-aware sorting |
| `$top` | Default 100, maximum 5,000 |
| `$skip` | Zero-based offset |
| `$count` | `$count=true` adds `__count` to the payload |
| `$inlinecount` | `allpages` behaves like `$count=true` |
| `$search` | Case-insensitive match across each entity's configured search fields |
| `$expand` | Single or comma-separated navigation properties, `*`, and nested options such as `to_Items($top=3;$select=Material,NetAmount)` |

Supported `$filter` functions: `contains`, `substringof`, `startswith`, `endswith`, `tolower`, `toupper`, `trim`, `length`, `indexof`, `substring`, `concat`, `year`, `month`, `day`, `round`, `floor`, `ceiling`.

Examples:

```text
# Open sales orders above 20,000, newest first
/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?$filter=TotalNetAmount gt 20000 and OverallDeliveryStatus ne 'C'&$orderby=CreationDate desc&$top=10

# Page two of the business partner list with a total count
/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=10&$skip=10&$count=true

# Expand items and only return selected item fields
/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('0000001001')?$expand=to_Items($select=Material,NetAmount)

# Search across the configured fields
/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$search="orion"
```

### Response envelope

Responses use the OData V2 JSON shape and set `DataServiceVersion: 2.0`. They do **not** claim OData V4.

```json
{
  "d": {
    "__count": "68",
    "results": [
      {
        "__metadata": {
          "type": "API_SALES_ORDER_SRV.A_SalesOrderType",
          "uri": "http://127.0.0.1:4004/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('0000001001')"
        },
        "SalesOrder": "0000001001",
        "TotalNetAmount": 50331.63,
        "TransactionCurrency": "CAD"
      }
    ]
  }
}
```

Single entities are returned under `d` without `results`. Errors use `error.code` and `error.message.value` and include the HTTP status code (400, 401, 403, 404, 405, 409, or 500).

## Write operations

| Method | Target | Behaviour | Success |
| --- | --- | --- | --- |
| `POST` | Collection | Create. Supports deep insert of child navigation rows. | `201` + `Location` |
| `PATCH` | Single entity | Merge supplied writable properties into the existing record. | `204` |
| `PUT` | Single entity | Full replacement: supplied writable properties are set, other writable properties reset to defaults. Keys and read-only fields are preserved. | `204` |
| `DELETE` | Single entity | Delete, cascading to owned child rows where configured. | `204` |

Read-only properties are rejected in write payloads. They are computed or denormalized convenience fields such as `CountryName`, `BusinessPartnerFullName`, `ProductDescription`, `NetAmount`, `TotalNetAmount`, status fields, and audit fields.

### Deep insert: business partner with a role

```bash
curl -u DEVELOPER:Password1 \
  -H "Content-Type: application/json" \
  -d '{
    "BusinessPartnerName": "Contoso Trading GmbH",
    "BusinessPartnerCategory": "2",
    "Country": "DE",
    "CityName": "Hamburg",
    "StreetName": "Testweg",
    "HouseNumber": "12",
    "to_Roles": [{ "BusinessPartnerRole": "FLCU00" }]
  }' \
  http://127.0.0.1:4004/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner
```

The `afterCreate` hook creates a default address and a customer master record. The response includes the generated 7-digit business partner key.

### Deep insert: sales order with an item

```bash
curl -u DEVELOPER:Password1 \
  -H "Content-Type: application/json" \
  -d '{
    "SalesOrderType": "OR",
    "SoldToParty": "1000035",
    "to_Items": [
      { "Material": "FG-1001", "RequestedQuantity": 2 }
    ]
  }' \
  http://127.0.0.1:4004/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder
```

The order hook validates the customer and material, generates the order key, computes item amounts and totals, and creates a schedule line for each item. Deleting the order removes its items and schedule lines.

Other validation examples:

- Creating a sales order with no items, an unknown sold-to party, or an unknown material returns `400`.
- Reusing an existing order key returns `409`.
- Deleting a business partner that is referenced by a sales order returns `409`.

## Sandbox data notes

- **Dates** are ISO calendar strings (`YYYY-MM-DD`) even where the metadata declares `Edm.Date`. This keeps the JSON readable and is a deliberate simplification from SAP's `/Date(...)/` wire format.
- **Decimals** are returned as JSON numbers rather than strings.
- **Convenience fields** such as customer names on sales orders and product descriptions on items are denormalized into the record and marked read-only. Real S/4HANA would expose these through associations or value helps.
- **Currency and unit fields** are informational. No currency conversion or unit conversion is performed.
- **Seed dates are relative to the day the data is generated**, so the calendar dates shift when you reset on a different day. Keys, relationships, amounts, and entity shapes are deterministic.
- **Single-process store.** The JSON file is written atomically (`.tmp` then rename), but concurrent writers across multiple server processes are not supported.

## Data file and reset

The data file path is `data/database.json` unless `S4_DATA_FILE` is set. When the file is missing or unreadable, the server seeds a new one. A corrupt file is renamed to `database.json.corrupt-<timestamp>` before re-seeding.

Three ways to reset:

```bash
# 1. Script (offline)
npm run seed

# 2. HTTP (server running, confirmation header required)
curl -X POST -H "x-confirm-reset: reset" http://127.0.0.1:4004/api/reset

# 3. UI: System page -> Reset demo data
```

`POST /api/reset` requires a write-capable user and is disabled by `S4_ALLOW_RESET=false`. To reset a custom data file, set `S4_DATA_FILE` for both the server and `npm run seed`.

## Backend-for-frontend API

The UI consumes a small JSON API under `/api`:

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Status, version, data file, seeded timestamp, total records |
| `GET /api/catalog` | Services, entities, fields, keys, navigation, UI metadata, auth flags |
| `GET /api/stats` | Launchpad KPIs and breakdowns |
| `GET /api/search?q=...&limit=...` | Cross-entity global search |
| `GET /api/me` | Current user and capabilities |
| `POST /api/reset` | Reset the dataset (write role + confirmation header) |

## Testing

```bash
npm test
```

The suite uses Node's built-in test runner and covers 29 tests:

- `test/query.test.js` — filter operators, string functions, sorting, paging, counts, projection, search, and invalid queries.
- `test/seed.test.js` — record counts, determinism, primary keys, referential consistency, document flow, amount arithmetic, schedule lines, date format, and metadata.
- `test/http.test.js` — catalog/metadata, OData envelopes, navigation, business partner CRUD and cascade behaviour, sales order deep insert, authentication and role gating, reset, search, and static UI serving.

HTTP tests set a unique temporary `S4_DATA_FILE` and listen on an ephemeral port, so they never touch your working dataset.

## Docker

```bash
docker build -t s4hana-sandbox .
docker run --rm -p 4004:4004 -v s4data:/app/data s4hana-sandbox
```

The image binds to `0.0.0.0` inside the container and persists the dataset in the named volume. Anonymous writes are enabled by default; pass `-e S4_ALLOW_ANONYMOUS_WRITE=false` to require authentication for writes.

## Continuous integration

`.github/workflows/ci.yml` runs `npm ci` and `npm test` on Node 18 and Node 20 for pushes and pull requests.

## Project layout

```text
server.js                 Express app factory, middleware, static UI, startup
src/
  auth.js                 Basic auth, roles, write gating
  constants.js            Countries, currencies, orgs, users, code lists
  errors.js               ApiError
  http.js                 OData error envelope
  schema.js               Services, entities, fields, navigation, hooks, validation
  seed.js                 Deterministic demo dataset
  store.js                JSON persistence, CRUD, transactions, key generation
  util.js                 Formatting, rounding, date helpers
  odata/
    metadata.js           EDMX generation
    query.js              $filter/$select/$orderby/$top/$skip/$count/$search/$expand
  routes/
    api.js                UI backend-for-frontend
    odata.js              Generic OData V2 HTTP layer
public/                   Fiori-style UI (HTML, CSS, ES modules)
scripts/reset.js          Offline data rebuild
test/                     Unit and HTTP integration tests
data/database.json        Persisted dataset (created on first start)
```

## Limitations

This sandbox intentionally implements a practical subset of the SAP ecosystem. Not included:

- `$batch` requests, delta tokens, ETags / `If-Match` optimistic concurrency, or `__next` paging links.
- SAP-specific actions, functions, annotations, or CDS view semantics beyond basic metadata attributes.
- SAML, OAuth, XSUAA, CSRF tokens, or production-grade session security.
- Multi-user concurrency, referential integrity enforcement at the storage layer, or database transactions across processes.
- Full SAP date/time, decimal-as-string, or currency/unit conversion semantics.

See the code in `src/schema.js` for the authoritative entity definitions, hooks, and validation rules.
