/**
 * ════════════════════════════════════════════════════════════════════════════════
 * DRAWING DETAILS TAB COMPONENT
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Displays and manages drawing templates for an order.
 * Shows grid of templates with preview images, quantity, pricing, and actions.
 *
 * KEY FEATURES:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. TEMPLATE DISPLAY:
 *    - Grid view with preview images (supports taper split view)
 *    - Shows girth, bends, quantity, and pricing for each template
 *    - Live status indicators (in production, fulfilled, etc.)
 *
 * 2. TEMPLATE ACTIONS:
 *    - Edit Drawing: Navigate to DrawingCanvas for modifications
 *    - Delete Drawing: Remove template from order
 *    - Copy: Duplicate template for modifications
 *    - Add to Production: Mark template ready for manufacturing
 *
 * 3. PRICING MANAGEMENT:
 *    - Automatic girth-based pricing calculation
 *    - Supports tier-based pricing by girth ranges
 *    - Real-time price updates when quantities change
 *
 * 4. BULK OPERATIONS:
 *    - Select multiple templates for bulk actions
 *    - Bulk add to production
 *    - Mass delete capabilities
 *
 * 5. TAPER MODE SUPPORT:
 *    - Split preview showing Far and Near profiles
 *    - Handles taper-specific data (farLengths, nearLengths, etc.)
 *
 * DATA FLOW:
 * ─────────────────────────────────────────────────────────────────────────────
 * Order → Fetch Templates → Display Grid → Edit/Delete Actions → Update Order
 *
 * ════════════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Row, Col, Card, Button, Table } from 'react-bootstrap';
import { MyDiv } from '../Common/Components';
import axios from 'axios';
import swal from 'sweetalert2';
import { FaPencilAlt, FaTrash, FaCheckCircle, FaTimesCircle, FaExclamationTriangle } from 'react-icons/fa';
import SplitPreviewGrid from '../Drawings/SplitPreviewGrid';
import { logger } from '../../utils/logger';
import { API_BASE_URL, tokenManager } from '../../config/api.config';
import { confirmActionAsync } from '../../utils/confirmDialog';
import { getGirth } from '../DrawingHelpers/DrawingHelpers';
import { calculatePoints } from '../DrawingHelpers/DrawingCalculations';
import { generateSplitPreview as generateSplitPreviewFrontend } from '../../utils/splitPreviewGenerator';
import DrawingPreview from '../../components/DrawingPreview';
import { FiLoader } from 'react-icons/fi';


// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Module-level utilities)
// ═══════════════════════════════════════════════════════════════

/**
 * Construct proper image URLs for preview images
 * Handles base64, full URLs, and relative paths
 * @param {String} imagePath - Image path from database
 * @returns {String} - Full image URL
 */
const getImageUrl = (imagePath) => {
  if (!imagePath) return '';

  // If it's a base64 image, return it directly
  if (imagePath.startsWith('data:image')) {
    return imagePath;
  }

  // If it's already a full URL, return it
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  // Otherwise, construct the URL to the backend uploads
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  // Constructing image URL from path
  return `${API_BASE_URL}${cleanPath}`;
};

/**
 * Debounce function to prevent rapid repeated function calls
 * Used for production safety to avoid duplicate API requests
 * @param {Function} func - Function to debounce
 * @param {Number} wait - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Calculate total girth including fold lengths
 * Handles both SWI format (startFoldType) and girth calc format (girthStartFoldType)
 * @param {Object} drawingObj - Drawing template object with fold data
 * @param {Array} lengths - Segment lengths array
 * @returns {Number} - Total girth in mm including folds
 */
const calculateDrawingGirth = (drawingObj, lengths) => {
  if (!Array.isArray(lengths)) return drawingObj?.girth || 0;

  // Try both fold type fields: startFoldType (SWI format) or girthStartFoldType (girth calc format)
  const startFoldType = drawingObj?.startFoldType || drawingObj?.girthStartFoldType;
  const endFoldType = drawingObj?.endFoldType || drawingObj?.girthEndFoldType;


  return getGirth(
    lengths,
    startFoldType,
    drawingObj?.startFoldLength || 0,
    endFoldType,
    drawingObj?.endFoldLength || 0
  );
};

// Helper function to get bends from saved template (use saved value, fallback for old drawings)
const getBendsFromTemplate = (drawingObj) => {
  // If bends is already saved, use it (for new drawings saved from DrawingCanvas)
  if (drawingObj?.bends !== undefined && drawingObj?.bends !== null) {
    return drawingObj.bends;
  }

  // Fallback: calculate for old drawings that don't have bends saved yet
  const angles = drawingObj?.angles || drawingObj?.nearAngles || drawingObj?.farAngles || [];

  // Count base bends - angles in 170-180 range count as 2 bends (same as DrawingCanvas)
  let baseBends = 0;
  if (angles.length > 0) {
    for (let i = 0; i < angles.length; i++) {
      const absAngle = Math.abs(angles[i]);
      // Angles between 170-180 degrees are fold-backs, count as 2 bends
      if (absAngle >= 170 && absAngle <= 180) {
        baseBends += 2;
      } else {
        baseBends += 1;
      }
    }
  }

  const hasFolds = drawingObj?.startFoldType || drawingObj?.endFoldType;
  let bends = baseBends;

  if (hasFolds) {
    // When there are folds, only add base bends if baseBends > 0
    // If baseBends = 0 (straight line), don't add the "1" - just count fold bends
    if (drawingObj?.startFoldType === 'SF' || drawingObj?.startFoldType === 'SSF') {
      bends += 2;
    }
    if (drawingObj?.endFoldType === 'SF' || drawingObj?.endFoldType === 'SSF') {
      bends += 2;
    }
  } else {
    // No folds: count base geometry bends, minimum 1 for straight line
    bends = Math.max(1, baseBends);
  }

  return bends;
};

export default function DrawingDetailsTab(props) {
  // ═══════════════════════════════════════════════════════════════
  // ROUTING & PARAMS
  // ═══════════════════════════════════════════════════════════════
  const routeParams = useParams();
  const orderId = props.orderId || routeParams.orderId; // order_unique_id (can be MongoDB ID or custom order number)
  const mongoIdFromProps = props.mongoId; // MongoDB _id if passed as prop from parent
  const RolePermission = JSON.parse(localStorage.getItem("role"));  
  
  {/* Quotation check handled */}
  const type = props.type
  const showEditDelete = props?.showEditDelete
  const location = useLocation();
  const navigate = useNavigate();
  const navTemplate = location.state?.template || null; // Template from navigation state

  // ═══════════════════════════════════════════════════════════════
  // ORDER DATA STATE
  // ═══════════════════════════════════════════════════════════════
  const [orderData, setOrderData] = useState(null); // Full order object with customer info
  const [orderLoading, setOrderLoading] = useState(false); // Loading indicator for order fetch
  const [mongoOrderId, setMongoOrderId] = useState(mongoIdFromProps || null); // MongoDB _id for order

  // If we have a navTemplate from navigation, trigger refresh immediately
  useEffect(() => {
    if (navTemplate && navTemplate._id) {
      logger.debug('New template from navigation, triggering refresh');
      setRefreshTrigger(prev => prev + 1);
    }
  }, [navTemplate?._id]);



  // Fetch order data to get orderNumber and customer info
  useEffect(() => {
    // If we already have mongoId from props, we might not need to fetch order data
    if (mongoIdFromProps) {

      setMongoOrderId(mongoIdFromProps);
      // Trigger initial template fetch when mongoId is set from props
      setRefreshTrigger(prev => prev + 1);
      return; // Skip fetching order data if we already have what we need
    }

    if (!orderId) {

      return;
    }

    setOrderLoading(true);


    // First, check if orderId is a MongoDB ID (24 hex chars) or order_unique_id
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(orderId);
    {/* Quotation check handled */}
    const endpoint = isMongoId
      ? `${API_BASE_URL}/api/orders/id/${type}/${orderId}`
      : `${API_BASE_URL}/api/orders/by-order-number/${type}/${orderId}`;

          // Removed: // logger.debug('📡 Using endpoint:', endpoint);
    axios.get(endpoint)
      .then(res => {

        setOrderData(res.data);
        // If orderId was already a MongoDB ID, use it directly
        setMongoOrderId(isMongoId ? orderId : res.data._id);
        setOrderLoading(false);

        // Trigger initial template fetch when mongoOrderId is set
        setRefreshTrigger(prev => prev + 1);

        // Save order data to localStorage for later use
        if (res.data?.order_unique_id) {
          localStorage.setItem('orderNumber', res.data.order_unique_id);
        }
        if (res.data?.order_customer_id) {
          localStorage.setItem('customerId', res.data.order_customer_id);
        }
        if (res.data?.order_customer_name) {
          localStorage.setItem('customerName', res.data.order_customer_name);
        }
      })
      .catch(err => {
       
        setOrderLoading(false);
      });
  }, []);

  // Initialize with navTemplate if available, but ensure it's in array format
  // If navTemplate has materialRows, create a drawing object for each row
  const initialDrawing = (() => {
    // Always return null if we have orderId - we'll fetch from API
    if (orderId) return null;
    if (!navTemplate) return null;

    // If we have material rows, create one drawing per row
    if (Array.isArray(navTemplate.materialRows) && navTemplate.materialRows.length > 0) {
      // Creating drawings from material rows
      // Full materialRows data logged for debugging

      return navTemplate.materialRows.map((row, index) => ({
        ...navTemplate,
        id: row._id || `temp_${index}`,
        // IMPORTANT: Use row data, NOT template data (template data has been overwritten with last row)
        material: row.material,
        color: row.color,
        qty: row.quantity,
        length: row.length,
        tag: row.tag,
        unitPrice: row.unitPrice,
        splitInto: row.splitInto,
        extPrice: row.extPrice,
        materialRows: [row], // Each drawing shows its own material row
        // Add URL versions of preview fields for display (use previewUrl if available, fallback to preview)
        previewUrl: navTemplate.previewUrl || navTemplate.preview,
        previewFarUrl: navTemplate.previewFarUrl || navTemplate.previewFar,
        previewNearUrl: navTemplate.previewNearUrl || navTemplate.previewNear
      }));
    }

    // Otherwise, single drawing
    return [{
      ...navTemplate,
      // Add URL versions of preview fields for display (use previewUrl if available, fallback to preview)
      previewUrl: navTemplate.previewUrl || navTemplate.preview,
      previewFarUrl: navTemplate.previewFarUrl || navTemplate.previewFar,
      previewNearUrl: navTemplate.previewNearUrl || navTemplate.previewNear
    }];
  })();

  // ═══════════════════════════════════════════════════════════════
  // DRAWING & TEMPLATE STATE
  // ═══════════════════════════════════════════════════════════════
  const [drawing, setDrawing] = useState(initialDrawing); // Array of drawing templates for this order
  const [materialRows, setMaterialRows] = useState(Array.isArray(navTemplate?.materialRows) ? navTemplate.materialRows : []); // Material selections per template
  const [loading, setLoading] = useState(false); // Loading indicator for template fetch
  const [error, setError] = useState(null); // Error message if fetch fails
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Counter to trigger template refetch

  // ═══════════════════════════════════════════════════════════════
  // PREVIEW & DISPLAY STATE
  // ═══════════════════════════════════════════════════════════════
  const [showOriginalDrawing, setShowOriginalDrawing] = useState({}); // Map of template IDs to show/hide original drawing
  const [splitPreviews, setSplitPreviews] = useState({}); // Cache of split preview renders for taper mode

  // ═══════════════════════════════════════════════════════════════
  // LIGHTBOX STATE
  // ═══════════════════════════════════════════════════════════════
  const [lightboxOpen, setLightboxOpen] = useState(false); // Whether lightbox is open
  const [lightboxIndex, setLightboxIndex] = useState(0); // Current drawing index in lightbox

  // ═══════════════════════════════════════════════════════════════
  // SWI PRODUCTION SYNC STATE
  // ═══════════════════════════════════════════════════════════════
  const [swiStatusMap, setSwiStatusMap] = useState({}); // Map of template IDs to SWI status (syncing, success, error)
  const [swiShapeIdMap, setSwiShapeIdMap] = useState({}); // Map of template IDs to SWI shape IDs
  const [isSyncing, setIsSyncing] = useState(false); // Global syncing indicator
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false); // Track if delete confirmation popup is open
  const [syncRequestId, setSyncRequestId] = useState(null); // Current sync request ID
  const syncAbortController = useRef(null); // AbortController for canceling sync requests
  const mountedRef = useRef(true); // Track if component is mounted to prevent state updates after unmount
  const retryTimeoutRef = useRef(null); // Timeout ID for sync retry logic
  const lastSyncTimeRef = useRef(0); // Timestamp of last sync to prevent duplicate syncs
  
  // Debug effect to log state changes
  useEffect(() => {
    // SWI Status Map updated
          logger.debug('Keys in map:', Object.keys(swiStatusMap).length);
  }, [swiStatusMap]);

  // Check for drawing refresh signal from localStorage
  useEffect(() => {
    const checkForRefresh = () => {
      // Check with both mongoOrderId and orderId for compatibility
      const mongoSignal = mongoOrderId && localStorage.getItem(`refreshDrawings_${mongoOrderId}`);
      const orderSignal = orderId && localStorage.getItem(`refreshDrawings_${orderId}`);

      if (mongoSignal || orderSignal) {
        logger.debug('Refresh signal detected, refreshing drawings...');
        if (mongoSignal) localStorage.removeItem(`refreshDrawings_${mongoOrderId}`);
        if (orderSignal) localStorage.removeItem(`refreshDrawings_${orderId}`);
        // Clear split preview cache to force regeneration with updated label offsets
        setSplitPreviews({});
        setRefreshTrigger(prev => prev + 1);
      }
    };

    // Check immediately
    checkForRefresh();

    // Set up interval to check periodically (every 2 seconds)
    const interval = setInterval(checkForRefresh, 2000);

    return () => clearInterval(interval);
  }, [mongoOrderId, orderId]);

  // Scroll to the edited drawing after returning from Select Materials
  useEffect(() => {
    if (!drawing || !Array.isArray(drawing) || drawing.length === 0) return;
    const storageKey = `scrollToDrawing_${mongoOrderId || orderId}`;
    const editedTemplateId = localStorage.getItem(storageKey);
    if (!editedTemplateId) return;
    localStorage.removeItem(storageKey);

    // Find the drawingIndex that matches the edited templateId
    const idx = drawing.findIndex(d => (d.templateId || d._id) === editedTemplateId);
    if (idx < 0) return;

    // Wait for React to commit cards to the DOM, then jump instantly
    let retries = 0;
    const scrollToCard = () => {
      const col = document.querySelector(`[data-drawing-index="${idx}"]`);
      if (col) {
        col.scrollIntoView({ behavior: 'instant', block: 'center' });
        const card = col.querySelector('.card') || col;
        card.style.transition = 'box-shadow 0.3s';
        card.style.boxShadow = '0 0 10px 3px rgba(0, 123, 255, 0.5)';
        setTimeout(() => { card.style.boxShadow = ''; }, 1500);
      } else if (retries < 20) {
        // Card not in DOM yet, retry (max ~2 seconds)
        retries++;
        setTimeout(scrollToCard, 100);
      }
    };
    setTimeout(scrollToCard, 200);
  }, [drawing, mongoOrderId, orderId]);

  // ═══════════════════════════════════════════════════════════════
  // LIGHTBOX KEYBOARD NAVIGATION - Will be initialized after lightboxDrawings
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // LIGHTBOX HANDLERS
  // ═══════════════════════════════════════════════════════════════
  const lightboxScrollRef = useRef(null);
  const lightboxContentRef = useRef(null);
  const lightboxIndexRef = useRef(0);
  const lightboxToDrawingMapRef = useRef([]);

  const openLightbox = (drawingIndex, splitPieceIndex = 0) => {
    // Map from original drawing index to expanded lightbox index
    let lightboxIdx = 0;
    for (let i = 0; i < drawingIndex && i < drawing.length; i++) {
      const drw = drawing[i];
      const splitFromRows = drw?.materialRows?.[0]?.splitInto;
      const splitInto = Number(splitFromRows || drw?.splitInto || 1);
      const isTaper = drw.isTaper === true;
      const isSplitDrawing = splitInto > 1 && isTaper;

      if (isSplitDrawing) {
        lightboxIdx += splitInto; // Split drawing contributes multiple entries
      } else {
        lightboxIdx += 1; // Non-split drawing contributes one entry
      }
    }

    // Add the split piece offset for the target drawing
    lightboxIdx += splitPieceIndex;

    setLightboxIndex(lightboxIdx);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    // Use the pre-built map to find the original drawing index
    const currentIdx = lightboxIndexRef.current;
    const map = lightboxToDrawingMapRef.current;
    const drawingIdx = map[currentIdx] != null ? map[currentIdx] : 0;

    setLightboxOpen(false);

    // Scroll to the drawing card after lightbox closes
    requestAnimationFrame(() => {
      const col = document.querySelector(`[data-drawing-index="${drawingIdx}"]`);
      if (col) {
        col.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Apply highlight to the Card element inside the Col
        const card = col.querySelector('.card') || col;
        card.style.transition = 'box-shadow 0.3s';
        card.style.boxShadow = '0 0 10px 3px rgba(0, 123, 255, 0.5)';
        setTimeout(() => { card.style.boxShadow = ''; }, 1500);
      }
    });
  };

  // Expand drawings array for lightbox - split drawings become multiple entries
  // Also build a reverse map: lightboxIndex → original drawingIndex
  const { lightboxDrawings, lightboxToDrawingMap } = useMemo(() => {
    if (!drawing || !Array.isArray(drawing)) return { lightboxDrawings: [], lightboxToDrawingMap: [] };

    const expanded = [];
    const indexMap = [];
    drawing.forEach((drw, drawingIndex) => {
      const splitFromRows = drw?.materialRows?.[0]?.splitInto;
      const splitInto = Number(splitFromRows || drw?.splitInto || 1);
      const isTaper = drw.isTaper === true;
      const isSplitDrawing = splitInto > 1 && isTaper;

      if (!isSplitDrawing) {
        // Non-split drawing: add as-is
        expanded.push(drw);
        indexMap.push(drawingIndex);
      } else {
        // Split drawing: create separate entries for each piece
        const farLengths = drw.farLengths || drw.lengths || [];
        const nearLengths = drw.nearLengths || drw.lengths || [];
        // Use getGirth to include fold lengths
        const farGirth = getGirth(
          farLengths,
          drw.startFoldType,
          drw.startFoldLength || 0,
          drw.endFoldType,
          drw.endFoldLength || 0
        );
        const nearGirth = getGirth(
          nearLengths,
          drw.startFoldType,
          drw.startFoldLength || 0,
          drw.endFoldType,
          drw.endFoldLength || 0
        );
        const taperDiff = farGirth - nearGirth;
        const step = taperDiff / splitInto;

        // Get cached split previews
        const actualTemplateId = drw?.templateId || drw?._id;
        const previewKey = `${actualTemplateId}_${splitInto}`;
        const currentSplitPreviews = splitPreviews[previewKey];

        // Create entries from FAR to NEAR (piece 1 = far end, last piece = near end)
        for (let i = 0; i < splitInto; i++) {
          const reverseIndex = splitInto - 1 - i;
          const segmentBottom = nearGirth + (reverseIndex * step);
          const segmentTop = nearGirth + ((reverseIndex + 1) * step);

          // Get preview images for this specific split piece
          const splitPreview = currentSplitPreviews?.[i];
          const splitPreviewFar = splitPreview?.farImage;
          const splitPreviewNear = splitPreview?.nearImage;

          expanded.push({
            ...drw,
            splitPiece: i + 1,
            splitTotal: splitInto,
            splitFar: segmentTop,
            splitNear: segmentBottom,
            splitPreviewFar: splitPreviewFar,
            splitPreviewNear: splitPreviewNear
          });
          indexMap.push(drawingIndex);
        }
      }
    });

    return { lightboxDrawings: expanded, lightboxToDrawingMap: indexMap };
  }, [drawing, splitPreviews]);

  // Generate split previews when lightbox opens on a split drawing
  useEffect(() => {
    if (!lightboxOpen || !drawing || !Array.isArray(drawing)) return;

    // Check if any drawings are split tapers that need preview generation
    drawing.forEach(drw => {
      const splitFromRows = drw?.materialRows?.[0]?.splitInto;
      const splitInto = Number(splitFromRows || drw?.splitInto || 1);
      const isTaper = drw.isTaper === true;
      const isSplitDrawing = splitInto > 1 && isTaper;

      if (isSplitDrawing) {
        const actualTemplateId = drw?.templateId || drw?._id;
        const previewKey = `${actualTemplateId}_${splitInto}`;

        // If previews not already cached or loading, generate them
        if (actualTemplateId && !splitPreviews[previewKey] && !splitPreviews[`${previewKey}_loading`]) {
          setSplitPreviews(prev => ({
            ...prev,
            [`${previewKey}_loading`]: true
          }));

          generateSplitPreviews(actualTemplateId, splitInto).then(previews => {
            if (previews) {
              setSplitPreviews(prev => ({
                ...prev,
                [previewKey]: previews,
                [`${previewKey}_loading`]: false
              }));
            }
          });
        }
      }
    });
  }, [lightboxOpen, drawing, splitPreviews]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLightboxIndex((prev) => {
          const newIndex = prev - 1;
          return newIndex < 0 ? 0 : newIndex; // Stop at first drawing
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLightboxIndex((prev) => {
          const newIndex = prev + 1;
          const maxIndex = (lightboxDrawings?.length || 1) - 1;
          return newIndex > maxIndex ? maxIndex : newIndex; // Stop at last drawing
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxDrawings]);

  // Scroll to top when lightbox opens or index changes
  useEffect(() => {
    if (lightboxOpen && lightboxScrollRef.current) {
      const scrollToTop = () => {
        const scrollContainer = lightboxScrollRef.current;
        if (scrollContainer) {
          scrollContainer.scrollTop = 0;
        }
      };

      // Try immediately and after render
      requestAnimationFrame(() => {
        scrollToTop();
        setTimeout(scrollToTop, 50);
        setTimeout(scrollToTop, 200);
      });
    }
  }, [lightboxOpen, lightboxIndex]);

  // Keep refs in sync so closeLightbox always reads the latest values
  useEffect(() => {
    lightboxIndexRef.current = lightboxIndex;
  }, [lightboxIndex]);

  useEffect(() => {
    lightboxToDrawingMapRef.current = lightboxToDrawingMap;
  }, [lightboxToDrawingMap]);

  const currentDrawingObj = useMemo(() => {
    const obj = (Array.isArray(drawing) ? drawing[0] : drawing) || null;
    // Recalculate girth with folds for existing drawings
    if (obj && Array.isArray(obj.lengths)) {
      const recalculatedGirth = calculateDrawingGirth(obj, obj.lengths);
      obj.girth = recalculatedGirth;
    }
    return obj;
  }, [drawing]);
  const templateId = currentDrawingObj?.templateId || navTemplate?._id || navTemplate?.templateId || null;

  // Function to generate split preview images
  const generateSplitPreviews = async (templateId, splitInto) => {
    try {
      // Fetch template data for frontend generation
      const API_TOKEN = tokenManager.getToken();
      const templateResponse = await axios.get(
        `${API_BASE_URL}/api/templates/${templateId}`,
        { headers: { 'Authorization': `Bearer ${API_TOKEN}` } }
      );

      const template = templateResponse.data.data || templateResponse.data;

      // Try frontend generation first (better label positioning)
      try {
        const farLengths = template.farLengths || template.lengths || [];
        const nearLengths = template.nearLengths || template.lengths || [];
        const angles = template.farAngles || template.angles || [];
        const direction = template.direction || 'Right';
        const firstSegmentAngle = template.firstSegmentAngle || null;
        const reverseColor = template.reverseColor || false;

        const farGirth = farLengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0);
        const nearGirth = nearLengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0);
        const taperDiff = farGirth - nearGirth;
        const step = taperDiff / splitInto;

        // OPTIMIZED: Prepare all split piece data first, then generate in parallel
        const splitPieceConfigs = [];

        // Step 1: Prepare configuration for each split piece
        for (let i = 0; i < splitInto; i++) {
          const splitFarLengths = [];
          const splitNearLengths = [];

          // Calculate interpolated dimensions for ALL segments (matching backend logic)
          for (let j = 0; j < farLengths.length; j++) {
            const farLen = parseFloat(farLengths[j]) || 0;
            const nearLen = parseFloat(nearLengths[j]) || 0;
            const diff = nearLen - farLen;
            const segmentStep = diff / splitInto;

            // Progressive dimensions for this split piece
            const pieceFarLen = farLen + (segmentStep * i);
            const pieceNearLen = farLen + (segmentStep * (i + 1));

            splitFarLengths.push(Math.round(pieceFarLen));
            splitNearLengths.push(Math.round(pieceNearLen));
          }

          // Get split-specific label offsets (indexed by split piece number)
          const splitKey = i + 1;
          const rawSplitOffsets = template.splitLabelOffsets?.[splitKey] || {};

          const splitPieceLabelOffsets = {
            segmentLabels: {},
            angleLabels: {},
            foldLabels: {}
          };

          // Convert from 'len-X'/'ang-X'/'fold-X' format to segmentLabels/angleLabels/foldLabels format
          Object.entries(rawSplitOffsets).forEach(([key, value]) => {
            if (key.startsWith('len-')) {
              const idx = parseInt(key.replace('len-', ''), 10);
              splitPieceLabelOffsets.segmentLabels[idx] = {
                x: value.x || 0,
                y: value.y || 0
              };
            } else if (key.startsWith('ang-')) {
              const idx = parseInt(key.replace('ang-', ''), 10);
              splitPieceLabelOffsets.angleLabels[idx] = {
                x: value.x || 0,
                y: value.y || 0
              };
            } else if (key.startsWith('fold-')) {
              const foldKey = key.replace('fold-', '');
              splitPieceLabelOffsets.foldLabels[foldKey] = {
                x: value.x || 0,
                y: value.y || 0
              };
            }
          });

          splitPieceConfigs.push({
            index: i,
            splitFarLengths,
            splitNearLengths,
            labelOffsets: splitPieceLabelOffsets
          });
        }

        // Step 2: Generate all split pieces in PARALLEL for faster loading
        const generationPromises = splitPieceConfigs.map(config =>
          generateSplitPreviewFrontend({
            farLengths: config.splitFarLengths,
            nearLengths: config.splitNearLengths,
            angles,
            direction,
            firstSegmentAngle,
            reverseColor,
            flipH: template.flipH || false,
            flipV: template.flipV || false,
            splitIndex: config.index + 1,
            splitTotal: splitInto,
            labelOffsets: config.labelOffsets,
            startFoldType: template.startFoldType,
            startFoldLength: template.startFoldLength || 0,
            startFoldDirection: template.startFoldDirection,
            endFoldType: template.endFoldType,
            endFoldLength: template.endFoldLength || 0,
            endFoldDirection: template.endFoldDirection,
            startFoldGap: template.startFoldGap || 0,
            endFoldGap: template.endFoldGap || 0,
            // Pass original FAR/NEAR lengths for consistent scale across all split pieces
            originalFarLengths: farLengths,
            originalNearLengths: nearLengths
          }).then(result => ({
            ...config,
            result
          }))
        );

        const generatedResults = await Promise.all(generationPromises);

        // Step 3: Collect results maintaining correct order
        const splitPreviews = generatedResults
          .filter(item => item.result)
          .map(item => ({
            splitIndex: item.index + 1,
            farLengths: item.splitFarLengths,
            nearLengths: item.splitNearLengths,
            farImage: item.result.farImage,
            nearImage: item.result.nearImage
          }))
          .sort((a, b) => a.splitIndex - b.splitIndex);

        if (splitPreviews.length === splitInto) {
          logger.debug('✅ Frontend split preview generation successful (parallel)');
          return splitPreviews;
        }
      } catch (frontendError) {
        logger.warn('Frontend split generation failed, falling back to backend:', frontendError);
      }

      // Fallback to backend generation if frontend fails
      const response = await axios.post(
        `${API_BASE_URL}/api/templates/generate-split-previews`,
        { templateId, splitInto },
        { headers: { 'Authorization': `Bearer ${API_TOKEN}` } }
      );

      if (response.data.success) {
        logger.debug('⚠️ Using backend split preview generation (fallback)');
        return response.data.splitPreviews;
      }
      return null;
    } catch (error) {
          // logger.error('Failed to generate split previews:', error);
      return null;
    }
  };

  // Production-safe sync function with safeguards
  const syncSWIStatus = async (retryCount = 0) => {
    // Prevent concurrent syncs
    if (isSyncing) {
          logger.debug('SWI Sync: Sync already in progress, skipping...');
      return;
    }

    // No rate limiting - real-time sync
    // Only prevent if already syncing

    // Check if component is still mounted
    if (!mountedRef.current) {
          logger.debug('SWI Sync: Component unmounted, skipping...');
      return;
    }

          logger.debug('SWI Sync: Starting sync...');
    setIsSyncing(true);
    lastSyncTimeRef.current = Date.now();

    // Cancel any previous request
    if (syncAbortController.current) {
      syncAbortController.current.abort();
    }
    syncAbortController.current = new AbortController();

    try {
      // Collect all SWI Job IDs from all drawings
      const allJobIds = [];
      const drawingArray = Array.isArray(drawing) ? drawing : (drawing ? [drawing] : []);
      
      // Process drawing array
      
      drawingArray.forEach(d => {
        if (d.swiJobIds && Array.isArray(d.swiJobIds)) {
          d.swiJobIds.forEach(jobId => {
            if (jobId && !allJobIds.includes(jobId)) {
              allJobIds.push(jobId);
            }
          });
        }
      });

      // Collected Job IDs for sync
          logger.debug('SWI Sync: Job IDs to sync:', allJobIds);

      if (allJobIds.length === 0) {
          logger.debug('SWI Sync: No Job IDs to sync');
        setIsSyncing(false);
        return;
      }

      // Batch large requests for production safety
      const BATCH_SIZE = 50;
      const batches = [];
      for (let i = 0; i < allJobIds.length; i += BATCH_SIZE) {
        batches.push(allJobIds.slice(i, i + BATCH_SIZE));
      }

          logger.debug(`SWI Sync: Processing ${batches.length} batch(es)...`);
      
      const API_TOKEN = tokenManager.getToken();
      const allResults = {};
      const allShapeIds = {};
      
      // Process batches with timeout and abort signal
      for (const batch of batches) {
        if (!mountedRef.current) break; // Stop if unmounted
        
        const response = await axios.post(
          `${API_BASE_URL}/api/swi/check-job-status`,
          { jobIds: batch },
          { 
            headers: { 'x-access-token': API_TOKEN },
            timeout: 120000, // 120 second timeout
            signal: syncAbortController.current.signal
          }
        );
        
        if (response.data.success) {
          if (response.data.statusMap) {
            Object.assign(allResults, response.data.statusMap);
          }
          if (response.data.shapeIdMap) {
            Object.assign(allShapeIds, response.data.shapeIdMap);
          }
        }
      }
      
      const response = { data: { success: true, statusMap: allResults, shapeIdMap: allShapeIds } };

      // Process SWI status response
          logger.debug('SWI Sync: Response received:', response.data);

      if (response.data.success && mountedRef.current) {
        const newStatusMap = response.data.statusMap || {};
        const newShapeIdMap = response.data.shapeIdMap || {};
          logger.debug('SWI Sync: Status map received:', newStatusMap);
          logger.debug('SWI Sync: Shape ID map received:', newShapeIdMap);
        setSwiStatusMap(newStatusMap);
        setSwiShapeIdMap(newShapeIdMap);
        // Clear retry timeout on success
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      }
    } catch (error) {
      // Don't retry if component unmounted or request was aborted
      if (!mountedRef.current || error.name === 'CanceledError') {
          logger.debug('SWI Sync: Sync cancelled');
        return;
      }
      
          logger.error('SWI Sync: Failed to sync SWI status:', error);
      
      // Implement exponential backoff retry (max 3 retries)
      if (retryCount < 3) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          logger.debug(`SWI Sync: Retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/3)`);
        
        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            syncSWIStatus(retryCount + 1);
          }
        }, retryDelay);
      } else {
          logger.error('SWI Sync: Max retries reached, giving up');
      }
    } finally {
      if (mountedRef.current) {
        setIsSyncing(false);
      }
    }
  };

  // Note: Debouncing is handled inside syncSWIStatus via rate limiting

  // Helper function to render status icon
  const renderSWIStatusIcon = (jobId) => {
    const status = swiStatusMap[jobId];
          logger.debug(`Rendering icon for Job ID ${jobId}: status = ${status}, map keys = ${Object.keys(swiStatusMap).length}`);
    
    // Always show an icon if we have checked the status
    if (status === 'active') {
      return (
        <span style={{ marginLeft: '8px', display: 'inline-block' }}>
          <FaCheckCircle style={{ color: '#10b981', fontSize: '16px', verticalAlign: 'middle' }} title="Active in SWI" />
        </span>
      );
    } else if (status === 'deleted') {
      return (
        <span style={{ marginLeft: '8px', display: 'inline-block' }}>
          <FaTimesCircle style={{ color: '#ef4444', fontSize: '16px', verticalAlign: 'middle' }} title="Deleted from SWI" />
        </span>
      );
    } else if (status === 'error') {
      return (
        <span style={{ marginLeft: '8px', display: 'inline-block' }}>
          <FaExclamationTriangle style={{ color: '#f59e0b', fontSize: '16px', verticalAlign: 'middle' }} title="Unable to verify status" />
        </span>
      );
    }
    
    // If no status yet (not synced), don't show anything
    return null;
  };

  useEffect(() => {
    // Check if we just deleted a drawing - don't refetch
    const justDeleted = sessionStorage.getItem('justDeletedDrawing');
    if (justDeleted) {
      logger.debug('Skipping fetch - just deleted a drawing');
      // Keep the flag for a bit longer to handle multiple re-renders
      setTimeout(() => {
        sessionStorage.removeItem('justDeletedDrawing');
      }, 2000);
      return; // Skip fetching to prevent deleted drawing from reappearing
    }
    
    // If no mongoOrderId yet, wait for it to be fetched
    if (!mongoOrderId) {
      // If we have navTemplate but no mongoOrderId, verify the template still exists
      if (navTemplate && navTemplate._id && !orderId) {
        axios.get(`${API_BASE_URL}/api/templates/${navTemplate._id}`)
          .then(res => {
            // Template still exists
          })
          .catch(err => {
            // Only clear state if it's a 404 (not found), not for network errors
            if (err.response && err.response.status === 404) {
          // Removed: // logger.debug('❌ Template no longer exists - clearing state');
              setDrawing(null);
              setMaterialRows([]);
              setError('Drawing no longer exists');
              // Clear navigation state
              navigate(location.pathname, { replace: true, state: {} });
            } else {
          logger.error('Error checking template existence:', err);
              // Don't clear state for network errors - let user retry
            }
          });
      }
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

          logger.debug('Fetching drawings for MongoDB ID:', mongoOrderId);
    {/* Quotation check handled using type param*/}
    axios
      .get(`${API_BASE_URL}/api/orders/id/${mongoOrderId}/${type}/drawings?t=${Date.now()}&nocache=${Math.random()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      .then((res) => {
        if (!mounted) {
          return;
        }
        const list = Array.isArray(res.data) ? res.data : [];
        
        // Get deleted templates from both sessionStorage and localStorage for this order
        const deletedTemplatesKey = `deletedTemplates_${mongoOrderId}`;
        let sessionDeleted = JSON.parse(sessionStorage.getItem(deletedTemplatesKey) || '[]');
        let localDeleted = JSON.parse(localStorage.getItem(deletedTemplatesKey) || '[]');
        
        // Clear the deleted templates storage since user manually deleted from DB
        // This will reset the tracking
        if (list.length === 0 && (sessionDeleted.length > 0 || localDeleted.length > 0)) {
          logger.debug('No drawings in DB but have deleted tracking - clearing storage');
          sessionStorage.removeItem(deletedTemplatesKey);
          localStorage.removeItem(deletedTemplatesKey);
          sessionDeleted = [];
          localDeleted = [];
        }
        
        // Clean up old entries - if we have more than 10 deleted templates, clear and start fresh
        // This prevents accumulation of old IDs that might not be relevant
        if (sessionDeleted.length > 10 || localDeleted.length > 10) {
          logger.debug('Clearing old deleted templates - too many accumulated');
          sessionDeleted = [];
          localDeleted = [];
          sessionStorage.removeItem(deletedTemplatesKey);
          localStorage.removeItem(deletedTemplatesKey);
        }
        
        const deletedTemplates = [...new Set([...sessionDeleted, ...localDeleted])];
        
        logger.debug('Deleted templates tracking:', {
          key: deletedTemplatesKey,
          sessionDeleted,
          localDeleted,
          combined: deletedTemplates,
          apiResponseCount: list.length
        });
        
        // Log what's coming from API
        if (list.length > 0) {
          logger.debug('📥 API RETURNED DRAWINGS:', list.map(d => ({
            templateId: d.templateId,
            _id: d._id,
            effectiveId: d.templateId || d._id,
            orderNumber: d.orderNumber,
            name: d.name
          })));
          
          // Check if this is a different template than what we deleted
          if (deletedTemplates.length > 0) {
            logger.debug('🔍 DELETED TEMPLATE IDS:', deletedTemplates);
            const returnedIds = list.map(d => d.templateId || d._id);
            const unexpectedIds = returnedIds.filter(id => !deletedTemplates.includes(id));
            if (unexpectedIds.length > 0) {
              logger.warn('⚠️ API returned unexpected template IDs (not in deleted list):', unexpectedIds);
            }
          }
        }
        
        // Filter out deleted templates
        const filteredList = list.filter(d => {
          const templateId = d.templateId || d._id;
          const shouldKeep = !deletedTemplates.includes(templateId);
          if (!shouldKeep) {
            logger.debug(`Filtering out deleted template: ${templateId}`);
          } else if (deletedTemplates.length > 0) {
            logger.debug(`Keeping template: ${templateId} (not in deleted list)`);
          }
          return shouldKeep;
        });
        
        // Remove duplicates based on templateId or _id
        const uniqueList = filteredList.filter((drawing, index, self) => {
          const id = drawing.templateId || drawing._id;
          return index === self.findIndex(d => (d.templateId || d._id) === id);
        });
        
          logger.debug(' Drawings found:', uniqueList.length, '(deduped from', filteredList.length, ', original', list.length, ')');

        if (uniqueList.length) {
          // Add URL versions of preview fields for display (use previewUrl if available from API, fallback to preview)
          const drawingsWithUrls = uniqueList.map(drw => ({
            ...drw,
            previewUrl: drw.previewUrl || drw.preview,
            previewFarUrl: drw.previewFarUrl || drw.previewFar,
            previewNearUrl: drw.previewNearUrl || drw.previewNear
          }));

          // Always use the unique filtered list from API, don't let navigation state override
          setDrawing(drawingsWithUrls);
          // Clear navigation state if it contains deleted data
          if (navTemplate) {
            navigate(location.pathname, { replace: true, state: {} });
          }
        }
        else {
          setError('No drawings available.');
          setDrawing(null);
          setMaterialRows([]);
          // Clear navigation state to prevent deleted drawing from reappearing
          if (navTemplate) {
            navigate(location.pathname, { replace: true, state: {} });
          }

          // If no drawings found on first load, retry after a short delay
          // This handles the case where drawing was just created
          if (!sessionStorage.getItem('retried_drawing_fetch')) {
            sessionStorage.setItem('retried_drawing_fetch', 'true');
            setTimeout(() => {
              logger.debug('No drawings found, retrying fetch after delay...');
              setRefreshTrigger(prev => prev + 1);
              // Clear the retry flag after some time
              setTimeout(() => {
                sessionStorage.removeItem('retried_drawing_fetch');
              }, 2000);
            }, 500); // Wait 500ms then retry (much faster)
          }
        }
      })
      .catch((error) => {
        if (mounted) {
          logger.error(' Error fetching drawings:', error.response?.status, error.response?.data);
          // Don't show "Internal Server Error" - treat as no drawings
          const errorMessage = error.response?.data?.message;
          if (errorMessage === 'Internal Server Error' || errorMessage === 'Order not found') {
            // Treat as empty state, not error
            setError(null);
            setDrawing([]);
          } else {
            // Show other errors
            setError(errorMessage || 'Could not load drawings.');
            setDrawing(null);
          }
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [location.state?.template?._id]); // Add template ID to trigger refresh when new template arrives

  useEffect(() => {
    if (Array.isArray(navTemplate?.materialRows)) setMaterialRows(navTemplate.materialRows);
    // navTemplate is already handled in the initial state
  }, [navTemplate]);

  // Auto-sync SWI status when drawings load
  useEffect(() => {
    if (drawing && (Array.isArray(drawing) ? drawing.length > 0 : true)) {
      // Check if any drawings have SWI Job IDs
      const drawingArray = Array.isArray(drawing) ? drawing : [drawing];
      const swiJobIds = drawingArray.flatMap(d => d?.swiJobIds || []);
      const hasSwiJobs = swiJobIds.length > 0;
      
      
      if (hasSwiJobs) {
          logger.debug('Triggering auto-sync for Job IDs:', swiJobIds);
        // Direct sync call (already has debouncing inside syncSWIStatus)
        syncSWIStatus();
      }
    }
  }, [drawing]); // Trigger when drawing changes

  // Cleanup on component unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      // Cancel any pending syncs
      if (syncAbortController.current) {
        syncAbortController.current.abort();
      }

      // Clear any retry timeouts
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // CRITICAL FIX: Clear justDeletedDrawing flag when navigating away
      // This allows refresh to work when user creates new drawing and comes back
      sessionStorage.removeItem('justDeletedDrawing');
    };
  }, []);

  // Real-time sync when window/tab gets focus (user comes back from SWI)
  useEffect(() => {
    const handleFocus = () => {
          logger.debug('Window focused - refreshing drawings and checking for SWI updates...');

      // Refresh drawings list when user comes back to the tab
      if (mountedRef.current && mongoOrderId) {
        logger.debug('Triggering drawing refresh after window focus...');
        setRefreshTrigger(prev => prev + 1);
      }

      // Check if we have drawings with SWI Job IDs
      const drawingArray = Array.isArray(drawing) ? drawing : (drawing ? [drawing] : []);
      const hasSwiJobs = drawingArray.some(d => d?.swiJobIds?.length > 0);

      if (hasSwiJobs && mountedRef.current) {
          logger.debug('Syncing SWI status after window focus...');
        syncSWIStatus();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handleFocus();
      }
    };

    // Listen for window focus and visibility change
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [drawing, mongoOrderId]); // Include drawing and mongoOrderId to check current state

  useEffect(() => {
    if (!templateId || materialRows.length) return;
    let mounted = true;
    axios
      .get(`${API_BASE_URL}/api/templates/${templateId}/rows`)
      .then((res) => {
        if (mounted) setMaterialRows(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => { })
    return () => {
      mounted = false;
    };
  }, [templateId, materialRows.length]);

  const primaryRow = useMemo(() => {
    if (materialRows.length) return materialRows[0];
    if (!currentDrawingObj) return null;
    return {
      quantity: currentDrawingObj.qty ?? 0,
      length: currentDrawingObj.length ?? null,
      tag: (currentDrawingObj.tag || '').trim(),
      unitPrice: currentDrawingObj.unitPrice ?? null,
      splitInto: currentDrawingObj.splitInto ?? 1,
    };
  }, [materialRows, currentDrawingObj]);

  const formatQtyLen = () => {
    if (!primaryRow) return '–';
    const pieces = Number(primaryRow.quantity || 0);
    const lengthMm = Number(primaryRow.length || 0);
    const splitInto = Number(primaryRow.splitInto || 1);

    const perPieceM = lengthMm ? (lengthMm / 1000).toFixed(3) : null;

    if (splitInto > 1) {
      const basePieces = pieces / splitInto;
      const baseLenM = lengthMm ? ((lengthMm * splitInto) / 1000).toFixed(3) : null;
      return `${basePieces || 0} * ${baseLenM || '–'} → split x${splitInto} = ${pieces || 0} * ${perPieceM || '–'}`;
    }

    return `${pieces || 0} * ${perPieceM || '–'}`;
  };

  // =============================================================================
  // RENDER PREVIEW FUNCTION
  // =============================================================================
  // Main function to render drawing previews in both main view and lightbox.
  // Handles multiple drawing types with different rendering paths.
  //
  // RENDERING PATHS (in order of priority):
  // ─────────────────────────────────────────────────────────────────────────────
  // PATH 1: Split piece in lightbox (isTaper && splitPiece)
  //         - Shows specific split piece FAR/NEAR images
  //         - Used when viewing individual split pieces in expanded lightbox
  //
  // PATH 2: Taper with split (isTaper && splitInto > 1)
  //         - Shows split preview grid with FAR/NEAR for each piece
  //         - Can toggle to show original unsplit drawing
  //
  // PATH 3: Taper without split (isTaper && splitInto <= 1)
  //         - Shows FAR and NEAR drawings stacked vertically
  //         - Uses DrawingPreview component with type="far" and type="near"
  //
  // PATH 4: Non-taper (normal drawing)
  //         - Shows single drawing using DrawingPreview component
  //         - Falls back to SplitPreviewGrid if no preview image
  //
  // PARAMETERS:
  // ─────────────────────────────────────────────────────────────────────────────
  // @param {Object} drawingToRender - Drawing object (optional, defaults to currentDrawingObj)
  // @param {Object} primaryRowToRender - Material row data (optional, defaults to primaryRow)
  // @param {boolean} isLightbox - Whether rendering in lightbox (affects sizing)
  // @param {number} dynamicHeight - Custom height for tall drawings
  // =============================================================================
  const renderPreview = (drawingToRender = null, primaryRowToRender = null, isLightbox = false, dynamicHeight = null) => {
    // Use passed parameters or fall back to component state
    const drawingObj = drawingToRender || currentDrawingObj;
    const rowData = primaryRowToRender || primaryRow;

    // Split count from material row
    const n = Number(rowData?.splitInto || 1);

    // Helper to calculate girth with folds
    const calculateGirthWithFolds = (lengths) => {
      if (!Array.isArray(lengths)) return drawingObj.girth || 0;
      return getGirth(
        lengths,
        drawingObj.startFoldType,
        drawingObj.startFoldLength || 0,
        drawingObj.endFoldType,
        drawingObj.endFoldLength || 0
      );
    };

    // Detect geometry type
    const hasNonTaperGeom = Array.isArray(drawingObj?.lengths) && drawingObj.lengths.length;
    const hasTaperGeom = (Array.isArray(drawingObj?.farLengths) && drawingObj.farLengths.length) ||
      (Array.isArray(drawingObj?.nearLengths) && drawingObj.nearLengths.length);
    const hasGeom = hasNonTaperGeom || hasTaperGeom;

    // Calculate piece and length values for display
    const perPieceM = Number(rowData?.length || 0) ? Number(rowData.length) / 1000 : null;
    const basePieces = n > 1 ? Number(rowData.quantity || 0) / n : Number(rowData.quantity || 0);
    const baseLenM = n > 1 && perPieceM != null ? perPieceM * n : perPieceM;
    const totalPieces = Number(rowData?.quantity || 0);

    // =========================================================================
    // PATH 1: SPLIT PIECE IN LIGHTBOX (individual split piece view)
    // =========================================================================
    // Check this FIRST - specific split piece in lightbox takes priority
    if (hasGeom && drawingObj?.isTaper && drawingObj.splitPiece) {
      // This is a specific split piece in the lightbox
      // Show only FAR view for this piece with its specific dimensions
        // Use split preview images if available, otherwise fall back to original
        const farImageSrc = drawingObj.splitPreviewFar
          ? getImageUrl(drawingObj.splitPreviewFar)
          : drawingObj.previewFarUrl;
        const nearImageSrc = drawingObj.splitPreviewNear
          ? getImageUrl(drawingObj.splitPreviewNear)
          : drawingObj.previewNearUrl || drawingObj.previewFarUrl;

        // Calculate dynamic max height using same girth tiers as geometryUtils.js
        let lightboxMaxHeight = 280;
        let isTallDrawing = false;
        try {
          const lbLengths = drawingObj?.farLengths || drawingObj?.lengths || [];
          if (lbLengths.length > 0) {
            const lbGirth = lbLengths.reduce((sum, len) => sum + (Number(len) || 0), 0);

            const lbPoints = calculatePoints(
              lbLengths.map(Number), drawingObj?.angles || [], drawingObj?.direction || 'Right',
              [], [], false, { x: 0, y: 0 }, drawingObj?.firstSegmentAngle, null, 0, null, 0
            );
            if (lbPoints && lbPoints.length > 0) {
              const lbXs = lbPoints.map(p => p.x);
              const lbYs = lbPoints.map(p => p.y);
              const lbDrawingWidth = Math.max(...lbXs) - Math.min(...lbXs);
              const lbDrawingHeight = Math.max(...lbYs) - Math.min(...lbYs);
              if (lbDrawingHeight > lbDrawingWidth) {
                isTallDrawing = true;
              }
            }

            // Map girth + segment count to max height
            const lbSegmentCount = lbLengths.length;

            // Complex drawings (many segments) need more height
            if (lbSegmentCount > 10) {
              if (lbGirth <= 500) {
                lightboxMaxHeight = 800;
              } else if (lbGirth <= 1000) {
                lightboxMaxHeight = 900;
              } else {
                lightboxMaxHeight = 1000;
              }
            }
            // Simple drawings (few segments) stay compact
            else {
              if (lbGirth <= 250) {
                lightboxMaxHeight = 600;
              } else if (lbGirth <= 500) {
                lightboxMaxHeight = 650;
              } else if (lbGirth <= 1000) {
                lightboxMaxHeight = 700;
              } else {
                lightboxMaxHeight = 750;
              }
            }
          }
        } catch (error) { /* keep default */ }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', marginTop: '5px' }}>
            {/* FAR end of this piece */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ overflow: 'visible', paddingLeft: '20px', paddingRight: '20px', paddingTop: '5px', paddingBottom: '15px', position: 'relative' }}>
                <div className="far-watermark">FAR</div>
                <img
                  src={farImageSrc}
                  alt={`Piece ${drawingObj.splitPiece} Far`}
                  style={{
                    maxWidth: isTallDrawing ? '400px' : '100%',
                    maxHeight: `${lightboxMaxHeight}px`,
                    objectFit: 'contain',
                    width: isTallDrawing ? 'auto' : '100%',
                    position: 'relative',
                    zIndex: 2
                  }}
                />
              </div>
            </div>

            {/* NEAR end of this piece */}
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <div style={{ overflow: 'visible', paddingLeft: '20px', paddingRight: '20px', paddingTop: '5px', paddingBottom: '5px', position: 'relative' }}>
                <div className="near-watermark">NEAR</div>
                <img
                  src={nearImageSrc}
                  alt={`Piece ${drawingObj.splitPiece} Near`}
                  style={{
                    maxWidth: isTallDrawing ? '400px' : '100%',
                    maxHeight: `${lightboxMaxHeight}px`,
                    objectFit: 'contain',
                    width: isTallDrawing ? 'auto' : '100%',
                    position: 'relative',
                    zIndex: 2
                  }}
                />
              </div>
            </div>
          </div>
        );
    }

    // =========================================================================
    // PATH 2: TAPER WITH SPLIT (splitInto > 1)
    // =========================================================================
    // Shows split preview grid with FAR/NEAR images for each split piece.
    // Can toggle between split view and original unsplit drawing.
    // NOT for individual split pieces in lightbox (that's PATH 1).
    // =========================================================================
    if (hasGeom && n > 1 && drawingObj?.isTaper) {
      // Check if we should show original drawing based on toggle
      const shouldShowOriginal = showOriginalDrawing[drawingObj._id || drawingObj.id || 'default'];

      // If toggle is on, show the original FAR/NEAR images without split info
      if (shouldShowOriginal && (drawingObj?.farLengths?.length > 0 || drawingObj?.nearLengths?.length > 0)) {
        return (
          <div>
            <div style={{
              textAlign: 'center',
              marginBottom: '15px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              ORIGINAL DRAWING (BEFORE SPLIT)
            </div>

            {/* Show original taper images */}
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }}>
                  Far
                </div>
                <div style={{ overflow: 'visible', paddingLeft: '20px', paddingRight: '20px', paddingTop: '10px', paddingBottom: '10px' }}>
                  <DrawingPreview
                    template={drawingObj}
                    type="far"
                    width={1000}
                    height={700}
                    fontSize={24}
                    style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
                  />
                </div>
                <div style={{
                  marginTop: '8px',
                  fontSize: '13px',
                  color: '#64748b',
                  fontWeight: '600'
                }}>
                  Girth: {Math.round(calculateGirthWithFolds(drawingObj.farLengths))} mm
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }}>
                  Near
                </div>
                <div style={{ overflow: 'visible', paddingLeft: '20px', paddingRight: '20px', paddingTop: '10px', paddingBottom: '10px' }}>
                  <DrawingPreview
                    template={drawingObj}
                    type="near"
                    width={1000}
                    height={700}
                    fontSize={24}
                    style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
                  />
                </div>
                <div style={{
                  marginTop: '8px',
                  fontSize: '13px',
                  color: '#64748b',
                  fontWeight: '600'
                }}>
                  Girth: {Math.round(calculateGirthWithFolds(drawingObj.nearLengths))} mm
                </div>
              </div>
            </div>
          </div>
        );
      }

      // Show split preview when toggle is off or using SplitPreviewGrid as fallback

      // Fallback to SplitPreviewGrid if no preview images
      return (
        <div className="d-flex justify-content-center">
          <SplitPreviewGrid
            isTaper={Boolean(drawingObj?.isTaper)}
            direction={drawingObj?.direction || 'Right'}
            firstSegmentAngle={drawingObj?.firstSegmentAngle}

            lengths={drawingObj?.lengths || []}
            angles={drawingObj?.angles || []}

            farLengths={drawingObj?.farLengths || drawingObj?.lengths || []}
            farAngles={drawingObj?.farAngles || drawingObj?.angles || []}
            nearLengths={drawingObj?.nearLengths || []}
            nearAngles={drawingObj?.nearAngles || []}

            farStart={drawingObj?.farStart}
            nearStart={drawingObj?.nearStart}

            reverseColor={drawingObj?.reverseColor}

            splitInto={n}
            canvasW={drawingObj?.isTaper ? 400 : 600}
            canvasH={drawingObj?.isTaper ? 300 : 400}
            onlySplit={false}
            showMainPageFormat={true}
            hideInternalToggle={true}
            showOriginalExternal={showOriginalDrawing[drawingObj._id || drawingObj.id || 'default']}

            basePieces={Number.isFinite(basePieces) ? basePieces : null}
            totalPieces={Number.isFinite(totalPieces) ? totalPieces : null}
            baseLengthM={baseLenM}
            perPieceLengthM={perPieceM}

            labelOffsets={drawingObj?.labelOffsets}
            splitLabelOffsets={drawingObj?.splitLabelOffsets}
          />
        </div>
      );
    }

    // =========================================================================
    // PATH 3 & 4: NON-SPLIT DRAWINGS (both taper and non-taper)
    // =========================================================================
    // PATH 3: Taper without split - Shows FAR and NEAR stacked vertically
    // PATH 4: Non-taper (normal) - Shows single drawing
    // =========================================================================
    if (hasGeom) {

      return (
        <div>
          {/* ─────────────────────────────────────────────────────────────────
              PATH 3: TAPER WITHOUT SPLIT (isTaper && splitInto <= 1)
              Shows FAR and NEAR drawings stacked vertically
              ───────────────────────────────────────────────────────────────── */}
          {drawingObj?.isTaper ? (
        (drawingObj?.farLengths?.length > 0 || drawingObj?.nearLengths?.length > 0) ? (
          <div>
            <div style={{ position: 'relative', width: '100%' }}>
              <div className='far-watermark'>FAR</div>
              <DrawingPreview
                template={drawingObj}
                type="far"
                width={1200}
                height={dynamicHeight || 700}
                fontSize={24}
                style={{ maxWidth: '100%', height: 'auto', position: 'relative', zIndex: 2 }}
              />
            </div>

            <div style={{ position: 'relative', width: '100%' }}>
              <div className='near-watermark'>NEAR</div>
              <DrawingPreview
                template={drawingObj}
                type="near"
                width={1200}
                height={dynamicHeight || 700}
                fontSize={24}
                style={{ maxWidth: '100%', height: 'auto', position: 'relative', zIndex: 2 }}
              />
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '30px',
            alignItems: 'center',
            justifyContent: 'flex-start',
            overflowX: 'visible',
            minWidth: '100%',
            padding: '10px'
          }}>
            <div style={{
              borderRadius: '8px',
              padding: '4px 8px 0px 8px',
              width: '100%',
              minWidth: 'auto',
              maxWidth: '520px',
              overflow: 'visible'
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: '700',
                color: '#6c757d',
                marginBottom: '20px',
                textTransform: 'uppercase',
                textAlign: 'center'
              }}>
                FAR
              </div>
              <div style={{ width: '100%', height: '280px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '0px', overflow: 'visible' }}>
                <SplitPreviewGrid
                  isTaper={false}
                  direction={drawingObj?.direction || 'Right'}
                  firstSegmentAngle={drawingObj?.firstSegmentAngle}
                  lengths={drawingObj?.farLengths || []}
                  angles={drawingObj?.farAngles || []}
                  reverseColor={drawingObj?.reverseColor}
                  splitInto={1}
                  canvasW={420}
                  canvasH={500}
                  onlySplit={true}
                  labelOffsets={drawingObj?.labelOffsets}
                />
              </div>
            </div>

            <div style={{
              borderRadius: '8px',
              padding: '4px 8px 0px 8px',
              width: '100%',
              minWidth: 'auto',
              maxWidth: '520px',
              overflow: 'visible'
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: '700',
                color: '#6c757d',
                marginBottom: '20px',
                textTransform: 'uppercase',
                textAlign: 'center'
              }}>
                NEAR
              </div>
              <div style={{ width: '100%', height: '280px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '0px', overflow: 'visible' }}>
                <SplitPreviewGrid
                  isTaper={false}
                  direction={drawingObj?.direction || 'Right'}
                  firstSegmentAngle={drawingObj?.firstSegmentAngle}
                  lengths={drawingObj?.nearLengths || []}
                  angles={drawingObj?.nearAngles || []}
                  reverseColor={drawingObj?.reverseColor}
                  splitInto={1}
                  canvasW={420}
                  canvasH={250}
                  onlySplit={true}
                  labelOffsets={drawingObj?.labelOffsets}
                />
              </div>
            </div>
          </div>
        )
          ) : (
          /* ─────────────────────────────────────────────────────────────────
             PATH 4: NON-TAPER (normal drawing)
             Shows single drawing using DrawingPreview or SplitPreviewGrid fallback
             ───────────────────────────────────────────────────────────────── */
        !drawingObj?.preview ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
            <div style={{
          width: '100%',
          maxWidth: isLightbox ? '100%' : '520px',
          height: dynamicHeight ? `${dynamicHeight}px` : '500px',
          display: 'flex',
          alignItems: isLightbox ? 'flex-start' : 'center',
          justifyContent: 'center',
          overflow: 'visible',
          margin: '0 auto'
            }}>
          <div style={{
            width: '100%',
            height: isLightbox ? 'auto' : '100%',
            display: 'flex',
            alignItems: isLightbox ? 'flex-start' : 'center',
            justifyContent: 'center'
          }}>
            <DrawingPreview
              template={drawingObj}
              type="normal"
              width={1000}
              height={dynamicHeight || 700}
              fontSize={24}
              style={{
            maxWidth: '100%',
            maxHeight: dynamicHeight ? `${dynamicHeight}px` : '500px',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            imageRendering: 'auto'
              }}
            />
          </div>
            </div>
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '5px',
            height: '300px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <SplitPreviewGrid
          isTaper={false}
          direction={drawingObj?.direction || 'Right'}
          firstSegmentAngle={drawingObj?.firstSegmentAngle}
          lengths={drawingObj?.lengths || []}
          angles={drawingObj?.angles || []}
          reverseColor={drawingObj?.reverseColor}
          splitInto={1}
          canvasW={420}
          canvasH={280}
          onlySplit={true}
          labelOffsets={drawingObj?.labelOffsets}
            />
          </div>
        )
          )}
        </div>
      );
    }

    // =========================================================================
    // PATH 5: FALLBACK - No geometry data
    // =========================================================================
    // When hasGeom is false but we still need to render something.
    // Uses DrawingPreview with type="normal" as last resort.
    // =========================================================================
    return (
      <div style={{
        width: '100%',
        height: dynamicHeight ? `${dynamicHeight}px` : '500px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: isLightbox ? 'flex-start' : 'center',
        padding: '10px',
      }}>
        <DrawingPreview
          template={drawingObj}
          type="normal"
          width={1000}
          height={dynamicHeight || 700}
          fontSize={24}
          style={{
            maxWidth: '100%',
            maxHeight: dynamicHeight ? `${dynamicHeight}px` : '500px',
            objectFit: 'contain'
          }}
        />
      </div>
    );
  };

  // =============================================================================
  // HANDLE EDIT - Navigate to DrawingCanvas for editing
  // =============================================================================
  // Prepares drawing data and navigates to SelectMaterialsSimplified for editing.
  // Steps:
  // 1. Fetch order data if not already loaded
  // 2. Build editState with drawing geometry, customer info, dates
  // 3. Fetch fresh template data from API for latest flip states
  // 4. Navigate to /select-materials-simplified with full edit state
  // =============================================================================
  const handleEdit = async () => {
    if (!templateId) return;

    // Step 1: Fetch order data if not already loaded
    let currentOrderData = orderData;
    if (!currentOrderData && orderId) {
          logger.debug(' Order data not loaded yet, fetching now...');
      setOrderLoading(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/orders/id/${orderId}`);
        currentOrderData = res.data;
        setOrderData(res.data);

        // Also save to localStorage immediately
        if (res.data?.order_unique_id) {
          localStorage.setItem('orderNumber', res.data.order_unique_id);
        }
        if (res.data?.order_customer_id) {
          localStorage.setItem('customerId', res.data.order_customer_id);
        }
        if (res.data?.order_customer_name) {
          localStorage.setItem('customerName', res.data.order_customer_name);
        }
      } catch (err) {
        swal.fire({
          text: 'Failed to fetch order data. Please try again.',
          icon: "error",
          type: "error",
        });
        setOrderLoading(false);
        return; // Exit if we can't get order data
      }
      setOrderLoading(false);
    }

    let editState = { ...currentDrawingObj };

    // Get orderNumber from currentOrderData (fetched from API) or fallback sources
    const orderNumberToUse = currentOrderData?.order_unique_id || currentDrawingObj?.orderNumber || location.state?.orderNumber;
    const customerIdToUse = currentOrderData?.order_customer_id || currentDrawingObj?.customerId;
    const customerNameToUse = currentOrderData?.order_customer_name || currentDrawingObj?.customerName;

    // If we still don't have customer data but have orderNumber, fetch it from order by orderNumber
    if (!customerIdToUse && orderNumberToUse) {
      try {
          logger.debug(' Fetching order by orderNumber:', orderNumberToUse);
          {/* Quotation check handled using type param*/}
        const orderRes = await axios.get(`${API_BASE_URL}/api/orders/by-order-number/${type}/${orderNumberToUse}`);
        if (orderRes.data) {
          editState.customerId = orderRes.data.order_customer_id;
          editState.customerName = orderRes.data.order_customer_name;

          // Save to localStorage
          if (orderRes.data.order_customer_id) {
            localStorage.setItem('customerId', orderRes.data.order_customer_id);
          }
          if (orderRes.data.order_customer_name) {
            localStorage.setItem('customerName', orderRes.data.order_customer_name);
          }
        }
      } catch (error) {
          // Removed: logger.warn('Order not found by orderNumber, continuing without customer data:', error.response?.status);
      }
    }

    // Always add order data to editState
    editState.orderNumber = orderNumberToUse;
    editState.customerId = editState.customerId || customerIdToUse;
    editState.customerName = editState.customerName || customerNameToUse;
    // Use mongoOrderId (MongoDB _id) for navigation, with orderId as fallback
    // Also try to get _id from currentOrderData if available
    const mongoIdToUse = mongoOrderId || mongoIdFromProps || currentOrderData?._id || orderId;
    editState.orderId = mongoIdToUse;

    // Add dates from order data if available
    if (currentOrderData) {
      // Use string versions for dates to avoid timezone issues
      editState.promiseDate = currentOrderData.order_delivery_date_str || currentOrderData.order_delivery_date;
      editState.enteredDate = currentOrderData.created_str || currentOrderData.created;
    } else if (orderNumberToUse) {
      // If no order data but have orderNumber, fetch it now
      try {
        {/* Quotation check handled using type param*/}
        const orderRes = await axios.get(`${API_BASE_URL}/api/orders/by-order-number/${type}/${orderNumberToUse}`);
        if (orderRes.data) {
          // Use string versions for dates to avoid timezone issues
          editState.promiseDate = orderRes.data.order_delivery_date_str || orderRes.data.order_delivery_date;
          editState.enteredDate = orderRes.data.created_str || orderRes.data.created;
        }
      } catch (error) {
        console.warn('Could not fetch order dates for edit mode:', error);
      }
    }

    // Fetch full template data to get flip states and other fields not in OrderItem
    try {
      const templateRes = await axios.get(`${API_BASE_URL}/api/templates/${templateId}`);
      // API returns { data: templateObject }, so we need to access templateRes.data.data
      const templateData = templateRes.data?.data || templateRes.data;
      if (templateData) {
        // Merge template data into editState, preserving flipH and flipV
        editState.flipH = templateData.flipH || false;
        editState.flipV = templateData.flipV || false;
        editState.firstSegmentAngle = templateData.firstSegmentAngle;
        editState.labelOffsets = templateData.labelOffsets;
        editState.splitLabelOffsets = templateData.splitLabelOffsets;
        // CRITICAL: Pass segmentAbsoluteAngles for correct SSF fold orientation
        editState.segmentAbsoluteAngles = templateData.segmentAbsoluteAngles || [];
        // CRITICAL: Pass fold gap values for SSF fold display
        editState.startFoldGap = templateData.startFoldGap || 0;
        editState.endFoldGap = templateData.endFoldGap || 0;
        // CRITICAL: Pass fresh preview URLs from API (fixes stale preview after clear & redraw)
        editState.previewUrl = templateData.previewUrl;
        editState.previewFarUrl = templateData.previewFarUrl;
        editState.previewNearUrl = templateData.previewNearUrl;
        editState.preview = templateData.preview;
        editState.previewFar = templateData.previewFar;
        editState.previewNear = templateData.previewNear;
        // Also update geometry in case it changed after clear & redraw
        // CRITICAL: Update both lengths/farLengths since SplitDrawingCanvas prefers farLengths
        editState.lengths = templateData.lengths;
        editState.farLengths = templateData.lengths; // farLengths should match lengths (far profile)
        editState.angles = templateData.angles;
        editState.farAngles = templateData.angles; // farAngles should match angles
        editState.nearLengths = templateData.nearLengths;
        editState.nearAngles = templateData.nearAngles;
        editState.isTaper = templateData.isTaper;
        editState.direction = templateData.direction;
        editState.reverseColor = templateData.reverseColor;
        editState.girth = templateData.girth;

        logger.debug('✅ Fetched template data for edit:', {
          flipH: editState.flipH,
          flipV: editState.flipV,
          firstSegmentAngle: editState.firstSegmentAngle,
          hasSplitLabelOffsets: !!templateData.splitLabelOffsets,
          hasSegmentAbsoluteAngles: !!templateData.segmentAbsoluteAngles
        });
      }
    } catch (error) {
      logger.warn('⚠️ Could not fetch template data, continuing without flip states:', error);
    }

    // Add edit flags for proper edit mode detection
    editState.isEdit = true;
    editState.isNewFromCanvas = false;
    editState.previousPage = props.currentPage || 'designers';

    // Remember which drawing was edited so we can scroll back to it
    localStorage.setItem(`scrollToDrawing_${mongoOrderId || orderId}`, templateId);
    // Navigate directly to Material Selection page instead of Drawing Canvas
    navigate(`/select-materials-simplified?templateId=${templateId}`, { state: editState, preventScrollReset: false });
  };

  // =============================================================================
  // HANDLE DELETE - Remove drawing template from order
  // =============================================================================
  // Deletes the current drawing template and its associated SWI jobs.
  // Steps:
  // 1. Confirm deletion with user
  // 2. Delete from SWI database (if has swiJobIds)
  // 3. Delete template from MongoDB
  // 4. Update local state and refresh drawings list
  // 5. Track deleted templates to prevent stale data showing
  // =============================================================================
  const handleDelete = async () => {
    if (!currentDrawingObj || isDeleteConfirmOpen) return;

    setIsDeleteConfirmOpen(true);
    try {
      // Step 1: Confirm deletion with user using swal.fire for better UI
      const result = await swal.fire({
        text: 'Delete this drawing and remove it from SWI database?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel'
      });
      if (!result.isConfirmed) {
        setIsDeleteConfirmOpen(false);
        return;
      }

      const templateIdToDelete = templateId || currentDrawingObj.templateId || currentDrawingObj._id;
      logger.debug('🗑️ DELETING TEMPLATE:', {
        templateId: templateIdToDelete,
        currentDrawingObj_id: currentDrawingObj._id,
        currentDrawingObj_templateId: currentDrawingObj.templateId,
        mongoOrderId: mongoIdFromProps || mongoOrderId || orderId
      });

      const deleteResponse = await axios.delete(`${API_BASE_URL}/api/templates/${templateIdToDelete}`);
      logger.debug('✅ DELETE RESPONSE:', {
        status: deleteResponse.status,
        data: deleteResponse.data,
        deletedId: templateIdToDelete
      });

      // Track deleted template in both sessionStorage and localStorage for persistence
      const deletedTemplatesKey = `deletedTemplates_${mongoIdFromProps || mongoOrderId || orderId}`;
      const deletedTemplates = JSON.parse(sessionStorage.getItem(deletedTemplatesKey) || '[]');
      if (!deletedTemplates.includes(templateIdToDelete)) {
        deletedTemplates.push(templateIdToDelete);
        sessionStorage.setItem(deletedTemplatesKey, JSON.stringify(deletedTemplates));
        localStorage.setItem(deletedTemplatesKey, JSON.stringify(deletedTemplates));
        logger.debug('Added to deleted templates list:', {
          key: deletedTemplatesKey,
          deletedList: deletedTemplates
        });
      }

      swal.fire({
        text: 'Drawing deleted successfully from database',
        icon: "success"
      });

      // Set flag to prevent re-fetching when switching tabs
      sessionStorage.setItem('justDeletedDrawing', 'true');

      // Update the drawing state to remove the deleted drawing
      setDrawing(prevDrawings => {
        if (Array.isArray(prevDrawings)) {
          const filtered = prevDrawings.filter(d => (d.templateId || d._id) !== templateIdToDelete);
          if (filtered.length > 0) {
            return filtered;
          } else {
            setError('No drawings available.');
            return null;
          }
        }
        setError('No drawings available.');
        return null;
      });

      setMaterialRows([]);

      // Clear the navigation state to prevent deleted drawing from reappearing on refresh
      navigate(location.pathname, { replace: true, state: {} });

      // Force clear any backend cache by calling a cache clear endpoint
      try {
        await axios.post(`${API_BASE_URL}/api/cache/clear`, {
          orderId: mongoIdFromProps || mongoOrderId || orderId,
          templateId: templateIdToDelete
        });
      } catch (cacheError) {
        // Ignore cache clear errors
      }

      // Don't re-fetch - just rely on the filtered state and sessionStorage tracking

    } catch (error) {
      swal.fire({
        text: 'Failed to delete drawing',
        icon: "error"
      });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  // Convert drawing to array if it's not already
  // For split tapers, expand each drawing into multiple split pieces
  const drawingsArray = useMemo(() => {
    if (!drawing) return [];
    const baseDrawings = Array.isArray(drawing) ? drawing : [drawing];
          logger.debug('Computing drawingsArray from drawing:', baseDrawings);

    // Don't expand split pieces - just show original with split indicator
    const expandedDrawings = baseDrawings;


    return expandedDrawings;
  }, [drawing]);

  const formatMeasurements = (drawing) => {
    if (drawing?.splitPiece) {
      return `F: ${Math.round(drawing.splitFar)} mm | N: ${Math.round(drawing.splitNear)} mm | B: ${getBendsFromTemplate(drawing)}`;
    }
    
    if (drawing?.isTaper) {
      const farGirth = Math.round(calculateDrawingGirth(drawing, drawing.farLengths));
      const nearGirth = Math.round(calculateDrawingGirth(drawing, drawing.nearLengths));
      return `F : ${farGirth} mm | N : ${nearGirth} mm | B: ${getBendsFromTemplate(drawing)}`;
    }
    
    const girth = Math.round(calculateDrawingGirth(drawing, drawing.lengths));
    return `G: ${girth} mm | B: ${getBendsFromTemplate(drawing)}`;
  };

  // Format quantity and length for material rows
  const formatQtyLength = (row) => {
    const qty = Number(row.qty || 0);
    const lengthMm = Number(row.length || 0);
    const perPieceM = lengthMm ? (lengthMm / 1000).toFixed(3) : '–';
    return `${qty} x ${perPieceM}`;
  };

  // Get tag for material row
  const getRowTag = (row, rowIndex, drawingObj) => {
    const swiJobId = drawingObj?.swiJobIds?.[rowIndex];
    if (swiJobId && swiShapeIdMap[swiJobId]) {
      return swiShapeIdMap[swiJobId];
    }
    return row?.tag || '–';
  };

  // Format measurements for split drawings
  const formatSplitMeasurements = (drawing, isTaper, farGirth, nearGirth) => {
    if (isTaper) {
      return `F: ${farGirth} mm | N : ${nearGirth} mm | B: ${getBendsFromTemplate(drawing)}`;
    }
    return `G: ${farGirth} mm | B: ${getBendsFromTemplate(drawing)}`;
  };

  // Calculate split quantity and length
  const calculateSplitQtyLength = (splitDrawing, materialRow, currentDrawingObj) => {
    // Get values from materialRows if available
    const splitInto = Number(materialRow?.splitInto || splitDrawing?.splitInto || 1);
    
    // Get the quantity - this might be total pieces after split or original pieces
    let quantity = Number(materialRow?.quantity || materialRow?.qty || 0);
    
    // The quantity shown should be the original number of pieces
    let originalPieces;
    if (quantity === splitInto) {
      // 1 piece split into N (e.g., 1 piece split into 2 = quantity 2)
      originalPieces = 1;
    } else if (quantity === splitInto * 2) {
      // 2 pieces split into N (e.g., 2 pieces split into 2 = quantity 4)
      originalPieces = 2;
    } else if (quantity % splitInto === 0) {
      // General case: divide by splitInto to get original
      originalPieces = quantity / splitInto;
    } else {
      // Fallback: quantity is already the original pieces
      originalPieces = quantity;
    }
    
    const totalLength = Number(
      materialRow?.length ||
      splitDrawing?.length ||
      splitDrawing?.splitLength ||
      currentDrawingObj?.splitLength ||
      0
    );
    
    // Calculate split values
    const splitQty = originalPieces;
    const splitLength = (totalLength / 1000).toFixed(3); // Length is already split, just convert mm to m
    
    return `${splitQty} x ${splitLength}`;
  };

  // Get tag for split drawing
  const getSplitTag = (currentDrawingObj, currentSplitIndex, swiShapeIdMap) => {
    // Get the SWI Job ID for this split
    const swiJobId = currentDrawingObj?.swiJobIds?.[currentSplitIndex] ||
                    currentDrawingObj?.swiJobIds?.[0];
    
    // Get the Shape ID (tag) from SWI database for this Job ID
    return swiShapeIdMap[swiJobId] || '–';
  };

  // Format lightbox measurements based on drawing type
  const formatLightboxMeasurements = (drawing) => {
    if (drawing?.splitPiece) {
      return `Far: ${Math.round(drawing.splitFar)} | Near: ${Math.round(drawing.splitNear)} | Bends: ${getBendsFromTemplate(drawing)}`;
    }
    
    if (drawing?.isTaper) {
      const farGirth = Math.round(calculateDrawingGirth(drawing, drawing.farLengths));
      const nearGirth = Math.round(calculateDrawingGirth(drawing, drawing.nearLengths));
      return `Far: ${farGirth} | Near: ${nearGirth} | Bends: ${getBendsFromTemplate(drawing)}`;
    }
    
    const girth = Math.round(calculateDrawingGirth(drawing, drawing.lengths));
    return `Girth: ${girth} | Bends: ${getBendsFromTemplate(drawing)}`;
  };

  // Get tag for lightbox table row
  const getLightboxTag = (row, rowIndex, drawing, swiShapeIdMap) => {
    // For split pieces, use the split piece index, not rowIndex
    const jobIdIndex = drawing?.splitPiece ? drawing.splitPiece - 1 : rowIndex;
    const swiJobId = drawing?.swiJobIds?.[jobIdIndex];
    
    if (swiJobId && swiShapeIdMap[swiJobId]) {
      return swiShapeIdMap[swiJobId];
    }
    
    return row?.tag || '–';
  };

  // Debug logging for status visibility
  const hasSwiJobs = drawingsArray.some(d => d?.swiJobIds?.length > 0);
  const hasStatusData = Object.keys(swiStatusMap).length > 0;

  // =============================================================================
  // MAIN RENDER SECTION
  // =============================================================================
  // Renders the Drawing Details Tab with the following structure:
  //
  // LAYOUT STRUCTURE:
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SWI Status Summary (top-right) - Shows active/deleted/error counts
  // 2. Loading/Error States - Displays loading spinner or error message
  // 3. Empty State - Shows "No Data Found" when no drawings
  // 4. Drawing Grid (Row/Col layout):
  //    - For each drawing:
  //      a. If split taper: Expand into individual split pieces
  //      b. If non-split: Render single card with drawing preview
  //    - Each card contains:
  //      - Material info header (material, thickness, girth, bends, color)
  //      - Qty/Length table
  //      - Drawing preview (using renderPreview function)
  //      - Action buttons (Edit, Delete, Re-push if deleted)
  //      - SWI status indicators
  // 5. Lightbox Modal - Full-screen view when double-clicking a drawing
  // =============================================================================
  return (
    <MyDiv
      className="GeneralTable mt-3"
      style={{
        border: 'none',
        borderBottom: 'none',
        overflow: 'hidden' // Prevent any scrollbar flash
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1: SWI Status Summary
          Shows counts of active, deleted, and error status jobs
          ═══════════════════════════════════════════════════════════════════════ */}
      {drawingsArray.length > 0 && hasSwiJobs && hasStatusData && (
        <div style={{ 
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '15px',
          marginBottom: '15px',
          fontSize: '13px'
        }}>
          <span style={{ color: '#10b981', fontWeight: '500' }}>
            <FaCheckCircle style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {Object.values(swiStatusMap).filter(s => s === 'active').length} Active
          </span>
          <span style={{ color: '#ef4444', fontWeight: '500' }}>
            <FaTimesCircle style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {Object.values(swiStatusMap).filter(s => s === 'deleted').length} Deleted
          </span>
          {Object.values(swiStatusMap).filter(s => s === 'error').length > 0 && (
            <span style={{ color: '#f59e0b', fontWeight: '500' }}>
              <FaExclamationTriangle style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              {Object.values(swiStatusMap).filter(s => s === 'error').length} Error
            </span>
          )}
        </div>
      )}
      
      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2: Loading and Error States
          ═══════════════════════════════════════════════════════════════════════ */}
      {loading && <p>Loading…</p>}
      {error && <p className="text-danger">{error}</p>}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3: Empty State
          ═══════════════════════════════════════════════════════════════════════ */}
      {!loading && !error && drawingsArray.length === 0 && (
        <Card className="p-4">
          <p className="text-muted">No Data Found</p>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4: Drawing Grid (Masonry Layout)
          Renders all drawings in a responsive masonry-style layout.
          - Uses CSS columns for automatic height-based positioning
          - Cards fill available space without wasted vertical gaps
          - Split taper drawings: Expanded into individual cards per split piece
          - Non-split drawings: Single card with full drawing preview
          ═══════════════════════════════════════════════════════════════════════ */}
      {(() => {
        return (
          <Row>
            {/* Iterate through all drawings maintaining their order */}
            {drawingsArray.map((drawing, drawingIndex) => {
              // Determine if this is a split taper drawing
              const splitFromRows = drawing?.materialRows?.[0]?.splitInto;
              const splitInto = Number(splitFromRows || drawing?.splitInto || 1);
              // CRITICAL: Only show split cards for TAPER drawings, not normal drawings
              // Only trust the isTaper flag - don't check farLengths/nearLengths existence
              const isTaper = drawing.isTaper === true;
              const isSplitDrawing = splitInto > 1 && isTaper;

              // Render split drawings in merged cards (ONLY for taper drawings)
              if (isSplitDrawing) {
                const splitDrawing = drawing;

                // Check if any Job IDs are deleted for split drawings
                const hasDeletedJobsSplit = splitDrawing?.swiJobIds?.some(id => swiStatusMap[id] === 'deleted');

                // Dynamic layout - always max 2 per row
                const splitsPerRow = 2;
                const rowsNeeded = Math.ceil(splitInto / 2);

                // Calculate dynamic height based on girth and aspect ratio (matches splitPreviewGenerator.js)
                let dynamicImageHeight = 400; // Default for split drawings
                try {
                  const lengths = splitDrawing?.farLengths || splitDrawing?.lengths || [];
                  const angles = splitDrawing?.angles || splitDrawing?.farAngles || [];
                  const direction = splitDrawing?.direction || 'Right';
                  const firstSegmentAngle = splitDrawing?.firstSegmentAngle;

                  if (lengths.length > 0) {
                    // Calculate actual drawing dimensions to check aspect ratio
                    const points = calculatePoints(
                      lengths.map(Number),
                      angles,
                      direction,
                      [],
                      [],
                      false,
                      { x: 0, y: 0 },
                      firstSegmentAngle,
                      null, 0, null, 0
                    );

                    let isWideDrawing = false;
                    if (points && points.length > 0) {
                      const xs = points.map(p => p.x);
                      const ys = points.map(p => p.y);
                      const drawingWidth = Math.max(...xs) - Math.min(...xs);
                      const drawingHeight = Math.max(...ys) - Math.min(...ys);
                      // Only consider "wide" if width is significantly greater than height (ratio > 2)
                      const aspectRatio = drawingHeight > 0 ? drawingWidth / drawingHeight : 1;
                      isWideDrawing = aspectRatio > 2;
                    }

                    const girth = lengths.reduce((sum, len) => sum + (Number(len) || 0), 0);
                    const segmentCount = lengths.length;

                    if (isWideDrawing) {
                      // WIDE drawings - compact heights (matches splitPreviewGenerator.js)
                      if (girth <= 500) {
                        dynamicImageHeight = 300; // Small/medium wide
                      } else if (girth <= 1000) {
                        dynamicImageHeight = 350; // Large wide
                      } else {
                        dynamicImageHeight = 400; // Very large wide
                      }
                    } else {
                      // TALL drawings - use girth + segment count
                      if (girth <= 250) {
                        dynamicImageHeight = 400; // Small parts
                      } else if (girth <= 500) {
                        dynamicImageHeight = 450; // Medium parts
                      } else if (girth <= 1000) {
                        dynamicImageHeight = 500; // Large parts
                      } else {
                        if (segmentCount > 10) {
                          dynamicImageHeight = 900; // Complex large drawings
                        } else if (segmentCount > 5) {
                          dynamicImageHeight = 700; // Medium complex large drawings
                        } else {
                          dynamicImageHeight = 500; // Simple large drawings
                        }
                      }
                    }
                  }
                } catch (error) {
                  // Fallback to default height on error
                }
                const dynamicCardHeight = (dynamicImageHeight * 2) + 250; // FAR + NEAR + headers/padding

                return (
                  <Col md={12} key={`split-${drawingIndex}`} className="mb-3" data-drawing-index={drawingIndex}>
                    <Card
                      className="p-2"
                      style={{ width: '100%', display: 'flex', flexDirection: 'column', minHeight: `${dynamicCardHeight}px`, overflow: 'visible' }}
                    >
                      <div
                        style={{ flex: '1', cursor: 'pointer' }}
                        onDoubleClick={() => openLightbox(drawingIndex)}
                      >
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          width: '100%',
                          overflow: 'visible'
                        }}>
                          {(() => {
                            // Check if we need to generate split previews
                            const actualTemplateId = splitDrawing?.templateId || splitDrawing?._id;
                            const previewKey = `${actualTemplateId}_${splitInto}`;
                            const currentSplitPreviews = splitPreviews[previewKey];


                            // Trigger preview generation outside of render
                            if (actualTemplateId && !currentSplitPreviews && !splitPreviews[`${previewKey}_loading`]) {
                              // Mark as loading to prevent multiple requests
                              setSplitPreviews(prev => ({
                                ...prev,
                                [`${previewKey}_loading`]: true
                              }));

                              generateSplitPreviews(actualTemplateId, splitInto).then(previews => {
                                if (previews) {
                                  setSplitPreviews(prev => ({
                                    ...prev,
                                    [previewKey]: previews,
                                    [`${previewKey}_loading`]: false
                                  }));
                                }
                              });
                            }

                            // Create rows based on layout
                            const rows = [];
                            let currentStartIndex = 0;

                            for (let rowIndex = 0; rowIndex < rowsNeeded && currentStartIndex < splitInto; rowIndex++) {
                              // Calculate how many splits in this row (max 2, or remaining if less)
                              const splitsInThisRow = Math.min(splitsPerRow, splitInto - currentStartIndex);
                              
                              const rowStartIndex = currentStartIndex;

                              rows.push(
                                <div key={`row-${rowIndex}`} style={{
                                  display: 'flex',
                                  gap: '3px',
                                  alignItems: 'stretch',
                                  justifyContent: splitsInThisRow < splitsPerRow ? 'center' : 'flex-start',
                                  width: '100%',
                                  overflow: 'visible'
                                }}>
                                  {Array.from({ length: splitsInThisRow }, (_, splitOffset) => {
                                    const currentSplitIndex = rowStartIndex + splitOffset;
                                    // Get split preview for current index
                                    const splitPreview = currentSplitPreviews?.[currentSplitIndex];
                                    const splitPreviewFar = splitPreview?.farImage;
                                    const splitPreviewNear = splitPreview?.nearImage;

                                    return (
                                      <React.Fragment key={`split-${currentSplitIndex}`}>
                                        <div style={{ flex: '1 1 0', padding: '2px', minWidth: 0, overflow: 'visible' }}>
                                          {/* Header for this split */}
                                          <div style={{
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            color: '#000000',
                                            textAlign: 'center',
                                            marginBottom: '10px',
                                            borderBottom: '2px solid #e2e8f0',
                                            paddingBottom: '5px'
                                          }}>
                                            SPLIT {currentSplitIndex + 1}
                                          </div>

                                          {/* Render this specific split drawing */}
                                          {(() => {
                                            const currentDrawing = splitDrawing;
                                            const currentDrawingObj = {
                                              ...currentDrawing,
                                              splitPreviewFar: splitPreviewFar,
                                              splitPreviewNear: splitPreviewNear
                                            };
                                            const isTaper = currentDrawingObj.farLengths && currentDrawingObj.nearLengths;

                                            // Calculate dimensions for this split piece
                                            let farGirth, nearGirth;
                                            let splitFarLengths, splitNearLengths; // Individual segment dimensions for this split

                                            if (isTaper) {
                                              const originalFarLengths = currentDrawingObj.farLengths || [];
                                              const originalNearLengths = currentDrawingObj.nearLengths || [];
                                              // Use getGirth to include fold lengths
                                              const originalFarGirth = getGirth(
                                                originalFarLengths,
                                                currentDrawingObj.startFoldType,
                                                currentDrawingObj.startFoldLength || 0,
                                                currentDrawingObj.endFoldType,
                                                currentDrawingObj.endFoldLength || 0
                                              );
                                              const originalNearGirth = getGirth(
                                                originalNearLengths,
                                                currentDrawingObj.startFoldType,
                                                currentDrawingObj.startFoldLength || 0,
                                                currentDrawingObj.endFoldType,
                                                currentDrawingObj.endFoldLength || 0
                                              );

                                              // Debug logging
                                              if (currentSplitIndex === 0) {
                                              }

                                              // Calculate progressive dimensions for each segment
                                              splitFarLengths = [];
                                              splitNearLengths = [];

                                              for (let i = 0; i < originalFarLengths.length; i++) {
                                                const farLen = parseFloat(originalFarLengths[i]) || 0;
                                                const nearLen = parseFloat(originalNearLengths[i]) || 0;
                                                const segmentDiff = nearLen - farLen;
                                                const segmentStep = segmentDiff / splitInto;

                                                // Calculate this segment's dimensions for this split piece
                                                const splitFarLen = farLen + (segmentStep * currentSplitIndex);
                                                const splitNearLen = farLen + (segmentStep * (currentSplitIndex + 1));

                                                splitFarLengths.push(Math.round(splitFarLen));
                                                splitNearLengths.push(Math.round(splitNearLen));
                                              }

                                              // Calculate total girths for display including fold lengths
                                              farGirth = getGirth(
                                                splitFarLengths,
                                                currentDrawingObj.startFoldType,
                                                currentDrawingObj.startFoldLength || 0,
                                                currentDrawingObj.endFoldType,
                                                currentDrawingObj.endFoldLength || 0
                                              );
                                              nearGirth = getGirth(
                                                splitNearLengths,
                                                currentDrawingObj.startFoldType,
                                                currentDrawingObj.startFoldLength || 0,
                                                currentDrawingObj.endFoldType,
                                                currentDrawingObj.endFoldLength || 0
                                              );
                                            } else {
                                              // Non-taper drawing - same dimensions for all splits, including fold lengths
                                              farGirth = getGirth(
                                                currentDrawingObj.lengths || [],
                                                currentDrawingObj.startFoldType,
                                                currentDrawingObj.startFoldLength || 0,
                                                currentDrawingObj.endFoldType,
                                                currentDrawingObj.endFoldLength || 0
                                              );
                                              nearGirth = farGirth;
                                            }

                                            return (
                                              <div>
                                                {/* Header with material info and table */}
                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    flexDirection: 'row',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'start',
                                                    gap: '5px',
                                                    marginBottom: '8px',
                                                    width: '100%',
                                                  }}
                                                >
                                                  {/* Left: Material info and measurements */}
                                                  <div 
                                                    style={{ 
                                                      padding: '4px 8px',
                                                      fontSize: '18px',
                                                      fontWeight: 'bold',
                                                      verticalAlign: 'middle',
                                                      border: 'none',
                                                    }}
                                                  >
                                                    {formatSplitMeasurements(currentDrawingObj, isTaper, farGirth, nearGirth)}
                                                  </div>

                                                  {/* Center: Color (if any) */}
                                                  {currentDrawingObj.color && (
                                                    <div
                                                      style={{
                                                        textAlign: 'center',
                                                        fontSize: '32px',
                                                        fontWeight: 'bold',
                                                        color: '#2c3e50',
                                                      }}
                                                    >
                                                      {currentDrawingObj.color.toUpperCase()}
                                                    </div>
                                                  )}

                                                  {/* Right: Qty/Len/Tag Table */}
                                                  <div>
                                                    <Table size="sm" bordered className="text-center mb-0">
                                                      <thead>
                                                        <tr style={{ lineHeight: '1' }}>
                                                          <th style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: '22px' }}>Qty/Len</th>
                                                          <th style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: '18px', backgroundColor: '#fa8585' }}>
                                                            Tag
                                                          </th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        <tr style={{ lineHeight: '1' }}>
                                                          <td style={{ padding: '3px 8px', fontWeight: 'bold', fontSize: '22px' }}>
                                                            {calculateSplitQtyLength(splitDrawing, splitDrawing?.materialRows?.[0], currentDrawingObj)}
                                                          </td>
                                                          <td style={{ padding: '3px 8px', fontWeight: 'bold', fontSize: '18px', backgroundColor: '#fa8585' }}>
                                                            {getSplitTag(currentDrawingObj, currentSplitIndex, swiShapeIdMap)}
                                                          </td>
                                                        </tr>
                                                      </tbody>
                                                    </Table>
                                                  </div>
                                                </div>
                                                {/* Split piece visualization */}
                                                <div style={{
                                                  padding: '20px',
                                                  overflow: 'visible'
                                                }}>

                                                  {/* FAR side of this split piece */}
                                                  <div>
                                                    {/* Use dynamically generated split preview or fallback to original */}
                                                    <div style={{ position: 'relative', overflow: 'visible' }}>
                                                      <div className="far-watermark">FAR</div>
                                                      {currentDrawingObj.splitPreviewFar ?
                                                        <img
                                                          src={getImageUrl(currentDrawingObj.splitPreviewFar)}
                                                          alt="Far"
                                                          style={{
                                                            width: '100%',
                                                            height: `${dynamicImageHeight}px`,
                                                            objectFit: 'contain',
                                                            objectPosition: 'center',
                                                            position: 'relative',
                                                            zIndex: 2
                                                          }}
                                                        />
                                                        : (
                                                          <div
                                                            className="template-preview-image"
                                                            style={{
                                                              width: '100%',
                                                              height: `${dynamicImageHeight}px`,
                                                              display: 'flex',
                                                              alignItems: 'center',
                                                              justifyContent: 'center',
                                                              backgroundColor: 'transparent',
                                                              maxWidth: '100%',
                                                              position: 'relative',
                                                              zIndex: 2
                                                            }}
                                                          >
                                                            <FiLoader className="spin" size={24} style={{ animation: 'spin 1s linear infinite' }} />
                                                          </div>
                                                        )
                                                      }
                                                    </div>
                                                  </div>

                                                  {/* NEAR side of this split piece */}
                                                  {isTaper && (
                                                    <div>
                                                      {/* Use dynamically generated split preview or fallback to canvas */}
                                                      <div style={{ position: 'relative', overflow: 'visible' }}>
                                                        <div className="near-watermark">NEAR</div>
                                                        {currentDrawingObj.splitPreviewNear ? (
                                                          <img
                                                            src={getImageUrl(currentDrawingObj.splitPreviewNear)}
                                                            alt="Near"
                                                            style={{
                                                              width: '100%',
                                                              height: `${dynamicImageHeight}px`,
                                                              objectFit: 'contain',
                                                              objectPosition: 'center',
                                                              position: 'relative',
                                                              zIndex: 2
                                                            }}
                                                          />
                                                        ) : (
                                                          <div
                                                            className="template-preview-image"
                                                            style={{
                                                              width: '100%',
                                                              height: `${dynamicImageHeight}px`,
                                                              display: 'flex',
                                                              alignItems: 'center',
                                                              justifyContent: 'center',
                                                              backgroundColor: 'transparent',
                                                              maxWidth: '100%',
                                                              position: 'relative',
                                                              zIndex: 2
                                                            }}
                                                          >
                                                            <FiLoader className="spin" size={24} style={{ animation: 'spin 1s linear infinite' }} />
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>

                                        {/* Add vertical "SPLIT INTO X" text between sections in same row */}
                                        {splitOffset < splitsInThisRow - 1 && (
                                          <div style={{
                                            display: 'flex',
                                            alignItems: 'stretch',
                                            justifyContent: 'center',
                                            padding: '0 15px',
                                            alignSelf: 'stretch'
                                          }}>
                                            <div style={{
                                              display: 'flex',
                                              flexDirection: 'column',
                                              alignItems: 'center',
                                              justifyContent: 'space-evenly',
                                              fontSize: '20px',
                                              fontWeight: 'bold',
                                              color: '#000000',
                                              letterSpacing: '4px',
                                              gap: '10px',
                                              background: 'linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%)',
                                              padding: '30px 10px',
                                              borderRadius: '8px',
                                              width: '100%',
                                              height: '100%'
                                            }}>
                                              {`SPLIT INTO ${splitInto}`.split('').map((char, charIndex) => (
                                                <span key={charIndex} style={{ lineHeight: '1' }}>
                                                  {char === ' ' ? '\u00A0' : char}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </div>
                              );

                              // Update currentStartIndex for next row
                              currentStartIndex += splitsInThisRow;
                            }

                            return rows;
                          })()}
                        </div>
                      </div>

                      {/* Warning message for deleted jobs - above buttons */}
                      {hasDeletedJobsSplit && (
                        <div style={{
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          margin: '0 10px 10px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <FaExclamationTriangle style={{ color: '#dc2626', fontSize: '14px' }} />
                          <span style={{ color: '#991b1b', fontSize: '12px', fontWeight: '500' }}>
                            This job was removed from SWI database
                          </span>
                        </div>
                      )}
                      
                      {/* Edit and Delete buttons for split cards */}
                      <div
                        style={{
                          display: 'flex',
                          gap: '10px',
                          padding: '10px',
                          borderTop: '1px solid #e2e8f0',
                          justifyContent: 'flex-end',
                          position: 'relative',
                          // zIndex: 1000,
                          backgroundColor: '#ffffff',
                          pointerEvents: 'auto'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="outline-primary"
                          size="sm"
                          disabled={hasDeletedJobsSplit || !showEditDelete}
                          title={hasDeletedJobsSplit ? "Cannot edit - job deleted from SWI. Please re-push first." : ""}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const editTemplateId = splitDrawing?.templateId || splitDrawing?._id;
                            if (!editTemplateId) {
          logger.error('No template ID found for editing', splitDrawing);
                              return;
                            }

                            // Pass the entire drawing object as state like normal edit does
                            // Note: customerId and customerName are already included from getDrawingsByOrderId API
                            let editState = { ...splitDrawing };

                            // Add necessary fields if not present
                            // Use mongoOrderId (MongoDB _id) for navigation, with orderId as fallback
                            editState.orderId = editState.orderId || mongoOrderId || mongoIdFromProps || orderId;
                            editState.mongoId = editState.mongoId || editState._id;

                            // Fetch full template data to get splitLabelOffsets and other fields
                            try {
                              const templateRes = await axios.get(`${API_BASE_URL}/api/templates/${editTemplateId}`);
                              const templateData = templateRes.data?.data || templateRes.data;
                              if (templateData) {
                                editState.flipH = templateData.flipH || false;
                                editState.flipV = templateData.flipV || false;
                                editState.firstSegmentAngle = templateData.firstSegmentAngle;
                                editState.labelOffsets = templateData.labelOffsets;
                                editState.splitLabelOffsets = templateData.splitLabelOffsets;
                                // CRITICAL: Pass segmentAbsoluteAngles for correct SSF fold orientation
                                editState.segmentAbsoluteAngles = templateData.segmentAbsoluteAngles || [];
                                // CRITICAL: Pass fold gap values for SSF fold display
                                editState.startFoldGap = templateData.startFoldGap || 0;
                                editState.endFoldGap = templateData.endFoldGap || 0;
                              }
                            } catch (error) {
                              console.warn('Could not fetch template data for split drawing edit:', error);
                            }

                            // Add edit flags for proper edit mode detection
                            editState.isEdit = true;
                            editState.isNewFromCanvas = false;
                            editState.previousPage = props.currentPage || 'designers';
                            editState.orderId = editState.orderId || mongoOrderId || mongoIdFromProps || orderId;
                            editState.orderNumber = orderId

                            // Remember which drawing was edited so we can scroll back to it
                            localStorage.setItem(`scrollToDrawing_${mongoOrderId || orderId}`, editTemplateId);
                            // Navigate directly to Material Selection page instead of Drawing Canvas
                            navigate(`/select-materials-simplified?templateId=${editTemplateId}`, { state: editState, preventScrollReset: false });
                          }}
                        >
                          <FaPencilAlt /> Edit
                        </Button>
                        {/* Re-push button for deleted jobs in split drawings */}
                        {(hasDeletedJobsSplit && RolePermission?.RepushToSWI?.edit === "1") && (
                          <Button
                            variant="outline-success"
                            size="sm"
                            disabled = {!showEditDelete}
                            onClick={async () => {
                              // Find which Job IDs are deleted
                              const deletedJobs = [];
                              splitDrawing?.swiJobIds?.forEach((id, index) => {
                                if (swiStatusMap[id] === 'deleted') {
                                  deletedJobs.push({ id, index });
                                }
                              });

                              if (deletedJobs.length === 0) return;

                              const confirmed = await confirmActionAsync(`Re-push ${deletedJobs.length} deleted job(s) to SWI?`);
                              if (!confirmed) return;

                              try {
                                const API_TOKEN = tokenManager.getToken();
                                // Use unified repush API for consistency with insert/update
                                const response = await fetch(`${API_BASE_URL}/api/templates/unified/repush`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${API_TOKEN}`
                                  },
                                  body: JSON.stringify({
                                    templateId: splitDrawing.templateId,
                                    rowIndices: deletedJobs.map(j => j.index),
                                    orderNumber: orderId,
                                    customerName: splitDrawing.customerName || localStorage.getItem('customerName'),
                                    customerPoNumber: orderData?.order_customer_PO_number,
                                    deliveryDate: orderData?.order_delivery_date_str || orderData?.order_delivery_date,
                                    enteredDate: orderData?.created_str || orderData?.created,
                                    enteredBy: localStorage.getItem('userId') // Add logged-in user ID
                                  })
                                });

                                if (!response.ok) {
                                  throw new Error(`Server responded with ${response.status}`);
                                }

                                const data = await response.json();
                                if (data.success) {
                                  swal.fire({
                                    text: 'Successfully re-pushed to SWI',
                                    icon: "success",
                                    type: "success",
                                    timer: 1500
                                  });

                                  // Refresh page after successful repush to update UI state
                                  setTimeout(() => {
                                    window.location.reload();
                                  }, 1600);
                                } else {
                                  swal.fire({
                                    titile: 'Error',
                                    text: data.message || 'Failed to re-push to SWI',
                                    icon: 'error',
                                  })
                                }
                              } catch (error) {
          // logger.error('Re-push error:', error);
                                swal.fire({
                                  titile: 'Error',
                                  text: 'Failed to re-push to SWI',
                                  icon: 'error',
                                })
                              }
                            }}
                          >
                            Re-push to SWI
                          </Button>
                        )}
                        <Button
                          variant="outline-danger"
                          size="sm"
                          disabled={!showEditDelete || isDeleteConfirmOpen}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!splitDrawing || isDeleteConfirmOpen) return;

                            setIsDeleteConfirmOpen(true);
                            try {
                              // Use swal.fire for better UI
                              const result = await swal.fire({
                                text: 'Delete this drawing and remove it from SWI database?',
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonColor: '#dc3545',
                                cancelButtonColor: '#6c757d',
                                confirmButtonText: 'Delete',
                                cancelButtonText: 'Cancel'
                              });
                              if (!result.isConfirmed) {
                                setIsDeleteConfirmOpen(false);
                                return;
                              }

                              const templateIdToDelete = splitDrawing?.templateId || splitDrawing?._id;
                              await axios.delete(`${API_BASE_URL}/api/templates/${templateIdToDelete}`);

                              // Track deleted template in both sessionStorage and localStorage for persistence
                              const deletedTemplatesKey = `deletedTemplates_${mongoIdFromProps || mongoOrderId || orderId}`;
                              const deletedTemplates = JSON.parse(sessionStorage.getItem(deletedTemplatesKey) || '[]');
                              if (!deletedTemplates.includes(templateIdToDelete)) {
                                deletedTemplates.push(templateIdToDelete);
                                sessionStorage.setItem(deletedTemplatesKey, JSON.stringify(deletedTemplates));
                                localStorage.setItem(deletedTemplatesKey, JSON.stringify(deletedTemplates));
                              }
                              props.onDesignDelete()

                              // Set flag to prevent re-fetching when switching tabs
                              sessionStorage.setItem('justDeletedDrawing', 'true');

                              // Update the drawings state to remove the deleted drawing
                              setDrawing(prevDrawings => {
                                if (Array.isArray(prevDrawings)) {
                                  return prevDrawings.filter(d => (d.templateId || d._id) !== templateIdToDelete);
                                }
                                return null;
                              });
                            } catch (error) {
                              // logger.error('Delete error:', error);
                              swal.fire({
                                text: 'Failed to delete drawing',
                                icon: "error"
                              })
                            } finally {
                              setIsDeleteConfirmOpen(false);
                            }
                          }}
                        >
                          <FaTrash /> Delete
                        </Button>
                      </div>
                    </Card>
                  </Col>
                );
              } else {
                // Render normal drawing
                const currentDrawing = drawing;
                const index = drawingIndex;
                // Use currentDrawing for this iteration
                const currentDrawingObj = currentDrawing;
                const currentTemplateId = currentDrawingObj?.templateId || currentDrawingObj?._id || null;

                // Get material rows for this specific drawing
                const currentMaterialRows = Array.isArray(currentDrawingObj?.materialRows)
                  ? currentDrawingObj.materialRows
                  : [];

                // Check if we have materialRows array from backend
                const baseRowsToDisplay = currentDrawingObj?.materialRows && Array.isArray(currentDrawingObj.materialRows)
                  ? currentDrawingObj.materialRows
                  : [{
                    qty: currentDrawingObj?.qty ?? 0,
                    length: currentDrawingObj?.length ?? null,
                    tag: (currentDrawingObj?.tag || '').trim(),
                    unitPrice: currentDrawingObj?.unitPrice ?? null,
                    splitInto: currentDrawingObj?.splitInto ?? 1
                  }];

                // Expand split rows into individual rows for display
                const rowsToDisplay = [];
                baseRowsToDisplay.forEach(row => {
                  const splitInto = Number(row.splitInto || 1);
                  if (splitInto > 1) {
                    // Create individual rows for each split piece
                    const basePieces = Number(row.qty || 0) / splitInto;
                    const lengthMm = Number(row.length || 0);
                    for (let i = 0; i < splitInto; i++) {
                      rowsToDisplay.push({
                        qty: basePieces,
                        length: lengthMm,
                        tag: row.tag,
                        unitPrice: row.unitPrice
                      });
                    }
                  } else {
                    rowsToDisplay.push(row);
                  }
                });

                // Keep currentPrimaryRow for backward compatibility with other parts of the code
                const currentPrimaryRow = {
                  quantity: baseRowsToDisplay[0]?.qty ?? 0,
                  length: baseRowsToDisplay[0]?.length ?? null,
                  tag: (baseRowsToDisplay[0]?.tag || '').trim(),
                  unitPrice: baseRowsToDisplay[0]?.unitPrice ?? null,
                  splitInto: baseRowsToDisplay[0]?.splitInto ?? 1,
                  material: currentDrawingObj?.material,
                  color: currentDrawingObj?.color
                };

                const formatQtyLen = (row) => {
                  if (!row) return '–';
                  const pieces = Number(row.qty || 0);
                  const lengthMm = Number(row.length || 0);
                  const perPieceM = lengthMm ? (lengthMm / 1000).toFixed(3) : null;
                  return `${pieces || 0} * ${perPieceM || '–'}`;
                };

                // Keep old function for backward compatibility
                const formatCurrentQtyLen = () => formatQtyLen(rowsToDisplay[0]);

                // Check if any Job IDs are deleted
                const hasDeletedJobs = currentDrawingObj?.swiJobIds?.some(id => swiStatusMap[id] === 'deleted');

                // =============================================================================
                // MAIN PAGE - DYNAMIC HEIGHT CALCULATION FOR NON-SPLIT DRAWINGS
                // =============================================================================
                // GIRTH-BASED HEIGHT CALCULATION with ASPECT RATIO check
                // =============================================================================
                let nonSplitDynamicHeight = 700; // Default height
                let nonSplitDynamicWidth = 1250; // Default width
                try {
                  const drawingLengths = currentDrawingObj?.isTaper
                    ? (currentDrawingObj?.farLengths || currentDrawingObj?.lengths || [])
                    : (currentDrawingObj?.lengths || []);
                  const drawingAngles = currentDrawingObj?.angles || [];
                  const drawingDirection = currentDrawingObj?.direction || 'Right';
                  const drawingFirstSegmentAngle = currentDrawingObj?.firstSegmentAngle;

                  if (drawingLengths.length > 0) {
                    // Calculate actual drawing dimensions to check aspect ratio
                    const points = calculatePoints(
                      drawingLengths.map(Number),
                      drawingAngles,
                      drawingDirection,
                      [],
                      [],
                      false,
                      { x: 0, y: 0 },
                      drawingFirstSegmentAngle,
                      null, 0, null, 0
                    );

                    let isWideDrawing = false;
                    if (points && points.length > 0) {
                      const xs = points.map(p => p.x);
                      const ys = points.map(p => p.y);
                      const dWidth = Math.max(...xs) - Math.min(...xs);
                      const dHeight = Math.max(...ys) - Math.min(...ys);
                      // Only consider "wide" if width is significantly greater than height (ratio > 2)
                      // This prevents diagonal step drawings from being classified as wide
                      const aspectRatio = dHeight > 0 ? dWidth / dHeight : 1;
                      isWideDrawing = aspectRatio > 2;
                    }

                    const girth = drawingLengths.reduce((sum, len) => sum + (Number(len) || 0), 0);
                    const segmentCount = drawingLengths.length;

                    if (isWideDrawing) {
                      // WIDE drawings - use smaller heights
                      if (girth <= 500) {
                        nonSplitDynamicHeight = 450; // Small/medium wide
                      } else if (girth <= 1000) {
                        nonSplitDynamicHeight = 500; // Large wide
                      } else {
                        nonSplitDynamicHeight = 550; // Very large wide
                      }
                    } else {
                      // TALL drawings - use girth + segment count
                      if (girth <= 250) {
                        nonSplitDynamicHeight = 600; // Small parts
                      } else if (girth <= 500) {
                        nonSplitDynamicHeight = 700; // Medium parts
                      } else if (girth <= 1000) {
                        // For drawings with many bends (like Monument), increase height
                        if (segmentCount > 10) {
                          nonSplitDynamicHeight = 1100; // Complex large parts (16+ bends)
                        } else {
                          nonSplitDynamicHeight = 800; // Simple large parts
                        }
                      } else {
                        if (segmentCount > 10) {
                          nonSplitDynamicHeight = 1500; // Complex very large drawings
                        } else if (segmentCount > 5) {
                          nonSplitDynamicHeight = 1100; // Medium complex very large drawings
                        } else {
                          nonSplitDynamicHeight = 800; // Simple very large drawings
                        }
                      }
                    }
                  }
                } catch (error) {
                  // FALLBACK: On calculation error, use default height (700px)
                }
                // =============================================================================

                return (
                  <Col md={6} key={currentDrawingObj?.id || currentDrawingObj?._id || index} className="mb-3" data-drawing-index={index}>                    
                    <Card
                      className="p-2"
                      style={{ display: 'flex', flexDirection: 'column', overflow: 'visible', minHeight: 'auto' }}
                    >
                        <div
                          style={{ flex: '1', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
                          onDoubleClick={() => openLightbox(index)}
                        >
                          {/* Header with material info and table */}
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'start',
                              gap: '5px',
                              marginBottom: '5px',
                              width: '100%',
                            }}
                          >
                            {/* Left: Material info and measurements */}
                            <div 
                              style={{ 
                                  padding: '4px 8px',
                                  fontSize: '18px',
                                  fontWeight: 'bold',
                                  verticalAlign: 'middle',
                                  border: 'none',
                                }}>
                              {formatMeasurements(currentDrawingObj)}
                            </div>

                            {/* Center: Color (if any) */}
                            {currentDrawingObj.color && (
                              <div
                                style={{
                                  textAlign: 'center',
                                  fontSize: '32px',
                                  fontWeight: 'bold',
                                  color: '#2c3e50',
                                }}
                              >
                                {currentDrawingObj.color.toUpperCase()}
                              </div>
                            )}

                            {/* Right: Qty/Len/Tag Table */}
                            <div>
                              <Table size="sm" bordered className="text-center mb-0">
                                <thead>
                                  <tr style={{ lineHeight: '1' }}>
                                    <th style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: '22px' }}>Qty/Len</th>
                                    <th style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: '18px', backgroundColor: '#fa8585' }}>
                                      Tag
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {baseRowsToDisplay.map((row, rowIndex) => (
                                    <tr key={rowIndex} style={{ lineHeight: '1' }}>
                                      <td style={{ padding: '3px 8px', fontWeight: 'bold', fontSize: '22px' }}>
                                        {formatQtyLength(row)}
                                      </td>
                                      <td style={{ padding: '3px 8px', fontWeight: 'bold', fontSize: '18px', backgroundColor: '#fa8585', wordWrap: 'break-word' }}>
                                        {getRowTag(row, rowIndex, currentDrawingObj)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            </div>
                          </div>
                          {/* Toggle button for original drawing - now available for all split scenarios */}
                          {/* TEMPORARILY COMMENTED OUT - Show Original Drawing Button
                {(currentPrimaryRow?.splitInto > 1 || currentDrawingObj?.splitPiece) && (
                    <button
                      onClick={() => {
                        const key = currentDrawingObj._id || currentDrawingObj.id || index;
                        setShowOriginalDrawing(prev => ({
                          ...prev,
                          [key]: !prev[key]
                        }));
                      }}
                      style={{
                        marginTop: '10px',
                        padding: '8px 16px',
                        fontSize: '13px',
                        fontWeight: '600',
                        border: showOriginalDrawing[currentDrawingObj._id || currentDrawingObj.id || index]
                          ? '2px solid #3b82f6'
                          : '2px solid #cbd5e1',
                        borderRadius: '20px',
                        background: showOriginalDrawing[currentDrawingObj._id || currentDrawingObj.id || index] 
                          ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                          : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                        color: showOriginalDrawing[currentDrawingObj._id || currentDrawingObj.id || index]
                          ? '#ffffff'
                          : '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        width: 'fit-content',
                        boxShadow: showOriginalDrawing[currentDrawingObj._id || currentDrawingObj.id || index]
                          ? '0 4px 12px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                          : '0 2px 6px rgba(0, 0, 0, 0.05)',
                        textTransform: 'none',
                        letterSpacing: '0.025em',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => {
                        if (!showOriginalDrawing[currentDrawingObj._id || currentDrawingObj.id || index]) {
                          e.target.style.background = 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';
                          e.target.style.borderColor = '#3b82f6';
                          e.target.style.color = '#2563eb';
                          e.target.style.transform = 'translateY(-1px)';
                          e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
                        } else {
                          e.target.style.transform = 'translateY(-1px)';
                          e.target.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = 'translateY(0)';
                        if (!showOriginalDrawing[currentDrawingObj._id || currentDrawingObj.id || index]) {
                          e.target.style.background = 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';
                          e.target.style.borderColor = '#cbd5e1';
                          e.target.style.color = '#475569';
                          e.target.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.05)';
                        } else {
                          e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
                        }
                      }}
                    >
                      <span style={{
                        fontSize: '14px',
                        transition: 'transform 0.3s ease',
                        display: 'inline-block',
                        transform: showOriginalDrawing[currentDrawingObj._id || currentDrawingObj.id || index] 
                          ? 'rotate(90deg)' 
                          : 'rotate(0deg)'
                      }}>➤</span>
                      <span style={{ fontWeight: '500' }}>
                        {showOriginalDrawing[currentDrawingObj._id || currentDrawingObj.id || index] 
                          ? 'Hide Original Drawing' 
                          : 'Show Original Drawing'}
                      </span>
                  </button>
                )}
                END OF COMMENTED OUT SECTION */}

                          {/* Drawing preview centered below - using dynamic height */}
                          <div style={{ overflow: 'visible', width: '100%' }}>
                            {!currentDrawingObj?.isTaper ?
                            <DrawingPreview
                                template={currentDrawingObj}
                                type="normal"
                                width={nonSplitDynamicWidth}
                                height={nonSplitDynamicHeight}
                                fontSize={26}
                                style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain' }}
                              /> : renderPreview(currentDrawingObj, currentPrimaryRow, false, nonSplitDynamicHeight) }
                          </div>

                          {/* Show original drawing if toggled and available */}
                          
                        </div>

                      {/* Warning message for deleted jobs - above buttons */}
                      {hasDeletedJobs && (
                        <div style={{
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          margin: '0 10px 10px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <FaExclamationTriangle style={{ color: '#dc2626', fontSize: '14px' }} />
                          <span style={{ color: '#991b1b', fontSize: '12px', fontWeight: '500' }}>
                            This job was removed from SWI database
                          </span>
                        </div>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: '12px',
                          padding: '10px',
                          borderTop: '1px solid #e2e8f0',
                          position: 'relative',
                          // zIndex: 1000,
                          backgroundColor: '#ffffff',
                          pointerEvents: 'auto'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="outline-primary"
                          size="sm"
                          disabled={hasDeletedJobs || !showEditDelete}
                          title={hasDeletedJobs ? "Cannot edit - job deleted from SWI. Please re-push first." : ""}
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Handle edit for this specific drawing
                            const editTemplateId = currentTemplateId;
                            if (!editTemplateId) return;

                            // Note: customerId and customerName are already included from getDrawingsByOrderId API
                            let editState = { ...currentDrawingObj };

                            // Fetch full template data to get segmentAbsoluteAngles and other fields
                            try {
                              const templateRes = await axios.get(`${API_BASE_URL}/api/templates/${editTemplateId}`);
                              const templateData = templateRes.data?.data || templateRes.data;
                              if (templateData) {
                                editState.flipH = templateData.flipH || false;
                                editState.flipV = templateData.flipV || false;
                                editState.firstSegmentAngle = templateData.firstSegmentAngle;
                                editState.labelOffsets = templateData.labelOffsets;
                                editState.splitLabelOffsets = templateData.splitLabelOffsets;
                                // CRITICAL: Pass segmentAbsoluteAngles for correct SSF fold orientation
                                editState.segmentAbsoluteAngles = templateData.segmentAbsoluteAngles || [];
                                // CRITICAL: Pass fold gap values for SSF fold display
                                editState.startFoldGap = templateData.startFoldGap || 0;
                                editState.endFoldGap = templateData.endFoldGap || 0;
                              }
                            } catch (error) {
                              console.warn('Could not fetch template data for drawing edit:', error);
                            }

                            //Code change by rahul
                            // Add edit flags for proper edit mode detection
                            editState.isEdit = true;
                            editState.isNewFromCanvas = false;
                            editState.previousPage = props.currentPage || 'designers';
                            // Use mongoOrderId (MongoDB _id) for navigation, with orderId as fallback
                            editState.orderId = editState.orderId || mongoOrderId || mongoIdFromProps || orderId;
                            editState.orderNumber = orderId

                            // Remember which drawing was edited so we can scroll back to it
                            localStorage.setItem(`scrollToDrawing_${mongoOrderId || orderId}`, editTemplateId);
                            // Navigate directly to Material Selection page instead of Drawing Canvas
                            navigate(`/select-materials-simplified?templateId=${editTemplateId}`, { state: editState, preventScrollReset: false });
                          }}
                        >
                          <FaPencilAlt /> Edit
                        </Button>
                        {/* Re-push button for deleted jobs */}
                        {(hasDeletedJobs && RolePermission?.RepushToSWI?.edit === "1") && (
                          <Button
                            variant="outline-success"
                            size="sm"
                            disabled = {!showEditDelete}
                            onClick={async () => {
                              // Find which Job IDs are deleted
                              const deletedJobs = [];
                              currentDrawingObj?.swiJobIds?.forEach((id, index) => {
                                if (swiStatusMap[id] === 'deleted') {
                                  deletedJobs.push({ id, index });
                                }
                              });

                              if (deletedJobs.length === 0) return;

                              const confirmed = await confirmActionAsync(`Re-push ${deletedJobs.length} deleted job(s) to SWI?`);
                              if (!confirmed) return;

                              try {
                                const API_TOKEN = tokenManager.getToken();
                                // Use unified repush API for consistency with insert/update
                                const response = await fetch(`${API_BASE_URL}/api/templates/unified/repush`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${API_TOKEN}`
                                  },
                                  body: JSON.stringify({
                                    templateId: currentDrawingObj.templateId,
                                    rowIndices: deletedJobs.map(j => j.index),
                                    orderNumber: orderId,
                                    customerName: currentDrawingObj.customerName || localStorage.getItem('customerName'),
                                    customerPoNumber: orderData?.order_customer_PO_number,
                                    deliveryDate: orderData?.order_delivery_date_str || orderData?.order_delivery_date,
                                    enteredDate: orderData?.created_str || orderData?.created,
                                    enteredBy: localStorage.getItem('userId') // Add logged-in user ID
                                  })
                                });

                                if (!response.ok) {
                                  throw new Error(`Server responded with ${response.status}`);
                                }

                                const data = await response.json();
                                if (data.success) {
                                  swal.fire({
                                    text: 'Successfully re-pushed to SWI',
                                    icon: "success",
                                    type: "success",
                                    timer: 1500
                                  });

                                  // Refresh page after successful repush to update UI state
                                  setTimeout(() => {
                                    window.location.reload();
                                  }, 1600);
                                } else {
                                  swal.fire({
                                    text: data.message || 'Failed to re-push to SWI',
                                    icon: "error",
                                    type: "error"
                                  });
                                }
                              } catch (error) {
          // logger.error('Re-push error:', error);
                                swal.fire({
                                  text: 'Failed to re-push to SWI',
                                  icon: "error",
                                  type: "error"
                                });
                              }
                            }}
                          >
                            Re-push to SWI
                          </Button>
                        )}
                        <Button
                          variant="outline-danger"
                          size="sm"
                          disabled={!showEditDelete || isDeleteConfirmOpen}
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Handle delete for this specific drawing
                            if (!currentDrawingObj || isDeleteConfirmOpen) return;

                            setIsDeleteConfirmOpen(true);
                            try {
                              // Use swal.fire for better UI
                              const result = await swal.fire({
                                text: 'Delete this drawing and remove it from SWI database?',
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonColor: '#dc3545',
                                cancelButtonColor: '#6c757d',
                                confirmButtonText: 'Delete',
                                cancelButtonText: 'Cancel'
                              });
                              if (!result.isConfirmed) {
                                setIsDeleteConfirmOpen(false);
                                return;
                              }

                              const templateIdToDelete = currentTemplateId || currentDrawingObj.templateId || currentDrawingObj._id;
                              await axios.delete(`${API_BASE_URL}/api/templates/${templateIdToDelete}`);

                              // Track deleted template in both sessionStorage and localStorage for persistence
                              const deletedTemplatesKey = `deletedTemplates_${mongoIdFromProps || mongoOrderId || orderId}`;
                              const deletedTemplates = JSON.parse(sessionStorage.getItem(deletedTemplatesKey) || '[]');
                              if (!deletedTemplates.includes(templateIdToDelete)) {
                                deletedTemplates.push(templateIdToDelete);
                                sessionStorage.setItem(deletedTemplatesKey, JSON.stringify(deletedTemplates));
                                localStorage.setItem(deletedTemplatesKey, JSON.stringify(deletedTemplates));
                              }
                              props.onDesignDelete()
                              // Set flag to prevent re-fetching when switching tabs
                              sessionStorage.setItem('justDeletedDrawing', 'true');

                              // Update the drawings state to remove the deleted drawing
                              setDrawing(prevDrawings => {
                                if (Array.isArray(prevDrawings)) {
                                  return prevDrawings.filter(d => (d.templateId || d._id) !== templateIdToDelete);
                                }
                                return null;
                              });

                            } catch (error) {
                              // logger.error('Delete error:', error);
                              swal.fire({
                                text: 'Failed to delete drawing',
                                icon: "error"
                              });
                            } finally {
                              setIsDeleteConfirmOpen(false);
                            }
                          }}
                        >
                          <FaTrash /> Delete
                        </Button>
                      </div>
                    </Card>
                  </Col>
                );
              }
            })}
          </Row>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5: LIGHTBOX MODAL
          Full-screen view for detailed drawing inspection.
          - Opens on double-click of any drawing card
          - Keyboard navigation: Left/Right arrows, Escape to close
          - Dynamic scaling based on drawing aspect ratio (see scale calculation above)
          - Shows FAR/NEAR for taper, single view for normal drawings
          ═══════════════════════════════════════════════════════════════════════ */}
      {lightboxOpen && lightboxDrawings && lightboxDrawings.length > 0 && (() => {
        const currentLightboxDrawing = lightboxDrawings[lightboxIndex];
        if (!currentLightboxDrawing) return null;

        // =============================================================================
        // LIGHTBOX SCALE CALCULATION - Separate cases for each drawing type
        // =============================================================================
        // CASE 1: Non-split taper (isTaper && !splitPiece) - Shows FAR + NEAR stacked
        //         Uses smaller scale (0.6-0.8) because 2 drawings are displayed
        // CASE 2: Non-taper tall drawings (height > width) - Single drawing, tall shape
        //         Uses moderate scale (1.0-1.4) with increased container height
        // CASE 3: Non-taper wide drawings (width > height) - Single drawing, wide shape
        //         Uses moderate scale (1.0-1.4) to fit horizontally
        // CASE 4: Default - Balanced drawings
        //         Uses default scale (1.2) and height (700)
        // =============================================================================
        let lightboxScale = 1.2; // Default scale for lightbox (normal drawings)
        let lightboxDynamicHeight = 700; // Default height for lightbox

        // Detect non-split taper: shows FAR + NEAR stacked vertically, needs smaller scale
        const isNonSplitTaper = currentLightboxDrawing?.isTaper && !currentLightboxDrawing?.splitPiece;

        try {
          const lbLengths = currentLightboxDrawing?.farLengths || currentLightboxDrawing?.lengths || [];
          const lbAngles = currentLightboxDrawing?.angles || currentLightboxDrawing?.farAngles || [];
          const lbDirection = currentLightboxDrawing?.direction || 'Right';
          const lbFirstSegmentAngle = currentLightboxDrawing?.firstSegmentAngle;

          if (lbLengths.length > 0) {
            const lbPoints = calculatePoints(
              lbLengths.map(Number),
              lbAngles,
              lbDirection,
              [], [], false, { x: 0, y: 0 },
              lbFirstSegmentAngle,
              null, 0, null, 0
            );

            if (lbPoints && lbPoints.length > 0) {
              const lbXs = lbPoints.map(p => p.x);
              const lbYs = lbPoints.map(p => p.y);
              const lbDrawingWidth = Math.max(...lbXs) - Math.min(...lbXs);
              const lbDrawingHeight = Math.max(...lbYs) - Math.min(...lbYs);

              // =============================================================
              // CASE 1: NON-SPLIT TAPER (isTaper && !splitPiece)
              // - Uses girth tiers + aspect ratio check for wide drawings
              // - Taper shows 2 drawings (FAR + NEAR)
              // =============================================================
              if (isNonSplitTaper) {
                const lbGirth = lbLengths.reduce((sum, len) => sum + (Number(len) || 0), 0);
                const lbTaperSegmentCount = lbLengths.length;

                // Check if drawing is wide (ratio > 2)
                const lbTaperAspectRatio = lbDrawingHeight > 0 ? lbDrawingWidth / lbDrawingHeight : 1;
                const isLbTaperWide = lbTaperAspectRatio > 2;

                if (isLbTaperWide) {
                  // WIDE taper drawings - compact heights
                  if (lbGirth <= 500) {
                    lightboxScale = 0.9;
                    lightboxDynamicHeight = 400;
                  } else if (lbGirth <= 1000) {
                    lightboxScale = 0.85;
                    lightboxDynamicHeight = 450;
                  } else {
                    lightboxScale = 0.8;
                    lightboxDynamicHeight = 500;
                  }
                } else {
                  // TALL/DIAGONAL taper drawings - girth + segment count
                  if (lbGirth <= 250) {
                    lightboxScale = 0.9;
                    lightboxDynamicHeight = 600;
                  } else if (lbGirth <= 500) {
                    lightboxScale = 0.85;
                    lightboxDynamicHeight = 700;
                  } else if (lbGirth <= 1000) {
                    lightboxScale = 0.8;
                    lightboxDynamicHeight = 800;
                  } else {
                    // Very large - check segment count
                    if (lbTaperSegmentCount > 10) {
                      lightboxScale = 0.7;
                      lightboxDynamicHeight = 1500;
                    } else if (lbTaperSegmentCount > 5) {
                      lightboxScale = 0.75;
                      lightboxDynamicHeight = 1100;
                    } else {
                      lightboxScale = 0.8;
                      lightboxDynamicHeight = 800;
                    }
                  }
                }
              }
              // =============================================================
              // CASE 2: NON-TAPER DRAWINGS
              // - Uses girth tiers + aspect ratio check for wide drawings
              // =============================================================
              else {
                const lbGirth = lbLengths.reduce((sum, len) => sum + (Number(len) || 0), 0);
                const lbSegmentCount = lbLengths.length;

                // Check if drawing is wide (ratio > 2)
                const lbAspectRatio = lbDrawingHeight > 0 ? lbDrawingWidth / lbDrawingHeight : 1;
                const isLbWideDrawing = lbAspectRatio > 2;

                if (isLbWideDrawing) {
                  // WIDE drawings - compact heights
                  if (lbGirth <= 500) {
                    lightboxScale = 1.2;
                    lightboxDynamicHeight = 450;
                  } else if (lbGirth <= 1000) {
                    lightboxScale = 1.1;
                    lightboxDynamicHeight = 500;
                  } else {
                    lightboxScale = 1.0;
                    lightboxDynamicHeight = 550;
                  }
                } else {
                  // TALL/DIAGONAL drawings - girth + segment count
                  if (lbGirth <= 250) {
                    lightboxScale = 1.2;
                    lightboxDynamicHeight = 600;
                  } else if (lbGirth <= 500) {
                    lightboxScale = 1.1;
                    lightboxDynamicHeight = 700;
                  } else if (lbGirth <= 1000) {
                    lightboxScale = 1.0;
                    lightboxDynamicHeight = 800;
                  } else {
                    // Very large - check segment count
                    if (lbSegmentCount > 10) {
                      lightboxScale = 0.85;
                      lightboxDynamicHeight = 1500;
                    } else if (lbSegmentCount > 5) {
                      lightboxScale = 0.9;
                      lightboxDynamicHeight = 1100;
                    } else {
                      lightboxScale = 0.95;
                      lightboxDynamicHeight = 800;
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          // FALLBACK: Keep default scale and height on error
          // For taper, use smaller default scale since it shows 2 drawings
          if (isNonSplitTaper) {
            lightboxScale = 0.8;
            lightboxDynamicHeight = 700;
          }
        }

        // Get material rows for current drawing
        const currentMaterialRows = currentLightboxDrawing.materialRows || [];

        // Determine rows to display based on split configuration
        const baseRowsToDisplay = currentMaterialRows.length > 0 ? currentMaterialRows : [{}];

        // If this is a specific split piece, show only that piece's data
        let rowsToDisplay = [];
        let currentPrimaryRow;

        if (currentLightboxDrawing.splitPiece) {
          // This is a specific split piece - show only this piece's data
          const splitInto = currentLightboxDrawing.splitTotal;
          const splitPiece = currentLightboxDrawing.splitPiece;
          const baseRow = baseRowsToDisplay[0] || {};
          const basePieces = Number(baseRow.qty || 0) / splitInto;
          const lengthMm = Number(baseRow.length || 0);
          const baseTag = (baseRow.tag || '').trim();

          // Generate tag for this specific piece (e.g., "4-1", "4-2")
          const pieceTag = baseTag ? `${baseTag}-${splitPiece}` : `${splitPiece}`;

          const pieceRow = {
            ...baseRow,
            qty: basePieces,
            length: lengthMm,
            tag: pieceTag,
            splitIndex: splitPiece - 1
          };

          rowsToDisplay = [pieceRow];
          currentPrimaryRow = {
            quantity: basePieces,
            length: lengthMm,
            tag: pieceTag,
            unitPrice: baseRow.unitPrice ?? null,
            splitInto: 1, // Don't split again in renderPreview
          };
        } else {
          // Non-split drawing or showing all pieces together
          currentPrimaryRow = {
            quantity: baseRowsToDisplay[0]?.qty ?? 0,
            length: baseRowsToDisplay[0]?.length ?? null,
            tag: (baseRowsToDisplay[0]?.tag || '').trim(),
            unitPrice: baseRowsToDisplay[0]?.unitPrice ?? null,
            splitInto: baseRowsToDisplay[0]?.splitInto ?? 1,
          };

          // For normal drawings (not viewing a specific split piece), show combined rows
          // Do NOT expand split rows - show them as-is like the Drawing Details Tab
          rowsToDisplay = [...baseRowsToDisplay];
        }

        const formatQtyLen = (row) => {
          if (!row) return '–';
          const pieces = Number(row.qty || 0);
          const lengthMm = Number(row.length || 0);
          const perPieceM = lengthMm ? (lengthMm / 1000).toFixed(3) : null;
          return `${pieces || 0} x ${perPieceM || '–'}`;
        };

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={closeLightbox}
          >

            {/* Content container - FULL SCREEN */}
            <div
              onClick={(e) => e.stopPropagation()}
              ref={lightboxScrollRef}
              style={{
                background: '#fff',
                width: '100vw',
                height: '100vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: 0,
                position: 'relative'
              }}
            >
              <div style={{
                background: 'rgba(255, 255, 255, 0.97)',
                padding: '12px 15px',
                borderBottom: '1px solid #ddd'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  Material: {currentLightboxDrawing.material}
                  {currentLightboxDrawing.thickness && ` ${currentLightboxDrawing.thickness}`}
                  {currentLightboxDrawing.side && ` | Side: ${currentLightboxDrawing.side}`}
                  {' | '}
                  <span>
                    {formatLightboxMeasurements(currentLightboxDrawing)}
                  </span>
                  {currentLightboxDrawing.color && (
                    <span style={{ marginLeft: '20%', fontSize: '36px', color: '#2c3e50' }}>
                      {currentLightboxDrawing.color.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Floating Table and Split Badge at top-right - positioned absolutely */}
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '15px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end'
              }}>
                <Table size="sm" bordered className="text-center mb-0" style={{ fontSize: '22px', background: '#fff' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '24px' }}>
                        Qty/Len
                      </th>
                      <th style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '22px',backgroundColor: '#fa8585' }}>
                        Tag
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToDisplay.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '24px' }}>
                          {formatQtyLen(row)}
                        </td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '22px',backgroundColor: '#fa8585' }}>
                          {getLightboxTag(row, rowIndex, currentLightboxDrawing, swiShapeIdMap)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                {/* Split Badge - below the table */}
                {currentLightboxDrawing.splitPiece && (
                  <div style={{ marginTop: '10px' }}>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: '#fb8500',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '18px',
                      fontWeight: 'bold'
                    }}>
                      Split {currentLightboxDrawing.splitPiece}/{currentLightboxDrawing.splitTotal}
                    </span>
                  </div>
                )}

                {/* Edit and Delete buttons in lightbox - only show on last split piece or non-split drawings */}
                {(() => {
                  // For split drawings, only show buttons on the last piece (like main page)
                  const isLastSplitPiece = !currentLightboxDrawing?.splitPiece ||
                    (currentLightboxDrawing?.splitPiece === currentLightboxDrawing?.splitTotal);

                  if (!isLastSplitPiece) return null;

                  // Check if any Job IDs are deleted for this drawing
                  const hasDeletedJobsLightbox = currentLightboxDrawing?.swiJobIds?.some(id => swiStatusMap[id] === 'deleted');

                  return (
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  marginTop: '15px',
                  justifyContent: 'flex-end'
                }}>
                  <Button
                    variant="outline-primary"
                    size="lg"
                    disabled={hasDeletedJobsLightbox || !showEditDelete}
                    title={hasDeletedJobsLightbox ? "Cannot edit - job deleted from SWI. Please re-push first." : ""}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const editTemplateId = currentLightboxDrawing?.templateId || currentLightboxDrawing?._id;
                      if (!editTemplateId) {
                        logger.error('No template ID found for editing', currentLightboxDrawing);
                        return;
                      }

                      // Pass the entire drawing object as state
                      let editState = { ...currentLightboxDrawing };

                      // Add necessary fields if not present
                      editState.orderId = editState.orderId || mongoOrderId || mongoIdFromProps || orderId;
                      editState.mongoId = editState.mongoId || editState._id;

                      // Fetch full template data to get splitLabelOffsets and other fields
                      try {
                        const templateRes = await axios.get(`${API_BASE_URL}/api/templates/${editTemplateId}`);
                        const templateData = templateRes.data?.data || templateRes.data;
                        if (templateData) {
                          editState.flipH = templateData.flipH || false;
                          editState.flipV = templateData.flipV || false;
                          editState.firstSegmentAngle = templateData.firstSegmentAngle;
                          editState.labelOffsets = templateData.labelOffsets;
                          editState.splitLabelOffsets = templateData.splitLabelOffsets;
                          editState.segmentAbsoluteAngles = templateData.segmentAbsoluteAngles || [];
                          editState.startFoldGap = templateData.startFoldGap || 0;
                          editState.endFoldGap = templateData.endFoldGap || 0;
                        }
                      } catch (error) {
                        console.warn('Could not fetch template data for lightbox edit:', error);
                      }

                      // Add edit flags for proper edit mode detection
                      editState.isEdit = true;
                      editState.isNewFromCanvas = false;
                      editState.previousPage = props.currentPage || 'designers';
                      editState.orderId = editState.orderId || mongoOrderId || mongoIdFromProps || orderId;
                      editState.orderNumber = orderId;

                      // Remember which drawing was edited so we can scroll back to it
                      localStorage.setItem(`scrollToDrawing_${mongoOrderId || orderId}`, editTemplateId);
                      // Close lightbox and navigate
                      closeLightbox();
                      navigate(`/select-materials-simplified?templateId=${editTemplateId}`, { state: editState, preventScrollReset: false });
                    }}
                  >
                    <FaPencilAlt /> Edit
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="lg"
                    disabled={!showEditDelete || isDeleteConfirmOpen}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!currentLightboxDrawing || isDeleteConfirmOpen) return;

                      setIsDeleteConfirmOpen(true);
                      try {
                        // Use swal.fire with high z-index to show above lightbox
                        // First, inject a style to ensure swal appears above lightbox
                        const styleId = 'swal-lightbox-zindex';
                        if (!document.getElementById(styleId)) {
                          const style = document.createElement('style');
                          style.id = styleId;
                          style.textContent = '.swal2-container { z-index: 10001 !important; }';
                          document.head.appendChild(style);
                        }

                        const result = await swal.fire({
                          text: 'Delete this drawing and remove it from SWI database?',
                          icon: 'warning',
                          showCancelButton: true,
                          confirmButtonColor: '#dc3545',
                          cancelButtonColor: '#6c757d',
                          confirmButtonText: 'Delete',
                          cancelButtonText: 'Cancel'
                        });
                        if (!result.isConfirmed) {
                          setIsDeleteConfirmOpen(false);
                          return;
                        }

                        const templateIdToDelete = currentLightboxDrawing?.templateId || currentLightboxDrawing?._id;
                        await axios.delete(`${API_BASE_URL}/api/templates/${templateIdToDelete}`);

                        // Track deleted template in both sessionStorage and localStorage for persistence
                        const deletedTemplatesKey = `deletedTemplates_${mongoIdFromProps || mongoOrderId || orderId}`;
                        const deletedTemplates = JSON.parse(sessionStorage.getItem(deletedTemplatesKey) || '[]');
                        if (!deletedTemplates.includes(templateIdToDelete)) {
                          deletedTemplates.push(templateIdToDelete);
                          sessionStorage.setItem(deletedTemplatesKey, JSON.stringify(deletedTemplates));
                          localStorage.setItem(deletedTemplatesKey, JSON.stringify(deletedTemplates));
                        }
                        props?.onDesignDelete();

                        // Set flag to prevent re-fetching when switching tabs
                        sessionStorage.setItem('justDeletedDrawing', 'true');

                        // Update the drawings state to remove the deleted drawing
                        setDrawing(prevDrawings => {
                          if (Array.isArray(prevDrawings)) {
                            return prevDrawings.filter(d => (d.templateId || d._id) !== templateIdToDelete);
                          }
                          return null;
                        });

                        // Close lightbox after deletion
                        closeLightbox();
                      } catch (error) {
                        swal.fire({
                          text: 'Failed to delete drawing',
                          icon: "error"
                        });
                      } finally {
                        setIsDeleteConfirmOpen(false);
                      }
                    }}
                  >
                    <FaTrash /> Delete
                  </Button>
                </div>
                  );
                })()}
              </div>

              {/* Drawing preview - scrolls with header */}
              <div
                ref={lightboxContentRef}
                style={{
                  padding: currentLightboxDrawing?.splitPiece
                    ? '15px 20px 300px 20px'
                    : currentPrimaryRow?.splitInto > 1
                      ? '15px 20px 400px 20px'
                      : currentLightboxDrawing?.isTaper
                        ? '15px 20px 300px 20px'
                        : lightboxDynamicHeight > 700
                          ? '20px 20px 300px 20px'  // Tall drawings need more bottom padding
                          : '20px 20px 100px 20px', // Normal drawings - smaller padding to fit on page
                  minWidth: '100%',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  overflow: 'visible'
                }}
              >
                <div style={{
                  transform: `scale(${lightboxScale})`,
                  transformOrigin: 'top center',
                  marginBottom: lightboxDynamicHeight > 700 ? '300px' : '100px', // Less margin for normal drawings
                  marginLeft: '0',
                  overflow: 'visible'
                }}>
                  {renderPreview(
                    currentLightboxDrawing,
                    currentPrimaryRow,
                    true, // isLightbox - enables side-by-side taper layout
                    lightboxDynamicHeight // dynamic height for tall drawings
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </MyDiv>
  );
}