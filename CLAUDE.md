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

1. ~~**Phase 2 — FINISH save logic**~~ — DONE (24-Feb)
2. ~~**FINISH & Add New**~~ — DONE (24-Feb)
3. ~~**FINISH & Copy**~~ — DONE (24-Feb)
4. ~~**AWF tab on order page**~~ — DONE (24-Feb)
5. **Product images**: Upload actual 3D product images to S3, replace placehold.co URLs
6. **Custom Offset form**: Complex form with W, A, B1, B2, C, D, E measurements + Seam Side + Type (Fixed/Adjustable) — deferred
7. ~~**Seed full product list**~~ — Partially done (Manual D/P expanded to all products from doc)
8. **Rollforming**: No spec in document yet — needs definition

---

## AWF Module — Work Log (24-Feb-2026)

### What Was Built

Phase 2 complete: FINISH save logic, AWF tab on order page, AWF tab on designers page, edit/delete functionality, lightbox view, barcode sticker display, and navigation fixes.

### Backend Changes (24-Feb)

| File | Changes |
|------|---------|
| `backend/controllers/awfOrderEntryCtrl.js` | Added `updateEntry` (PUT) for edit mode. Changed `deleteEntry` from soft delete (`findByIdAndUpdate`) to hard delete (`findByIdAndDelete`) to match Flashing behavior. |
| `backend/routes/awfOrderEntryRoutes.js` | Added `PUT /:id` route for updating entries. |

### Frontend — AWF Tab on Order Page (manageOrderItem.js)

| Change | Details |
|--------|---------|
| Import | Added `AWFDetailsTab` import |
| Tab | Added `<Tab label="AWF" value="AWF" />` — always visible after GBIL |
| Content | AWF tab renders "Add AWF Product" button + `<AWFDetailsTab>` component |
| Navigation | "Add AWF Product" navigates to Template Library with `partGroup: "AWF"` |
| Tab persistence | `onEntryDelete` is no-op `() => {}` to prevent tab switching after delete |
| activeTab | Reads `location.state?.activeTab` to open correct tab after FINISH navigation |

### Frontend — AWF Tab on Designers Page (designToolOrders.js)

| Change | Details |
|--------|---------|
| Imports | Added `Tabs, Tab` (MUI), `AWFDetailsTab`, `useLocation` |
| Tabs | Flashing / AWF tab switcher above the Flashing header |
| AWF content | "Add AWF Product" button in `GeneralHeading` wrapper + `<AWFDetailsTab>` |
| Tab state | `activeDesignTab` reads `location.state?.activeTab` — defaults to Flashing, switches to AWF when returning from AWF finish |
| Flashing guard | All Flashing-specific content (Order Item header, badges, toggle, buttons, DrawingDetailsTab) inside `activeDesignTab === "Flashing"` guard |

**Note:** `designToolQuotes.js` was NOT modified — quotation flow untouched per user instruction.

### Frontend — AWFSelectMaterials.js Updates

| Feature | Details |
|---------|---------|
| Edit mode | Detects `editEntryId` + `editData` in navigation state. Pre-fills form fields. Uses PUT instead of POST. |
| Navigation fix | `handleFinish` uses `previousPage` (like Flashing) — navigates to `/designers/{id}` when from designers, `/orders/{id}` when from orders |
| activeTab | Passes `activeTab: 'AWF'` in navigation state so order/designer page opens on AWF tab |
| Colors auto-load | In edit mode, auto-loads colors when materials are available |

### Frontend — AWFDetailsTab.js (Card Grid + Lightbox)

Created as AWF equivalent of DrawingDetailsTab. Located at `frontend/src/Pages/Drawings/AWFDetailsTab.js`.

**Card Grid:**
- `Col md={6}` — 2 cards per row (matches Flashing normal card layout)
- Header row: product info (left) | COLOR bold (center) | Qty/Len table (right)
- Barcode sticker display: "BARCODE" / barcode icon / "STICKERS" when `entry.barcode === true`
- Product image area (or Package icon placeholder)
- Edit / Delete action buttons bar (outline-primary / outline-danger)
- `previousPage` passed in edit navigation state for correct return navigation

**Lightbox (double-click to open):**
- Full-screen overlay (`rgba(0,0,0,0.9)`, z-index 10000) — same as Flashing
- Header bar: "Material: {name} {thickness}" + COLOR in large text
- Qty/Len table (top-right, always visible)
- Edit / Delete buttons (top-right, below table) — Delete uses swal with z-index 10001
- Product name + partClass centered
- Barcode sticker (large, if checked)
- Product image (large)
- Keyboard: Arrow Left/Right to navigate, Escape to close
- On close: scrolls to card + blue glow highlight (1.5s)
- Click dark overlay to close

**Delete behavior:**
- Hard delete from MongoDB (matching Flashing)
- No success swal after delete
- Tab stays on AWF (no tab switching)

### Frontend — AWFSelectMaterials.js Form Updates (25-Feb)

| Change | Details |
|--------|---------|
| Dimension boxes | Only show for custom products (name contains "---") — applies to ALL part classes (Downpipe, Offsets, Bends). Square custom ("--- x --- mm") shows 2 boxes (A, B). Round custom ("--- mm") shows 1 box (A). |
| Length dropdown | Downpipe + Offsets: dropdown with 1.800 / 2.400. Clips: fixed display "Length: 1". Others: no length field. |
| Barcode checkbox | Now visible for ALL products (including Manual D/P and Clips) |
| TAPERED renamed | Checkbox label changed from "TAPERED" to "Big – Small End" |
| Barcode sticker visual | When BARCODE checked, shows "BARCODE / barcode icon / STICKERS" above product image on left panel |
| Thickness display | Shows 2 decimal places (0.60 not 0.6) |
| Finish button | Always shows "Finish" (not "Update" in edit mode) |

### AWF Form Fields Per Type (Updated 25-Feb)

| Field | Standard D/P | Manual D/P | Clips & Pops | Standard Offset | Bends |
|-------|-------------|-----------|--------------|-----------------|-------|
| Material dropdown | ✓ | ✓ | ✓ | ✓ | ✓ |
| Color dropdown | ✓ | ✓ | ✓ | ✓ | ✓ |
| Thickness | 0.45 (fixed) | 0.45 (fixed) | 0.60 (fixed) | 0.45 (fixed) | 0.45 (fixed) |
| Dimensions (A x B) | Custom only | Custom only | — | Custom only | Custom only |
| Dimensions (A) | Custom only | Custom only | — | Custom only | Custom only |
| Number of Pieces | ✓ | ✓ | ✓ | ✓ | ✓ |
| Length | Dropdown (1.800/2.400) | Dropdown (1.800/2.400) | Fixed: 1 | Dropdown (1.800/2.400) | Dropdown (1.800/2.400) |
| Big – Small End | — | ✓ | — | — | — |
| BARCODE | ✓ | ✓ | ✓ | ✓ | ✓ |
| *Note* | ✓ | ✓ | ✓ | ✓ | ✓ |
| Unit Price | ✓ | ✓ | ✓ | ✓ | ✓ |

**Dimension logic:** `showDimensions = productName.includes('---')`. If name also contains "x" → square → 2 boxes (A, B). Otherwise → round → 1 box (A). This applies across all part classes universally.

**Length logic:** `partClass === 'Downpipe' || partClass === 'Offsets'` → dropdown (1.800/2.400). `formType === 'clips'` → fixed "1". All others → no length field.

### AWF Product Library (Database Updates 24-25 Feb)

Manual D/P products expanded to match document:

**Square (name has "x"):** 100X50mm, 100x75mm, 75x50mm, 125x100mm, 150x100mm, --- x --- mm (custom)

**Round (no "x"):** 65mm, 75mm, 90mm, 100mm, 125mm, --- mm (custom)

Offset custom products added:

**Standard Offset:** --- x --- mm Square Offset (custom), --- mm Round Offset (custom)

**Bends (Elbow/Shoes):** --- x --- mm Square Elbow (custom), --- mm Round Elbow (custom)

Total AWF products in `awf_product_libraries`: 28 (14 original + 10 Manual D/P + 4 Offset custom)

### Files Summary (All AWF Changes 24-25 Feb)

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/Pages/Drawings/AWFDetailsTab.js` | CREATED | Card grid + lightbox for AWF entries |
| `frontend/src/Pages/Orders/manageOrderItem.js` | MODIFIED | AWF tab + render AWFDetailsTab |
| `frontend/src/Pages/OrderDesignersManagement/designToolOrders.js` | MODIFIED | Flashing/AWF tabs + AWFDetailsTab |
| `frontend/src/Pages/DrawingComponents/AWFSelectMaterials.js` | MODIFIED | Edit mode, navigation fix, form updates, Length dropdown for Downpipe+Offsets, universal custom dimension logic |
| `frontend/src/styles/AWFSelectMaterials.scss` | MODIFIED | Dimension row spacing, barcode overlay styles |
| `backend/controllers/awfOrderEntryCtrl.js` | MODIFIED | Added updateEntry, hard delete |
| `backend/routes/awfOrderEntryRoutes.js` | MODIFIED | Added PUT route |
| `backend/scripts/addCustomOffsetProducts.js` | CREATED | Seed script for 4 custom Offset products |

### What's Next (TODO — as of 24-Feb)

1. ~~**Custom Offset form**~~ — DONE (25-Feb)
2. **Product images**: Upload actual product images to S3, replace placehold.co URLs
3. **Rollforming**: No spec yet
4. **Quotation flow**: AWF tab for quotes — deferred per user instruction

---

## AWF Module — Work Log (25-26 Feb 2026)

### What Was Built

Major updates to AWFSelectMaterials form: Custom Offset form with measurements sidebar, interactive SVG drawings for Custom Offset and Standard Offset products, Standard D/P length-from-product-name, Manual D/P custom length, tapered small/big end fields, "Use 2.4 Downpipe" checkbox for Offsets, and Federation offset products.

### Custom Offset Form (25-Feb)

Full custom offset form with separate two-column layout:

**Left column (form fields):**
- Material & Color dropdowns (shared API)
- Thickness dropdown (0.45 / 0.60 — unlike other types which have fixed thickness)
- Size (manual text input)
- Number of Pieces
- Note, Unit Price

**Right column (measurements sidebar):**
- Measurements (mm): W, A, B1, B2, C — each with label + input
- Angle Degree: D, E — each with label + input
- Type: Fixed / Adjustable radio buttons (adjustable shows from/to range inputs)
- Seam Side: Top / Left Side / Bottom / Right Side radio buttons

**Interactive SVG drawing (left panel):**
- 3D isometric square offset pipe with labeled dimensions (W, A, B1, B2, C, D, E)
- When a measurement field changes, the corresponding SVG label highlights briefly (yellow background, 1.5s)
- SVG labels show current values (e.g., "W = 150")

### Standard Offset SVG Drawings (26-Feb)

**Square offset SVG** — thick 3D box pipe forming an L-shape:
- Horizontal pipe across the top (front face, top face, right side)
- Vertical pipe going down on the left (front face, right side, bottom face)
- Inner corner step visible where they meet
- Gray shading: lightest #ddd on top, #ccc on front, #aaa on sides, #999 on bottom
- viewBox="0 0 400 440" used consistently across all locations, scaled via width/height
- Dimension labels A (vertical height) and C (horizontal length, updates with "Use 2.4 Downpipe")

**Round offset SVG** — cylindrical Z-shape pipe:
- Top vertical pipe with elliptical cap
- Angled diagonal connector section
- Bottom horizontal pipe with elliptical ends
- Dimension labels: A (450-600mm adjustable), B (120mm), C (880mm/1480mm), D (80°), E (80°)

Both square and round SVGs appear in all 4 locations:
- TemplateLibrary.js card thumbnails (small)
- TemplateLibrary.js preview pane (medium)
- AWFSelectMaterials.js left panel (large, with dimension labels)
- AWFDetailsTab.js card grid + lightbox

### Federation Offset Products (26-Feb)

Standard Offset sub-category now has 8 products (was 2):

| Type | Products |
|------|----------|
| Standard Square | 100x50mm, 100x75mm |
| Standard Round | 75mm, 90mm |
| Federation Square | Federation 100x50mm, Federation 100x75mm |
| Federation Round | Federation 75mm, Federation 90mm |

Federation products show bold italic "FEDERATION" text below the SVG drawing. Detection: `productName.toLowerCase().includes('federation')`.

### Standard D/P Length Changes (25-Feb)

- Replaced 2 generic Standard D/P products with 8 length-specific products:
  - 100x50mm 1.8mtr, 100x50mm 2.4mtr, 100x75mm 1.8mtr, 100x75mm 2.4mtr
  - 75mm 1.8mtr, 75mm 2.4mtr, 90mm 1.8mtr, 90mm 2.4mtr
- Length is readonly (bold display like thickness), extracted from product name
- `standardDPLength` useMemo: checks if productName contains "1.8" or "2.4"

### Manual D/P Custom Length (25-Feb)

- Length dropdown has "Custom" option (only for `formType === 'manual_dp'`)
- When selected: dropdown replaced with text input for custom length value
- When cleared: immediately switches back to dropdown

### Tapered Small End / Big End (25-Feb)

- Checkbox label changed back to "TAPERED"
- When checked: shows two text fields — Small End and Big End
- State: `taperedSmallEnd`, `taperedBigEnd` — saved to backend

### Use 2.4 Downpipe (25-Feb)

- Checkbox appears for `partClass === 'Offsets' && formType !== 'custom_offset'`
- When checked: `length` changes from 1.8 to 2.4, C dimension in SVG updates from 880mm to 1480mm (880 + 600)
- SVG C label turns red when active
- Saved as `use24Downpipe` boolean in backend

### Offsets — No Length Field (25-Feb)

- Offsets auto-set `length = 1.8` on mount (no dropdown shown)
- "Use 2.4 Downpipe" checkbox toggles length between 1.8 and 2.4
- Custom Offset has no length field at all (measurements entered manually)

### UI Tweaks (25-Feb)

- "Clips" title instead of "Clips & Pops" in AWFSelectMaterials
- Length display: "2.4" not "2.400"
- BARCODE checkbox visible for all product types

### Backend Model Updates (25-Feb)

`awfOrderEntryModel.js` — added fields:
- `taperedSmallEnd: Number`, `taperedBigEnd: Number`
- `size: String` (manually entered size for Custom Offset)
- `measurements: { W, A, B1, B2, C }` (mm values)
- `angleDegree: { D, E }` (degree values)
- `offsetType: String` (enum: fixed, adjustable, null)
- `adjustableRange: { from, to }` (only when adjustable)
- `seamSide: String` (enum: top, left, bottom, right, null)
- `use24Downpipe: Boolean`

`awfOrderEntryCtrl.js` — createEntry and updateEntry both destructure and save all new fields.

### Files Modified (25-26 Feb)

| File | Changes |
|------|---------|
| `frontend/src/Pages/DrawingComponents/AWFSelectMaterials.js` | Custom Offset form layout, measurements sidebar, interactive SVG, Standard Offset SVG (square L-shape + round Z-shape), Standard D/P readonly length, Manual D/P custom length, tapered fields, Use 2.4 Downpipe, UI tweaks |
| `frontend/src/Pages/DrawingComponents/TemplateLibrary.js` | SVG drawings for Standard Offset cards (square/round) + preview pane, Federation label, Custom Offset SVG in cards/preview |
| `frontend/src/Pages/Drawings/AWFDetailsTab.js` | SVG drawings for Standard Offset + Custom Offset in card grid + lightbox, edit handler passes all new fields (measurements, angleDegree, offsetType, adjustableRange, seamSide, taperedSmallEnd, taperedBigEnd, use24Downpipe) |
| `frontend/src/styles/AWFSelectMaterials.scss` | Custom offset layout styles (grid, measurements panel, radio options, adjustable range) |
| `backend/models/awfOrderEntryModel.js` | Added fields: taperedSmallEnd, taperedBigEnd, size, measurements, angleDegree, offsetType, adjustableRange, seamSide, use24Downpipe |
| `backend/controllers/awfOrderEntryCtrl.js` | createEntry + updateEntry save all new fields |

### Files Created (26-Feb)

| File | Purpose |
|------|---------|
| `backend/scripts/addFederationOffsets.js` | Seed script: deletes old Standard Offset products, inserts 8 new (4 standard + 4 federation) |

### AWF Product Library Count

Total AWF products in `awf_product_libraries`: ~34
- Downpipe > Standard D/P: 8 (length-specific)
- Downpipe > Manual D/P: 12 (5 square + 5 round + 2 custom)
- Clips & Pops: 2
- Offsets > Standard Offset: 8 (4 standard + 4 federation)
- Offsets > Custom Offset: 4 (2 original + 2 from addCustomOffsetProducts)
- Offsets > Bends: 2 + 2 custom = 4
- Rollforming: 2

### AWF Form Fields Per Type (Updated 26-Feb)

| Field | Standard D/P | Manual D/P | Clips | Std Offset | Bends | Custom Offset |
|-------|-------------|-----------|-------|------------|-------|---------------|
| Material | dropdown | dropdown | dropdown | dropdown | dropdown | dropdown |
| Color | dropdown | dropdown | dropdown | dropdown | dropdown | dropdown |
| Thickness | 0.45 fixed | 0.45 fixed | 0.60 fixed | 0.45 fixed | 0.45 fixed | 0.45/0.60 dropdown |
| Length | readonly from product name | dropdown + Custom option | fixed: 1 | auto 1.8 (no field) | no field | no field |
| Dimensions | custom products only | custom products only | — | custom products only | custom products only | via measurements sidebar |
| Number of Pieces | yes | yes (side by side with length) | yes | yes | yes | yes |
| TAPERED | — | checkbox + Small/Big End | — | — | — | — |
| BARCODE | yes | yes | yes | yes | yes | — |
| Use 2.4 Downpipe | — | — | — | checkbox (C += 600) | checkbox (C += 600) | — |
| Measurements (W,A,B1,B2,C) | — | — | — | — | — | sidebar inputs |
| Angle Degree (D,E) | — | — | — | — | — | sidebar inputs |
| Type (Fixed/Adjustable) | — | — | — | — | — | radio buttons |
| Seam Side | — | — | — | — | — | radio buttons |
| Size | — | — | — | — | — | text input |
| Note | yes | yes | yes | yes | yes | yes |
| Unit Price | yes | yes | yes | yes | yes | yes |

### Bends Uses Same SVG as Standard Offset (26-Feb)

Bends (Elbow/Shoes) is part of the Offsets part class, so it now shares the same rendering as Standard Offset everywhere:

- **TemplateLibrary.js**: Card thumbnails and preview pane conditions changed from `sub_category === 'Standard Offset'` to `(sub_category === 'Standard Offset' || sub_category === 'Bends (Elbow/Shoes)')` — same square L-shape / round Z-shape SVGs
- **AWFDetailsTab.js**: Card grid and lightbox conditions changed from `subCategory === 'Standard Offset'` to `(subCategory === 'Standard Offset' || subCategory === 'Bends (Elbow/Shoes)')` — same SVGs
- **AWFSelectMaterials.js**: Already correct — condition `partClass === 'Offsets' && formType !== 'custom_offset'` covers both Standard Offset and Bends. Same SVG, same length auto-set to 1.8, same "Use 2.4 Downpipe" checkbox (toggles length 1.8↔2.4, updates C value 880mm↔1480mm in SVG)

### SVG Proportion Updates (26-Feb)

**Standard Offset square SVG** — proportions updated for thicker pipe walls:
- Old viewBox `0 0 400 440`: pipe walls 55px thick, horizontal 300px wide (ratio 5.5:1 — too thin)
- New viewBox `0 0 300 400`: pipe walls 65px thick, horizontal 175px wide (ratio 2.7:1 — chunkier)
- AWFSelectMaterials.js uses expanded viewBox `"-80 0 380 400"` to accommodate horizontal A label on left
- A dimension label changed from rotated vertical text to **horizontal** text: "450-600mm" / "Adjustable" / "A" — three lines, readable left-to-right
- Updated in all 5 locations: TemplateLibrary card/preview, AWFDetailsTab card/lightbox, AWFSelectMaterials

**Custom Offset SVG** — completely redesigned as thick 3D Z-shape box pipe:
- Old: thin-walled Z-shape with inconsistent pipe thickness and old-style 3D (different colors #e8e8e8/#d0d0d0/#b8b8b8)
- New: thick box pipe Z-shape matching Standard Offset style — 3 sections (top bar, connector, bottom bar), all 55px thick, consistent 3D depth dx=22 dy=-18
- Pipe coordinates: top bar (110,70)→(290,125), connector (110,125)→(165,285), bottom bar (110,285)→(290,340)
- Two inner corner steps visible at both junctions (#bbb)
- Colors: #ddd top, #ccc front, #bbb inner step, #aaa sides, #999 bottom (matching Standard Offset)
- A label: horizontal text (not rotated). When Adjustable with from/to values: shows "{from}-{to}mm" + "Adjustable" on two lines. When Fixed: shows "A = {value}"
- Seam Side indicator: colored dashed lines appear on pipe faces when seam side radio selected (Top=#d32f2f red, Left=#f57c00 orange, Bottom=#388e3c green, Right=#1976d2 blue)
- viewBox="0 0 420 460" for labeled version, "85 35 250 325" for card thumbnails
- Updated in all 5 locations: AWFSelectMaterials, TemplateLibrary card/preview, AWFDetailsTab card/lightbox
- **NOTE**: SVG still needs refinement to exactly match the reference image — deferred

---

## AWF Module — Work Log (26-Feb-2026)

### What Was Built

Restructured AWFDetailsTab card layout and lightbox to match new design. Added Note display, barcode sticker SVG, and various UI refinements across AWFSelectMaterials and AWFDetailsTab.

### Card Layout (AWFDetailsTab) — New Structure

```
┌──────────────────────────────────────────────┐
│  0.45          ASHWOOD           │ Qty/Len  │
│  (thickness)   (color)          │ 4 x 1.800│
│─────────────────────────────────────────────│
│                                              │
│              BARCODE                         │
│           ||||||||||||||||                    │
│              STICKERS                        │
│           [Drawing / SVG / Image]            │
│                                              │
│              100x50mm 1.8mtr                 │
│                          Note: Test          │
│─────────────────────────────────────────────│
│                         Edit  │  Delete      │
└──────────────────────────────────────────────┘
```

- **Top row**: Thickness (left) | Color name bold center | Qty/Len table (right)
- **Barcode + Drawing + Product Name + Note**: All grouped in one centered column wrapper. Barcode sits directly above drawing (no gap). Note right-aligned to drawing width.
- **Barcode**: SVG barcode lines (not icon) — BARCODE text, vertical bars, STICKERS text, all same width. Centered within the group.
- **Drawing**: Centered (SVG for offsets, product image for others, Package icon fallback)
- **Below drawing**: Product name only (centered, no sub-category)
- **Below product name**: Note (right-aligned to drawing width via `alignSelf: flex-end`, not full card width)
- Card grid: 3 per row (`Col md={4}`), `minHeight: 550px`

### Lightbox — Updated to Match Cards

- **Header**: Thickness (left) | Color (center) | Qty/Len table (top-right, floating)
- **Barcode**: Same SVG barcode pattern (180px wide, 80px tall)
- **Drawing**: Centered
- **Below drawing**: Product name (centered)
- **Below product name**: Note (right-aligned to drawing width)

### Note Display

- **AWFSelectMaterials**: Below the drawing, right-aligned within drawing width (280px for other types, full width of `awf-offset-drawing` for offsets). Bold, 18px.
- **AWFDetailsTab cards**: Inside a column wrapper that auto-sizes to drawing. Uses `alignSelf: 'flex-end'` to align with drawing's right edge.
- **AWFDetailsTab lightbox**: Same approach — wrapped with drawing in column flex, `alignSelf: 'flex-end'`.

### Barcode Sticker — SVG Redesign

Replaced `FaBarcode` icon with proper SVG barcode in all locations:
- **Pattern**: Varying thick/thin vertical bars with white space (like a real barcode)
- **Layout**: BARCODE text → SVG bars → STICKERS text, all same width
- **Sizes**: Cards 110px wide × 50px tall, Lightbox 180px wide × 80px tall, Materials page 140px wide × 50px tall
- **Applied to all product types**: Standard offset, custom offset, and other types in AWFSelectMaterials; cards and lightbox in AWFDetailsTab

### Custom Offset — BARCODE Checkbox Added

Added BARCODE checkbox to the custom offset form in AWFSelectMaterials (below Number of Pieces field). Previously missing — only existed in the standard form. Barcode sticker display also added to both offset SVG sections (standard and custom) on the left panel.

### Custom Offset SVG — ViewBox Expanded

Card viewBox expanded from `"85 35 250 325"` to `"20 10 380 420"` (card: 250×280, lightbox: 380×420) to prevent label cutoff on A, E, C, B1 dimension labels.

### Offset SVG Cleanup (26-Feb, later)

Removed extra decorative elements from offset SVGs in AWFSelectMaterials — keeping only the pipe drawing and essential dimension labels.

**Custom Offset SVG:**
- Removed "* Standard angle of a downpipe offset is 80°" italic note text (was at bottom of SVG)

**Round Offset SVG (Standard Offset):**
- Removed 80° ANGLE indicator box (top-left corner)
- Removed D = 80° angle arc and label
- Removed E = 80° angle arc and label
- Removed fixed specs legend at bottom-left (A=450-600mm, B=120mm, C=880mm, D=80°, E=80°)
- Kept: pipe drawing, B=120mm label, C=880mm/1480mm label, Federation label

**Both Square and Round Offset SVGs (Standard Offset):**
- Removed "450-600mm Adjustable A" dimension lines and labels (vertical height indicator)
- Square offset now shows: pipe drawing + C dimension only
- Round offset now shows: pipe drawing + B dimension + C dimension only

**Lightbox (AWFDetailsTab):**
- Removed "* Standard angle of a downpipe offset is 80°" from Custom Offset SVG (done earlier)
- Increased drawing sizes: Custom Offset 480×520, Square Offset 480×520, Round Offset 440×470, product image maxHeight 500px, Package icon 180
- Added 40px top padding for better spacing
- Product name `marginTop: 10px` for spacing below drawing

### Files Modified (26-Feb)

| File | Changes |
|------|---------|
| `frontend/src/Pages/Drawings/AWFDetailsTab.js` | Card layout restructured (thickness/color/qty header, drawing centered, product name below, note right-aligned to drawing). Barcode SVG pattern. Lightbox updated to match. Custom Offset viewBox expanded. 3 cards per row. 550px min height. Lightbox drawing sizes increased. Removed 80° note from lightbox Custom Offset. Product name margin added. |
| `frontend/src/Pages/DrawingComponents/AWFSelectMaterials.js` | Note positioned right-aligned within drawing sections. Barcode SVG pattern in all 3 drawing sections (standard offset, custom offset, other types). BARCODE checkbox added to custom offset form. Removed 80° note from Custom Offset SVG. Removed angle box, D/E angles, specs legend from Round Offset SVG. Removed 450-600mm Adjustable A dimension from both Square and Round Offset SVGs. |
| `frontend/src/styles/AWFSelectMaterials.scss` | `awf-canvas-container` gap set to 0 |

### What's Next (TODO)

1. **Custom Offset SVG refinement**: Current thick box Z-shape needs adjustment to exactly match reference image proportions/perspective
2. **Product images**: Upload actual product images to S3, replace placehold.co URLs
3. **Rollforming**: No spec yet
4. **Quotation flow**: AWF tab for quotes — deferred per user instruction
