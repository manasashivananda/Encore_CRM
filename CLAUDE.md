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

---

## AWF Module — Work Log (20-Feb-2026)

### What Was Built

The AWF part group was added to the Template Library alongside the existing Flashing flow. AWF has its own independent collections, API routes, and frontend rendering — completely separate from Flashing.

### AWF Architecture (Separate from Flashing)

```
Template Library (TemplateLibrary.js)
  ├── Flashing flow (unchanged):
  │     Sidebar classes → template-library API → Konva drawing cards → DrawingCanvas → SelectMaterialsSimplified
  │
  └── AWF flow (new):
        Sidebar classes → awf-products API → Product cards (image + name) → AWFSelectMaterials page
```

### Files Created

| File | Purpose |
|------|---------|
| `backend/models/awfProductLibraryModel.js` | Mongoose model for `awf_product_libraries` collection — simplified catalog (name, description, image only) |
| `backend/controllers/awfProductLibraryCtrl.js` | Controller with `getAWFProducts()` — filters by part_class, sub_category, pagination |
| `backend/routes/awfProductLibraryRoutes.js` | `GET /api/awf-products` route |
| `backend/scripts/seedAWFTemplates.js` | Seed script — 14 products (2 per category) with simplified fields |
| `frontend/src/Pages/DrawingComponents/AWFSelectMaterials.js` | AWF material selection page (placeholder — needs full form) |

### Files Modified

| File | Changes |
|------|---------|
| `backend/routes/meta.js` | Added AWF group with 4 classes + `subCategories` field (Downpipe, Offsets have sub-categories) |
| `backend/server.js` | Registered `/api/awf-products` route |
| `frontend/src/App.js` | Imported AWFSelectMaterials, added routes `/orders/:id/awf/select-materials` and `/quotes/:id/awf/select-materials` |
| `frontend/src/Pages/DrawingComponents/TemplateLibrary.js` | Full AWF support — see details below |
| `frontend/src/styles/TemplateLibrary.scss` | Toggle styles + AWF product card styles + AWF preview pane styles |

### TemplateLibrary.js — AWF Changes Detail

- **Part Group dropdown**: Only AWF and Flashing visible. Default is Flashing.
- **AWF sidebar**: Shows only 4 part classes (Downpipe, Clips & Pops, Offsets, Rollforming). No Create Drawing / My Library / Customer Library.
- **Sub-category toggles**: Downpipe shows `Standard D/P | Manual D/P` toggles. Offsets shows `Standard Offset | Custom Offset | Bends (Elbow/Shoes)` toggles. First toggle auto-selected.
- **AWF API fetch**: When AWF selected, fetches from `/api/awf-products` (not `/api/template-library`). Passes `part_class` and `sub_category` as query params.
- **AWF product cards**: Show product image (placeholder until S3 upload) + name only. No product specs on cards. Has double-click and single-click selection.
- **AWF preview pane**: Shows product image + name + "Use It" button. No description or product specs shown.
- **AWF navigation**: Double-click or "Use It" → `/orders/{orderNumber}/awf/select-materials?productId={id}` (separate from Flashing's `/drawings/new`). Passes only `productId, name, partGroup, partClass, subCategory` in state.
- **Flashing completely unchanged**: All AWF logic guarded by `selectedGroup === 'AWF'` or `_isAWFProduct` flag.

### Database

- **Collection**: `awf_product_libraries` in `EncoreDB` (NOT `encorestaging`)
- **Current data**: 14 products (2 per category) seeded via `node scripts/seedAWFTemplates.js`
- **Schema fields (simplified catalog)**: `part_class` (4 enum values), `sub_category`, `name`, `description`, `image` (S3 key — null for now), `status`, `created_by`
- **Note**: Product specifications (shape, dimensions, thickness, lengths, pricing, barcode, is_custom) are NOT in this collection — they belong in the second order-specific collection (to be created)

### AWF Product Categories (from AWF MODULE.docx)

| Part Class | Sub-Category | Products | Notes |
|------------|-------------|----------|-------|
| Downpipe | Standard D/P | 100x50, 100x75 (square) + 75mm, 90mm (round) × 1.8m/2.4m | Thickness 0.45mm fixed. Length dropdown. |
| Downpipe | Manual D/P | 5 square + 5 round + 2 custom sizes | All fields editable. Tapered = big–small end. |
| Clips & Pops | *(none)* | Saddle clips, Stand-off clips, Reducers (square + round) | Thickness 0.60mm. Length always 1. |
| Offsets | Standard Offset | Standard + Federation types (square + round) | Thickness 0.45mm. Length 1.8m/2.4m. Adjustability 450–600mm. |
| Offsets | Custom Offset | Round + Square drawing entry forms | User enters W, A, B1, B2, C, D, E measurements. Thickness dropdown 0.45/0.6. |
| Offsets | Bends (Elbow/Shoes) | Elbows + Shoes (square + round + custom) | All editable except standard bends. |
| Rollforming | *(none)* | Placeholder (no spec yet) | |

---

## AWF Module — Work Log (23-Feb-2026)

### What Was Built

AWFSelectMaterials page fully built (display/navigation only — no backend save yet). Backend model for order entries created. Product images updated with placeholders.

### AWF Select Materials — Complete Flow

```
Template Library (AWF product selected)
    │  Double-click or "Use It" button
    │  Passes: productId, name, productImage, partClass, subCategory, order context
    ▼
AWFSelectMaterials page (/orders/:id/awf/select-materials)
    │  Two-column layout:
    │    LEFT:  subCategory/partClass title → product image → productName
    │    RIGHT: Material/Color dropdowns → Thickness → form fields → FINISH buttons
    │
    │  Form varies by type:
    │    standard (Standard D/P, Standard Offset): Thickness 0.45, BARCODE
    │    manual_dp (Manual D/P): Thickness 0.45, dimensions, Number of Pieces + Length side by side, TAPERED, NO BARCODE
    │    clips (Clips & Pops): Thickness 0.60, NO BARCODE, NO dimensions
    │    bends (Elbow/Shoes): Thickness 0.45, dimensions, BARCODE
    │    custom_offset: DEFERRED (complex form)
    │
    │  FINISH buttons (placeholders — console.log only, no API save yet):
    │    ✓ Finish — save and return to order
    │    + Finish & Add New — save and go back to Template Library
    │    📋 Finish & Copy — save and duplicate with same product
    ▼
  (Phase 2: wire up save to awf_order_entries collection)
```

### Files Created (23-Feb)

| File | Purpose |
|------|---------|
| `backend/models/awfOrderEntryModel.js` | Mongoose model for `awf_order_entries` collection — one doc per FINISH click. Fields: orderNumber, productId/Name, partClass, subCategory, material, color, thickness, numberOfPieces, length, dimensions (width/height/diameter), tapered, barcode, note, unitPrice, productImage, status. Indexed on `{orderNumber, status}` |
| `backend/scripts/updateAWFImages.js` | Quick script to update existing AWF products with placeholder image URLs (placehold.co). Run once: `node scripts/updateAWFImages.js` |
| `frontend/src/styles/AWFSelectMaterials.scss` | AWF-specific styles — split layout, thickness bold display, dimension row with "x" separator, checkbox bold text, finish buttons centered |

### Files Modified (23-Feb)

| File | Changes |
|------|---------|
| `frontend/src/Pages/DrawingComponents/AWFSelectMaterials.js` | **Full rewrite** — MUI form with Material/Color dropdowns (same API as Flashing), thickness bold display, conditional fields per form type, TAPERED/BARCODE checkboxes, *Note* textarea, Unit Price, 3 FINISH buttons, Back button |
| `frontend/src/Pages/DrawingComponents/TemplateLibrary.js` | Added `productImage: tpl.image` to AWF navigation state (both double-click and "Use It" handlers) |
| `backend/scripts/seedAWFTemplates.js` | Updated all 14 products with placeholder image URLs from placehold.co |

### Key Design Decisions (23-Feb)

- **One model, not two**: AWF uses single `awf_order_entries` model (unlike Flashing's Template + MaterialRow). No drawing geometry in AWF.
- **Shared Material/Color APIs**: Reuses `GET /fetch-core-product-data` and `GET /fetch-product-color-data/:id` — same endpoints as Flashing's SelectMaterialsSimplified. No duplicate APIs needed.
- **No Add Rows**: AWF doesn't have add rows feature
- **No Girth field**: Removed from model and form
- **TAPERED**: Only for Manual D/P (simple checkbox, not Flashing's dual-profile taper mode)
- **BARCODE**: Only for Standard D/P, Standard Offset, Bends — NOT for Clips or Manual D/P
- **Flashing untouched**: Zero changes to SelectMaterialsSimplified.js, DrawingCanvas.js, or any Flashing flow

### AWF Form Fields Per Type

| Field | Standard | Manual D/P | Clips | Bends |
|-------|----------|-----------|-------|-------|
| Material dropdown | ✓ | ✓ | ✓ | ✓ |
| Color dropdown | ✓ | ✓ | ✓ | ✓ |
| Thickness | 0.45 | 0.45 | 0.60 | 0.45 |
| Dimensions (W x H) | — | ✓ | — | ✓ |
| + Add Quantity | — | ✓ | — | ✓ |
| Number of Pieces | ✓ | ✓ (side by side with Length) | ✓ | ✓ |
| Length (m) | — | ✓ (side by side with Pieces) | — | — |
| TAPERED | — | ✓ | — | — |
| BARCODE | ✓ | — | — | ✓ |
| *Note* | ✓ | ✓ | ✓ | ✓ |
| Unit Price | ✓ | ✓ | ✓ | ✓ |

### What's Next (TODO)

1. **Phase 2 — FINISH save logic**: Create `awfOrderEntryCtrl.js` (controller with save/fetch/delete), `awfOrderEntryRoutes.js` (routes), register in `server.js`, wire up 3 FINISH buttons to save API
2. **FINISH & Add New**: After save → navigate back to Template Library with AWF state
3. **FINISH & Copy**: After save → stay on AWFSelectMaterials with same product pre-filled
4. **AWF tab on order page**: Show saved AWF entries in a grid/table (like Flashing's DrawingDetailsTab)
5. **Product images**: Upload actual 3D product images to S3, replace placehold.co URLs
6. **Custom Offset form**: Complex form with W, A, B1, B2, C, D, E measurements + Seam Side + Type (Fixed/Adjustable) — deferred
7. **Seed full product list**: Add all products when ready (currently 2 per category = 14 total)
8. **Rollforming**: No spec in document yet — needs definition
