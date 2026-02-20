# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**EncoreCRM** — A full-stack CRM system for manufacturing/printing operations (AWF). Handles orders, quotations, design tools (flashing/sheet metal), barcode generation, quality control, production tracking, delivery planning, and MYOB accounting integration.

Timezone: Australia/Sydney (hardcoded in frontend via moment-timezone).

## Repository Structure

```
AWF/
└── Encore_CRM/
    ├── backend/     # Node.js/Express API server
    └── frontend/    # React SPA (Create React App + Craco)
```

## Development Commands

### Backend
```bash
cd Encore_CRM/backend
npm install
npm run serve          # starts nodemon on server.js, port from .env (default 8089)
```

### Frontend
```bash
cd Encore_CRM/frontend
npm install
npm start              # craco start, runs on port 3000
npm run build          # production build to frontend/build/
npm test               # craco test (Jest + React Testing Library)
```

**Note:** Backend has no test suite configured (`npm test` is a no-op placeholder).

### Environment Requirements
- **MongoDB** must be running locally at `mongodb://127.0.0.1:27017/encorestaging`
- **AWS credentials** required for S3 file uploads (bucket: `encore-sheet`), SES email, Lambda, DynamoDB
- **MSSQL** connection required for MYOB integration (config in `backend/config/sqlConfig.js`)
- Backend validates 68+ required env vars on startup via `middleware/envValidator.js` — missing vars will cause `process.exit(1)`

## Architecture

### Backend (Express + Mongoose)

**Request flow:** `server.js` route definitions → `middleware/auth.js` (JWT + RBAC) → `controllers/` → `models/` (Mongoose) + `services/`

- **server.js**: All routes are defined directly in this file (not all delegated to route files). Most endpoints use `app.get/post/patch/delete` with inline `auth.checkRole()` or `auth.checkAnyRole()` middleware.
- **Routes (7 files):** Only `meta`, `templates`, `template-library`, `custom-prices`, `swi`, `orders`, `tags` use dedicated route files under `routes/`.
- **Controllers (31 files):** Business logic organized by domain — `ordermanagementCtrl.js` is the largest and handles orders, quotations, designer/QC/production workflows, reports, MYOB sync, dockets, and more.
- **Models (50 files):** Mongoose schemas. `ordermasterModel` is the central entity.
- **Services:** `s3Service.js` (file ops), `swiService.js` (SWI machine integration), `transactionCoordinator.js`, `validationService.js`.

**Authentication:** JWT tokens verified via `x-access-token` header. Role-based access uses `checkRole(moduleName, accessType)` where accessType is `'add'`, `'edit'`, or `'view'`. Permissions stored in `user.user_role.rolepermissions` object.

**File uploads:** Multer with multer-s3-v3 for S3 uploads, disk storage for barcodes/xlsx imports. Temp directories created on startup: `barcodeimages/`, `barcodeimagespdf/`, `designimages/`, `xlsximages/`, `xlsximagescustom/`, `dockets/`, `logs/`.

**Scheduled jobs:** `autoEmailReportCtrl.scheduleDailyReports()` runs on startup via node-schedule.

**Logging:** Custom Excel-based logging system (`logger.js`) with 10-day auto-cleanup.

### Frontend (React 18 + Redux Toolkit)

**Entry point:** `index.js` → `App.js` (React Router v6 with lazy-loaded routes).

- **State management:** Redux Toolkit store at `src/store/index.js` with 9 slices (masterOrder, quotation, deliveryDashboard, designReport, qcReport, orderReport, doubt, supplier).
- **API layer:** `src/config/api.config.js` — centralized URL config, `tokenManager`, `userManager` helpers. Dev API: `http://localhost:8089`, production: same-origin or `REACT_APP_API_BASE_URL`.
- **Auth token:** Stored in `localStorage` as `token`, sent as `x-access-token` header. 90-minute conservative expiry check. Auto-logout after 2 hours idle.
- **Page modules (25):** Each under `src/Pages/` — Auth, Dashboard, Customers, Products, Orders, Quotation, OrderDesignersManagement, OrderQCManagement, OrderProductionManagement, DeliveryPlanning, Drawings/DrawingComponents, BarcodeGenerator, Reports, Runs, Masters, Users, QueryManagement, Common.
- **Design tool:** Konva canvas (`react-konva`) for flashing/sheet metal design — see `Pages/DrawingComponents/` and `Pages/Drawings/`.
- **UI:** Bootstrap 5 + React Bootstrap + MUI (DataGrid, DatePickers). SASS for custom styles. Toast notifications via react-toastify, modals via SweetAlert2.
- **Forms:** Mix of React Hook Form (with Yup validation) and React Final Form.
- **Build override:** `craco.config.js` strips `console.*` calls in production via babel-plugin-transform-remove-console.

### Key Domain Concepts

- **Order lifecycle:** Quotation → Sale Order → Designer Assignment → QC Check → Production → Barcode/Docket Generation → Delivery Planning → Runs/Transport
- **Departments:** Orders flow through departments; each department has rack tracking.
- **MYOB integration:** Orders/quotations sync with MYOB accounting system via MSSQL.
- **SWI:** Sheet/metal machine integration for offcuts and fold reports.
- **Drawings:** Canvas-based flashing designs attached to orders/quotations, with template library support.
- **Split orders:** Orders can be split for partial delivery.

## Drawing Tool — Complete Flow & Architecture (Flashing Part Group)

### Navigation Flow (4 steps)

```
"Add Design" button (manageOrderItem.js)
    │  navigate(`/orders/{orderId}/drawings/templates`, state)
    ▼
Template Library (DrawingComponents/TemplateLibrary.js)
    │  User picks: "Create Drawing" tab (new) OR double-click/Use It (existing template)
    │  navigate(`/{orders|quotes}/{orderId}/drawings/new?[partGroup&partClass | templateId]`, state)
    ▼
Drawing Canvas (DrawingComponents/DrawingCanvas.js)
    │  User draws/edits geometry → clicks "Finish"
    │  navigate(`/select-materials-simplified?templateId={id}`, state)
    ▼
Select Materials (DrawingComponents/SelectMaterialsSimplified.js)
    │  User sets material, color, qty, length, thickness → clicks "Finish"
    │  ONE atomic API call: POST /api/templates/unified
    │  navigate(`/{orders|quotes}/{orderId}`, { state: { activeTab: 'Flashing' } })
    ▼
Drawing Details Tab (Drawings/DrawingDetailsTab.js)
    Shows grid of all drawings for the order with preview, girth, bends, qty, pricing.
    Actions: Edit, Copy, Flip, Delete.
```

Orders use `orderNumber.startsWith("IN") ? "orders" : "quotes"` to distinguish paths.

After finishing materials, user can also: **Add New** (back to Template Library), **Copy** (back to DrawingCanvas with `?copy=true`), or **Flip** taper (back to DrawingCanvas with `?flip=true`).

### Key Files

| File | Purpose |
|------|---------|
| `DrawingComponents/DrawingCanvas.js` | Main component (~4500 lines). Konva canvas, all drawing modes, geometry state, undo/redo, fold system, taper mode, label management, preview generation. |
| `DrawingComponents/SelectMaterialsSimplified.js` | Material selection post-drawing. Atomic API call creates template + material rows + SWI jobs. |
| `DrawingComponents/TemplateLibrary.js` | Browse/search templates by part class with infinite scroll. Entry point for new drawings. |
| `DrawingComponents/Header.js` | Header bar showing customer, order number, delivery date. |
| `DrawingComponents/PreviewThumbnail.js` | Small Konva preview canvas (≤150x120px) for thumbnails. |
| `Drawings/DrawingDetailsTab.js` | Grid display of all templates in an order. Edit/delete/copy/flip actions. |
| `Drawings/DrawingPreviewCanvas.js` | Preview rendering with color side indicator (red gradient line). |
| `Drawings/SplitPreviewGrid.js` | Split interpolations for taper mode (Far/Near cross-sections). |
| `DrawingHelpers/DrawingConstants.js` | `DIRECTION_MAP` (Up=90°, Down=-90°, Right=0°, Left=180°), `GRID_SIZE`, `GRID_SNAP`. |
| `DrawingHelpers/DrawingCalculations.js` | Pure math: `calculatePoints()` (lengths+angles → {x,y} points), `getFoldSegments()`. |
| `DrawingHelpers/DrawingHelpers.js` | `initializeDisplayAngles()`, `getGirth()` (sum of lengths + fold lengths). |

### Drawing Geometry Model

A drawing is defined by:
- **`lengths[]`** — mm per segment
- **`angles[]`** — degree turns between segments (relative)
- **`segmentAbsoluteAngles[]`** — compass angles per segment (newer absolute system)
- **`direction`** — starting cardinal: `'Right'`(0°), `'Up'`(90°), `'Left'`(180°), `'Down'`(-90°)
- **`firstSegmentAngle`** — optional override for initial direction

`calculatePoints(lengths, angles, direction)` converts these to `[{x,y}, ...]` canvas coordinates.

### Drawing Modes

- **Click-to-Draw**: Click origin → hover preview → click endpoint → creates segment. Green handle extends.
- **Table Editing**: Enter lengths/angles directly in input fields → real-time canvas redraw.
- **Point Dragging**: Drag orange control points. **Lock Legends ON** = preserve lengths, adjust angles. **Lock Legends OFF** = preserve angles, adjust lengths.
- **Taper Mode** (`showTaper=true`): Dual profiles — Far (primary) and Near (interpolated), each with independent lengths/angles and separate Konva stages.

### Fold System

| UI Type | SWI Type | Behavior |
|---------|----------|----------|
| Up | SF, direction=up | Square fold upward 90° |
| Down | SF, direction=down | Square fold downward 90° |
| OpenUp | SSF, direction=up | Semi-square fold, angled up (custom gap) |
| OpenDn | SSF, direction=down | Semi-square fold, angled down (custom gap) |

Each fold has: `type`, `length` (mm), `gap` (SSF only). Fold points are injected into the points array at start/end. `getFoldSegments()` calculates fold geometry.

### Transformations

- **flipH / flipV**: Mirror around centroid (horizontal/vertical).
- **reverseColor**: Shows red/orange gradient line on inside indicating color-painted side.
- **Girth-based scaling**: 4 tiers — ≤250mm(0.8x), ≤500mm(0.5x), ≤1000mm(0.25x), >1000mm(0.1x). Taper profiles scale independently.

### Label System

Labels (segment lengths in blue, angles in red, folds in dark blue) are draggable. Positions stored as relative offsets in `labelOffsets` object (keyed by segment index). Survives geometry modifications.

### State Management

All drawing state is **local React state** in DrawingCanvas — no Redux. Key state groups:
- Geometry: `lengths`, `angles`, `farLengths`, `nearLengths`, `farAngles`, `nearAngles`, `segmentAbsoluteAngles`
- Folds: `startFoldType/Length/Gap`, `endFoldType/Length/Gap`
- Transforms: `flipH`, `flipV`, `reverseColor`, `direction`, `firstSegmentAngle`
- Canvas: `points`, `canvasScale`, `canvasOffset`, `dynamicStageWidth/Height`
- Labels: `labelOffsets`, `coordOffsets`
- History: `history[]` (10-state), `redoHistory[]`
- Library: `templateName`, `partGroup`, `partClass`, `isFromLibrary`

Navigation state passed via React Router `location.state`. Fallback to `localStorage` for refresh/timeout resilience.

### Backend: Drawing APIs

**Template CRUD** (route files under `routes/`):
- `POST /api/templates/unified` — Atomic create: template + material rows + S3 upload + SWI push. Uses `transactionCoordinator.createTemplateWithMaterials()`.
- `PUT /api/templates/unified/:templateId` — Update template + sync SWI records.
- `POST /api/templates/unified/repush` — Re-push deleted SWI jobs for specific material rows.
- `GET /api/templates/:id` — Get template with signed S3 preview URLs.
- `GET /api/templates/:id/preview-urls` — Lightweight: preview URLs + segmentAbsoluteAngles only (for edit mode).
- `DELETE /api/templates/:id` — Delete template + cascade material rows.
- `GET /api/templates/get-system-generated-drawing/:orderid` — Generate PDF of all order drawings (Puppeteer, 6 per page with barcodes).
- `GET /api/templates/get-drawing-counts/:orderNumber` — Count drawings/pieces/colors.

**Template Library**:
- `POST /api/template-library/` — Save to library (part_class, my_library, or customer_library).
- `GET /api/template-library/` — Fetch with pagination (page, limit=12). Filter by library_type, part_group, part_class.
- `GET /api/template-library/check-duplicate` — Pre-save duplicate check (lengths+angles match).
- `PUT /api/template-library/:id` — Update name only.
- `DELETE /api/template-library/:id` — Remove from library.

**Meta**: `GET /api/templates/meta/groups-classes` — Returns part group/class taxonomy (Flashing→[Gutters, Cappings, Aprons, Ridge & Valley, Soakers, Foot Moulds, Misc], Jobbing, FG, Cladding, Roofing, GBI, GBI.L).

**Material Rows** (nested under templates):
- `POST /api/templates/:templateId/material-rows` — Create row.
- `GET /api/templates/:templateId/material-rows` — Get all rows for template.
- `PUT /api/templates/material-rows/:rowId` — Update row.
- `DELETE /api/templates/material-rows/:rowId` — Delete row.

### Backend: Drawing Data Models

**Template** (`models/templateModel.js`): Stores geometry (`lengths`, `angles`, `nearLengths`, `nearAngles`, `farLengths`, `farAngles`), previews (S3 keys), folds, transforms (`flipH`, `flipV`), `labelOffsets`, `isTaper`, `swiJobIds[]`, `orderNumber`, `customerName`, `status` (draft/processing/completed/failed).

**MaterialRow** (`models/materialRowModel.js`): Links to template via `templateId`. Stores `material`, `color`, `thickness`, `tag` (ShapeID), `quantity`, `length`, `girth`, `unitPrice`, `extPrice`, `swiJobId`, `status` (pending/pushed_to_swi/failed).

**TemplateLibrary** (`models/templateLibraryModel.js`): Same geometry fields as Template. Categorized by `library_type` (part_class/my_library/customer_library), `part_group`, `part_class`, `owner_user_id`, `customer_id`.

**OrderMaster** drawing-related fields: Design images by dept (`order_images_f[]`, `_fg[]`, `_cl[]`, `_j[]`, `_roof[]`, `_gbi[]`), barcode images by dept, design workflow tracking (`order_designed_person`, `order_design_stage`, `order_qc_status`, `order_qced_person`).

### SWI Integration

When a template is created/updated, material rows are pushed to the MSSQL SWI manufacturing system via `swiService.js`. Each material row gets a `swiJobId`. Split taper drawings create multiple SWI jobs. The `transactionCoordinator.js` handles atomic create/rollback. Barcodes (Code128 via bwip-js) are generated from SWI JobIDs for production printing.

### API Conventions

- Most endpoints follow the pattern: `/verb-entity-details/:id` (e.g., `/fetch-specific-order-details/:orderid`, `/add-order-item-details/:orderid`)
- Bulk operations use xlsx file uploads: `/bulk-import-*`
- Export endpoints return Excel/PDF: `*-export`, `*-generate-export`
- Auth token passed as `x-access-token` header on every authenticated request
