/**
 * ════════════════════════════════════════════════════════════════════════════════
 * DRAWING CANVAS COMPONENT
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Main canvas component for creating and editing custom part drawings.
 *
 * KEY FEATURES:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. DRAWING MODES:
 *    - Normal Mode: Single profile drawing with click-to-draw or drag-to-extend
 *    - Taper Mode: Dual profile (Far & Near) for tapered parts
 *
 * 2. DRAWING METHODS:
 *    - Click-to-Draw: Click origin, then click endpoints for each segment
 *    - Drag Green Handle: Extend drawing by dragging green square at endpoints
 *    - Point Dragging: Drag orange corner points to adjust shape (Lock Legends ON/OFF)
 *
 * 3. FOLDS:
 *    - SF (Square Fold): Up/Down at start or end
 *    - SSF (Semi-Square Fold): OpenUp/OpenDn with custom gap control
 *
 * 4. DYNAMIC SCALING:
 *    - Girth-based auto-zoom (4 tiers: ≤250mm, ≤500mm, ≤1000mm, >1000mm)
 *    - Independent scaling for Far and Near in taper mode
 *
 * 5. LABEL SYSTEM:
 *    - Draggable segment length labels (blue)
 *    - Draggable angle labels (red)
 *    - Draggable fold labels (dark blue/brown)
 *    - Position preservation across edits
 *
 * 6. LIBRARY INTEGRATION:
 *    - Quick Library: Browse and load templates without leaving canvas
 *    - Save to Library: Store templates by part class
 *    - Duplicate detection
 *
 * DATA FLOW:
 * ─────────────────────────────────────────────────────────────────────────────
 * Create Drawing → Edit in Canvas → Save/Finish → SelectMaterialsSimplified → Order
 * Template Library → Load Template → Edit → Save Instance → Order
 *
 * ════════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useRef, useEffect, useMemo, startTransition } from 'react';
import { Stage, Layer, Line, Circle, Text, Rect, Arc, RegularPolygon, Group, Arrow } from 'react-konva';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import swal from 'sweetalert2';
import { logger } from '../../utils/logger';
import { API_BASE_URL, tokenManager, userManager } from '../../config/api.config';
import styles from '../../styles/DrawingToolPage.module.scss';
import { getScale, getOutsideArc, getAngleLabelPosition, getSegmentLabelPosition, getFoldArcProps, getFoldLabelPosition, resetGlobalLabelPositions, getAdjustedPointsForMinimumSegments, normalizeDegrees, calculateAngleBetweenPoints, capSegmentLength, getPerpendicularVector, reflectPoint, getBoundingBoxCenter, angleToCardinalDirection, calculateSegmentLengths, polarToCartesian, snapToGrid, normalizeAllAngles, getInitialAbsoluteAngle, getLastAbsoluteAngle, calculateAbsoluteEndAngle, snapToCommonAngle } from '../../utils/geometryUtils';
import { DIRECTION_MAP, GRID_SIZE, ENABLE_GRID_SNAP, GRID_PADDING } from '../DrawingHelpers/DrawingConstants';
import { calculatePoints, getFoldSegments } from '../DrawingHelpers/DrawingCalculations';
import { initializeDisplayAngles, getGirth } from '../DrawingHelpers/DrawingHelpers';
import { FiZap } from 'react-icons/fi';
import { BiColorFill } from 'react-icons/bi';
import { HiCheckCircle } from 'react-icons/hi';
import { FiArrowLeft, FiTrash2, FiRefreshCcw, FiSave, FiLock, FiUnlock, FiFolder, FiUsers, FiSkipBack, FiSkipForward, FiPlay, FiPause, FiChevronUp, FiChevronDown } from 'react-icons/fi';
import { FiRotateCcw, FiRotateCw } from 'react-icons/fi';
import { ArrowLeft } from 'lucide-react';
import PreviewCanvas from './PreviewThumbnail';
import DuplicateDrawingModal from '../../components/DuplicateDrawingModal';
import { GetDayFromDate, HeadingThree } from '../Common/Components';
import { Card, Grid, Typography } from '@mui/material';


const DrawingCanvas = () => {
  // User permissions and ID (read once on mount to avoid stale token issues)
  const RolePermission = userManager.getRole();
  const USER_ID = userManager.getUserId();
  // ══════════════════════════════
  // ═════════════════════════════════
  // ROUTING & NAVIGATION
  // ═══════════════════════════════════════════════════════════════
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ═══════════════════════════════════════════════════════════════
  // CANVAS REFS (Konva Stage references for rendering)
  // ═══════════════════════════════════════════════════════════════
  const stageRef = useRef(null); // Normal mode canvas
  const farRef = useRef(null);   // Taper Far canvas
  const nearRef = useRef(null);  // Taper Near canvas

  // ═══════════════════════════════════════════════════════════════
  // DRAWING STATE (Core geometry data)
  // ═══════════════════════════════════════════════════════════════
  const [extensionPoint, setExtensionPoint] = useState(null); // Green square drag handle position
  const [hideGreenSquare, setHideGreenSquare] = useState(false); // Control green handle visibility
  const [direction, setDirection] = useState('Right'); // Initial drawing direction: 'Right', 'Left', 'Up', 'Down'
  const [points, setPoints] = useState([]); // Calculated {x, y} coordinates for all points
  const [draggingPoints, setDraggingPoints] = useState(null); // Temporary points during orange point drag

  // Track previous lengths count to detect when first segment is added
  const prevLengthsCountRef = useRef(0);
  const hasAutoSetColorSideRef = useRef(false); // Track if we've already auto-set color side
  const lockedCentroidCorrectionRef = useRef(null); // Lock centroid correction after first segment
  const initialDirectionRef = useRef(null); // Store initial horizontal direction (Left/Right) when drawing starts

  // ═══════════════════════════════════════════════════════════════
  // TEMPLATE & METADATA
  // ═══════════════════════════════════════════════════════════════
  const [templateName, setTemplateName] = useState(''); // User-provided template name
  const [savedTemplateId, setSavedTemplateId] = useState(null); // ID of saved template in library
  const [isFromLibrary, setIsFromLibrary] = useState(false); // True if loaded from library (prevents overwrite)
  const [isSaving, setIsSaving] = useState(false); // Prevents duplicate save operations

  // ═══════════════════════════════════════════════════════════════
  // UI CONTROLS & VISUAL STATE
  // ═══════════════════════════════════════════════════════════════
  const [lockLegends, setLockLegends] = useState(false); // Lock Legends: true = preserve lengths during drag
  const [reverseColor, setReverseColor] = useState(false); // Flip label positioning to opposite side
  const [coordOffsets, setCoordOffsets] = useState({}); // Dragged label positions {x, y}
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 }); // Pan offset for zoom/pan
  const [canvasScale, setCanvasScale] = useState(1); // Zoom level (1.0 = 100%)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false); // Show duplicate warning modal
  const [duplicateModalLibrary, setDuplicateModalLibrary] = useState(''); // Which library has duplicate
  const [duplicateModalCallback, setDuplicateModalCallback] = useState(null); // Callback after user choice

  // ═══════════════════════════════════════════════════════════════
  // FOLD CONTROLS (SF and SSF folds at start/end)
  // ═══════════════════════════════════════════════════════════════
  const [startFoldType, setStartFoldType] = useState(''); // 'Up', 'Down', 'OpenUp', 'OpenDn', or ''
  const [startFoldLength, setStartFoldLength] = useState(''); // Fold length in mm
  const [startFoldGap, setStartFoldGap] = useState(''); // Gap for SSF (OpenUp/OpenDn) in mm
  const [startFoldLengthError, setStartFoldLengthError] = useState(''); // Validation error message
  const [endFoldType, setEndFoldType] = useState(''); // Same as startFoldType but for end
  const [endFoldLength, setEndFoldLength] = useState('');
  const [endFoldGap, setEndFoldGap] = useState('');
  const [endFoldLengthError, setEndFoldLengthError] = useState('');
  const [startFoldSegment, setStartFoldSegment] = useState(null); // Reserved for future use
  const [endFoldSegment, setEndFoldSegment] = useState(null); // Reserved for future use

  // ═══════════════════════════════════════════════════════════════
  // FLIP TRANSFORMATIONS
  // ═══════════════════════════════════════════════════════════════
  const [flipH, setFlipH] = useState(false); // Horizontal flip (mirror left-right)
  const [flipV, setFlipV] = useState(false); // Vertical flip (mirror top-bottom)

  // ═══════════════════════════════════════════════════════════════
  // SAVE TO LIBRARY FEEDBACK STATES
  // ═══════════════════════════════════════════════════════════════
  const [savedToLibrary, setSavedToLibrary] = useState(false); // Save to Part Class Library feedback
  const [savedToMyLibrary, setSavedToMyLibrary] = useState(false); // Save to My Library feedback
  const [savedToCustomerLibrary, setSavedToCustomerLibrary] = useState(false); // Save to Customer Library feedback

  // ═══════════════════════════════════════════════════════════════
  // BASELINE DATA (For reverting changes in taper mode)
  // ═══════════════════════════════════════════════════════════════
  const [baseLengths, setBaseLengths] = useState([]); // Original lengths before taper adjustments
  const [baseAngles, setBaseAngles] = useState([]); // Original angles before taper adjustments
  const [baseReverseColor, setBaseReverseColor] = useState(false); // Original reverseColor state

  // ═══════════════════════════════════════════════════════════════
  // UI ELEMENT REFS (For focus management and keyboard navigation)
  // ═══════════════════════════════════════════════════════════════
  const firstBtnRef = useRef(null); // Back button (first focusable element)
  const templateNameRef = useRef(null); // Template name input field
  const continueDrawingRef = useRef(null); // Continue Drawing button
  const taperButtonRef = useRef(null); // Taper Mode button
  const reverseColorRef = useRef(null); // Reverse Color button
  const finishButtonRef = useRef(null); // Finish button (last focusable element)

  // ═══════════════════════════════════════════════════════════════
  // TABLE INPUT REFS (For keyboard navigation in length/angle tables)
  // ═══════════════════════════════════════════════════════════════
  const lengthRefs = useRef([]); // Normal mode length input refs
  const angleRefs = useRef([]); // Normal mode angle input refs
  const farLengthRefs = useRef([]); // Taper Far length input refs
  const farAngleRefs = useRef([]); // Taper Far angle input refs
  const nearLengthRefs = useRef([]); // Taper Near length input refs
  const nearAngleRefs = useRef([]); // Taper Near angle input refs

  // ═══════════════════════════════════════════════════════════════
  // SPECIAL PURPOSE REFS (Flags and cached data)
  // ═══════════════════════════════════════════════════════════════
  const firstAngleTurnDirectionRef = useRef(null); // Reserved: First angle turn direction (legacy)
  const canvasContainerRef = useRef(null); // Canvas container div for size calculations
  const quickLibraryInputRef = useRef(null); // Quick Library input for keyboard focus
  const prevFoldTypesRef = useRef({ start: '', end: '' }); // Track fold type changes for validation
  const taperDataProcessedRef = useRef(false); // Prevent duplicate taper data loading
  const restoringLabelsRef = useRef(false); // Flag during label position restoration to prevent loops

  // ═══════════════════════════════════════════════════════════════
  // LIBRARY & PART CLASS STATE
  // ═══════════════════════════════════════════════════════════════
  const [partGroup, setPartGroup] = useState('Flashing'); // Selected part group for library save
  const [partClass, setPartClass] = useState('Gutters'); // Selected part class for library save (default: Gutters)
  const [groupClassMap, setGroupClassMap] = useState({}); // Map of part groups to available classes
  const [groupClassLoaded, setGroupClassLoaded] = useState(false); // Track if group/class data is loaded

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION STATE (From React Router)
  // Falls back to localStorage if location.state is missing (e.g., after idle timeout)
  // ═══════════════════════════════════════════════════════════════
  const location = useLocation();
  const {
    orderNumber = localStorage.getItem('orderNumber') || '',
    customerName = localStorage.getItem('customerName') || '',
    customerId = localStorage.getItem('customerId') || '',
    orderId = localStorage.getItem('orderId') || '',
    customerPoNumber = localStorage.getItem('customerPoNumber') || '',
    deliveryDate: promiseDate,
    enteredDate
  } = location.state || {};

  // Tag suggestion for this order
  const [suggestedTag, setSuggestedTag] = useState('1');
  const [loadingTag, setLoadingTag] = useState(false);

  // Determine if drawing should be flipped (for taper Far/Near swap)
  // Use location.state.isFlip if available (from navigation), otherwise fall back to URL parameter
  // This prevents incorrect flipping when returning from Edit Drawing
  const isFlip = location.state?.isFlip ?? (searchParams.get('flip') === 'true');

  // Debug log to check flip parameter
  logger.debug('🔍 DrawingCanvas URL params:', {
    flip: searchParams.get('flip'),
    isFlip: isFlip,
    templateId: searchParams.get('templateId'),
    allParams: Array.from(searchParams.entries())
  });
  // ═══════════════════════════════════════════════════════════════
  // useEffect: FETCH SUGGESTED TAG FOR ORDER
  // - Edit mode: Shows the saved tag from existing material rows
  // - New mode: Shows the next sequential tag for this order
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchSuggestedTag = async () => {
      if (!orderNumber) return;

      try {
        setLoadingTag(true);
        const token = tokenManager.getToken();

        // Check if we're in edit mode
        const isEditMode = location.state?.isEdit || searchParams.get('isEdit') === 'true';
        // Check both URL templateId and preserved templateId (preserved after Clear button in edit mode)
        const currentTemplateId = searchParams.get('templateId') || location.state?.preservedTemplateId;

        if (isEditMode && currentTemplateId) {
          // Edit mode: Fetch the saved tag from material rows for this template
          try {
            const response = await axios.get(`${API_BASE_URL}/api/templates/${currentTemplateId}/material-rows`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data && response.data.length > 0) {
              // Get the last saved tag from material rows
              const lastRow = response.data[response.data.length - 1];
              if (lastRow.tag) {
                setSuggestedTag(lastRow.tag);
                return;
              }
            }
          } catch (error) {
            logger.warn('Failed to fetch saved tag, falling back to next sequence:', error);
          }
        }

        // New mode or fallback: Get next sequential tag
        const response = await axios.get(`${API_BASE_URL}/api/tags/next-for-order`, {
          params: { orderNumber },
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success && response.data.nextTag) {
          setSuggestedTag(response.data.nextTag);
        }
      } catch (error) {
        logger.error('Failed to fetch suggested tag:', error);
        // Keep default '1' if fetch fails
      } finally {
        setLoadingTag(false);
      }
    };

    fetchSuggestedTag();
  }, [orderNumber, location.state?.isEdit, searchParams]);

  // ═══════════════════════════════════════════════════════════════
  // useEffect: SAVE CUSTOMER DATA TO LOCALSTORAGE
  // Persists order-related data to survive navigation/refresh
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (orderNumber) localStorage.setItem('orderNumber', orderNumber);
    if (customerName) localStorage.setItem('customerName', customerName);
    if (customerId) localStorage.setItem('customerId', customerId);
    if (orderId) localStorage.setItem('orderId', orderId);
    if (customerPoNumber) localStorage.setItem('customerPoNumber', customerPoNumber);


  }, [orderNumber, customerName, customerId, orderId, customerPoNumber]);

  // ═══════════════════════════════════════════════════════════════
  // useEffect: FORCE SCROLL TO TOP ON NAVIGATION
  // Overrides browser scroll restoration with multiple delayed attempts
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const scrollToTop = () => {
      // Scroll window
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

      // Scroll the main container
      const mainContainer = document.querySelector('.RightMainContainer');
      if (mainContainer) {
        mainContainer.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    };

    // Execute immediately
    scrollToTop();

    // Execute after render with requestAnimationFrame
    requestAnimationFrame(() => {
      scrollToTop();
    });

    // Execute with delays to override any scroll restoration
    const timeouts = [
      setTimeout(scrollToTop, 10),
      setTimeout(scrollToTop, 50),
      setTimeout(scrollToTop, 100),
      setTimeout(scrollToTop, 200)
    ];

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [location.key]); // Use location.key to trigger on every navigation

  // ═══════════════════════════════════════════════════════════════
  // URL PARAMS & TEMPLATE DETECTION
  // ═══════════════════════════════════════════════════════════════
  const templateId = searchParams.get('templateId'); // Template ID from URL for editing
  const urlPartGroup = searchParams.get('partGroup'); // Part group from URL
  const urlPartClass = searchParams.get('partClass'); // Part class from URL
  // CRITICAL FIX: Also check for isEdit flag and existing template data in location.state
  // Even without templateId in URL, if we're editing, it's not a new drawing
  // Also check isFromEditDrawingNoTemplate - when Edit Drawing is clicked before template creation
  const isNewDrawing = !templateId && !location.state?.isEdit && !location.state?.preservedTemplateId && !location.state?.isFromEditDrawingNoTemplate; // True if creating new drawing (no template ID)

  // ═══════════════════════════════════════════════════════════════
  // DRAWING MODE STATE
  // ═══════════════════════════════════════════════════════════════
  const [hoverPoint, setHoverPoint] = useState(null); // Preview point during click-to-draw
  const [originOffset, setOriginOffset] = useState({ x: 0, y: 0 }); // Drawing origin offset (legacy)
  const [showTaper, setShowTaper] = useState(false); // True = Taper mode, False = Normal mode
  const [continuousDrawing, setContinuousDrawing] = useState(true); // Enable/disable drawing mode
  const [templateCreateMode, setTemplateCreateMode] = useState(false); // Special mode for template creation
  const [firstSegmentAngle, setFirstSegmentAngle] = useState(null); // Absolute angle of first segment
  const [hasEditedInTable, setHasEditedInTable] = useState(false); // True if table was edited (prevents 1000mm shrinking)
  const [segmentAbsoluteAngles, setSegmentAbsoluteAngles] = useState([]); // Compass direction for each segment
  const skipPointRecalc = useRef(false); // Prevent recalculation during drag operations
  const [dragStartCenter, setDragStartCenter] = useState(null); // Flip center cached during drag
  const [firstClickPoint, setFirstClickPoint] = useState(null); // First click in click-to-draw mode
  const [firstClickPixelPos, setFirstClickPixelPos] = useState(null); // Pixel position of first click (for anchoring)

  // ═══════════════════════════════════════════════════════════════
  // CANVAS SIZE & RENDERING STATE
  // ═══════════════════════════════════════════════════════════════
  const [resetKey, setResetKey] = useState(0); // Force canvas re-render by incrementing
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 }); // Measured container dimensions
  const [dynamicStageWidth, setDynamicStageWidth] = useState(1000); // Canvas width in pixels
  const [dynamicStageHeight, setDynamicStageHeight] = useState(850); // Canvas height in pixels

  // ═══════════════════════════════════════════════════════════════
  // GIRTH-BASED SCALING STATE (Normal Mode)
  // ═══════════════════════════════════════════════════════════════
  const [hasTaperDataLoaded, setHasTaperDataLoaded] = useState(false); // Track taper data loading status
  const [preservedShrinkFactor, setPreservedShrinkFactor] = useState(null); // Cached shrinkFactor for normal mode
  const [preservedGirth, setPreservedGirth] = useState(0); // Last calculated girth (to detect tier changes)
  const [forceRecalculate, setForceRecalculate] = useState(0); // Increment to force shrinkFactor recalc

  // ═══════════════════════════════════════════════════════════════
  // GIRTH-BASED SCALING STATE (Taper Mode - Far & Near)
  // ═══════════════════════════════════════════════════════════════
  const [preservedFarShrinkFactor, setPreservedFarShrinkFactor] = useState(null); // Cached shrinkFactor for Far canvas
  const [preservedFarGirth, setPreservedFarGirth] = useState(0); // Last calculated Far girth
  const [preservedNearShrinkFactor, setPreservedNearShrinkFactor] = useState(null); // Cached shrinkFactor for Near canvas
  const [preservedNearGirth, setPreservedNearGirth] = useState(0); // Last calculated Near girth

  // ═══════════════════════════════════════════════════════════════
  // QUICK LIBRARY STATE (Browse templates without leaving canvas)
  // ═══════════════════════════════════════════════════════════════
  const [libraryPartClasses, setLibraryPartClasses] = useState([]); // Available part classes for quick access
  const [currentPartClassIndex, setCurrentPartClassIndex] = useState(0); // Selected part class index (0 = My Library)
  const [showDrawingsOverlay, setShowDrawingsOverlay] = useState(false); // Show/hide library overlay
  const [selectedPartClassDrawings, setSelectedPartClassDrawings] = useState([]); // Templates in selected part class
  const [loadingLibrary, setLoadingLibrary] = useState(false); // Loading indicator for library fetch
  const [drawingSearchTerm, setDrawingSearchTerm] = useState(''); // Search filter for drawings
  // Infinite scroll state (same pattern as TemplateLibrary.js)
  const [quickLibraryPage, setQuickLibraryPage] = useState(1); // Current page for infinite scroll
  const [quickLibraryHasMore, setQuickLibraryHasMore] = useState(true); // Whether more templates exist
  const [quickLibraryLoadingMore, setQuickLibraryLoadingMore] = useState(false); // Loading indicator for scroll load
  const [quickLibraryPageSize] = useState(12); // Items per load (same as TemplateLibrary)
  const quickLibraryScrollRef = useRef(null); // Ref for scroll container

  // Responsive library canvas dimensions based on viewport width
  const [libraryCanvasDimensions, setLibraryCanvasDimensions] = useState({
    width: 110, height: 80, fontSize: 11, cardHeight: 120, modalWidth: '55%', modalMaxWidth: '680px'
  });

  //Code change by Rahul
  // Add new state for order details after the existing state declarations (around line 200)
  const [orderDetails, setOrderDetails] = useState(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);

  // ═══════════════════════════════════════════════════════════════
  // useEffect: INITIALIZE SAVED TEMPLATE ID
  // Determines if this is a library template or a new drawing
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Check if this is a template from the library (via URL param or template selection)
    // Templates from library should NOT update the original when saved
    // IMPORTANT: Check for isEdit flag - if editing, it's NOT from library even with templateId in URL
    const isEditMode = location.state?.isEdit === true;
    const isLibraryTemplate = !!templateId && !isEditMode; // If templateId is in URL AND not editing, it's from library
    const existingId = templateId || location.state?.templateId || location.state?.preservedTemplateId;

    if (existingId) {
      if (isLibraryTemplate) {
        // This is from library - don't set savedTemplateId, so it creates new on save
        setIsFromLibrary(true);
        logger.debug('Template is from library, will create new instance on save:', existingId);
      } else if (location.state?.isNewFromCanvas || isEditMode) {
        // This is a newly created drawing in this session OR editing existing - track its ID
        setSavedTemplateId(existingId);
        logger.debug('Initialized savedTemplateId for drawing:', { existingId, isEditMode, isNewFromCanvas: location.state?.isNewFromCanvas });
      }
    }
  }, [templateId]);

  // Add useEffect to fetch order details on component mount
  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoadingOrderDetails(true);

        // Get orderState from localStorage and parse it
        const orderStateString = localStorage.getItem('orderState');

        if (!orderStateString) {
          logger.debug('No orderState found in localStorage');
          return;
        }

        const orderState = JSON.parse(orderStateString);
        const orderNumberFromStorage = orderState?.orderNumber;

        console.log('Fetching order details for order number:', orderNumberFromStorage);

        if (!orderNumberFromStorage) {
          logger.debug('No order number found in orderState');
          return;
        }

        const token = tokenManager.getToken();
        // Updated URL to match the backend route
        const url = `${API_BASE_URL}/fetch-order-details-by-ordernumber/${orderNumberFromStorage}`;

        const response = await axios.get(url, {
          headers: {
            "x-access-token": token,
            "Accept": "application/json",
            "Content-Type": "application/json"
          }
        });

        if (response.data) {
          setOrderDetails(response.data);
          logger.debug('Order details fetched successfully:', response.data);
        } else {
          logger.warn('No order details data in response');
        }
      } catch (error) {
        logger.error('Failed to fetch order details:', error);
        swal.fire({
          text: 'Failed to load order details.',
          icon: 'error',
          title: 'Error'
        });
      } finally {
        setLoadingOrderDetails(false);
      }
    };

    fetchOrderDetails();
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // useEffect: FETCH LIBRARY PART CLASSES FOR QUICK LIBRARY
  // Loads all available part classes for the navigation sidebar
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchLibraryPartClasses = async () => {

      try {
        setLoadingLibrary(true);
        const token = tokenManager.getToken();

        // Use optimized template-library endpoint (with selective field population and better performance)
        const response = await axios.get(`${API_BASE_URL}/api/template-library`, {
          headers: {
            'x-access-token': token,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        if (response.data?.data && Array.isArray(response.data.data)) {
          // Extract templates from library entries (template data is in template_id field)
          const libraryEntries = response.data.data;
          const templatesToUse = libraryEntries
            .filter(entry => entry.template_id) // Filter out entries with deleted templates
            .map(entry => entry.template_id); // Extract template data

          // Extract unique part classes (NOT part groups)
          const partClassesSet = new Set();
          templatesToUse.forEach(template => {
            // Only add partClass, not partGroup
            if (template.partClass && template.partClass !== '') {
              partClassesSet.add(template.partClass);
            }
          });

          const partClassesArray = Array.from(partClassesSet).sort();

          // Use the correct part classes list
          const correctPartClasses = [
            'My Library',
            'Customer Library',
            'Gutters',
            'Cappings',
            'Aprons',
            'Ridge & Valley',
            'Soakers',
            'Foot Moulds',
            'Misc'
          ];

          if (partClassesArray.length === 0) {
            setLibraryPartClasses(correctPartClasses);
          } else {
            // Merge found classes with correct ones to ensure all are present
            const mergedSet = new Set([...partClassesArray, ...correctPartClasses]);
            const finalArray = Array.from(mergedSet).sort();
            setLibraryPartClasses(finalArray);
          }

          // Store all templates for later use (no longer needed as we fetch on-demand)
          window.libraryTemplates = templatesToUse;
        } else {
          setLibraryPartClasses([
            'My Library',
            'Customer Library',
            'Gutters',
            'Cappings',
            'Aprons',
            'Ridge & Valley',
            'Soakers',
            'Foot Moulds',
            'Misc'
          ]);
        }
      } catch (error) {
        logger.error('Failed to fetch library part classes:', error);
        // Use default list on error
        setLibraryPartClasses([
          'My Library',
          'Customer Library',
          'Gutters',
          'Cappings',
          'Aprons',
          'Ridge & Valley',
          'Soakers',
          'Foot Moulds',
          'Misc'
        ]);
      } finally {
        setLoadingLibrary(false);
      }
    };

    fetchLibraryPartClasses();
  }, []);

  // Set initial Quick Library selection to "My Library" when libraryPartClasses is loaded
  // Note: Save to Library will still use the currently selected part class (default: Gutters if no selection made)
  useEffect(() => {
    if (libraryPartClasses.length > 0) {
      const myLibraryIndex = libraryPartClasses.findIndex(
        (partClass) => partClass === 'My Library'
      );
      if (myLibraryIndex !== -1) {
        setCurrentPartClassIndex(myLibraryIndex);
      } else {
        // Fallback to first item if My Library not found
        setCurrentPartClassIndex(0);
      }
    }
  }, [libraryPartClasses]);

  // Infinite scroll handler for Quick Library (same pattern as TemplateLibrary.js)
  useEffect(() => {
    const scrollContainer = quickLibraryScrollRef.current;
    if (!scrollContainer || !showDrawingsOverlay) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 100;

      if (nearBottom && quickLibraryHasMore && !quickLibraryLoadingMore && !loadingLibrary) {
        const nextPage = quickLibraryPage + 1;
        setQuickLibraryPage(nextPage);
        const currentPartClass = libraryPartClasses[currentPartClassIndex];
        if (currentPartClass) {
          handlePartClassClick(currentPartClass, nextPage, true);
        }
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [showDrawingsOverlay, quickLibraryHasMore, quickLibraryLoadingMore, loadingLibrary, quickLibraryPage, libraryPartClasses, currentPartClassIndex]);

  // Calculate responsive library canvas dimensions based on viewport width
  useEffect(() => {
    const updateLibraryCanvasDimensions = () => {
      const viewportWidth = window.innerWidth;

      if (viewportWidth >= 1920) {
        // Large desktop/4K monitors
        setLibraryCanvasDimensions({
          width: 160, height: 120, fontSize: 12, cardHeight: 180,
          modalWidth: '60%', modalMaxWidth: '900px'
        });
      } else if (viewportWidth >= 1600) {
        // HD+ Desktop (1600x1134)
        setLibraryCanvasDimensions({
          width: 145, height: 108, fontSize: 11, cardHeight: 165,
          modalWidth: '58%', modalMaxWidth: '800px'
        });
      } else if (viewportWidth >= 1366) {
        // HD Laptop/Small Desktop
        setLibraryCanvasDimensions({
          width: 130, height: 95, fontSize: 11, cardHeight: 150,
          modalWidth: '55%', modalMaxWidth: '720px'
        });
      } else if (viewportWidth >= 1024) {
        // iPad Landscape/Small Laptop
        setLibraryCanvasDimensions({
          width: 115, height: 85, fontSize: 10, cardHeight: 135,
          modalWidth: '60%', modalMaxWidth: '680px'
        });
      } else if (viewportWidth >= 768) {
        // iPad Portrait/Tablet
        setLibraryCanvasDimensions({
          width: 100, height: 75, fontSize: 9, cardHeight: 120,
          modalWidth: '70%', modalMaxWidth: '600px'
        });
      } else {
        // Mobile
        setLibraryCanvasDimensions({
          width: 90, height: 68, fontSize: 8, cardHeight: 110,
          modalWidth: '90%', modalMaxWidth: '500px'
        });
      }
    };

    // Initial calculation
    updateLibraryCanvasDimensions();

    // Update on resize
    window.addEventListener('resize', updateLibraryCanvasDimensions);
    return () => window.removeEventListener('resize', updateLibraryCanvasDimensions);
  }, []);

  // Calculate dynamic stage dimensions based on viewport for all screen sizes
  useEffect(() => {
    const calculateStageDimensions = () => {
      if (canvasContainerRef.current) {
        // Use a small delay to ensure layout is fully rendered
        setTimeout(() => {
          // Calculate width based on container - use almost all available space
          const containerWidth = canvasContainerRef.current.offsetWidth;
          const availableWidth = containerWidth - 10; // Minimal margin

          // Ensure width is multiple of 20 for grid alignment
          const roundedWidth = Math.round(Math.max(availableWidth, 320) / 20) * 20;
          setDynamicStageWidth(roundedWidth);

          // Calculate height to fit viewport without scrolling
          const viewportHeight = window.innerHeight;
          // Reserved space: header (55px), top bar (35px), bottom controls (60px), extra margin (50px) for bottom border visibility
          const reservedHeight = showTaper ? 200 : 185; // Balanced to reduce bottom space

          const availableHeight = viewportHeight - reservedHeight;

          // Use almost all available height - maximize canvas
          // Ensure height is multiple of 20 for grid alignment
          const roundedHeight = Math.round(Math.max(availableHeight, 400) / 20) * 20;
          setDynamicStageHeight(roundedHeight);
        }, 50); // Small delay for layout rendering
      }
    };

    calculateStageDimensions();

    // Use ResizeObserver for instant response to container size changes
    const resizeObserver = new ResizeObserver(() => {
      calculateStageDimensions();
      // Also trigger taper view recalculation
      if (canvasContainerRef.current) {
        setContainerSize({
          width: canvasContainerRef.current.offsetWidth,
          height: canvasContainerRef.current.offsetHeight
        });
      }
    });

    if (canvasContainerRef.current) {
      resizeObserver.observe(canvasContainerRef.current);
    }

    // Also listen to window resize and orientation change for mobile
    window.addEventListener('resize', calculateStageDimensions);
    window.addEventListener('orientationchange', calculateStageDimensions);

    // Listen for sidebar toggle events (if using MutationObserver for sidebar changes)
    const observeSidebarChanges = () => {
      const sidebar = document.querySelector('.pro-sidebar');
      if (sidebar) {
        const sidebarObserver = new MutationObserver(() => {
          calculateStageDimensions();
        });
        sidebarObserver.observe(sidebar, {
          attributes: true,
          attributeFilter: ['class', 'style']
        });
        return sidebarObserver;
      }
      return null;
    };

    const sidebarObserver = observeSidebarChanges();

    return () => {
      window.removeEventListener('resize', calculateStageDimensions);
      window.removeEventListener('orientationchange', calculateStageDimensions);
      resizeObserver.disconnect();
      if (sidebarObserver) {
        sidebarObserver.disconnect();
      }
    };
  }, [showTaper]); // Recalculate when taper mode changes

  // Debug: Track showTaper changes
  useEffect(() => {

  }, [showTaper]);

  // ═══════════════════════════════════════════════════════════════
  // GEOMETRY DATA - NORMAL MODE (Single Profile)
  // ═══════════════════════════════════════════════════════════════
  const [lengths, setLengths] = useState([]); // Segment lengths in mm
  const [angles, setAngles] = useState([]); // Turn angles in degrees (relative to previous segment)
  const [displayAngles, setDisplayAngles] = useState([]); // Angles shown in table (can be negative for display)
  const [displayLengths, setDisplayLengths] = useState([]); // Last valid lengths when input is cleared

  // ═══════════════════════════════════════════════════════════════
  // GEOMETRY DATA - TAPER MODE (Dual Profile: Far & Near)
  // ═══════════════════════════════════════════════════════════════
  const [farLengths, setFarLengths] = useState([]); // Far profile segment lengths
  const [farAngles, setFarAngles] = useState([]); // Far profile turn angles
  const [nearLengths, setNearLengths] = useState([]); // Near profile segment lengths
  const [nearAngles, setNearAngles] = useState([]); // Near profile turn angles

  // ═══════════════════════════════════════════════════════════════
  // LABEL POSITION PRESERVATION
  // Stores user-adjusted label positions relative to calculated positions
  // ═══════════════════════════════════════════════════════════════
  const [labelOffsets, setLabelOffsets] = useState({
    segmentLabels: {},  // { 0: {x: 10, y: 5}, 1: {x: -8, y: 3} } - Length label offsets (for non-taper mode)
    angleLabels: {},    // { 0: {x: 5, y: 10} } - Angle label offsets (for non-taper mode)
    foldLabels: {},     // { start: {x: 12, y: 8}, end: {x: 15, y: -5} } - Fold label offsets (for non-taper mode)
    gapLabels: {},      // { start: {x: 5, y: 10}, end: {x: 8, y: -5} } - Gap label offsets for SSF (for non-taper mode)
    // Taper mode specific label offsets (independent for far and near profiles)
    farSegmentLabels: {},  // { 0: {x: 10, y: 5} } - Far profile segment/length label offsets
    nearSegmentLabels: {}, // { 0: {x: 10, y: 5} } - Near profile segment/length label offsets
    farAngleLabels: {},   // { 0: {x: 5, y: 10} } - Far profile angle label offsets
    nearAngleLabels: {},  // { 0: {x: 5, y: 10} } - Near profile angle label offsets
    farFoldLabels: {},    // { start: {x: 12, y: 8}, end: {x: 15, y: -5} } - Far profile fold label offsets
    nearFoldLabels: {},   // { start: {x: 12, y: 8}, end: {x: 15, y: -5} } - Near profile fold label offsets
    farGapLabels: {},     // { start: {x: 5, y: 10}, end: {x: 8, y: -5} } - Far profile gap label offsets
    nearGapLabels: {}     // { start: {x: 5, y: 10}, end: {x: 8, y: -5} } - Near profile gap label offsets
  });

  // ═══════════════════════════════════════════════════════════════
  // UNDO/REDO HISTORY
  // ═══════════════════════════════════════════════════════════════
  const [history, setHistory] = useState([]); // Stack of previous drawing states for undo
  const [canUndo, setCanUndo] = useState(false); // Enable/disable undo button
  const [redoHistory, setRedoHistory] = useState([]); // Stack of states for redo
  const [canRedo, setCanRedo] = useState(false); // Enable/disable redo button

  // Refs to always have latest history values (avoid stale closures in event handlers)
  const historyRef = useRef(history);
  const redoHistoryRef = useRef(redoHistory);
  const skipNextHistorySaveRef = useRef(false); // Flag to skip saveToHistory after ESC (prevents duplicate from auto-focus)

  // ═══════════════════════════════════════════════════════════════
  // EDITING INDEX - Track which dimension is being edited in the grid
  // Used to highlight the corresponding label on the canvas
  // ═══════════════════════════════════════════════════════════════
  const [editingIndex, setEditingIndex] = useState({ type: null, index: null, profile: null });
  // type: 'length' or 'angle'
  // index: the segment/angle index being edited
  // profile: 'far' or 'near' for taper mode, null for normal mode

  const hasValidDrawing = lengths.length > 0 || (showTaper && farLengths.length > 0); // At least one segment is drawn (check farLengths in taper mode)

  // Check if any length value is 0 (invalid for SWI)
  const hasZeroLength = showTaper
    ? farLengths.some(l => l === 0) || nearLengths.some(l => l === 0)
    : lengths.some(l => l === 0);

  // Check if any length value is empty/cleared (invalid for SWI)
  const hasEmptyLength = showTaper
    ? farLengths.some(l => l === '' || l === null || l === undefined) || nearLengths.some(l => l === '' || l === null || l === undefined)
    : lengths.some(l => l === '' || l === null || l === undefined);

  // Derived error: true when any displayAngle exceeds 180 (like hasZeroLength for lengths)
  const hasAngleOver180 = displayAngles.some(a => {
    if (a === '' || a === null || a === undefined || a === '-') return false;
    const num = Number(a);
    return !isNaN(num) && Math.abs(num) > 180;
  });

  // ═══════════════════════════════════════════════════════════════
  // useEffect: KEEP HISTORY REFS IN SYNC WITH STATE
  // Ensures event handlers always have access to latest history values
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    historyRef.current = history;
    setCanUndo(history.length > 0);
  }, [history]);

  useEffect(() => {
    redoHistoryRef.current = redoHistory;
    setCanRedo(redoHistory.length > 0);
  }, [redoHistory]);

  // ═══════════════════════════════════════════════════════════════
  // useEffect: RESET TAPER FLAG ON UNMOUNT/NAVIGATION
  // Prevents stale taper data from persisting across navigations
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    return () => {
      taperDataProcessedRef.current = false;
    };
  }, [location.state]);

  // ═══════════════════════════════════════════════════════════════
  // useEffect: SET INITIAL FOCUS ON MOUNT
  // Focuses correct element (Back button in normal, Near input in taper)
  // Multiple attempts to override browser's default focus behavior
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Prevent default browser focus behavior
    const preventBrowserFocus = () => {
      if (!showTaper && firstBtnRef.current) {
        firstBtnRef.current?.focus();
      } else if (showTaper && nearLengthRefs.current?.[0]) {
        nearLengthRefs.current[0]?.focus();
      }
    };

    // Multiple attempts to ensure focus stays where we want
    preventBrowserFocus();
    setTimeout(preventBrowserFocus, 50);
    setTimeout(preventBrowserFocus, 100);
    setTimeout(preventBrowserFocus, 200);
  }, []); // Run only once on mount

  // Focus change when switching between modes
  // Track previous showTaper value to detect toggle direction
  const prevShowTaperRef = useRef(showTaper);
  // Track if initial mount phase is complete (to distinguish manual toggle from data loading)
  const isInitialMountRef = useRef(true);

  // Mark initial mount as complete after a delay (after data has loaded)
  useEffect(() => {
    const timer = setTimeout(() => {
      isInitialMountRef.current = false;
    }, 500); // Wait for initial data load to complete
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const wasInTaperMode = prevShowTaperRef.current;
    prevShowTaperRef.current = showTaper;

    setTimeout(() => {
      if (!showTaper && wasInTaperMode && lengthRefs.current?.[0]) {
        // Toggling FROM taper TO normal: focus first length input
        lengthRefs.current[0]?.focus();
      } else if (!showTaper && !wasInTaperMode && lengthRefs.current?.[0]) {
        // Normal mode on initial load: focus first length input
        lengthRefs.current[0]?.focus();
      } else if (showTaper && !wasInTaperMode && !isInitialMountRef.current && nearLengthRefs.current?.[0]) {
        // Toggling FROM normal TO taper: focus first Near length input
        // Only for MANUAL toggle (not during initial data load)
        // This applies to both create mode AND edit mode when user clicks toggle
        nearLengthRefs.current[0]?.focus();
      }
    }, 200);
  }, [showTaper]);

  // Removed automatic reset of canvas offset and scale when showTaper changes
  // This was causing issues when navigating back from other pages

  // When Far Angles change, Near Angles should mirror
  useEffect(() => {
    if (showTaper) setNearAngles([...farAngles]);
  }, [farAngles, showTaper]);

  useEffect(() => {

    // Check if this is a copy or flip operation with data to load
    // For normal drawings, check for lengths array; for taper, check isTaper flag
    const isCopyWithData = location.state?.isCopy && (location.state?.isTaper || (location.state?.lengths && location.state?.lengths.length > 0));
    const isFlipWithData = location.state?.isFlip && (location.state?.isTaper || (location.state?.lengths && location.state?.lengths.length > 0));

    // Check if this is truly a new drawing (no template data to load)
    // IMPORTANT: Also check for isEdit flag to prevent clearing when coming from Edit Drawing button
    // Also check for taper data (farLengths/nearLengths) to prevent clearing taper drawings
    const hasTaperData = location.state?.farLengths || location.state?.nearLengths || location.state?.farAngles || location.state?.nearAngles || location.state?.isTaper;
    const hasAnyDrawingData = location.state?.lengths || location.state?.angles || hasTaperData;

    // ONLY clear if this is truly a new drawing with no data at all
    if (isNewDrawing && !isCopyWithData && !isFlipWithData && !location.state?.isEdit && !hasAnyDrawingData) {
      logger.debug('DrawingCanvas: New drawing mode - clearing all data');
      setTemplateName('');
      setLengths([]);
      setAngles([]);
      setDisplayAngles([]); // Also clear display angles for new drawing
      setDisplayLengths([]); // Also clear display lengths for new drawing
      setFarLengths([]);
      setNearLengths([]);
      setFarAngles([]);
      setNearAngles([]);
      setShowTaper(false);
      setPreservedShrinkFactor(null); // Reset preserved shrinkFactor for new drawing
      setPreservedGirth(0); // Reset preserved girth for new drawing
      setPreservedFarShrinkFactor(null); // Reset taper far shrinkFactor
      setPreservedFarGirth(0);
      setPreservedNearShrinkFactor(null); // Reset taper near shrinkFactor
      setPreservedNearGirth(0);
      // Set partGroup and partClass from URL parameters for new drawings
      if (urlPartGroup) {
        setPartGroup(urlPartGroup);
      }
      if (urlPartClass) {
        setPartClass(urlPartClass);
      }
      return;
    }

    // Check if we have location.state to load from
    const state = location.state;

    // CRITICAL DEBUG: Log location.state.lengths immediately
    if (state?.lengths) {
      console.log('🔥 LOCATION.STATE.LENGTHS AT ENTRY:', JSON.stringify(state.lengths));
      console.log('🔥 DETAILED:', state.lengths.map((l, i) => ({ index: i, value: l, type: typeof l })));
    }

    if (state && typeof state === 'object') {
      // CRITICAL: Set restoration flag BEFORE any state changes if labelOffsets exist
      if (state.labelOffsets) {
        restoringLabelsRef.current = true;
        console.log('🏷️ PRE-RESTORATION: Set restoringLabelsRef = true BEFORE loading state');
      }

      logger.debug('DrawingCanvas: Loading from state:', state);
      logger.debug('DrawingCanvas: isTaper:', state.isTaper);
      logger.debug('DrawingCanvas: farLengths:', state.farLengths);
      logger.debug('DrawingCanvas: nearLengths:', state.nearLengths);
      logger.debug('📊 RECEIVED STATE IN DRAWINGCANVAS:', {
        isTaper: state.isTaper,
        farLengths: state.farLengths,
        farAngles: state.farAngles,
        nearLengths: state.nearLengths,
        nearAngles: state.nearAngles,
        firstFarAngle: state.farAngles?.[0],
        lastFarAngle: state.farAngles?.[state.farAngles?.length - 1],
        firstNearAngle: state.nearAngles?.[0],
        lastNearAngle: state.nearAngles?.[state.nearAngles?.length - 1],
        direction: state.direction
      });


      // CRITICAL: Only disable continuous drawing when loading actual drawing data
      // Don't disable if state only has metadata (isEdit, preservedTemplateId, etc.) after clear
      const hasDrawingData = (state.lengths && state.lengths.length > 0) ||
        (state.farLengths && state.farLengths.length > 0) ||
        (state.nearLengths && state.nearLengths.length > 0);

      if (hasDrawingData) {
        setContinuousDrawing(false);
        setFirstClickPoint(null); // Clear first click point when loading template
      }

      // CRITICAL FIX: Set ref IMMEDIATELY, BEFORE startTransition
      // Must be synchronous to prevent auto-detection from running during template load
      hasAutoSetColorSideRef.current = true;
      console.log('✅ Set hasAutoSetColorSideRef.current = true (from Edit Drawing load) - BEFORE startTransition');

      startTransition(() => {
        logger.debug('Setting direction from state:', state.direction);
        console.log('🎨 Loading reverseColor from Edit Drawing state:', {
          reverseColorFromState: state.reverseColor,
          isEdit: state.isEdit,
          preservedTemplateId: state.preservedTemplateId,
          isFromEditDrawingNoTemplate: state.isFromEditDrawingNoTemplate,
          finalValue: state.reverseColor ?? false,
          hasAutoSetColorSideRef: hasAutoSetColorSideRef.current
        });
        setTemplateName(state.name || '');
        setDirection(state.direction || 'Right');  // Default to 'Right' if undefined
        setReverseColor(state.reverseColor ?? false);
        setBaseReverseColor(state.reverseColor ?? false);
        // Set partGroup/partClass from state (now includes correct values from template library)
        setPartGroup(state.partGroup);
        setPartClass(state.partClass);
        // Restore flip states if they exist
        if (state.flipH !== undefined) setFlipH(state.flipH);
        if (state.flipV !== undefined) setFlipV(state.flipV);

        // Restore fold data from state FIRST
        if (state.startFoldDirection) {
          // Convert database format to frontend format
          // START fold needs inverted mapping due to inverted dropdown options
          let frontendDirection = state.startFoldDirection;
          if (frontendDirection === 'up') frontendDirection = 'Down';  // Inverted for START
          else if (frontendDirection === 'down') frontendDirection = 'Up';  // Inverted for START
          else if (frontendDirection === 'openup') frontendDirection = 'OpenDn';  // Inverted for START
          else if (frontendDirection === 'opendn') frontendDirection = 'OpenUp';  // Inverted for START

          setStartFoldType(frontendDirection);
          setStartFoldLength(state.startFoldLength || '');
          setStartFoldGap(state.startFoldGap || '');
        }

        // Restore first segment angle to preserve drawing orientation
        // DEBUG: Log all orientation-related values from state
        console.log('🔄 DrawingCanvas - Received orientation data from state:', {
          firstSegmentAngle: state.firstSegmentAngle,
          segmentAbsoluteAngles: state.segmentAbsoluteAngles,
          direction: state.direction,
          startFoldType: state.startFoldType,
          startFoldDirection: state.startFoldDirection,
          hasSegmentAbsoluteAngles: state.segmentAbsoluteAngles?.length > 0
        });

        if (state.firstSegmentAngle !== undefined) {
          // Always restore firstSegmentAngle for correct orientation
          console.log('🔄 Restoring firstSegmentAngle:', state.firstSegmentAngle);
          setFirstSegmentAngle(state.firstSegmentAngle);
        }

        if (state.endFoldDirection) {
          // Convert database format to frontend format  
          let frontendDirection = state.endFoldDirection;
          if (frontendDirection === 'up') frontendDirection = 'Up';
          else if (frontendDirection === 'down') frontendDirection = 'Down';
          else if (frontendDirection === 'openup') frontendDirection = 'OpenUp';
          else if (frontendDirection === 'opendn') frontendDirection = 'OpenDn';

          setEndFoldType(frontendDirection);
          setEndFoldLength(state.endFoldLength || '');
          setEndFoldGap(state.endFoldGap || '');
        }

        // Restore label offsets if they exist
        console.log('🏷️🏷️🏷️ DRAWINGCANVAS RESTORATION - Checking for labelOffsets in state');
        console.log('state.labelOffsets exists?', !!state.labelOffsets);
        console.log('state.labelOffsets value:', state.labelOffsets);

        if (state.labelOffsets) {
          console.log('🏷️ ✅ RESTORING label offsets from template:', state.labelOffsets);
          logger.debug('🏷️ Restoring label offsets from template:', state.labelOffsets);

          // SAFEGUARD: Handle case where labelOffsets might be an array (old data bug)
          // or an object without expected structure - normalize to proper object format
          let normalizedLabelOffsets = state.labelOffsets;
          if (Array.isArray(state.labelOffsets) || typeof state.labelOffsets !== 'object') {
            console.log('🏷️ ⚠️ labelOffsets is not an object, using default empty structure');
            normalizedLabelOffsets = {
              segmentLabels: {},
              angleLabels: {},
              foldLabels: {}
            };
          }

          // CRITICAL: Store the labelOffsets in state
          setLabelOffsets(normalizedLabelOffsets);
          console.log('🏷️ Called setLabelOffsets with:', normalizedLabelOffsets);

          // Also populate coordOffsets so labels render at saved positions immediately
          const restoredCoordOffsets = {};

          // Restore segment label offsets
          // NOTE: Segment labels are now stored as RELATIVE offsets in labelOffsets.segmentLabels
          // They should NOT be copied to coordOffsets (which expects absolute positions)
          // The rendering logic will read them from labelOffsets and apply as relative offsets
          if (normalizedLabelOffsets.segmentLabels) {
            console.log('🏷️ Segment label RELATIVE offsets restored via labelOffsets (not coordOffsets):', normalizedLabelOffsets.segmentLabels);
            // Don't copy to restoredCoordOffsets - they're relative and will be applied during render
          }

          // Restore angle label offsets
          // NOTE: Angle labels are now stored as RELATIVE offsets in labelOffsets.angleLabels
          // They should NOT be copied to coordOffsets (which expects absolute positions)
          // The rendering logic will read them from labelOffsets and apply as relative offsets
          if (normalizedLabelOffsets.angleLabels) {
            console.log('🏷️ Angle label RELATIVE offsets restored via labelOffsets (not coordOffsets):', normalizedLabelOffsets.angleLabels);
            // Don't copy to restoredCoordOffsets - they're relative and will be applied during render
          }

          // Restore fold label offsets
          // NOTE: Fold labels are now stored as RELATIVE offsets in labelOffsets.foldLabels
          // They should NOT be copied to coordOffsets (which expects absolute positions)
          // The rendering logic will read them from labelOffsets and apply as relative offsets
          if (normalizedLabelOffsets.foldLabels) {
            console.log('🏷️ Fold label RELATIVE offsets restored via labelOffsets (not coordOffsets):', normalizedLabelOffsets.foldLabels);
            // Don't copy to restoredCoordOffsets - they're relative and will be applied during render
          }

          console.log('🏷️ Total restored coordOffsets:', restoredCoordOffsets);
          logger.debug('🏷️ Restored coordOffsets:', restoredCoordOffsets);
          setCoordOffsets(restoredCoordOffsets);

          // Reset flag after state has settled (after all useEffects have run)
          setTimeout(() => {
            restoringLabelsRef.current = false;
            console.log('🏷️ Label restoration complete - allowing future coordOffsets clearing');
          }, 500);
        } else {
          console.log('🏷️ ❌ NO labelOffsets in state - labels will use default positions');
        }
      });

      // ═══════════════════════════════════════════════════════════════
      // TAPER MODE INITIALIZATION
      // Loads taper-specific data (Far and Near profiles) from navigation state
      // ═══════════════════════════════════════════════════════════════
      if (state.isTaper && !taperDataProcessedRef.current) {
        logger.debug('DrawingCanvas: Setting up taper mode');

        // Mark as processed to prevent re-running
        taperDataProcessedRef.current = true;

        // CRITICAL: Set showTaper immediately, NOT in startTransition
        // This ensures taper mode is active before any other effects run
        setShowTaper(true);

        // Get the data from state, handling both old and new format
        let farL = [...(state.farLengths || state.lengths || [])];
        let farA = [...(state.farAngles || state.angles || [])];
        let nearL = [...(state.nearLengths || [])];
        let nearA = [...(state.nearAngles || [])];

        // CRITICAL FIX: Handle templates saved with old incorrect format
        // DISABLED: This swap logic was causing issues with Edit Drawing navigation
        // The swap should only happen for truly old templates, not during normal editing
        // if (farL.length === 0 && nearL.length > 0) {
        //   logger.debug('🔄 Swapping far/near data - template was saved with old format');
        //   [farL, nearL] = [nearL, farL];
        //   [farA, nearA] = [nearA, farA];
        // }

        // If near data is missing after potential swap, duplicate far data (symmetric taper)
        if (nearL.length === 0 && farL.length > 0) {
          logger.debug('📋 Duplicating far data to near (symmetric taper)');
          nearL = [...farL];
        }
        if (nearA.length === 0 && farA.length > 0) {
          nearA = [...farA];
        }

        // Handle flip mode if needed
        logger.debug('🔍 CHECKING isFlip in taper restoration:', {
          isFlip: isFlip,
          'location.state?.isFlip': location.state?.isFlip,
          'searchParams.get(flip)': searchParams.get('flip'),
          'location.state?.isEdit': location.state?.isEdit
        });
        if (isFlip) {
          // For Finish & Flip, only swap Far and Near - do NOT flip the drawing orientation
          logger.debug('⚠️ FLIP MODE ACTIVE - Swapping Far and Near segments');
          logger.debug('Before swap:', {
            isFlip,
            flipParam: searchParams.get('flip'),
            farAngles: farA,
            nearAngles: nearA,
            isEditFromMaterialPage: location.state?.isEdit,
            preservedTemplateId: location.state?.preservedTemplateId
          });
          [farL, nearL] = [nearL, farL];
          [farA, nearA] = [nearA, farA];

          // Don't modify firstSegmentAngle - keep it as is
          // The backend will handle the rotation differently for flipped tapers

          logger.debug('⚠️ FLIP MODE ACTIVE - After swap:', {
            farAngles: farA,
            nearAngles: nearA,
            recalculatedFirstSegmentAngle: firstSegmentAngle
          });
        }


        // CRITICAL: Set taper arrays immediately to prevent them being cleared
        // These must be set synchronously, not in startTransition
        setFarLengths(farL);
        setFarAngles(farA);
        setNearLengths(nearL);
        setNearAngles(nearA);
        setBaseLengths(farL);
        setBaseAngles(farA);

        // CRITICAL FIX: Restore firstSegmentAngle for taper mode with folds
        // This preserves the drawing orientation
        // Check both state.firstSegmentAngle (from Edit Drawing) and state.template.firstSegmentAngle (from Finish button)
        const savedFirstSegmentAngle = state.firstSegmentAngle ?? state.template?.firstSegmentAngle;
        if (savedFirstSegmentAngle !== undefined && savedFirstSegmentAngle !== null) {
          setFirstSegmentAngle(savedFirstSegmentAngle);
        }

        // CRITICAL FIX: When loading from Copy/Flip, set hasEditedInTable to true
        // This ensures applyFixedWidths=true in calculatePoints, preventing segment shrinking
        // Note: Copy/Flip create NEW drawings (not edit mode), but still need fixed widths
        if (location.state?.isCopy || location.state?.isFlip) {
          setHasEditedInTable(true);
        }

        logger.debug('DrawingCanvas: Taper mode setup complete');
      } else if (state.isTaper) {
        // If it's taper but already processed, just skip
        logger.debug('DrawingCanvas: Taper already processed, skipping');
      }
      // ═══════════════════════════════════════════════════════════════
      // NORMAL MODE (NON-TAPER) INITIALIZATION
      // Loads standard single-profile drawing data from navigation state
      // ═══════════════════════════════════════════════════════════════
      else {
        startTransition(() => {
          setShowTaper(false);
          if (Array.isArray(state.lengths)) {
            logger.debug('✅ SETTING LENGTHS:', state.lengths);

            // DEBUG: Log detailed info about length 1000
            console.log('🔍 DrawingCanvas RECEIVING LENGTHS:', {
              rawLengths: state.lengths,
              lengthTypes: state.lengths.map((l, i) => ({
                index: i,
                rawValue: l,
                type: typeof l,
                is1000String: l === '1000',
                is1000Number: l === 1000,
                numberConversion: Number(l),
                afterCheck: (isNaN(Number(l)) || !isFinite(Number(l))) ? 0 : Number(l)
              }))
            });

            const numericLengths = state.lengths.map(l => {
              const num = Number(l);
              return (isNaN(num) || !isFinite(num)) ? 0 : num;
            });
            setLengths(numericLengths);
            setDisplayLengths(numericLengths); // Initialize displayLengths immediately to prevent race condition

            // CRITICAL FIX: When loading from Copy/Flip, set hasEditedInTable to true
            // This ensures applyFixedWidths=true in calculatePoints, preventing segment shrinking
            // Note: Copy/Flip create NEW drawings (not edit mode), but still need fixed widths
            if (location.state?.isCopy || location.state?.isFlip) {
              setHasEditedInTable(true);
            }
          }
          if (Array.isArray(state.angles)) {
            const validatedAngles = state.angles.map(a => {
              const num = Number(a);
              if (isNaN(num) || !isFinite(num)) {
                console.warn('Invalid angle value in state:', a);
                return 0;
              }
              return num;
            });
            const trimmedAngles = validatedAngles.slice(0, Math.max(0, state.lengths?.length - 1));
            const normalizedAngles = normalizeAllAngles(trimmedAngles);
            logger.debug('✅ SETTING ANGLES:', normalizedAngles);
            setAngles(normalizedAngles);
            setBaseLengths(state.lengths ?? []);
            setBaseAngles(normalizedAngles);
            // Initialize display angles with first angle as absolute
            const displayAngs = initializeDisplayAngles(
              normalizedAngles,  // Use normalized angles instead of trimmedAngles
              state.firstSegmentAngle || null,
              state.direction || 'Right'
            );
            setDisplayAngles(displayAngs);
          }

          // Removed auto-center that was causing drawing to disappear
          // The canvas offset will be handled by existing mechanisms
        });
      }
      return;
    }

    // If we have a templateId, fetch from API
    if (!isNewDrawing) {
      logger.debug('DrawingCanvas: No state found, fetching template from API');
      // Disable continuous drawing when loading existing template
      setContinuousDrawing(false);
      setFirstClickPoint(null); // Clear first click point when loading template

      axios.get(`${API_BASE_URL}/api/templates/${templateId}`)
        .then((res) => {
          const data = res.data?.data;
          logger.debug('DrawingCanvas: API response:', data);
          if (!data || !Array.isArray(data.lengths) || !Array.isArray(data.angles)) {
            swal.fire({
              text: 'Template is missing drawing data.',
              icon: 'error',
              title: 'Error'
            });
            return;
          }
          const {
            lengths,
            angles,
            name,
            direction,
            reverseColor: savedRC,
            isTaper,
            previewFar,
            previewNear,
            nearLengths,
            nearAngles,
            partGroup: savedPartGroup,
            partClass: savedPartClass,
            startFoldType: savedStartFoldType,
            startFoldDirection: savedStartFoldDirection,
            startFoldLength: savedStartFoldLength,
            endFoldType: savedEndFoldType,
            endFoldDirection: savedEndFoldDirection,
            endFoldLength: savedEndFoldLength
          } = data;

          // Map database fields correctly:
          // lengths = farLengths (primary/far profile)
          // angles = farAngles (primary/far profile)  
          // nearLengths = nearLengths (near profile for taper)
          // nearAngles = nearAngles (near profile for taper)
          const farLengths = lengths;
          // Validate angles before using them
          const farAngles = angles ? angles.map(a => {
            const num = Number(a);
            if (isNaN(num) || !isFinite(num)) {
              console.warn('Invalid angle value from template:', a);
              return 0;
            }
            return num;
          }) : [];

          // CRITICAL FIX: Set ref IMMEDIATELY, BEFORE any state updates
          // Must be synchronous to prevent auto-detection from running during template load
          hasAutoSetColorSideRef.current = true;
          console.log('✅ Set hasAutoSetColorSideRef.current = true (from library load) - BEFORE state updates');

          setTemplateName(name || '');
          setBaseReverseColor(savedRC ?? false);
          setReverseColor(savedRC ?? false);
          logger.debug('Setting direction from loaded data:', direction);
          setDirection(direction || 'Right');  // Default to 'Right' if undefined
          setPartGroup(savedPartGroup || 'Flashing');
          setPartClass(savedPartClass || 'Gutters');

          // Restore first segment angle if available in saved data
          if (data.firstSegmentAngle !== undefined && data.firstSegmentAngle !== null) {
            // For SSF at START, don't restore firstSegmentAngle - let it stay null to use direction
            if (savedStartFoldDirection === 'openup' || savedStartFoldDirection === 'opendn') {
              logger.debug('🔄 SSF at START (DB): Not restoring firstSegmentAngle, keeping as null to use direction');
              // Don't set firstSegmentAngle - leave it as null
            } else {
              // For SF or no fold, use the angle as-is
              // Keep exact value for geometry calculation
              setFirstSegmentAngle(data.firstSegmentAngle);
            }
          } else {
            // If firstSegmentAngle is not saved (older templates), calculate it from direction and first angle
            const directionMap = DIRECTION_MAP;

            // For older templates without firstSegmentAngle saved:
            // The actual first segment angle = direction angle + first turn angle
            const baseAngle = directionMap[direction] ?? 0;
            if (angles && angles.length > 0) {
              // Calculate what the first segment angle should be
              // This is the direction angle for segment 0
              // (The first angle in the array is the turn from segment 0 to segment 1)
              setFirstSegmentAngle(baseAngle);
            }
          }

          // Restore fold data
          if (savedStartFoldDirection) {
            // Convert database format to frontend format
            // START fold needs inverted mapping due to inverted dropdown options
            let frontendDirection = savedStartFoldDirection;
            if (frontendDirection === 'up') frontendDirection = 'Down';  // Inverted for START
            else if (frontendDirection === 'down') frontendDirection = 'Up';  // Inverted for START
            else if (frontendDirection === 'openup') frontendDirection = 'OpenDn';  // Inverted for START
            else if (frontendDirection === 'opendn') frontendDirection = 'OpenUp';  // Inverted for START

            setStartFoldType(frontendDirection);
            setStartFoldLength(savedStartFoldLength || 8);
            setStartFoldGap(data.startFoldGap || '');
          }
          if (savedEndFoldDirection) {
            // Convert database format to frontend format  
            let frontendDirection = savedEndFoldDirection;
            if (frontendDirection === 'up') frontendDirection = 'Up';
            else if (frontendDirection === 'down') frontendDirection = 'Down';
            else if (frontendDirection === 'openup') frontendDirection = 'OpenUp';
            else if (frontendDirection === 'opendn') frontendDirection = 'OpenDn';

            setEndFoldType(frontendDirection);
            setEndFoldLength(savedEndFoldLength || 8);
            setEndFoldGap(data.endFoldGap || '');
          }

          if (isTaper) {
            logger.debug('🔧 FIXING: Setting showTaper to true because isTaper is true');
            setShowTaper(true);

            // SIMPLIFIED taper data loading now that we have correct field mapping
            let farLens = [...(farLengths || [])];
            let farAngs = [...(farAngles || [])];
            let nearLens = [...(nearLengths || [])];
            let nearAngs = [...(nearAngles || [])];

            // CRITICAL FIX: Handle templates saved with old incorrect format
            // DISABLED: This swap logic was causing issues with Edit Drawing navigation
            // if (farLens.length === 0 && nearLens.length > 0) {
            //   logger.debug('🔄 Swapping far/near data - template was saved with old format');
            //   [farLens, nearLens] = [nearLens, farLens];
            //   [farAngs, nearAngs] = [nearAngs, farAngs];
            // }

            // If near data is missing after potential swap, duplicate far data (symmetric taper)
            if (nearLens.length === 0 && farLens.length > 0) {
              logger.debug('📋 Duplicating far data to near (symmetric taper)');
              nearLens = [...farLens];
            }
            if (nearAngs.length === 0 && farAngs.length > 0) {
              nearAngs = [...farAngs];
            }

            logger.debug('Final taper arrays:', { farLens, farAngs, nearLens, nearAngs });

            // SWAP if isFlip
            // Only swap when explicitly in flip mode (from Finish & Flip operation)
            if (isFlip) {
              [farLens, nearLens] = [nearLens, farLens];
              [farAngs, nearAngs] = [nearAngs, farAngs];
              logger.debug('After flip:', { farLens, farAngs, nearLens, nearAngs });
            }

            // Ensure arrays have valid data before setting state
            logger.debug('Setting state with:', {
              farLengths: farLens,
              farAngles: farAngs,
              nearLengths: nearLens,
              nearAngles: nearAngs
            });

            setFarLengths([...farLens]);
            // Validate farAngles before setting
            const validatedFarAngles = farAngs.map(a => {
              const num = Number(a);
              if (isNaN(num) || !isFinite(num)) {
                console.warn('Invalid farAngle value:', a);
                return 0;
              }
              return num;
            });
            setFarAngles(validatedFarAngles);
            setNearLengths([...nearLens]);
            // nearAngles should mirror farAngles
            setNearAngles(validatedFarAngles);
            setBaseLengths([...farLens]);
            setBaseAngles([...farAngs]);

            // Removed auto-center for API-loaded taper mode
          } else if (!isNewDrawing) {
            // Only reset showTaper for existing templates, not fresh drawings
            logger.debug('🔧 FIXING: Setting showTaper to false because isTaper is false (existing template)');
            setShowTaper(false);
            setLengths(lengths);
            const trimmedAngles = angles.slice(0, Math.max(0, lengths.length - 1));
            const normalizedAngles = normalizeAllAngles(trimmedAngles);
            setAngles(normalizedAngles);
            setBaseLengths(lengths);
            setBaseAngles(normalizedAngles);
            // Initialize display angles with first angle as absolute
            const displayAngs = initializeDisplayAngles(
              normalizedAngles,  // Use normalized angles instead of trimmedAngles
              data.firstSegmentAngle || null,
              direction || 'Right'
            );
            setDisplayAngles(displayAngs);

            // Initialize segment absolute angles for proper rendering
            const absoluteAngles = [];
            const directionMap = DIRECTION_MAP;
            let currentAngle = data.firstSegmentAngle || ((directionMap[direction] || 0));

            for (let i = 0; i < lengths.length; i++) {
              if (i === 0) {
                absoluteAngles.push(currentAngle);
              } else {
                currentAngle = normalizeDegrees(currentAngle + (trimmedAngles[i - 1] || 0));
                absoluteAngles.push(currentAngle);
              }
            }

            setSegmentAbsoluteAngles(absoluteAngles);

            // Removed auto-center for API-loaded normal mode
          }

        })
        .catch(() => swal.fire({
          text: 'Failed to load template.',
          icon: 'error',
          title: 'Error'
        }));
    }

  }, [templateId, isNewDrawing]); // Remove location.state from dependencies to prevent infinite loop

  // ═══════════════════════════════════════════════════════════════
  // useEffect: AUTOMATIC COLOR SIDE BASED ON DIRECTION (SWI Convention)
  // For NEW drawings only: LEFT side keeps default, RIGHT side gets adjusted
  // Detects when first segment is added (0 → 1) and auto-sets color side
  // LEFT → reverseColor=false (default), RIGHT → reverseColor=true (to match LEFT)
  // Existing drawings keep their saved reverseColor value
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const currentCount = lengths.length;
    const prevCount = prevLengthsCountRef.current;

    // Define isLoadingExisting at the TOP of useEffect so it can be used throughout
    // CRITICAL: Also require actual drawing data (lengths/angles) to be considered "loading existing"
    // This allows auto-detection after clearing in edit mode (isEdit=true but no lengths/angles)
    const hasDrawingDataInState = (location.state?.lengths && location.state.lengths.length > 0) ||
      (location.state?.angles && location.state.angles.length > 0) ||
      (location.state?.farLengths && location.state.farLengths.length > 0);
    const isLoadingExisting = hasDrawingDataInState && (
      location.state?.reverseColor !== undefined || location.state?.isEdit || location.state?.isFromEditDrawingNoTemplate
    );

    // Save initial direction when drawing starts (lengths goes from 0 to 0, or initial state)
    // Only save if direction is Left or Right (horizontal starting direction)
    if (currentCount === 0 && (direction === 'Left' || direction === 'Right')) {
      if (initialDirectionRef.current !== direction) {
        console.log('💾 Saving initial direction:', direction);
        initialDirectionRef.current = direction;
      }
    }

    // Reset flags when drawing is cleared
    // BUT: Don't reset if we're loading an existing drawing from Edit Drawing
    if (currentCount === 0 && !isLoadingExisting) {
      if (hasAutoSetColorSideRef.current) {
        console.log('🧹 Resetting auto-set color side flag (drawing cleared)');
        hasAutoSetColorSideRef.current = false;
      }
      if (lockedCentroidCorrectionRef.current !== null) {
        console.log('🧹 Resetting locked centroid correction (drawing cleared)');
        lockedCentroidCorrectionRef.current = null;
      }
      // Don't reset initialDirectionRef here - we need it when first segment is added
    }

    // Detect transition from 0 → 1 (first segment added)
    const isFirstSegmentAdded = prevCount === 0 && currentCount === 1;

    // isLoadingExisting is now defined at the top of this useEffect

    // Debug: log all conditions
    if (currentCount === 1) {
      console.log('🔍 First segment conditions check:', {
        isNewDrawing,
        isFirstSegmentAdded,
        isLoadingExisting,
        hasAutoSetColorSideRef: hasAutoSetColorSideRef.current,
        direction,
        initialDirection: initialDirectionRef.current,
        currentCount,
        prevCount,
        // ADDED: Debug values for isNewDrawing calculation
        templateId,
        isEditFlag: location.state?.isEdit,
        preservedTemplateId: location.state?.preservedTemplateId,
        isFromEditDrawingNoTemplate: location.state?.isFromEditDrawingNoTemplate,
        reverseColorFromState: location.state?.reverseColor
      });
    }

    // CRITICAL: Only set color side ONCE on first segment, ONLY for RIGHT side
    // LEFT side is already correct by default, so don't change it
    // Use ref to ensure it only happens once per drawing session
    // NOTE: hasAutoSetColorSideRef.current is set to true when loading existing drawings,
    // and reset to false when clearing. This is the primary guard against re-auto-detecting.
    // isLoadingExisting check prevents auto-detection during initial load of existing drawings.
    // We no longer require isNewDrawing because clearing in edit mode should still allow auto-detection.
    if (isFirstSegmentAdded && !isLoadingExisting && !hasAutoSetColorSideRef.current) {
      // Use savedDirection to detect if starting from LEFT or RIGHT
      const savedDir = initialDirectionRef.current || direction;
      const isStartingFromRight = (savedDir === 'Right');

      // ONLY change reverseColor for RIGHT side
      // LEFT side keeps default (false)
      // RIGHT side needs true to match LEFT
      let shouldReverseColor = false; // Default for LEFT

      if (isStartingFromRight) {
        // RIGHT side needs to be flipped to match LEFT
        shouldReverseColor = true;
      }

      console.log('⚠️ AUTO-DETECTION RUNNING - Setting color side on first segment:', {
        savedDirection: savedDir,
        currentDirection: direction,
        isStartingFromRight,
        shouldReverseColor,
        meaning: isStartingFromRight ? 'RIGHT side → reverseColor=true (to match LEFT)' : 'LEFT side → reverseColor=false (default)',
        WARNING: 'THIS SHOULD NOT RUN when editing existing drawing!'
      });

      setReverseColor(shouldReverseColor);
      setBaseReverseColor(shouldReverseColor);
      hasAutoSetColorSideRef.current = true; // Mark as done
      console.log('✅ Set hasAutoSetColorSideRef.current = true (from auto-detection)');

      // Reset initial direction after using it
      initialDirectionRef.current = null;
    }

    // Update ref for next render
    prevLengthsCountRef.current = currentCount;
  }, [direction, lengths.length, location.state]); // Dependencies: direction for auto-detection, lengths.length for first segment detection, location.state for isLoadingExisting

  // Debug log to see actual state values after useEffect
  useEffect(() => {
    logger.debug('📊 CURRENT STATE VALUES:', {
      lengths,
      angles,
      farLengths,
      nearLengths,
      showTaper,
      templateName
    });
  }, [lengths, angles, farLengths, nearLengths, showTaper, templateName]);

  // Calculate and maintain absolute angles for each segment
  useEffect(() => {
    // Use farLengths/farAngles when in taper mode, otherwise use regular lengths/angles
    const lengthsToUse = showTaper && farLengths.length > 0 ? farLengths : lengths;
    const anglesToUse = showTaper && farAngles.length > 0 ? farAngles : angles;

    if (!Array.isArray(lengthsToUse) || lengthsToUse.length === 0) {
      setSegmentAbsoluteAngles([]);
      return;
    }

    // Don't recalculate during dragging (for both Lock Legends ON and OFF)
    // This prevents other segments from moving while dragging a single point
    if (draggingPoints) {
      return;
    }

    // Always recalculate absolute angles when angles change or segment count changes
    // This ensures the drawing updates immediately when angles are modified
    const directionMap = {
      'Up': 90,
      'Down': -90,
      'Right': 0,
      'Left': 180,
    };

    const absoluteAngles = [];
    let currentAngle = firstSegmentAngle !== null ? firstSegmentAngle : (directionMap[direction] ?? 0);

    // Calculate absolute angle for each segment
    for (let i = 0; i < lengthsToUse.length; i++) {
      if (i === 0) {
        absoluteAngles.push(currentAngle);
      } else {
        // Add the turn angle to get the next segment's absolute angle
        currentAngle += anglesToUse[i - 1] || 0;
        absoluteAngles.push(currentAngle);
      }
    }

    setSegmentAbsoluteAngles(absoluteAngles);
  }, [showTaper ? farLengths.length : lengths.length, firstSegmentAngle, direction, showTaper, farLengths, farAngles, lengths, angles, draggingPoints]); // Recalculate when mode or structure changes

  // Initialize displayLengths when lengths are set
  useEffect(() => {
    // Only initialize if displayLengths is empty but lengths has values
    if (lengths.length > 0 && displayLengths.length === 0) {
      const validLengths = lengths.filter(l => l !== '' && l != null);
      if (validLengths.length > 0) {
        console.log('Initializing displayLengths from lengths:', lengths);
        setDisplayLengths([...lengths]);
      }
    }
  }, [lengths]);

  useEffect(() => {
    if (!Array.isArray(lengths) || !Array.isArray(angles)) return;
    // Don't recalculate points while dragging to avoid conflicts
    if (draggingPoints) return;
    // Skip if we're manually updating from onChange
    if (skipPointRecalc.current) {
      skipPointRecalc.current = false;
      return;
    }
    // Apply fixed widths ONLY when user has actually edited values in the table
    // NOT just when they stop drawing OR in any create mode (pure or template-based)
    // EXCEPT: Copy/Flip operations should apply fixed widths even though they create "new" drawings
    const isCreateMode = !templateId; // Pure create mode (not from template)
    const isCopyOrFlipOperation = location.state?.isCopy || location.state?.isCopyOperation || location.state?.isFlip || location.state?.isFlipOperation;
    const isAnyCreateMode = (isCreateMode || templateCreateMode) && !isCopyOrFlipOperation; // Exclude copy/flip from create mode
    const applyFixedWidths = hasEditedInTable && !continuousDrawing && !isAnyCreateMode;
    const newPoints = calculatePointsLocal(lengths, angles, direction, segmentAbsoluteAngles, displayLengths, applyFixedWidths);
    setPoints(newPoints);

    // Set first segment angle if we have at least 2 points
    // BUT not if SSF is at START - let it use direction instead
    const hasStartSSF = startFoldType === 'OpenUp' || startFoldType === 'OpenDn';
    if (newPoints.length > 1 && firstSegmentAngle === null && !hasStartSSF) {
      const dx = newPoints[1].x - newPoints[0].x;
      const dy = newPoints[1].y - newPoints[0].y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      setFirstSegmentAngle(angle);
    }
  }, [
    lengths,
    angles,
    direction,
    startFoldType,
    startFoldLength,
    endFoldType,
    endFoldLength,
    draggingPoints,
    firstSegmentAngle, // Add this to recalculate when it's reset to null
    segmentAbsoluteAngles, // Need this to trigger recalc when absolute angles change
    displayLengths, // Need this to preserve visual lengths when input is empty
    hasEditedInTable, // Need this to trigger recalc when table is edited
    continuousDrawing, // Need this to recalc when starting/stopping drawing
    templateCreateMode // Need this to detect create mode changes
  ]);

  // Reset firstClickPoint on mount if in create mode
  useEffect(() => {
    if (!templateId && lengths.length === 0) {
      setFirstClickPoint(null);
      setFirstClickPixelPos(null);
      setHoverPoint(null);
    }
  }, []); // Run once on mount

  // ═══════════════════════════════════════════════════════════════
  // NORMAL MODE: GIRTH-BASED DYNAMIC SCALING
  // Automatically adjusts zoom based on total girth to fit drawing on screen
  // Updates when: (1) Girth changes to different tier, or (2) Table is edited
  // Tier 1 (≤250mm): shrinkFactor 0.75 | Tier 2 (≤500mm): 0.70
  // Tier 3 (≤1000mm): 0.65 | Tier 4 (>1000mm): 0.60
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!continuousDrawing && lengths.length > 0) {
      const lengthsForGirth = lengths.map(len => {
        const numLen = typeof len === 'number' ? len : Number(len);
        return isNaN(numLen) || !isFinite(numLen) || len === '' || len == null ? 0 : numLen;
      });
      const currentGirth = lengthsForGirth.reduce((sum, len) => sum + len, 0);

      const getGirthTier = (girth) => {
        if (girth <= 250) return 1;
        if (girth <= 500) return 2;
        if (girth <= 1000) return 3;
        return 4;
      };

      const currentTier = getGirthTier(currentGirth);
      const previousTier = getGirthTier(preservedGirth);

      // Update if: girth changed OR forceRecalculate was triggered (table edit)
      if (currentGirth !== preservedGirth || forceRecalculate > 0) {
        let calculatedShrinkFactor = 0.65;
        if (currentGirth <= 250) calculatedShrinkFactor = 0.75;
        else if (currentGirth <= 500) calculatedShrinkFactor = 0.70;
        else if (currentGirth <= 1000) calculatedShrinkFactor = 0.65;
        else calculatedShrinkFactor = 0.60;

        console.log('🔒 useEffect - RECALCULATING SHRINK FACTOR:', {
          previousGirth: preservedGirth,
          currentGirth,
          previousTier,
          currentTier,
          tierChanged: currentTier !== previousTier,
          forceRecalculate,
          calculatedShrinkFactor
        });
        setPreservedShrinkFactor(calculatedShrinkFactor);
        setPreservedGirth(currentGirth);
      }
    }
  }, [lengths, continuousDrawing, preservedGirth, preservedShrinkFactor, forceRecalculate]); // Include forceRecalculate

  // ═══════════════════════════════════════════════════════════════
  // TAPER MODE: GIRTH-BASED DYNAMIC SCALING (FAR & NEAR)
  // Each canvas (Far and Near) scales independently based on its own girth
  // Same tier system as normal mode, but applied separately to each profile
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (showTaper) {
      const getGirthTier = (girth) => {
        if (girth <= 250) return 1;
        if (girth <= 500) return 2;
        if (girth <= 1000) return 3;
        return 4;
      };

      // Far canvas
      if (farLengths.length > 0) {
        const farLengthsForGirth = farLengths.map(len => {
          const numLen = typeof len === 'number' ? len : Number(len);
          return isNaN(numLen) || !isFinite(numLen) || len === '' || len == null ? 0 : numLen;
        });
        const farGirth = farLengthsForGirth.reduce((sum, len) => sum + len, 0);
        const farCurrentTier = getGirthTier(farGirth);
        const farPreviousTier = getGirthTier(preservedFarGirth);

        // ALWAYS update if girth changed
        if (farGirth !== preservedFarGirth) {
          let calculatedFarShrinkFactor = 0.65;
          if (farGirth <= 250) calculatedFarShrinkFactor = 0.75;
          else if (farGirth <= 500) calculatedFarShrinkFactor = 0.70;
          else if (farGirth <= 1000) calculatedFarShrinkFactor = 0.65;
          else calculatedFarShrinkFactor = 0.60;

          console.log('🔒 useEffect TAPER FAR - RECALCULATING:', {
            previousGirth: preservedFarGirth,
            currentGirth: farGirth,
            previousTier: farPreviousTier,
            currentTier: farCurrentTier,
            calculatedShrinkFactor: calculatedFarShrinkFactor
          });
          setPreservedFarShrinkFactor(calculatedFarShrinkFactor);
          setPreservedFarGirth(farGirth);
        }
      }

      // Near canvas
      if (nearLengths.length > 0) {
        const nearLengthsForGirth = nearLengths.map(len => {
          const numLen = typeof len === 'number' ? len : Number(len);
          return isNaN(numLen) || !isFinite(numLen) || len === '' || len == null ? 0 : numLen;
        });
        const nearGirth = nearLengthsForGirth.reduce((sum, len) => sum + len, 0);
        const nearCurrentTier = getGirthTier(nearGirth);
        const nearPreviousTier = getGirthTier(preservedNearGirth);

        // ALWAYS update if girth changed
        if (nearGirth !== preservedNearGirth) {
          let calculatedNearShrinkFactor = 0.65;
          if (nearGirth <= 250) calculatedNearShrinkFactor = 0.75;
          else if (nearGirth <= 500) calculatedNearShrinkFactor = 0.70;
          else if (nearGirth <= 1000) calculatedNearShrinkFactor = 0.65;
          else calculatedNearShrinkFactor = 0.60;

          console.log('🔒 useEffect TAPER NEAR - RECALCULATING:', {
            previousGirth: preservedNearGirth,
            currentGirth: nearGirth,
            previousTier: nearPreviousTier,
            currentTier: nearCurrentTier,
            calculatedShrinkFactor: calculatedNearShrinkFactor
          });
          setPreservedNearShrinkFactor(calculatedNearShrinkFactor);
          setPreservedNearGirth(nearGirth);
        }
      }
    }
  }, [farLengths, nearLengths, showTaper, preservedFarGirth, preservedFarShrinkFactor, preservedNearGirth, preservedNearShrinkFactor]); // Include preserved values

  // Reset firstClickPoint when in create mode with no segments
  useEffect(() => {
    if (continuousDrawing && lengths.length === 0) {
      setFirstClickPoint(null);
      setFirstClickPixelPos(null);
      setHoverPoint(null);
    }
  }, [continuousDrawing, lengths.length]);

  useEffect(() => {
    if (isFlip) {
      try {
        const raw = localStorage.getItem('taperSegments');
        const taperSegments = JSON.parse(raw || '[]');
        if (taperSegments.length > 0) {
          const segLengths = taperSegments.map(s => parseFloat(s.length));
          const far = taperSegments.map(s => parseFloat(s.far));
          const near = taperSegments.map(s => parseFloat(s.near));
          const trimmedFar = far.slice(0, Math.max(0, segLengths.length - 1));
          const trimmedNear = near.slice(0, Math.max(0, segLengths.length - 1));
          setLengths(segLengths);
          setFarAngles(trimmedFar);
          setNearAngles(trimmedNear);
          setAngles(trimmedFar);
          setShowTaper(true);
        }
      } catch (err) {
        logger.error('Failed to parse taperSegments:', err);
        swal.fire({
          text: 'Invalid taper segment data.',
          icon: 'error',
          title: 'Error'
        });
      }
    }
  }, [isFlip]);

  useEffect(() => {
    // Clear fold label offsets when fold type changes, but keep other label offsets
    const startChanged = prevFoldTypesRef.current.start !== startFoldType;
    const endChanged = prevFoldTypesRef.current.end !== endFoldType;

    if (startChanged || endChanged) {
      // Don't clear fold labels if we're restoring from template
      if (restoringLabelsRef.current) {
        console.log('🏷️ SKIPPING fold label clear - currently restoring labels from template');
        return;
      }
      console.log('🧹 Clearing fold labels due to fold type change:', { startChanged, endChanged });
      setCoordOffsets(prev => {
        const newOffsets = { ...prev };
        // Remove fold label offsets so they recalculate based on new fold type
        // Include both standard and taper-specific keys
        if (startChanged) {
          delete newOffsets['fold-start'];
          delete newOffsets['fold-far-start'];
          delete newOffsets['fold-near-start'];
        }
        if (endChanged) {
          delete newOffsets['fold-end'];
          delete newOffsets['fold-far-end'];
          delete newOffsets['fold-near-end'];
        }
        return newOffsets;
      });

      // Also clear saved offsets from labelOffsets for changed fold types
      setLabelOffsets(prev => {
        const updates = { ...prev };
        if (startChanged) {
          if (updates.foldLabels) delete updates.foldLabels['start'];
          if (updates.farFoldLabels) delete updates.farFoldLabels['start'];
          if (updates.nearFoldLabels) delete updates.nearFoldLabels['start'];
        }
        if (endChanged) {
          if (updates.foldLabels) delete updates.foldLabels['end'];
          if (updates.farFoldLabels) delete updates.farFoldLabels['end'];
          if (updates.nearFoldLabels) delete updates.nearFoldLabels['end'];
        }
        return updates;
      });

      // Update previous fold types
      prevFoldTypesRef.current = { start: startFoldType, end: endFoldType };
    }
  }, [startFoldType, endFoldType]);

  useEffect(() => {
    // Clear all offsets when flip or taper mode changes
    // BUT don't clear if we're currently restoring labelOffsets from a saved template
    if (restoringLabelsRef.current) {
      console.log('🏷️ SKIPPING coordOffsets clear - currently restoring labels from template');
      return;
    }
    console.log('🧹 Clearing coordOffsets due to flip/taper change');
    setCoordOffsets({});
  }, [flipH, flipV, showTaper]);

  // Debug: Log whenever coordOffsets changes
  useEffect(() => {
    console.log('🔄 coordOffsets STATE CHANGED:', coordOffsets);
    console.log('  Keys:', Object.keys(coordOffsets));
  }, [coordOffsets]);

  // Clear fold and angle label coordOffsets when angles change so they recalculate with new geometry
  // but KEEP labelOffsets since those are relative offsets that will be applied to new geometry
  useEffect(() => {
    // Don't clear during label restoration from navigation
    if (restoringLabelsRef.current) {
      console.log('🏷️ SKIPPING coordOffsets clear - currently restoring labels from navigation');
      return;
    }

    // Clear only from coordOffsets (temporary drag state)
    setCoordOffsets(prev => {
      const newOffsets = { ...prev };
      // Clear fold labels (including taper-specific keys)
      delete newOffsets['fold-start'];
      delete newOffsets['fold-end'];
      delete newOffsets['fold-far-start'];
      delete newOffsets['fold-far-end'];
      delete newOffsets['fold-near-start'];
      delete newOffsets['fold-near-end'];
      // Clear angle labels (including taper-specific keys like 'ang-far-0', 'ang-near-1')
      Object.keys(newOffsets).forEach(key => {
        if (key.startsWith('ang-')) {
          delete newOffsets[key];
        }
      });
      return newOffsets;
    });
    // Don't clear labelOffsets - they contain relative offsets that work with any geometry
  }, [angles, farAngles, nearAngles]);

  // Clear extension point when continuous drawing changes or in edit mode
  useEffect(() => {
    // Don't set extension point automatically - only set it during drag
    const isEditMode = searchParams.get('isEdit') === 'true';

    if ((isNewDrawing && continuousDrawing) || templateCreateMode) {
      // Clear extension point when continuous drawing is active
      setExtensionPoint(null);
    } else if (isEditMode) {
      // Always clear extension point in edit mode
      setExtensionPoint(null);
    }
    // Don't set extension point automatically when stopping drawing
  }, [continuousDrawing, isNewDrawing, searchParams]);

  // Reset save feedback states when drawing data changes
  useEffect(() => {
    // Reset all save feedback states when user modifies the drawing
    setSavedToLibrary(false);
    setSavedToMyLibrary(false);
    setSavedToCustomerLibrary(false);
  }, [lengths, angles, farLengths, farAngles, nearLengths, nearAngles, reverseColor, direction]);

  //Code change by rahul
  // ═══════════════════════════════════════════════════════════════
  // useEffect: AUTO-FOCUS FIRST INPUT ON INITIAL LOAD ONLY
  // When navigating from Edit Drawing, Copy, or Flip - focus first input
  // This only runs on INITIAL mount - toggle focus is handled by separate useEffect
  // Library taper uses toggle useEffect (focuses NEAR when user toggles to taper)
  // Library normal mode focuses first length here
  // ═══════════════════════════════════════════════════════════════
  const initialFocusAppliedRef = useRef(false);
  useEffect(() => {
    // Only run once on initial mount
    if (initialFocusAppliedRef.current) return;

    // Check if we're loading a template (from edit, copy, flip)
    const isEditMode = location.state?.isEdit === true || location.state?.isCopy === true || location.state?.isFlip === true;
    const hasTemplateData = (lengths.length > 0 || farLengths.length > 0);

    if (isEditMode && hasTemplateData) {
      // Mark that initial focus has been applied
      initialFocusAppliedRef.current = true;

      // Edit/Copy/Flip: focus FAR for taper, first length for normal (INITIAL LOAD ONLY)
      setTimeout(() => {
        if (showTaper && farLengthRefs.current[0]) {
          // Taper mode (edit/copy/flip): focus first Far Length input
          farLengthRefs.current[0]?.focus();
        } else if (lengthRefs.current[0]) {
          // Normal mode: focus first Length input
          lengthRefs.current[0]?.focus();
        }
      }, 300);
    } else if (isFromLibrary && hasTemplateData && !showTaper) {
      // Mark that initial focus has been applied
      initialFocusAppliedRef.current = true;

      // Library with normal mode: focus first length
      // Library with taper: toggle useEffect handles NEAR focus when user toggles
      setTimeout(() => {
        if (lengthRefs.current[0]) {
          lengthRefs.current[0]?.focus();
        }
      }, 300);
    }
  }, [location.state?.isEdit, showTaper, location.state?.isCopy, location.state?.isFlip, isFromLibrary, lengths.length, farLengths.length]);

  // ESC key listener to stop drawing mode
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if ESC key is pressed and continuous drawing is active
      if (event.key === 'Tab' && continuousDrawing) {
        // Set flag to skip saveToHistory calls triggered by auto-focus
        skipNextHistorySaveRef.current = true;

        setContinuousDrawing(false);
        setFirstClickPoint(null);
        setFirstClickPixelPos(null);
        setHoverPoint(null);
        // Reset cursor to default
        const stage = document.querySelector('.konvajs-content canvas');
        if (stage && stage.parentElement) {
          stage.parentElement.style.cursor = 'default';
        }
        // Exit template create mode if active
        if (templateCreateMode) {
          setTemplateCreateMode(false);
        }
        logger.debug('ESC key pressed - stopped drawing mode');

        // Auto-focus on first length input after stopping drawing mode
        setTimeout(() => {
          if (showTaper && nearLengthRefs.current[0]) {
            nearLengthRefs.current[0]?.focus();
          } else if (lengthRefs.current[0]) {
            lengthRefs.current[0]?.focus();
          }
        }, 100);

        // Clear the skip flag after auto-focus has completed
        setTimeout(() => {
          skipNextHistorySaveRef.current = false;
        }, 200);
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup on unmount or when dependencies change
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [continuousDrawing, templateCreateMode, showTaper]);

  // Auto-focus on first length input when drawing mode stops
  useEffect(() => {
    // Only focus when drawing mode is stopped (not when starting)
    if (!continuousDrawing && lengths.length > 0) {
      setTimeout(() => {
        // Check if user is already editing an input field - don't steal focus
        const activeEl = document.activeElement;
        const isAlreadyEditingInput = activeEl &&
          (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

        if (isAlreadyEditingInput) {
          // User is already focused on an input, don't steal focus
          return;
        }

        if (showTaper && nearLengthRefs.current[0]) {
          nearLengthRefs.current[0]?.focus();
        } else if (lengthRefs.current[0]) {
          lengthRefs.current[0]?.focus();
        }
      }, 100);
    }
  }, [continuousDrawing, showTaper, lengths.length]);

  /**
   * Wrapper function that calculates point coordinates for drawing segments
   * Calls the imported calculatePoints with current state variables (folds, origin offset, etc.)
   * This is the core geometry calculation that converts lengths/angles into drawable points
   * @param {Array} lengthsArr - Segment lengths in mm
   * @param {Array} anglesArr - Turn angles in degrees between segments
   * @param {String} direction - Initial direction: 'Right', 'Left', 'Up', 'Down'
   * @param {Array} absoluteAngles - Absolute angle (compass direction) for each segment
   * @param {Array} preservedLengths - Lengths to display when input is empty/invalid
   * @param {Boolean} applyFixedWidths - Whether to apply fixed width scaling for large segments
   * @returns {Array} - Array of {x, y} point coordinates with fold points marked
   */
  const calculatePointsLocal = (lengthsArr, anglesArr, direction = 'Right', absoluteAngles = [], preservedLengths = [], applyFixedWidths = false) => {
    return calculatePoints(
      lengthsArr,
      anglesArr,
      direction,
      absoluteAngles,
      preservedLengths,
      applyFixedWidths,
      originOffset,
      firstSegmentAngle,
      startFoldType,
      startFoldLength,
      endFoldType,
      endFoldLength
    );
  };

  /**
   * Handle canvas zoom and pan controls
   * Controls the viewport transformation (zoom level and offset)
   * @param {String} action - Control action: 'left', 'right', 'up', 'down', 'zoom-in', 'zoom-out'
   */
  const handleControl = (action) => {
    const step = 40; // Step size for panning (in pixels)
    const zoomStep = 0.1; // Zoom increment/decrement

    if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
      setCanvasOffset(prev => {
        let newOffset = { ...prev };

        // Increased limits to allow viewing tall/wide drawings that extend beyond grid
        const maxOffsetX = 300;  // Horizontal movement limit
        const maxOffsetY = 400;  // Vertical movement limit (increased for tall drawings)

        switch (action) {
          case 'left':
            newOffset.x = Math.max(prev.x - step, -maxOffsetX);
            break;
          case 'right':
            newOffset.x = Math.min(prev.x + step, maxOffsetX);
            break;
          case 'up':
            newOffset.y = Math.max(prev.y - step, -maxOffsetY);
            break;
          case 'down':
            newOffset.y = Math.min(prev.y + step, maxOffsetY);
            break;
        }
        console.log('Canvas offset changed:', action, 'from', prev, 'to', newOffset);
        return newOffset;
      });
    }

    if (action === 'zoom-in' || action === 'zoom-out') {
      if (action === 'zoom-in') {
        // Limit zoom to keep drawing within grid boundaries
        setCanvasScale(prev => {
          const maxSafeZoom = 1.2; // Maximum zoom to keep drawing within grid

          if (prev >= maxSafeZoom) {
            console.log('Maximum safe zoom reached:', maxSafeZoom);
            return prev; // Don't increase zoom
          }

          const newScale = Math.min(prev + zoomStep, maxSafeZoom);

          // Reset offset when zooming to keep centered
          setCanvasOffset({ x: 0, y: 0 });

          console.log('Zoom in - Current scale:', prev, 'New scale:', newScale);
          return newScale;
        });
      } else {
        // Zoom out - limit minimum to keep drawing within grid boundaries
        setCanvasScale(prev => {
          const minSafeZoom = 0.5; // Minimum zoom to keep drawing within grid
          const newScale = Math.max(prev - zoomStep, minSafeZoom);

          if (prev <= minSafeZoom) {
            console.log('Minimum safe zoom reached:', minSafeZoom);
            return prev; // Don't decrease zoom further
          }

          // When zooming out significantly, reduce pan offset to keep drawing visible
          if (newScale < 0.8 && prev >= 0.8) {
            setCanvasOffset(currentOffset => ({
              x: currentOffset.x * 0.5,
              y: currentOffset.y * 0.5
            }));
          }

          return newScale;
        });
      }
    }
  };


  /**
   * Create library entry in template_library table
   * Called after template is successfully saved to link it to a library
   * @param {String} templateId - ID of the template to add to library
   * @param {String} libraryType - Type of library: 'part_class', 'my_library', or 'customer_library'
   * @param {Object} options - Additional options (partGroup, partClass, customerId, customerName)
   */
  const createLibraryEntry = async (templateId, libraryType, options = {}) => {
    try {
      const token = tokenManager.getToken();

      const payload = {
        template_id: templateId,
        library_type: libraryType,
        saved_by: USER_ID
      };

      // Add type-specific fields
      if (libraryType === 'part_class') {
        payload.part_group = options.partGroup;
        payload.part_class = options.partClass;
      } else if (libraryType === 'my_library') {
        payload.owner_user_id = USER_ID;
      } else if (libraryType === 'customer_library') {
        payload.customer_id = options.customerId;
        payload.customer_name = options.customerName;
      }

      logger.debug('Creating library entry:', payload);

      const response = await axios.post(`${API_BASE_URL}/api/template-library`, payload, {
        headers: {
          'x-access-token': token,
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.isDuplicate) {
        logger.debug('Library entry already exists (duplicate)');
      } else {
        logger.debug('Library entry created successfully:', response.data?.data?._id);
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to create library entry:', error);
      // Don't throw - template is already saved, library entry is secondary
      return null;
    }
  };

  /**
   * Check for duplicate drawings based on geometry (lengths and angles)
   * Queries the backend API to find templates with matching segment lengths and angles
   * @param {Array} lengths - Segment lengths to check
   * @param {Array} angles - Turn angles to check
   * @param {String} library - Optional library filter ('my', 'customer', or null for partClass)
   * @param {String} quickLibrarySelection - The Quick Library selection (e.g., 'My Library', 'Customer Library', 'Gutters', etc.)
   * @returns {Object|null} - Duplicate template object if found, null otherwise
   */
  const checkForDuplicate = async (lengths, angles, library = null, quickLibrarySelection = null) => {
    try {
      const token = tokenManager.getToken();

      // Build query params for duplicate check
      const params = new URLSearchParams({
        lengths: JSON.stringify(lengths),
        angles: JSON.stringify(angles)
      });

      // Determine the library type based on Quick Library selection or library parameter
      const effectiveSelection = quickLibrarySelection || libraryPartClasses[currentPartClassIndex];
      
      if (library === 'my' || effectiveSelection === 'My Library') {
        // Check in My Library
        params.append('library', 'my');
        params.append('owner_user_id', USER_ID);
      } else if (library === 'customer' || effectiveSelection === 'Customer Library') {
        // Check in Customer Library
        params.append('library', 'customer');
        const customerId = localStorage.getItem('customerId');
        if (customerId) {
          params.append('customer_id', customerId);
        }
      } else {
        // Check in Part Class Library
        const checkPartClass = effectiveSelection || partClass;
        const partGroupMapping = {
          'Gutters': 'Flashing',
          'Cappings': 'Flashing',
          'Aprons': 'Flashing',
          'Ridge & Valley': 'Flashing',
          'Soakers': 'Flashing',
          'Foot Moulds': 'Flashing',
          'Misc': 'Flashing'
        };
        const checkPartGroup = partGroupMapping[checkPartClass] || partGroup;
        params.append('partClass', checkPartClass);
        params.append('partGroup', checkPartGroup);
      }

      // Use the new TemplateLibrary endpoint instead of old Template endpoint
      const response = await axios.get(`${API_BASE_URL}/api/template-library/check-duplicate?${params}`, {
        headers: { 'x-access-token': token }
      });

      logger.debug('Duplicate check response:', response.data);
      return response.data?.duplicate || null;
    } catch (error) {
      logger.debug('Error checking for duplicate:', error);
      return null;
    }
  };

  /**
   * Handle Save to Library operation
   * Saves the current drawing to the part class library
   * Flow: Permission check → Duplicate check → Generate preview → API call → Success feedback
   * @returns {Promise<void>}
   */
  const handleSave = async () => {
    // Always use empty name when saving from drawing canvas
    const nameToSave = '';

    if (isSaving) {
      logger.debug('Save already in progress, ignoring duplicate click');
      return;
    }

    setIsSaving(true);

    // Set visual feedback immediately when user clicks
    setSavedToLibrary(true);

    // Check for duplicate before saving (optional - don't block save if check fails)
    let duplicate = null;
    try {
      duplicate = await checkForDuplicate(
        showTaper ? farLengths : lengths,
        showTaper ? farAngles : angles
      );
    } catch (error) {
      logger.debug('Duplicate check failed, continuing with save:', error);
    }

    if (duplicate && duplicate._id) {
      // Use Quick Library's selected part class for duplicate modal message
      const quickLibraryPartClass = libraryPartClasses[currentPartClassIndex];
      setDuplicateModalLibrary(`${quickLibraryPartClass || 'Gutters'} library`);
      setDuplicateModalOpen(true);

      // Store the callback to continue save operation if confirmed
      setDuplicateModalCallback(() => () => {
        setDuplicateModalOpen(false);
        setIsSaving(true); // Re-enable saving flag when user confirms
        continueSaveOperation(duplicate);
      });
      
      // Reset saving flag when showing duplicate modal (user needs to confirm)
      setIsSaving(false);
      return;
    }

    // If no duplicate, continue with save
    continueSaveOperation(null);

    // Extract the save operation into a separate function
    async function continueSaveOperation(duplicateTemplate) {
      // NEW FLOW: No need to generate preview images (library recreates from geometry)
      setHideGreenSquare(true);

      // Use setTimeout to ensure state update is applied
      setTimeout(async () => {
        try {
          // NOTE: Preview generation removed - library uses PreviewCanvas to redraw from geometry

          // Parse fold data - startFoldType contains the direction directly ("Up", "Down", "OpenUp", "OpenDn")
          // Determine fold type based on direction: Up/Down = SF, OpenUp/OpenDn = SSF
          const getStartFoldInfo = () => {
            if (!startFoldType) return { type: undefined, direction: undefined };
            // Reverse the mapping since dropdown labels are swapped
            let actualType = startFoldType;
            if (startFoldType === 'Up') actualType = 'Down';
            else if (startFoldType === 'Down') actualType = 'Up';
            else if (startFoldType === 'OpenUp') actualType = 'OpenDn';
            else if (startFoldType === 'OpenDn') actualType = 'OpenUp';

            // No flip compensation needed - dropdown already reflects flipped value

            if (actualType === 'Up' || actualType === 'Down') {
              return { type: 'SF', direction: actualType.toLowerCase() }; // Convert to lowercase for SWI
            } else if (actualType === 'OpenUp' || actualType === 'OpenDn') {
              return { type: 'SSF', direction: actualType.toLowerCase() }; // Convert to lowercase for SWI
            }
            return { type: undefined, direction: undefined };
          };

          const getEndFoldInfo = () => {
            if (!endFoldType) return { type: undefined, direction: undefined };
            // Use the actual type directly without swapping
            let actualType = endFoldType;

            // No flip compensation needed - dropdown already reflects flipped value

            if (actualType === 'Up' || actualType === 'Down') {
              return { type: 'SF', direction: actualType };
            } else if (actualType === 'OpenUp' || actualType === 'OpenDn') {
              return { type: 'SSF', direction: actualType };
            }
            return { type: undefined, direction: undefined };
          };

          const startFoldInfo = getStartFoldInfo();
          const endFoldInfo = getEndFoldInfo();

          // Calculate bends to save
          const hasFolds = startFoldType || endFoldType;
          const currentAngles = showTaper ? farAngles : angles;

          // Count base bends - angles in 170-180 range count as 2 bends
          let baseBends = 0;
          if (currentAngles.length > 0) {
            for (let i = 0; i < currentAngles.length; i++) {
              const absAngle = Math.abs(currentAngles[i]);
              // Angles between 170-180 degrees are fold-backs, count as 2 bends
              if (absAngle >= 170 && absAngle <= 180) {
                baseBends += 2;
              } else {
                baseBends += 1;
              }
            }
          }

          let calculatedBends = baseBends;

          if (hasFolds) {
            // When there are folds, only add base bends if baseBends > 0
            // If baseBends = 0 (straight line), don't add the "1" - just count fold bends
            if (startFoldType === 'Up' || startFoldType === 'Down' || startFoldType === 'OpenUp' || startFoldType === 'OpenDn') {
              calculatedBends += 2;
            }
            if (endFoldType === 'Up' || endFoldType === 'Down' || endFoldType === 'OpenUp' || endFoldType === 'OpenDn') {
              calculatedBends += 2;
            }
          } else {
            // No folds: count base geometry bends, minimum 1 for straight line
            calculatedBends = Math.max(1, baseBends);
          }

          // Save to Library: Use the exact Quick Library selection
          // Supports: My Library, Customer Library, and all part classes (Gutters, Aprons, etc.)
          const quickLibraryPartClass = libraryPartClasses[currentPartClassIndex] || 'Gutters';
          const isMyLibrary = quickLibraryPartClass === 'My Library';
          const isCustomerLibrary = quickLibraryPartClass === 'Customer Library';
          const isPartClassLibrary = !isMyLibrary && !isCustomerLibrary;

          // Validate customer_id for Customer Library
          if (isCustomerLibrary && !localStorage.getItem('customerId')) {
            swal.fire({
              text: 'Please select a customer before saving to Customer Library.',
              icon: 'error',
              title: 'Customer Required'
            });
            setHideGreenSquare(false);
            setIsSaving(false);
            setSavedToLibrary(false);
            return;
          }

          // Determine save parameters based on Quick Library selection
          let savePartClass = quickLibraryPartClass;
          let savePartGroup = partGroup;
          let libraryType = 'part_class';
          
          if (isMyLibrary) {
            libraryType = 'my_library';
            savePartClass = undefined; // Not used for my_library
            savePartGroup = undefined; // Not used for my_library
          } else if (isCustomerLibrary) {
            libraryType = 'customer_library';
            savePartClass = undefined; // Not used for customer_library
            savePartGroup = undefined; // Not used for customer_library
          } else {
            // Map part class to part group for part_class library type
            const partGroupMapping = {
              'Gutters': 'Flashing',
              'Cappings': 'Flashing',
              'Aprons': 'Flashing',
              'Ridge & Valley': 'Flashing',
              'Soakers': 'Flashing',
              'Foot Moulds': 'Flashing',
              'Misc': 'Flashing'
            };
            savePartGroup = partGroupMapping[savePartClass] || partGroup;
          }
          
          const payload = {
            name: nameToSave,
            ...(isPartClassLibrary && { partGroup: savePartGroup }),
            ...(isPartClassLibrary && { partClass: savePartClass }),
            direction,
            reverseColor,
            isTaper: showTaper,
            lengths: showTaper ? farLengths : lengths,
            angles: showTaper ? farAngles : angles,
            farLengths: showTaper ? farLengths : undefined,
            farAngles: showTaper ? farAngles : undefined,
            nearLengths: showTaper ? nearLengths : undefined,
            nearAngles: showTaper ? nearAngles : undefined,
            startFoldType: startFoldInfo.type,
            startFoldDirection: startFoldInfo.direction,
            startFoldLength: startFoldType ? startFoldLength : undefined,
            startFoldGap: (startFoldType === 'OpenUp' || startFoldType === 'OpenDn') && startFoldGap ? startFoldGap : undefined,
            endFoldType: endFoldInfo.type,
            endFoldDirection: endFoldInfo.direction,
            endFoldLength: endFoldType ? endFoldLength : undefined,
            endFoldGap: (endFoldType === 'OpenUp' || endFoldType === 'OpenDn') && endFoldGap ? endFoldGap : undefined,
            firstSegmentAngle: firstSegmentAngle,  // Preserve drawing orientation
            flipH: flipH,  // Preserve flip state
            flipV: flipV,  // Preserve flip state
            labelOffsets: labelOffsets  // Preserve label positions
          };

          logger.debug('=== SAVE TO LIBRARY DEBUG ===');
          logger.debug('Payload being sent:', payload);
          logger.debug('Payload JSON:', JSON.stringify(payload, null, 2));
          logger.debug('Library Type:', libraryType);
          logger.debug('Part Group:', savePartGroup);
          logger.debug('Part Class:', savePartClass);
          logger.debug('Quick Library Selection:', quickLibraryPartClass);
          logger.debug('Is My Library:', isMyLibrary);
          logger.debug('Is Customer Library:', isCustomerLibrary);
          logger.debug('Is Part Class Library:', isPartClassLibrary);
          logger.debug('================================');

          const token = tokenManager.getToken();

          // NEW FLOW: Save directly to TemplateLibrary (skip Template table)
          // Template table is ONLY used when clicking "Finish" in SelectMaterialPage

          logger.debug('NEW FLOW: Saving directly to TemplateLibrary (no Template record)');

          // Build library payload based on library type
          const libraryPayload = {
            ...payload,
            library_type: libraryType,
            saved_by: USER_ID
          };
          
          // Add type-specific fields
          if (isMyLibrary) {
            libraryPayload.owner_user_id = USER_ID;
          } else if (isCustomerLibrary) {
            const customerId = localStorage.getItem('customerId');
            if (customerId) {
              libraryPayload.customer_id = customerId;
            }
          } else {
            // Part class library
            libraryPayload.part_group = savePartGroup;
            libraryPayload.part_class = savePartClass;
          }

          const response = await axios.post(`${API_BASE_URL}/api/template-library`, libraryPayload, {
            headers: {
              'x-access-token': token,
              'Content-Type': 'application/json'
            }
          });

          const libraryData = response.data?.data || response.data;

          logger.debug('Library entry created:', {
            libraryData: libraryData,
            extractedId: libraryData?._id
          });

          if (libraryData && libraryData._id) {
            logger.debug('Saved to library with ID:', libraryData._id);
          } else {
            logger.error('Failed to extract library entry ID from response');
          }

          // Reset the flags after successful save
          setHideGreenSquare(false);
          setIsSaving(false);
        } catch (error) {
          const errorMessage = error.response?.data?.message || 'Save failed';
          swal.fire({
            text: errorMessage,
            icon: 'error',
            title: 'Save Failed'
          });
          // Reset the flags even on error
          setHideGreenSquare(false);
          setIsSaving(false);
          setSavedToLibrary(false); // Reset visual feedback on error
        }
      }, 50); // Small delay to ensure React re-render happens
    }
  };

  const handleMyLibrarySave = async () => {
    // Always use empty name when saving from drawing canvas
    const nameToSave = '';

    // if (!checkLibrarySavePermission()) {
    //   return;
    // }

    // Prevent duplicate saves from multiple clicks
    if (isSaving) {
      logger.debug('My Library save already in progress, ignoring duplicate click');
      return;
    }

    setIsSaving(true);

    // Set visual feedback immediately when user clicks
    setSavedToMyLibrary(true);

    // Check for duplicate in My Library
    const duplicate = await checkForDuplicate(
      showTaper ? farLengths : lengths,
      showTaper ? farAngles : angles,
      'my'
    );

    if (duplicate && duplicate._id) {
      setDuplicateModalLibrary('My Library');
      setDuplicateModalOpen(true);

      // Store the callback to continue save operation if confirmed
      setDuplicateModalCallback(() => () => {
        setDuplicateModalOpen(false);
        setIsSaving(true); // Re-enable saving flag when user confirms
        continueSaveToMyLibrary();
      });

      // Reset saving flag when showing duplicate modal (user needs to confirm)
      setIsSaving(false);
      return;
    }

    // If no duplicate, continue with save
    continueSaveToMyLibrary();

    async function continueSaveToMyLibrary() {

      // NEW FLOW: No need to generate preview images (library recreates from geometry)
      setHideGreenSquare(true);

      // Use setTimeout to ensure state update is applied
      setTimeout(() => {
        const startFoldInfo = getStartFoldInfo();
        const endFoldInfo = getEndFoldInfo();

        const payload = {
          name: nameToSave,
          direction,
          reverseColor,
          isTaper: showTaper,
          lengths: showTaper ? farLengths : lengths,
          angles: showTaper ? farAngles : angles,
          farLengths: showTaper ? farLengths : undefined,
          farAngles: showTaper ? farAngles : undefined,
          nearLengths: showTaper ? nearLengths : undefined,
          nearAngles: showTaper ? nearAngles : undefined,
          startFoldType: startFoldInfo.type,
          startFoldDirection: startFoldInfo.direction,
          startFoldLength: startFoldType ? startFoldLength : undefined,
          startFoldGap: (startFoldType === 'OpenUp' || startFoldType === 'OpenDn') && startFoldGap ? startFoldGap : undefined,
          endFoldType: endFoldInfo.type,
          endFoldDirection: endFoldInfo.direction,
          endFoldLength: endFoldType ? endFoldLength : undefined,
          endFoldGap: (endFoldType === 'OpenUp' || endFoldType === 'OpenDn') && endFoldGap ? endFoldGap : undefined,
          firstSegmentAngle: firstSegmentAngle,  // Preserve drawing orientation
          flipH: flipH,  // Preserve flip state
          flipV: flipV,  // Preserve flip state
          labelOffsets: labelOffsets  // Preserve label positions
        };

        logger.debug('=== MY LIBRARY SAVE DEBUG ===');
        logger.debug('Payload being sent:', payload);
        logger.debug('Library field value:', payload.library);
        logger.debug('================================');

        const token = tokenManager.getToken();

        // NEW FLOW: Save directly to TemplateLibrary (skip Template table)
        logger.debug('NEW FLOW: Saving My Library directly to TemplateLibrary (no Template record)');

        const libraryPayload = {
          ...payload,
          library_type: 'my_library',
          owner_user_id: USER_ID,
          saved_by: USER_ID
        };

        axios.post(`${API_BASE_URL}/api/template-library`, libraryPayload, {
          headers: {
            'x-access-token': token,
            'Content-Type': 'application/json'
          }
        })
          .then((response) => {
            logger.debug('My Library save response:', response.data);

            // Extract library entry ID from response
            const libraryData = response.data?.data || response.data;
            if (libraryData && libraryData._id) {
              logger.debug('My Library - Created library entry with ID:', libraryData._id);
            } else {
              logger.error('My Library - Failed to extract library entry ID from response');
            }

            // Reset the flag after successful save
            setHideGreenSquare(false);
            setIsSaving(false);
          })
          .catch((error) => {
            const errorMessage = error.response?.data?.message || 'Save failed';
            swal.fire({
              text: errorMessage,
              icon: 'error',
              title: 'Save Failed'
            });
            // Reset the flag even on error
            setHideGreenSquare(false);
            setIsSaving(false);
            setSavedToMyLibrary(false); // Reset visual feedback on error
          });
      }, 50); // Small delay to ensure React re-render happens
    }
  };

  const handleCustomerLibrarySave = async () => {
    // Always use empty name when saving from drawing canvas
    const nameToSave = '';

    if (!customerId) {
      swal.fire({
        text: 'Please select a customer before saving to Customer Library.',
        icon: 'error',
        title: 'Customer Required'
      });
      return;
    }

    // Prevent duplicate saves from multiple clicks
    if (isSaving) {
      logger.debug('Customer Library save already in progress, ignoring duplicate click');
      return;
    }

    setIsSaving(true);

    // Set visual feedback immediately when user clicks
    setSavedToCustomerLibrary(true);

    // Check for duplicate in Customer Library
    const duplicate = await checkForDuplicate(
      showTaper ? farLengths : lengths,
      showTaper ? farAngles : angles,
      'customer'
    );

    if (duplicate && duplicate._id) {
      setDuplicateModalLibrary(`${customerName} Library`);
      setDuplicateModalOpen(true);

      // Store the callback to continue save operation if confirmed
      setDuplicateModalCallback(() => () => {
        setDuplicateModalOpen(false);
        setIsSaving(true); // Re-enable saving flag when user confirms
        continueSaveToCustomerLibrary();
      });

      // Reset saving flag when showing duplicate modal (user needs to confirm)
      setIsSaving(false);
      return;
    }

    // If no duplicate, continue with save
    continueSaveToCustomerLibrary();

    async function continueSaveToCustomerLibrary() {

      // NEW FLOW: No need to generate preview images (library recreates from geometry)
      setHideGreenSquare(true);

      // Use setTimeout to ensure state update is applied
      setTimeout(() => {
        const startFoldInfo = getStartFoldInfo();
        const endFoldInfo = getEndFoldInfo();

        const payload = {
          name: nameToSave,
          direction,
          reverseColor,
          isTaper: showTaper,
          lengths: showTaper ? farLengths : lengths,
          angles: showTaper ? farAngles : angles,
          farLengths: showTaper ? farLengths : undefined,
          farAngles: showTaper ? farAngles : undefined,
          nearLengths: showTaper ? nearLengths : undefined,
          nearAngles: showTaper ? nearAngles : undefined,
          startFoldType: startFoldInfo.type,
          startFoldDirection: startFoldInfo.direction,
          startFoldLength: startFoldType ? startFoldLength : undefined,
          startFoldGap: (startFoldType === 'OpenUp' || startFoldType === 'OpenDn') && startFoldGap ? startFoldGap : undefined,
          endFoldType: endFoldInfo.type,
          endFoldDirection: endFoldInfo.direction,
          endFoldLength: endFoldType ? endFoldLength : undefined,
          endFoldGap: (endFoldType === 'OpenUp' || endFoldType === 'OpenDn') && endFoldGap ? endFoldGap : undefined,
          firstSegmentAngle: firstSegmentAngle,  // Preserve drawing orientation
          flipH: flipH,  // Preserve flip state
          flipV: flipV,  // Preserve flip state
          labelOffsets: labelOffsets  // Preserve label positions
        };

        logger.debug('=== CUSTOMER LIBRARY SAVE DEBUG ===');
        logger.debug('Payload being sent:', payload);
        logger.debug('Library field value:', payload.library);
        logger.debug('Customer ID:', payload.customerId);
        logger.debug('Customer Name:', payload.customerName);
        logger.debug('====================================');

        const token = tokenManager.getToken();

        // NEW FLOW: Save directly to TemplateLibrary (skip Template table)
        logger.debug('NEW FLOW: Saving Customer Library directly to TemplateLibrary (no Template record)');

        const libraryPayload = {
          ...payload,
          library_type: 'customer_library',
          customer_id: customerId,
          saved_by: USER_ID
        };

        axios.post(`${API_BASE_URL}/api/template-library`, libraryPayload, {
          headers: {
            'x-access-token': token,
            'Content-Type': 'application/json'
          }
        })
          .then((response) => {
            logger.debug('Customer Library save response:', response.data);

            // Extract library entry ID from response
            const libraryData = response.data?.data || response.data;
            if (libraryData && libraryData._id) {
              logger.debug('Customer Library - Created library entry with ID:', libraryData._id);
            } else {
              logger.error('Customer Library - Failed to extract library entry ID from response');
            }

            // Reset the flag after successful save
            setHideGreenSquare(false);
            setIsSaving(false);
          })
          .catch((error) => {
            const errorMessage = error.response?.data?.message || 'Save failed';
            swal.fire({
              text: errorMessage,
              icon: 'error',
              title: 'Save Failed'
            });
            // Reset the flag even on error
            setHideGreenSquare(false);
            setIsSaving(false);
            setSavedToCustomerLibrary(false); // Reset visual feedback on error
          });
      }, 50); // Small delay to ensure React re-render happens
    }
  };

  const getStartFoldInfo = () => {
    if (!startFoldType) return { type: undefined, direction: undefined };
    // Reverse the mapping since dropdown labels are swapped
    // UI "Up" sends "Down", so we need to swap back for SWI
    let actualType = startFoldType;
    if (startFoldType === 'Up') actualType = 'Down';
    else if (startFoldType === 'Down') actualType = 'Up';
    else if (startFoldType === 'OpenUp') actualType = 'OpenDn';
    else if (startFoldType === 'OpenDn') actualType = 'OpenUp';

    // No flip compensation needed - dropdown already reflects flipped value

    if (actualType === 'Up' || actualType === 'Down') {
      return { type: 'SF', direction: actualType.toLowerCase() };
    } else if (actualType === 'OpenUp' || actualType === 'OpenDn') {
      return { type: 'SSF', direction: actualType.toLowerCase() };
    }
    return { type: undefined, direction: undefined };
  };

  const getEndFoldInfo = () => {
    if (!endFoldType) return { type: undefined, direction: undefined };
    // Use the actual type directly without swapping
    let actualType = endFoldType;

    // No flip compensation needed - dropdown already reflects flipped value

    if (actualType === 'Up' || actualType === 'Down') {
      return { type: 'SF', direction: actualType };
    } else if (actualType === 'OpenUp' || actualType === 'OpenDn') {
      return { type: 'SSF', direction: actualType };
    }
    return { type: undefined, direction: undefined };
  };

  // Save current state to history before making changes
  const saveToHistory = () => {
    // Skip if flag is set (e.g., after ESC when auto-focus triggers onFocus)
    if (skipNextHistorySaveRef.current) {
      return;
    }

    const currentState = {
      lengths: showTaper ? [...farLengths] : [...lengths],
      angles: showTaper ? [...farAngles] : [...angles],
      nearLengths: showTaper ? [...nearLengths] : [],
      nearAngles: showTaper ? [...nearAngles] : [],
      displayAngles: [...displayAngles],
      displayLengths: [...displayLengths], // Save display lengths for table sync
      segmentAbsoluteAngles: [...segmentAbsoluteAngles], // Save absolute angles
      showTaper,
      direction,
      startFoldType,
      startFoldLength,
      startFoldGap,
      endFoldType,
      endFoldLength,
      endFoldGap,
      reverseColor,
      flipH,
      flipV,
      firstSegmentAngle,
      continuousDrawing,
      firstClickPoint,
      firstClickPixelPos // Also save pixel position
    };

    // FIX: Check if current state is same as last history entry to prevent duplicates
    // This fixes the issue where tabbing through inputs creates duplicate history entries
    const lastHistoryState = historyRef.current[historyRef.current.length - 1];
    if (lastHistoryState) {
      const currentLengths = currentState.lengths;
      const lastLengths = lastHistoryState.lengths;
      const currentAngles = currentState.angles;
      const lastAngles = lastHistoryState.angles;

      // Compare key properties that indicate actual changes
      const lengthsSame = currentLengths.length === lastLengths.length &&
        currentLengths.every((l, i) => l === lastLengths[i]);
      const anglesSame = currentAngles.length === lastAngles.length &&
        currentAngles.every((a, i) => a === lastAngles[i]);
      const foldsSame = currentState.startFoldType === lastHistoryState.startFoldType &&
        currentState.startFoldLength === lastHistoryState.startFoldLength &&
        currentState.endFoldType === lastHistoryState.endFoldType &&
        currentState.endFoldLength === lastHistoryState.endFoldLength;

      // If state is same, skip saving (prevents duplicate entries from tabbing)
      if (lengthsSame && anglesSame && foldsSame) {
        return;
      }
    }

    setHistory(prev => [...prev.slice(-9), currentState]); // Keep last 10 states
    // canUndo will be updated by the useEffect that syncs with history

    // Clear redo history when a new action is performed
    setRedoHistory([]);
    // canRedo will be updated by the useEffect that syncs with redoHistory
  };

  // Handle undo action
  const handleUndo = () => {
    // Use ref to get latest history value (avoids stale closure issues)
    let currentHistory = [...historyRef.current];
    if (currentHistory.length === 0) return;

    // Get current state for comparison
    const currentLengths = showTaper ? farLengths : lengths;
    const currentAngles = showTaper ? farAngles : angles;

    // FIX: Skip history entries that are identical to current state
    // This fixes the 2-click issue where first undo restores to same state
    let lastState = currentHistory[currentHistory.length - 1];
    while (currentHistory.length > 0) {
      const historyLengths = lastState.lengths;
      const historyAngles = lastState.angles;

      // Compare key properties
      const lengthsSame = currentLengths.length === historyLengths.length &&
        currentLengths.every((l, i) => l === historyLengths[i]);
      const anglesSame = currentAngles.length === historyAngles.length &&
        currentAngles.every((a, i) => a === historyAngles[i]);
      const foldsSame = startFoldType === lastState.startFoldType &&
        startFoldLength === lastState.startFoldLength &&
        endFoldType === lastState.endFoldType &&
        endFoldLength === lastState.endFoldLength;

      if (lengthsSame && anglesSame && foldsSame) {
        // This history entry is same as current - skip it
        currentHistory = currentHistory.slice(0, -1);
        if (currentHistory.length === 0) {
          // No more history entries with actual changes
          setHistory([]);
          return;
        }
        lastState = currentHistory[currentHistory.length - 1];
      } else {
        // Found a different state - use this one
        break;
      }
    }

    // Save current state to redo history before undoing
    const currentStateForRedo = {
      lengths: showTaper ? [...farLengths] : [...lengths],
      angles: showTaper ? [...farAngles] : [...angles],
      nearLengths: showTaper ? [...nearLengths] : [],
      nearAngles: showTaper ? [...nearAngles] : [],
      displayAngles: [...displayAngles],
      displayLengths: [...displayLengths], // Save display lengths for table sync
      segmentAbsoluteAngles: [...segmentAbsoluteAngles],
      showTaper,
      direction,
      startFoldType,
      startFoldLength,
      startFoldGap,
      endFoldType,
      endFoldLength,
      endFoldGap,
      reverseColor,
      flipH,
      flipV,
      firstSegmentAngle,
      continuousDrawing,
      firstClickPoint,
      firstClickPixelPos
    };

    setRedoHistory(prev => [...prev, currentStateForRedo]);
    setCanRedo(true);

    // Set skip flag to prevent saveToHistory from being triggered by auto-focus after undo
    // This prevents redo history from being cleared immediately after undo
    skipNextHistorySaveRef.current = true;
    setTimeout(() => {
      skipNextHistorySaveRef.current = false;
    }, 300);

    // Restore the state
    if (lastState.showTaper) {
      setFarLengths(lastState.lengths);
      setFarAngles(lastState.angles);
      setNearLengths(lastState.nearLengths);
      setNearAngles(lastState.nearAngles);
    } else {
      setLengths(lastState.lengths);
      setAngles(lastState.angles);
    }

    // Restore all other state variables
    // Initialize display angles properly with first angle as absolute if needed
    const displayAngs = lastState.displayAngles && lastState.displayAngles.length > 0 ?
      lastState.displayAngles :
      initializeDisplayAngles(
        lastState.angles,
        lastState.firstSegmentAngle,
        lastState.direction
      );
    setDisplayAngles(displayAngs);
    setDisplayLengths(lastState.displayLengths || lastState.lengths || []); // Restore display lengths for table sync
    setSegmentAbsoluteAngles(lastState.segmentAbsoluteAngles || []); // Restore absolute angles
    setShowTaper(lastState.showTaper);
    setDirection(lastState.direction);
    setStartFoldType(lastState.startFoldType);
    setStartFoldLength(lastState.startFoldLength);
    setStartFoldGap(lastState.startFoldGap || 0);
    setEndFoldType(lastState.endFoldType);
    setEndFoldLength(lastState.endFoldLength);
    setEndFoldGap(lastState.endFoldGap || 0);
    setReverseColor(lastState.reverseColor);
    setFlipH(lastState.flipH);
    setFlipV(lastState.flipV);
    setFirstSegmentAngle(lastState.firstSegmentAngle);
    setContinuousDrawing(lastState.continuousDrawing);
    setFirstClickPoint(lastState.firstClickPoint);
    setFirstClickPixelPos(lastState.firstClickPixelPos); // Restore pixel position

    // Remove the last state from history
    const newHistory = currentHistory.slice(0, -1);
    setHistory(newHistory);
    // canUndo will be updated by the useEffect that syncs with history
  };

  // Handle redo action
  const handleRedo = () => {
    // Use ref to get latest redoHistory value (avoids stale closure issues)
    const currentRedoHistory = redoHistoryRef.current;
    if (currentRedoHistory.length === 0) return;

    // Save current state to undo history before redoing
    const currentStateForUndo = {
      lengths: showTaper ? [...farLengths] : [...lengths],
      angles: showTaper ? [...farAngles] : [...angles],
      nearLengths: showTaper ? [...nearLengths] : [],
      nearAngles: showTaper ? [...nearAngles] : [],
      displayAngles: [...displayAngles],
      displayLengths: [...displayLengths], // Save display lengths for table sync
      segmentAbsoluteAngles: [...segmentAbsoluteAngles],
      showTaper,
      direction,
      startFoldType,
      startFoldLength,
      startFoldGap,
      endFoldType,
      endFoldLength,
      endFoldGap,
      reverseColor,
      flipH,
      flipV,
      firstSegmentAngle,
      continuousDrawing,
      firstClickPoint,
      firstClickPixelPos
    };

    setHistory(prev => [...prev, currentStateForUndo]);
    // canUndo will be updated by the useEffect that syncs with history

    // Set skip flag to prevent saveToHistory from being triggered by auto-focus after redo
    skipNextHistorySaveRef.current = true;
    setTimeout(() => {
      skipNextHistorySaveRef.current = false;
    }, 300);

    const lastRedoState = currentRedoHistory[currentRedoHistory.length - 1];

    // Restore the state
    if (lastRedoState.showTaper) {
      setFarLengths(lastRedoState.lengths);
      setFarAngles(lastRedoState.angles);
      setNearLengths(lastRedoState.nearLengths);
      setNearAngles(lastRedoState.nearAngles);
    } else {
      setLengths(lastRedoState.lengths);
      setAngles(lastRedoState.angles);
    }

    // Restore all other state variables
    const displayAngs = lastRedoState.displayAngles && lastRedoState.displayAngles.length > 0 ?
      lastRedoState.displayAngles :
      initializeDisplayAngles(
        lastRedoState.angles,
        lastRedoState.firstSegmentAngle,
        lastRedoState.direction
      );
    setDisplayAngles(displayAngs);
    setDisplayLengths(lastRedoState.displayLengths || lastRedoState.lengths || []); // Restore display lengths for table sync
    setSegmentAbsoluteAngles(lastRedoState.segmentAbsoluteAngles || []);
    setShowTaper(lastRedoState.showTaper);
    setDirection(lastRedoState.direction);
    setStartFoldType(lastRedoState.startFoldType);
    setStartFoldLength(lastRedoState.startFoldLength);
    setStartFoldGap(lastRedoState.startFoldGap || 0);
    setEndFoldType(lastRedoState.endFoldType);
    setEndFoldLength(lastRedoState.endFoldLength);
    setEndFoldGap(lastRedoState.endFoldGap || 0);
    setReverseColor(lastRedoState.reverseColor);
    setFlipH(lastRedoState.flipH);
    setFlipV(lastRedoState.flipV);
    setFirstSegmentAngle(lastRedoState.firstSegmentAngle);
    setContinuousDrawing(lastRedoState.continuousDrawing);
    setFirstClickPoint(lastRedoState.firstClickPoint);
    setFirstClickPixelPos(lastRedoState.firstClickPixelPos);

    // Remove the last state from redo history
    const newRedoHistory = currentRedoHistory.slice(0, -1);
    setRedoHistory(newRedoHistory);
    // canRedo will be updated by the useEffect that syncs with redoHistory
  };

  /**
   * Handle Finish button - Navigate to SelectMaterialsSimplified with current drawing
   * Prepares template data and navigation state, then navigates to materials selection
   * Flow: Build template object → Save label offsets → Navigate with state
   * @returns {void}
   */
  const handleFinish = () => {
    logger.debug('🟢 FINISH BUTTON CLICKED - Current state:', {
      savedTemplateId,
      templateId,
      locationState: location.state,
      isFromLibrary,
      isSaving,
      continuousDrawing
    });

    // Prevent finish if fold type selected but value is missing
    if ((startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) {
      return;
    }

    // Prevent finish if there are fold validation errors
    if (startFoldLengthError || endFoldLengthError) {
      return;
    }

    // If save is in progress, wait for it to complete
    if (isSaving) {
      swal.fire({
        text: 'Please wait for save to complete before finishing.',
        icon: 'info',
        title: 'Info'
      });
      return;
    }

    logger.debug('🔍 handleFinish debug: Navigating directly to material selection');
    logger.debug('🔍 Taper state:', {
      showTaper,
      hasFarLengths: farLengths.length > 0,
      hasNearLengths: nearLengths.length > 0,
      farLengths,
      nearLengths
    });

    // GIRTH-BASED SCALING FIX: Force stop continuous drawing to allow girth-based scaling
    // Use requestAnimationFrame to ensure state updates BEFORE capturing preview
    setContinuousDrawing(false);
    setHideGreenSquare(true);
    setExtensionPoint(null);

    // Template name is OPTIONAL for finish - users can complete drawing without saving to library
    // Template name is only required for library save operations

    // CRITICAL: Use requestAnimationFrame to wait for React to re-render with new state
    // This ensures continuousDrawing=false has propagated and canvas uses girth-based scaling
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        logger.debug('🎨 PREVIEW CAPTURE - After RAF, checking scale');

        // Generate preview images for the template
        // Only generate far/near previews if in taper mode and refs exist
        let farUri = null;
        let nearUri = null;
        let uri = null;

        // Helper function to get cropped preview - crops to content with padding
        const getCroppedPreview = (stageRefObj, padding = 50) => {
          if (!stageRefObj || !stageRefObj.current) return null;

          const stage = stageRefObj.current;
          const layer = stage.findOne('Layer');
          if (!layer) return stage.toDataURL({ pixelRatio: 4 });

          // Get bounding box of all content
          const clientRect = layer.getClientRect({ skipTransform: false });

          if (!clientRect || clientRect.width === 0 || clientRect.height === 0) {
            // Fallback to full stage if no content bounds
            return stage.toDataURL({ pixelRatio: 4 });
          }

          // Add padding around content
          const x = Math.max(0, clientRect.x - padding);
          const y = Math.max(0, clientRect.y - padding);
          const width = Math.min(stage.width() - x, clientRect.width + padding * 2);
          const height = Math.min(stage.height() - y, clientRect.height + padding * 2);

          return stage.toDataURL({
            pixelRatio: 4,
            x: x,
            y: y,
            width: width,
            height: height
          });
        };

        try {
          if (showTaper && farRef.current && nearRef.current) {
            farUri = getCroppedPreview(farRef, 40);
            nearUri = getCroppedPreview(nearRef, 40);
          }
          if (stageRef.current) {
            uri = getCroppedPreview(stageRef, 40);
          }
        } catch (error) {
          logger.error('❌ Error generating preview images:', error);
        }

        logger.debug('🖼️ Preview generation debug:', {
          hasStageRef: !!stageRef.current,
          hasFarRef: !!farRef.current,
          hasNearRef: !!nearRef.current,
          uriLength: uri?.length || 0,
          farUriLength: farUri?.length || 0,
          nearUriLength: nearUri?.length || 0,
          showTaper,
          isEditSession: location.state?.isEdit === true,
          previewStart: uri?.substring(0, 50)
        });

        // CRITICAL: Ensure we have at least the main preview for edit mode
        if (!uri && stageRef.current) {
          logger.warn('⚠️ Preview generation failed, retrying...');
          try {
            uri = getCroppedPreview(stageRef, 40);
            logger.debug('✅ Preview generated on retry, length:', uri?.length || 0);
          } catch (retryError) {
            logger.error('❌ Preview generation retry failed:', retryError);
          }
        }

        // Process fold info to match expected format
        const startFoldInfo = getStartFoldInfo();
        const endFoldInfo = getEndFoldInfo();

        // Navigate directly to material selection without saving to library
        // Preserve edit mode flags if this was an edit session
        const isEditSession = location.state?.isEdit === true;
        // CRITICAL: Only use existing templateId if we're in edit mode
        // For new drawings from library, we should create a NEW template, not reuse the library one
        // Also check for preservedTemplateId from Edit Drawing button
        // IMPORTANT: For copy/flip operations, always create a new template
        const isCopyOrFlip = location.state?.isCopy || location.state?.isFlip;
        const existingTemplateId = isCopyOrFlip ? null : (
          isEditSession ?
            // In edit mode, prioritize preservedTemplateId (survives clear), then URL, then saved
            (location.state?.preservedTemplateId || templateId || location.state?.templateId || location.state?._id || savedTemplateId) :
            // In new mode, check savedTemplateId first (from save operations), then preservedTemplateId
            (savedTemplateId || location.state?.preservedTemplateId)
        ); // Force null for copy/flip to create new template

        // For copy/flip, force it to be treated as new drawing
        const treatAsNew = isCopyOrFlip || !isEditSession;

        logger.debug('🔍 handleFinish templateId sources:', {
          fromSearchParams: templateId,
          fromLocationState: location.state?.templateId,
          fromLocationStateId: location.state?._id,
          preservedTemplateId: location.state?.preservedTemplateId,
          savedTemplateId: savedTemplateId,
          finalTemplateId: existingTemplateId,
          isEditSession,
          isEdit: location.state?.isEdit,
          isCopyOrFlip,
          isCopy: location.state?.isCopy,
          isFlip: location.state?.isFlip,
          isFromLibrary: isFromLibrary,
          treatAsNew
        });

        logger.debug('💾 SSF Debug - Saving to navigation state:', {
          startFoldType,
          startFoldDirection: startFoldInfo.direction,
          firstSegmentAngle,
          direction
        });

        logger.debug('🎯 CRITICAL: Direction being passed to material selection:', direction);

        const navigationState = {
          orderNumber,
          customerName,
          customerId,
          orderId,
          customerPoNumber,
          deliveryDate: promiseDate,
          enteredDate,
          // Preserve edit mode for material selection page
          isEdit: isEditSession && !isCopyOrFlip, // Only edit if truly editing, not copy/flip
          isNewFromCanvas: treatAsNew, // Set true for copy/flip or new drawings
          // Always pass templateId if available (for both edit and new templates that have been saved)
          templateId: existingTemplateId || undefined,
          // IMPORTANT: Pass flip/copy state to SelectMaterials for correct SWI orientation
          isFlip: isFlip || location.state?.isFlip || false,
          isCopy: location.state?.isCopy || false,
          // Preserve flip states for drawing orientation
          flipH: flipH,
          flipV: flipV,
          // PRESERVE split state from material selection page
          splitInto: location.state?.splitInto || null,
          // PRESERVE material/color selections from Edit Drawing button
          material: location.state?.material,
          color: location.state?.color,
          unitPrice: location.state?.unitPrice,
          savedGirth: location.state?.savedGirth, // Pass through to detect girth changes
          savedBends: location.state?.savedBends, // Pass through to detect bend changes
          savedIsTaper: location.state?.savedIsTaper, // Pass through to detect normal↔taper changes
          // PRESERVE saved rows from Edit Drawing button - but NOT for copy/flip
          savedRows: isCopyOrFlip ? [] : (location.state?.savedRows),
          // PRESERVE pending form data (quantity, length, tag) from Edit Drawing button - but NOT for copy/flip
          pendingFormData: isCopyOrFlip ? null : location.state?.pendingFormData,
          // PRESERVE the template ID that was already created - but NOT for copy/flip
          preservedTemplateId: isCopyOrFlip ? null : location.state?.preservedTemplateId,
          // PRESERVE the flag indicating Edit Drawing with no template
          isFromEditDrawingNoTemplate: location.state?.isFromEditDrawingNoTemplate,
          // Add flags to indicate copy/flip operation
          isCopyOperation: location.state?.isCopy || false,
          isFlipOperation: location.state?.isFlip || false,
          // Flag to indicate if user came from "Create Drawing" button
          fromCreateDrawing: location.state?.fromCreateDrawing || false,
          // Part class to return to after "Finish & Add New"
          returnToPartClass: location.state?.returnToPartClass,
          template: {
            // Always pass _id and templateId if available (needed for save operations)
            // But NOT for copy/flip - they should create completely new templates
            _id: isCopyOrFlip ? undefined : (existingTemplateId || location.state?.preservedTemplateId || undefined),
            templateId: isCopyOrFlip ? undefined : (existingTemplateId || location.state?.preservedTemplateId || undefined),
            name: templateName,
            direction,
            reverseColor,
            preview: showTaper ? (farUri || uri) : uri,
            previewFar: showTaper ? farUri : undefined,
            previewNear: showTaper ? nearUri : undefined,
            isTaper: showTaper,
            lengths: showTaper ? farLengths : lengths,
            angles: showTaper ? farAngles : angles,
            farLengths: showTaper ? farLengths : undefined,
            farAngles: showTaper ? farAngles : undefined,
            nearLengths: showTaper ? nearLengths : undefined,
            nearAngles: showTaper ? nearAngles : undefined,
            // SWI format (what backend expects)
            startFoldType: startFoldInfo.type,  // 'SF' or 'SSF' for SWI
            startFoldDirection: startFoldInfo.direction,  // 'up', 'down' for SWI
            startFoldLength: startFoldType ? startFoldLength : undefined,
            startFoldGap: (startFoldType === 'OpenUp' || startFoldType === 'OpenDn') && startFoldGap ? startFoldGap : undefined,
            endFoldType: endFoldInfo.type,  // 'SF' or 'SSF' for SWI
            endFoldDirection: endFoldInfo.direction,  // 'up', 'down' for SWI
            endFoldLength: endFoldType ? endFoldLength : undefined,
            endFoldGap: (endFoldType === 'OpenUp' || endFoldType === 'OpenDn') && endFoldGap ? endFoldGap : undefined,
            // Girth calculation format (for getGirth function)
            girthStartFoldType: startFoldType,  // 'Up', 'Down', 'OpenUp', 'OpenDn' for getGirth
            girthEndFoldType: endFoldType,  // 'Up', 'Down', 'OpenUp', 'OpenDn' for getGirth
            // For SSF drawings, use segmentAbsoluteAngles[0] to ensure consistency
            // This ensures SWI and other systems get the correct starting angle
            firstSegmentAngle: (startFoldType === 'OpenUp' || startFoldType === 'OpenDn')
              ? (segmentAbsoluteAngles.length > 0 ? segmentAbsoluteAngles[0] : firstSegmentAngle)
              : firstSegmentAngle,
            // Include girth with folds (what's displayed on canvas)
            girth: showTaper
              ? getGirth(farLengths, startFoldType, startFoldLength, endFoldType, endFoldLength)
              : getGirth(lengths, startFoldType, startFoldLength, endFoldType, endFoldLength),
            partGroup: partGroup,  // Add partGroup
            partClass: partClass,  // Add partClass
            createdBy: USER_ID,
            // Include label offsets to preserve manual position adjustments
            labelOffsets: labelOffsets,
            // Include flip states to preserve orientation
            flipH: flipH,
            flipV: flipV,
            // Include segment absolute angles for precise rendering in split preview
            segmentAbsoluteAngles: segmentAbsoluteAngles
          },
          isNewFromCanvas: treatAsNew, // Set true for copy/flip or new drawings
          //Code change by Rahul
          previousPage: location.state?.previousPage || 'designers'
        };


        logger.debug('🔍 Navigating to material selection with state:', {
          isEditSession,
          existingTemplateId,
          orderId: navigationState.orderId,
          isEdit: navigationState.isEdit,
          isNewFromCanvas: navigationState.isNewFromCanvas,
          templateId: navigationState.templateId,
          templateName: navigationState.template.name,
          preservedTemplateId: navigationState.preservedTemplateId,
          savedRows: navigationState.savedRows?.length,
          partGroup: partGroup,
          partClass: partClass
        });

        logger.debug('🔍 Current partGroup/partClass values:', {
          partGroup,
          partClass,
          urlPartGroup,
          urlPartClass
        });

        // Always include templateId in URL if available (for both edit mode and after template creation)
        // This ensures the SelectMaterialsSimplified can find the template
        // Check multiple sources for the template ID
        // IMPORTANT: For copy/flip, don't include any templateId
        // Check multiple sources including the global backup
        const templateIdForUrl = isCopyOrFlip ? null : (
          savedTemplateId ||  // Use savedTemplateId first if available
          window.__lastSavedTemplateId ||  // Fallback to global if state not updated yet
          existingTemplateId ||
          location.state?.preservedTemplateId ||
          navigationState.template?._id ||
          navigationState.template?.templateId
        );

        logger.debug('🔍 Template ID for navigation:', {
          savedTemplateId,
          existingTemplateId,
          templateIdForUrl,
          isCopyOrFlip
        });

        logger.debug('🟢 FINISH - NAVIGATION:', {
          savedTemplateId,
          existingTemplateId,
          templateIdForUrl,
          navigateUrl: templateIdForUrl ? `/select-materials?templateId=${templateIdForUrl}` : '/select-materials',
          navigationStateTemplateId: navigationState.template?._id,
          navigationStateTemplateId2: navigationState.template?.templateId
        });

        const navigateUrl = templateIdForUrl
          ? `/select-materials-simplified?templateId=${templateIdForUrl}`
          : '/select-materials-simplified';

        navigate(navigateUrl, {
          state: navigationState,
          preventScrollReset: false // Allow scroll reset
        });

        // Reset the flag after navigation
        setTimeout(() => setHideGreenSquare(false), 100);
      }); // End second requestAnimationFrame
    }); // End first requestAnimationFrame
  };

  /**
   * Handle dragging of corner points (orange circles)
   * Updates point position in real-time during drag
   * @param {Object} e - Konva event object
   * @param {Number} index - Index of the point being dragged
   */
  const handlePointDrag = (e, index) => {
    // Use effective lengths for scaling
    const effectiveLengthsForDrag = lengths.map((len, idx) => {
      if (len === '' || len == null) {
        return displayLengths[idx] || 0;
      }
      return len;
    });
    const { scale, offsetX, offsetY } = getScale(points, 625, 800, 40, 1, { x: 0, y: 0 }, null, effectiveLengthsForDrag);
    const x = (e.target.x() - offsetX) / scale;
    const y = (e.target.y() - offsetY) / scale;
    const updated = [...points];
    updated[index] = { x, y };
    setPoints(updated);
  };

  /**
   * Handle dragging of labels (segment lengths, angles, fold labels)
   * Saves both temporary drag position and persistent relative offsets
   * @param {Object} e - Konva event object
   * @param {String} key - Label identifier ('len-0', 'ang-1', 'ang-far-0', 'ang-near-1', 'fold-start', etc.)
   * @param {Object} calculatedPosition - Original calculated position {x, y} for relative offset calculation
   * @param {String} taperProfile - 'far', 'near', or null for non-taper mode
   */
  const handleCoordDrag = (e, key, calculatedPosition = null, taperProfile = null, isDragEnd = false) => {
    // Clamp label position to stay within canvas boundaries
    const stage = e.target.getStage();
    if (stage) {
      const labelPadding = 30; // Keep labels 30px from edge
      const stageWidth = stage.width();
      const stageHeight = stage.height();

      // Safety check: ensure valid stage dimensions
      if (stageWidth > 0 && stageHeight > 0) {
        // Get absolute position to check boundaries (handles all Group transforms)
        const absPos = e.target.getAbsolutePosition();

        // Safety check: ensure valid absolute position
        if (absPos && typeof absPos.x === 'number' && typeof absPos.y === 'number') {
          // Clamp absolute position to canvas bounds
          const clampedAbsX = Math.max(labelPadding, Math.min(stageWidth - labelPadding, absPos.x));
          const clampedAbsY = Math.max(labelPadding, Math.min(stageHeight - labelPadding, absPos.y));

          // If position was clamped, use Konva's setAbsolutePosition to update correctly
          if (clampedAbsX !== absPos.x || clampedAbsY !== absPos.y) {
            e.target.setAbsolutePosition({ x: clampedAbsX, y: clampedAbsY });
          }
        }
      }
    }

    // Get the final position after any clamping
    const { x, y } = e.target.position();
    console.log(`🏷️ Label dragged: ${key} to position (${x}, ${y}), taperProfile: ${taperProfile}`);

    // Special handling for fold labels to prevent overlap with arcs
    if (key.startsWith('fold-')) {
      // Only validate position on drag end for smooth dragging experience
      const validatedPosition = isDragEnd ? validateFoldLabelPosition(x, y, key) : { x, y };

      // Sync coordOffsets between FAR and NEAR for immediate visual update
      if (key.includes('-far-')) {
        const nearKey = key.replace('-far-', '-near-');
        setCoordOffsets(prev => ({ ...prev, [key]: validatedPosition, [nearKey]: validatedPosition }));
      } else if (key.includes('-near-')) {
        const farKey = key.replace('-near-', '-far-');
        setCoordOffsets(prev => ({ ...prev, [key]: validatedPosition, [farKey]: validatedPosition }));
      } else {
        setCoordOffsets(prev => ({ ...prev, [key]: validatedPosition }));
      }

      // Save to persistent labelOffsets as RELATIVE offset from calculated position
      // This allows the adjustment to move with the geometry when angles change
      // Extract the fold position (start/end) from the key
      let foldKey;
      if (key.includes('-far-')) {
        foldKey = key.replace('fold-far-', ''); // 'start' or 'end'
      } else if (key.includes('-near-')) {
        foldKey = key.replace('fold-near-', ''); // 'start' or 'end'
      } else {
        foldKey = key.replace('fold-', ''); // 'start' or 'end'
      }

      if (calculatedPosition) {
        const relativeOffset = {
          x: validatedPosition.x - calculatedPosition.x,
          y: validatedPosition.y - calculatedPosition.y
        };
        setLabelOffsets(prev => {
          let updated;
          if (taperProfile === 'far') {
            // Sync FAR fold label position to NEAR as well
            updated = {
              ...prev,
              farFoldLabels: { ...prev.farFoldLabels, [foldKey]: relativeOffset },
              nearFoldLabels: { ...prev.nearFoldLabels, [foldKey]: relativeOffset }
            };
            console.log(`🏷️ Saved FAR fold label ${foldKey} and synced to NEAR:`, relativeOffset);
          } else if (taperProfile === 'near') {
            // Sync NEAR fold label position to FAR as well
            updated = {
              ...prev,
              nearFoldLabels: { ...prev.nearFoldLabels, [foldKey]: relativeOffset },
              farFoldLabels: { ...prev.farFoldLabels, [foldKey]: relativeOffset }
            };
            console.log(`🏷️ Saved NEAR fold label ${foldKey} and synced to FAR:`, relativeOffset);
          } else {
            updated = {
              ...prev,
              foldLabels: { ...prev.foldLabels, [foldKey]: relativeOffset }
            };
            console.log(`🏷️ Saved fold label ${foldKey} as RELATIVE offset:`, relativeOffset);
          }
          return updated;
        });
      }
    } else {
      // Sync coordOffsets between FAR and NEAR for immediate visual update
      if (key.includes('-far-')) {
        const nearKey = key.replace('-far-', '-near-');
        setCoordOffsets(prev => ({ ...prev, [key]: { x, y }, [nearKey]: { x, y } }));
      } else if (key.includes('-near-')) {
        const farKey = key.replace('-near-', '-far-');
        setCoordOffsets(prev => ({ ...prev, [key]: { x, y }, [farKey]: { x, y } }));
      } else {
        setCoordOffsets(prev => ({ ...prev, [key]: { x, y } }));
      }

      // Save to persistent labelOffsets based on label type
      if (key.startsWith('len-')) {
        // Extract index from key (e.g., 'len-0', 'len-far-0', 'len-near-1')
        let index;
        if (key.includes('-far-')) {
          index = key.replace('len-far-', '');
        } else if (key.includes('-near-')) {
          index = key.replace('len-near-', '');
        } else {
          index = key.replace('len-', '');
        }

        // Save segment labels as RELATIVE offset from calculated position (matching angle labels)
        if (calculatedPosition) {
          const relativeOffset = {
            x: x - calculatedPosition.x,
            y: y - calculatedPosition.y
          };
          setLabelOffsets(prev => {
            let updated;
            if (taperProfile === 'far') {
              // Sync FAR segment label to NEAR as well
              updated = {
                ...prev,
                farSegmentLabels: { ...prev.farSegmentLabels, [index]: relativeOffset },
                nearSegmentLabels: { ...prev.nearSegmentLabels, [index]: relativeOffset }
              };
              console.log(`🏷️ Saved FAR segment label ${index} and synced to NEAR:`, relativeOffset);
            } else if (taperProfile === 'near') {
              // Sync NEAR segment label to FAR as well
              updated = {
                ...prev,
                nearSegmentLabels: { ...prev.nearSegmentLabels, [index]: relativeOffset },
                farSegmentLabels: { ...prev.farSegmentLabels, [index]: relativeOffset }
              };
              console.log(`🏷️ Saved NEAR segment label ${index} and synced to FAR:`, relativeOffset);
            } else {
              updated = {
                ...prev,
                segmentLabels: { ...prev.segmentLabels, [index]: relativeOffset }
              };
              console.log(`🏷️ Saved segment label ${index} as RELATIVE offset:`, relativeOffset);
            }
            return updated;
          });
        }
      } else if (key.startsWith('ang-')) {
        // Save angle labels as RELATIVE offset from calculated position
        // Extract index from key (e.g., 'ang-0', 'ang-far-0', 'ang-near-1')
        let index;
        if (key.includes('-far-')) {
          index = key.replace('ang-far-', '');
        } else if (key.includes('-near-')) {
          index = key.replace('ang-near-', '');
        } else {
          index = key.replace('ang-', '');
        }

        if (calculatedPosition) {
          const relativeOffset = {
            x: x - calculatedPosition.x,
            y: y - calculatedPosition.y
          };
          setLabelOffsets(prev => {
            let updated;
            if (taperProfile === 'far') {
              // Sync FAR angle label position to NEAR as well
              updated = {
                ...prev,
                farAngleLabels: { ...prev.farAngleLabels, [index]: relativeOffset },
                nearAngleLabels: { ...prev.nearAngleLabels, [index]: relativeOffset }
              };
              console.log(`🏷️ Saved FAR angle label ${index} and synced to NEAR:`, relativeOffset);
            } else if (taperProfile === 'near') {
              // Sync NEAR angle label position to FAR as well
              updated = {
                ...prev,
                nearAngleLabels: { ...prev.nearAngleLabels, [index]: relativeOffset },
                farAngleLabels: { ...prev.farAngleLabels, [index]: relativeOffset }
              };
              console.log(`🏷️ Saved NEAR angle label ${index} and synced to FAR:`, relativeOffset);
            } else {
              updated = {
                ...prev,
                angleLabels: { ...prev.angleLabels, [index]: relativeOffset }
              };
              console.log(`🏷️ Saved angle label ${index} as RELATIVE offset:`, relativeOffset);
            }
            return updated;
          });
        }
      } else if (key.startsWith('gap-label-')) {
        // Save gap labels as RELATIVE offset from calculated position
        // Extract position from key (e.g., 'gap-label-start', 'gap-label-end')
        const gapKey = key.replace('gap-label-', ''); // 'start' or 'end'

        if (calculatedPosition) {
          const relativeOffset = {
            x: x - calculatedPosition.x,
            y: y - calculatedPosition.y
          };
          setLabelOffsets(prev => {
            let updated;
            if (taperProfile === 'far') {
              // Sync FAR gap label position to NEAR as well
              updated = {
                ...prev,
                farGapLabels: { ...prev.farGapLabels, [gapKey]: relativeOffset },
                nearGapLabels: { ...prev.nearGapLabels, [gapKey]: relativeOffset }
              };
              console.log(`🏷️ Saved FAR gap label ${gapKey} and synced to NEAR:`, relativeOffset);
            } else if (taperProfile === 'near') {
              // Sync NEAR gap label position to FAR as well
              updated = {
                ...prev,
                nearGapLabels: { ...prev.nearGapLabels, [gapKey]: relativeOffset },
                farGapLabels: { ...prev.farGapLabels, [gapKey]: relativeOffset }
              };
              console.log(`🏷️ Saved NEAR gap label ${gapKey} and synced to FAR:`, relativeOffset);
            } else {
              updated = {
                ...prev,
                gapLabels: { ...prev.gapLabels, [gapKey]: relativeOffset }
              };
              console.log(`🏷️ Saved gap label ${gapKey} as RELATIVE offset:`, relativeOffset);
            }
            return updated;
          });
        }
      }
    }
  };

  // Validate fold label position to ensure it doesn't overlap with fold arcs
  const validateFoldLabelPosition = (x, y, foldKey) => {
    // Get the current points array (same as allPts)
    const currentPts = calculatePointsLocal(lengths, angles, direction, segmentAbsoluteAngles, displayLengths, false);

    // Find the fold corner position based on fold type
    let cornerIndex;
    if (foldKey === 'fold-start' && startFoldType) {
      cornerIndex = 2; // Start fold is at index 2
    } else if (foldKey === 'fold-end' && endFoldType) {
      cornerIndex = currentPts.length - 3; // End fold is at length-3
    } else {
      return { x, y }; // No validation needed if no fold
    }

    if (cornerIndex >= 0 && cornerIndex < currentPts.length) {
      // Apply flip transformation to corner position for consistent validation
      const corner = applyFlipToPoint(currentPts[cornerIndex]);
      const cornerScreenX = corner.x * scale + offsetX;
      const cornerScreenY = corner.y * scale + offsetY;

      // Calculate distance from drag position to arc center
      const distance = Math.hypot(x - cornerScreenX, y - cornerScreenY);
      const minDistance = 30; // Well outside max arc radius (22) + generous buffer

      if (distance < minDistance) {
        // Push label outside the minimum distance
        const angle = Math.atan2(y - cornerScreenY, x - cornerScreenX);
        return {
          x: cornerScreenX + minDistance * Math.cos(angle),
          y: cornerScreenY + minDistance * Math.sin(angle)
        };
      }
    }

    return { x, y };
  };

  /**
   * Check if a fold would be outside the shape (using centroid-based detection)
   * Outside folds have no max length restriction, inside folds are limited by parent segment
   * @param {String} foldType - Fold type: 'Up', 'Down', 'OpenUp', 'OpenDn'
   * @param {Boolean} isEndFold - true for end fold, false for start fold
   * @returns {Boolean} - true if fold is outside (no max limit), false if inside (apply max limit)
   */
  const isFoldOutside = (foldType, isEndFold) => {
    // Fold validation only runs in normal mode, so use lengths/angles directly
    // Need at least 3 points to form a shape with inside/outside
    if (lengths.length < 2) return true; // Default to outside if not enough points

    // Calculate points WITHOUT any folds for clean inside/outside detection
    // This prevents stale fold state from affecting the centroid calculation
    const cleanPts = calculatePoints(
      lengths,
      angles,
      direction,
      segmentAbsoluteAngles,
      displayLengths,
      false,
      originOffset,
      firstSegmentAngle,
      null, // No start fold
      0,    // No start fold length
      null, // No end fold
      0     // No end fold length
    );
    const nonFoldPoints = cleanPts.filter(p => !p.isFold);

    if (nonFoldPoints.length < 3) return true; // Default to outside

    // Calculate centroid (geometric center of the shape)
    let sumX = 0;
    let sumY = 0;
    nonFoldPoints.forEach(pt => {
      sumX += pt.x;
      sumY += pt.y;
    });
    const centroidX = sumX / nonFoldPoints.length;
    const centroidY = sumY / nonFoldPoints.length;

    // Get corner and adjacent points based on fold position
    let corner, prev, next;

    if (isEndFold) {
      // END fold: corner is at second-to-last point
      const cornerIdx = nonFoldPoints.length - 2;
      if (cornerIdx < 1) return true; // Not enough points
      corner = nonFoldPoints[cornerIdx];
      prev = nonFoldPoints[cornerIdx - 1];
      next = nonFoldPoints[cornerIdx + 1];
    } else {
      // START fold: corner is at second point (index 1)
      if (nonFoldPoints.length < 3) return true; // Not enough points
      corner = nonFoldPoints[1];
      prev = nonFoldPoints[0];
      next = nonFoldPoints[2];
    }

    // Determine segment direction (direction of the segment where the fold is attached)
    // START fold: first segment (from prev/first point toward corner)
    // END fold: last segment (from corner toward next/last point)
    const segDir = isEndFold ?
      { x: next.x - corner.x, y: next.y - corner.y } :  // Last segment direction
      { x: corner.x - prev.x, y: corner.y - prev.y };   // First segment direction
    const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
    if (segLen === 0) return true; // Degenerate segment
    const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

    // Calculate fold perpendicular direction based on fold type
    // NOTE: END fold direction is INVERTED in rendering (Up→Down, Down→Up)
    // So we need to invert the perpendicular direction for END folds
    const typeLower = foldType.toLowerCase();
    const isUpType = typeLower === 'up' || typeLower === 'openup';

    // For END fold, invert the direction since rendering inverts it
    let effectiveIsUp = isEndFold ? !isUpType : isUpType;

    // Account for flip transformations - flip changes visual direction of fold
    // flipV inverts the vertical direction (up becomes down visually)
    // flipH inverts the horizontal direction
    if (flipV) {
      effectiveIsUp = !effectiveIsUp;
    }

    // For END fold with flipH, the fold direction also needs to be inverted
    // because the last segment's orientation is mirrored
    if (flipH && isEndFold) {
      effectiveIsUp = !effectiveIsUp;
    }

    let perpDir;
    if (effectiveIsUp) {
      perpDir = { x: -segUnit.y, y: segUnit.x };
    } else { // down or opendn
      perpDir = { x: segUnit.y, y: -segUnit.x };
    }

    // Apply flipH to perpendicular direction (mirrors x component)
    // Only for START fold - END fold already handled via effectiveIsUp inversion above
    if (flipH && !isEndFold) {
      perpDir.x = -perpDir.x;
    }

    // Vector from fold point to centroid
    // START fold is at prev (first point), END fold is at next (last point)
    const foldPoint = isEndFold ? next : prev;
    const toCentroid = {
      x: centroidX - foldPoint.x,
      y: centroidY - foldPoint.y
    };

    // Dot product determines if fold points toward or away from shape center
    const dot = perpDir.x * toCentroid.x + perpDir.y * toCentroid.y;

    // If dot < 0, fold points away from centroid (outside) - no max limit
    // If dot >= 0, fold points toward centroid (inside) - apply max limit
    return dot < 0;
  };

  // Re-validate fold lengths when segment lengths or fold types change
  // This ensures fold length errors are shown when parent segment becomes smaller
  // or when fold direction changes from outside to inside
  useEffect(() => {
    // Use farLengths in taper mode, lengths in normal mode
    // For taper mode, use the MINIMUM of far and near lengths for validation
    // since fold cannot exceed either profile's segment length
    const effectiveLengths = showTaper
      ? farLengths.map((len, i) => Math.min(Number(len) || 0, Number(nearLengths[i]) || 0))
      : lengths;
    const effectiveAngles = showTaper ? farAngles : angles;

    // Wait for valid drawing data before validating (prevents validation with stale/incomplete data)
    // Need at least 2 lengths and 1 angle for a valid drawing shape
    const hasValidDrawingData = effectiveLengths.length >= 2 && effectiveAngles.length >= 1 &&
                                 effectiveLengths.some(l => Number(l) > 0);

    // Validate start fold
    if (startFoldType && startFoldLength > 0 && hasValidDrawingData) {
      // Check if first segment involves a diagonal turn
      const firstAngle = effectiveAngles.length > 0 ? Math.abs(Number(effectiveAngles[0])) : 0;
      const isDiagonalStart = firstAngle !== 0 && firstAngle !== 90 && firstAngle !== 180;

      let isInside;
      if (isDiagonalStart) {
        const isUpType = startFoldType.toLowerCase() === 'up' || startFoldType.toLowerCase() === 'openup';

        // Check if all angles have consistent signs (all positive or all negative)
        const hasPositive = effectiveAngles.some(a => Number(a) > 0);
        const hasNegative = effectiveAngles.some(a => Number(a) < 0);
        const isMixedSigns = hasPositive && hasNegative;

        if (isMixedSigns) {
          // Mixed angle shapes: use LOCAL angle sign at the fold point
          // Positive first angle: Up = inside, Down = outside
          // Negative first angle: Down = inside, Up = outside
          // FlipH/FlipV invert the inside/outside relationship (XOR - one inverts, both cancel)
          const firstAngleValue = Number(effectiveAngles[0]);
          let baseInside = firstAngleValue >= 0 ? isUpType : !isUpType;
          const shouldInvert = flipH !== flipV;
          isInside = shouldInvert ? !baseInside : baseInside;
        } else {
          // Consistent angles - use total winding
          // Positive total (CCW, bucket): Up = inside
          // Negative total (CW, V-shape): Down = inside
          // FlipH/FlipV invert the inside/outside relationship (XOR - one inverts, both cancel)
          const totalAngle = effectiveAngles.reduce((sum, a) => sum + Number(a), 0);
          let baseInside = totalAngle >= 0 ? isUpType : !isUpType;
          const shouldInvert = flipH !== flipV;
          isInside = shouldInvert ? !baseInside : baseInside;
        }
      } else {
        isInside = !isFoldOutside(startFoldType, false);
      }

      if (isInside) {
        // Inside fold - check against first segment length
        const parentLineLength = Number(effectiveLengths[0]) || Infinity;
        if (Number(startFoldLength) > parentLineLength) {
          setStartFoldLengthError(`Max ${parentLineLength}mm`);
        } else {
          setStartFoldLengthError('');
        }
      } else {
        // Outside fold - no limit
        setStartFoldLengthError('');
      }
    } else if (!startFoldType || !startFoldLength) {
      setStartFoldLengthError('');
    }

    // Validate end fold
    if (endFoldType && endFoldLength > 0 && hasValidDrawingData) {
      // Check if last segment involves a diagonal turn
      const lastAngle = effectiveAngles.length > 0 ? Math.abs(Number(effectiveAngles[effectiveAngles.length - 1])) : 0;
      const isDiagonalEnd = lastAngle !== 0 && lastAngle !== 90 && lastAngle !== 180;

      let isInside;
      if (isDiagonalEnd) {
        const isUpType = endFoldType.toLowerCase() === 'up' || endFoldType.toLowerCase() === 'openup';

        // Check if all angles have consistent signs (all positive or all negative)
        const hasPositive = effectiveAngles.some(a => Number(a) > 0);
        const hasNegative = effectiveAngles.some(a => Number(a) < 0);
        const isMixedSigns = hasPositive && hasNegative;

        if (isMixedSigns) {
          // Mixed angle shapes: use LOCAL angle sign at the fold point
          // Positive last angle: Down = inside, Up = outside
          // Negative last angle: Up = inside, Down = outside
          // FlipH/FlipV invert the inside/outside relationship (XOR - one inverts, both cancel)
          const lastAngleValue = Number(effectiveAngles[effectiveAngles.length - 1]);
          let baseInside = lastAngleValue >= 0 ? !isUpType : isUpType;
          const shouldInvert = flipH !== flipV;
          isInside = shouldInvert ? !baseInside : baseInside;
        } else {
          // Consistent angles - use total winding
          // Positive total (CCW, bucket): Down = inside (opposite of START)
          // Negative total (CW, V-shape): Up = inside (opposite of START)
          // FlipH/FlipV invert the inside/outside relationship (XOR - one inverts, both cancel)
          const totalAngle = effectiveAngles.reduce((sum, a) => sum + Number(a), 0);
          let baseInside = totalAngle >= 0 ? !isUpType : isUpType;
          const shouldInvert = flipH !== flipV;
          isInside = shouldInvert ? !baseInside : baseInside;
        }
      } else {
        isInside = !isFoldOutside(endFoldType, true);
      }

      if (isInside) {
        // Inside fold - check against last segment length
        const parentLineLength = Number(effectiveLengths[effectiveLengths.length - 1]) || Infinity;
        if (Number(endFoldLength) > parentLineLength) {
          setEndFoldLengthError(`Max ${parentLineLength}mm`);
        } else {
          setEndFoldLengthError('');
        }
      } else {
        // Outside fold - no limit
        setEndFoldLengthError('');
      }
    } else if (!endFoldType || !endFoldLength) {
      setEndFoldLengthError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengths, farLengths, nearLengths, startFoldType, startFoldLength, endFoldType, endFoldLength, angles, farAngles, direction, segmentAbsoluteAngles, flipH, flipV, showTaper]);

  /**
   * Handle part class selection from Quick Library navigation
   * Fetches drawings for the selected part class and displays them in the overlay
   * Uses optimized template-library endpoint with selective field population
   * Supports infinite scroll (same pattern as TemplateLibrary.js)
   * @param {String} partClass - Selected part class ('My Library', 'Gutters', 'Aprons', etc.)
   * @param {Number} pageNum - Page number to fetch (default: 1)
   * @param {Boolean} append - Whether to append to existing data (for scroll load) or replace
   * @returns {Promise<void>}
   */
  const handlePartClassClick = async (partClass, pageNum = 1, append = false) => {
    try {
      // Set appropriate loading state
      if (append) {
        setQuickLibraryLoadingMore(true);
      } else {
        setLoadingLibrary(true);
        setQuickLibraryHasMore(true); // Reset hasMore for fresh tab load
      }

      const token = tokenManager.getToken();

      // Build params for optimized library endpoint (same as TemplateLibrary.js)
      const params = {
        page: pageNum,
        limit: quickLibraryPageSize
      };

      if (partClass === 'My Library') {
        // For My Library
        params.library_type = 'my_library';
        params.owner_user_id = USER_ID;

      } else if (partClass === 'Customer Library') {
        // For Customer Library
        params.library_type = 'customer_library';
        const customerId = localStorage.getItem('customerId');
        if (customerId) {
          params.customer_id = customerId;
        }

      } else {
        // For specific part classes (Gutters, Aprons, etc.)
        const partGroupMapping = {
          'Gutters': 'Flashing',
          'Cappings': 'Flashing',
          'Aprons': 'Flashing',
          'Ridge & Valley': 'Flashing',
          'Soakers': 'Flashing',
          'Foot Moulds': 'Flashing',
          'Misc': 'Flashing'
        };

        params.library_type = 'part_class';
        params.part_group = partGroupMapping[partClass] || 'Flashing';
        params.part_class = partClass;
      }

      // Use optimized template-library endpoint (with selective field population and better performance)
      const response = await axios.get(`${API_BASE_URL}/api/template-library`, {
        params,
        headers: {
          'x-access-token': token,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.data && Array.isArray(response.data.data)) {
        // Extract templates from library entries (template data is in template_id field)
        const libraryEntries = response.data.data;
        const pagination = response.data.pagination || {};

        const templatesData = libraryEntries
          .filter(entry => entry.template_id) // Filter out entries with deleted templates
          .map(entry => ({
            ...entry.template_id, // Spread template data
            _libraryEntryId: entry._id // Add library entry ID for potential future use
          }));

        // Sort by creation date (oldest first) - same as library page
        const sortedDrawings = templatesData.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        // Update hasMore based on pagination response
        setQuickLibraryHasMore(pagination.hasMore !== undefined ? pagination.hasMore : templatesData.length === quickLibraryPageSize);

        if (append) {
          // Append to existing templates (scroll load)
          setSelectedPartClassDrawings(prev => [...prev, ...sortedDrawings]);
        } else {
          // Replace templates (initial load or tab change)
          setSelectedPartClassDrawings(sortedDrawings);
          setQuickLibraryPage(1); // Reset page
          setShowDrawingsOverlay(true);
        }
      } else {
        if (!append) {
          setSelectedPartClassDrawings([]);
          setQuickLibraryPage(1); // Reset page
          setShowDrawingsOverlay(true);
        }
        setQuickLibraryHasMore(false);
      }
    } catch (error) {
      logger.error('Failed to load Quick Library drawings:', error);

      if (!append) {
        // Show empty overlay only on initial load
        setSelectedPartClassDrawings([]);
        setShowDrawingsOverlay(true);

        if (error.response?.status === 404) {
          swal.fire({
            text: 'Library endpoint not found.',
            icon: 'error',
            title: 'API Error'
          });
        } else if (error.response?.status === 401) {
          swal.fire({
            text: 'Authentication failed.',
            icon: 'error',
            title: 'API Error'
          });
        } else {
          swal.fire({
            text: 'Failed to load drawings.',
            icon: 'error',
            title: 'Error'
          });
        }
      }
    } finally {
      if (append) {
        setQuickLibraryLoadingMore(false);
      } else {
        setLoadingLibrary(false);
      }
    }
  };

  /**
   * Handle drawing selection from Quick Library overlay
   * Loads the selected template into the canvas for editing/use
   * Marks it as from library so it creates a new instance on save (doesn't update original)
   * @param {Object} drawing - Selected drawing template object
   * @returns {void}
   */
  const handleDrawingSelect = (drawing) => {
    // Load the selected drawing into the canvas
    if (!drawing) return;

    console.log('Quick Library Drawing Selected:', {
      lengths: drawing.lengths,
      angles: drawing.angles,
      farLengths: drawing.farLengths,
      farAngles: drawing.farAngles,
      isTaper: drawing.isTaper,
      firstSegmentAngle: drawing.firstSegmentAngle,
      direction: drawing.direction
    });

    // Mark this as from library - should create new instance on save, not update original
    setIsFromLibrary(true);
    setSavedTemplateId(null); // Clear any previously saved template ID

    // Clear existing drawing first to ensure clean load
    setContinuousDrawing(false);
    setFirstClickPoint(null);

    // CRITICAL FIX: Set ref IMMEDIATELY, BEFORE any state updates
    // Must be synchronous to prevent auto-detection from running during template load
    hasAutoSetColorSideRef.current = true;
    console.log('✅ Set hasAutoSetColorSideRef.current = true (from Quick Library) - BEFORE state updates');

    // Set basic properties first (same order as library load)
    setTemplateName(drawing.name || '');
    setBaseReverseColor(drawing.reverseColor ?? false);
    setReverseColor(drawing.reverseColor ?? false);
    setDirection(drawing.direction || 'Right');
    setPartGroup(drawing.partGroup || 'Flashing');
    setPartClass(drawing.partClass || 'Aprons')

    // Restore saved orientation to maintain correct drawing appearance
    setFirstSegmentAngle(drawing.firstSegmentAngle ?? null);
    setFlipH(drawing.flipH ?? false);
    setFlipV(drawing.flipV ?? false);
    // Also restore label offsets if available
    if (drawing.labelOffsets) {
      setLabelOffsets(drawing.labelOffsets);
    }
    setSegmentAbsoluteAngles([]); // Clear absolute angles to force recalculation

    // Handle folds (same as library load)
    if (drawing.startFoldDirection) {
      let frontendDirection = drawing.startFoldDirection;
      if (frontendDirection === 'up') frontendDirection = 'Down';
      else if (frontendDirection === 'down') frontendDirection = 'Up';
      else if (frontendDirection === 'openup') frontendDirection = 'OpenDn';
      else if (frontendDirection === 'opendn') frontendDirection = 'OpenUp';

      // No reverse flip compensation needed - dropdown was already flipped when saved

      setStartFoldType(frontendDirection);
      setStartFoldLength(drawing.startFoldLength || '');
      setStartFoldGap(drawing.startFoldGap || '');
    } else {
      // Clear start fold if new drawing doesn't have one
      setStartFoldType('');
      setStartFoldLength('');
      setStartFoldGap('');
    }
    if (drawing.endFoldDirection) {
      let frontendDirection = drawing.endFoldDirection;
      if (frontendDirection === 'up') frontendDirection = 'Up';
      else if (frontendDirection === 'down') frontendDirection = 'Down';
      else if (frontendDirection === 'openup') frontendDirection = 'OpenUp';
      else if (frontendDirection === 'opendn') frontendDirection = 'OpenDn';

      // No reverse flip compensation needed - dropdown was already flipped when saved

      setEndFoldType(frontendDirection);
      setEndFoldLength(drawing.endFoldLength || '');
      setEndFoldGap(drawing.endFoldGap || '');
    } else {
      // Clear end fold if new drawing doesn't have one
      setEndFoldType('');
      setEndFoldLength('');
      setEndFoldGap('');
    }

    // Load taper mode if needed
    if (drawing.isTaper) {
      setShowTaper(true)

      // Use same logic as library template load
      const lengths = (drawing.lengths || []).map(l => {
        const num = Number(l);
        return (isNaN(num) || !isFinite(num)) ? 0 : num;
      });
      const angles = drawing.angles || [];
      const farLengths = (drawing.farLengths || lengths).map(l => {
        const num = Number(l);
        return (isNaN(num) || !isFinite(num)) ? 0 : num;
      });
      const farAngles = drawing.farAngles || angles;
      const nearLengths = (drawing.nearLengths || []).map(l => {
        const num = Number(l);
        return (isNaN(num) || !isFinite(num)) ? 0 : num;
      });
      const nearAngles = drawing.nearAngles || [];

      // Validate angles (same as library load)
      const validatedFarAngles = farAngles.map(a => {
        const num = Number(a);
        if (isNaN(num) || !isFinite(num)) {
          console.warn('Invalid angle value from Quick Library:', a);
          return 0;
        }
        return num;
      });

      // Handle taper mode data
      let farLens = [...farLengths];
      let farAngs = [...validatedFarAngles];
      let nearLens = [...nearLengths];
      let nearAngs = [...nearAngles];

      // If near data is missing, duplicate far data (symmetric taper)
      if (nearLens.length === 0 && farLens.length > 0) {
        nearLens = [...farLens];
      }
      if (nearAngs.length === 0 && farAngs.length > 0) {
        nearAngs = [...farAngs];
      }

      // Set the data (same as library load)
      setFarLengths(farLens);
      setFarAngles(farAngs);
      setNearLengths(nearLens);
      setNearAngles(nearAngs);
      setLengths(farLens); // Also set lengths for taper mode
      const normalizedFarAngles = normalizeAllAngles(farAngs);
      const normalizedNearAngles = normalizeAllAngles(nearAngs);
      setFarAngles(normalizedFarAngles);
      setNearAngles(normalizedNearAngles);
      setAngles(normalizedFarAngles); // Also set angles for taper mode
      setBaseLengths(farLens);
      setBaseAngles(normalizedFarAngles);

      // No auto-center for taper mode
    } else {
      // Normal mode (non-taper) - same as library load
      setShowTaper(false);

      const validatedAngles = drawing.angles ? drawing.angles.map(a => {
        const num = Number(a);
        if (isNaN(num) || !isFinite(num)) {
          console.warn('Invalid angle value from Quick Library:', a);
          return 0;
        }
        return num;
      }) : [];

      const mappedLengths = (drawing.lengths || []).map(l => {
        const num = Number(l);
        return (isNaN(num) || !isFinite(num)) ? 0 : num;
      });
      setLengths(mappedLengths);
      const trimmedAngles = validatedAngles.slice(0, Math.max(0, mappedLengths.length - 1));

      console.log('Quick Library Non-Taper Loading:', {
        mappedLengths,
        validatedAngles,
        trimmedAngles,
        firstSegmentAngle: drawing.firstSegmentAngle,
        direction: drawing.direction
      });

      const normalizedAngles = normalizeAllAngles(trimmedAngles);
      setAngles(normalizedAngles);
      setBaseLengths(mappedLengths);
      setBaseAngles(normalizedAngles);

      // Initialize display angles with saved firstSegmentAngle to maintain correct orientation
      const displayAngs = initializeDisplayAngles(
        normalizedAngles,  // Use normalized angles instead of trimmedAngles
        drawing.firstSegmentAngle ?? null, // Use saved firstSegmentAngle if available
        drawing.direction || 'Right'
      );
      setDisplayAngles(displayAngs);

      // Segment absolute angles will be recalculated naturally
    }

    // Hide the overlay
    setShowDrawingsOverlay(false);

    // Focus the first length input after loading from Quick Library
    setTimeout(() => {
      if (drawing.isTaper && nearLengthRefs.current[0]) {
        nearLengthRefs.current[0]?.focus();
      } else if (lengthRefs.current[0]) {
        lengthRefs.current[0]?.focus();
      }
    }, 300);

    // Save to history for undo/redo
    const newHistoryEntry = {
      lengths: drawing.lengths || [],
      angles: drawing.angles || [],
      direction: drawing.direction || 'Right',
      firstSegmentAngle: null, // Don't save firstSegmentAngle to match reset behavior
      showTaper: drawing.isTaper || false
    };
    setHistory([...history, newHistoryEntry]);
    setCanUndo(true);
  };

  const handleStartFold = (type, len) => {
    setStartFoldType(type);
    setStartFoldLength(len);
  };

  const handleEndFold = (type, len) => {
    setEndFoldType(type);
    setEndFoldLength(len);
  };

  /**
   * Flip points horizontally around their bounding box center
   * @param {Array} pts - Array of {x, y} points
   * @returns {Array} - Horizontally flipped points
   */
  const flipX = (pts) => {
    if (!Array.isArray(pts) || pts.length === 0) return [];

    const center = getBoundingBoxCenter(pts);

    return pts.map(p => ({
      x: reflectPoint(p, { x: center.x, y: p.y }).x,
      y: p.y
    }));
  };

  /**
   * Flip points vertically around their bounding box center
   * @param {Array} pts - Array of {x, y} points
   * @returns {Array} - Vertically flipped points
   */
  const flipY = (pts) => {
    const center = getBoundingBoxCenter(pts);
    return pts.map(p => ({
      x: p.x,
      y: reflectPoint(p, { x: p.x, y: center.y }).y
    }));
  };

  /**
   * Calculate angle after applying horizontal and/or vertical flip transformations
   * Flipping changes angle sign based on flip state
   * @param {Number} angle - Original angle in degrees
   * @returns {Number} - Flipped angle
   */
  const getFlippedAngle = (angle) => {
    // Ensure angle is a valid number
    const numAngle = Number(angle);
    if (isNaN(numAngle)) {
      console.warn('Invalid angle value:', angle);
      return 0;
    }
    const h = flipH ? -1 : 1;
    const v = flipV ? -1 : 1;
    const netFlip = h * v;
    return Math.round(numAngle * netFlip);
  };

  /**
   * Apply current flip transformations (H and/or V) to a single point
   * Uses bounding box center of MAIN points only (excludes fold points) as flip axis
   * This ensures flip center remains stable when folds are added/removed
   * @param {Object} p - Point object {x, y}
   * @param {Array} pointsArray - Optional points array for center calculation (defaults to state points)
   * @returns {Object} - Flipped point {x, y}
   */
  const applyFlipToPoint = (p, pointsArray = null) => {
    // Use provided points array or fall back to state points
    const ptsToUse = pointsArray || points;

    if (!p || !ptsToUse || ptsToUse.length === 0) return p || { x: 0, y: 0 };

    // CRITICAL: Filter out fold points for center calculation
    // Fold points extend the bounding box asymmetrically, which would shift the flip axis
    // By using only main (non-fold) points, the flip center remains stable
    const mainPtsForCenter = ptsToUse.filter(pt => !pt.isFold);
    const ptsForCenter = mainPtsForCenter.length > 0 ? mainPtsForCenter : ptsToUse;

    const center = getBoundingBoxCenter(ptsForCenter);
    let newP = { ...p };

    if (flipH && ptsToUse.length > 0 && isFinite(center.x)) {
      newP.x = reflectPoint(p, { x: center.x, y: p.y }).x;
    }
    if (flipV && ptsToUse.length > 0 && isFinite(center.y)) {
      newP.y = reflectPoint(p, { x: p.x, y: center.y }).y;
    }
    return newP;
  };

  // SWI-style: Removed automatic initial segment - drawing now starts from scratch
  // Users must click to set origin point, then click again to create first segment
  // useEffect(() => {
  //   // Don't add default segment if we have location.state with drawing data
  //   const hasLocationStateData = location.state?.lengths || location.state?.farLengths || location.state?.angles || location.state?.isEdit;
  //   if (!templateId && lengths.length === 0 && angles.length === 0 && !hasLocationStateData) {
  //     // Start with 50mm segment in the initial direction
  //     setLengths([50]);
  //     setAngles([]);
  //   }
  // }, [templateId, lengths, angles]);

  // Don't apply fixed widths during rendering - let getAdjustedPointsForMinimumSegments handle it
  // SAFETY: Use lengths if displayLengths is empty (fixes Edit Drawing collapse issue)
  const effectiveDisplayLengths = displayLengths.length > 0 ? displayLengths : lengths;
  const allPts = calculatePointsLocal(lengths, angles, direction, segmentAbsoluteAngles, effectiveDisplayLengths, false);
  const mainPts = allPts.filter(p => !p.isFold);
  // Use dynamic stage dimensions based on viewport
  const stageWidth = dynamicStageWidth;
  const stageHeight = dynamicStageHeight; // Responsive height based on viewport

  // Use effective lengths for scaling (with preserved values for empty inputs)
  const effectiveLengths = lengths.map((len, idx) => {
    // Convert to number first
    const numLen = typeof len === 'number' ? len : Number(len);

    // If invalid or empty, try displayLengths, otherwise use 0
    if (isNaN(numLen) || !isFinite(numLen) || len === '' || len == null) {
      const displayVal = displayLengths[idx];
      return (displayVal !== undefined && displayVal !== null) ? displayVal : 0;
    }
    return numLen;
  });

  console.log('🔍 RENDER - Current State:', {
    lengths,
    effectiveLengths,
    continuousDrawing,
    preservedShrinkFactor,
    preservedGirth
  });

  // DEBUG: Check if 1000 is being corrupted
  if (lengths.some(l => Number(l) >= 999 && Number(l) <= 1000)) {
    console.log('🔧 EFFECTIVE LENGTHS CALCULATION:', {
      lengthsInput: lengths,
      displayLengthsInput: displayLengths,
      effectiveLengthsOutput: effectiveLengths,
      mappingDetail: lengths.map((len, idx) => ({
        idx,
        input: len,
        type: typeof len,
        numLen: typeof len === 'number' ? len : Number(len),
        output: effectiveLengths[idx]
      }))
    });
  }

  // SAFETY CHECK: Don't call getScale if we don't have valid points
  let scale, offsetX, offsetY;
  if (mainPts.length < 2 || (lengths.length === 0 && displayLengths.length === 0)) {
    scale = 1;
    offsetX = stageWidth / 2;
    offsetY = stageHeight / 2;
  } else {
    // GIRTH-BASED SCALING: Use ACTUAL lengths for girth calculation, not capped values
    // The girth should be calculated from the real segment values (e.g., 300mm, not capped to 150)
    // CRITICAL FIX: Don't use effectiveLengths (which come from point calculations with capping)
    // Use the raw lengths array directly for accurate girth calculation
    const lengthsForScale = lengths.map(len => {
      const numLen = typeof len === 'number' ? len : Number(len);
      return isNaN(numLen) || !isFinite(numLen) || len === '' || len == null ? 0 : numLen;
    });

    // GIRTH-BASED SCALING: Only prevent auto-center while actively drawing
    // After drawing stops, allow girth-based scaling to apply ONCE, then preserve it
    const shouldPreventAutoCenter = continuousDrawing; // Only prevent during active drawing

    // Determine shrinkFactor:
    // - While drawing (continuousDrawing=true): Use null to calculate fresh
    // - After drawing stops: Calculate based on current girth
    // - When girth changes (new segments added): Recalculate to adjust scale
    let shrinkFactorToUse = null;

    if (continuousDrawing) {
      // During active drawing, always calculate fresh
      shrinkFactorToUse = null;
    } else {
      // When not drawing, check if girth has changed since last calculation
      const currentGirth = lengthsForScale.reduce((sum, len) => sum + (len === "" ? 0 : Number(len)), 0);

      // Helper function to determine which tier a girth value falls into
      const getGirthTier = (girth) => {
        if (girth <= 250) return 1;
        if (girth <= 500) return 2;
        if (girth <= 1000) return 3;
        return 4;
      };

      const currentTier = getGirthTier(currentGirth);
      const previousTier = getGirthTier(preservedGirth);

      // If girth tier has changed, force recalculation
      if (currentTier !== previousTier || preservedShrinkFactor === null) {
        shrinkFactorToUse = null; // Will trigger fresh calculation in getScale
      } else {
        // Girth tier hasn't changed, use preserved value
        shrinkFactorToUse = preservedShrinkFactor;
      }
    }

    const result = getScale(
      mainPts,
      stageWidth,
      stageHeight,
      60,
      canvasScale,
      { x: canvasOffset.x, y: canvasOffset.y },
      shrinkFactorToUse, // Use preserved shrinkFactor when available
      lengthsForScale, // Pass ACTUAL lengths for correct girth calculation
      shouldPreventAutoCenter, // Prevent auto-center while drawing AND after stopping (until table edit)
      continuousDrawing ? firstClickPixelPos : null // Use firstClickPixelPos only during continuous drawing
    );
    scale = result.scale;
    offsetX = result.offsetX;
    offsetY = result.offsetY;

    // Note: shrinkFactor preservation is now handled in useEffect (lines 1169-1205)
    // This ensures proper timing after state updates complete
  }

  /**
   * Main rendering function that draws all visual elements on the canvas
   * Handles: segments, tick marks, labels, folds, green extension handle, preview lines
   * This is the core rendering pipeline that converts geometric data into React-Konva elements
   * @param {Array} pts - Point coordinates to render
   * @param {Number} scale - Current zoom/scale factor
   * @param {Number} offsetX - Horizontal canvas offset (for centering)
   * @param {Number} offsetY - Vertical canvas offset (for centering)
   * @param {Array} labelLens - Lengths to display on labels
   * @param {Array} labelAngs - Angles for turn calculations
   * @param {Array} displayAngs - Angles to display on labels (can differ from labelAngs)
   * @param {Boolean} isInTemplateCreateMode - Whether in template creation mode
   * @param {Boolean} isTaperMode - Whether rendering taper mode canvas
   * @returns {JSX.Element} - React-Konva elements for rendering
   */
  const drawLines = (pts, scale, offsetX, offsetY, labelLens = displayLengths.length > 0 ? displayLengths : lengths, labelAngs = null, displayAngs = null, isInTemplateCreateMode = false, isTaperMode = false, taperProfile = null) => {
    const tickElements = [];
    const guideLines = [];
    const extraMarkers = [];

    // Apply adjustments only for extreme cases (very small or very large segments)
    // For normal segments, ALWAYS use exact positions to preserve drawing accuracy
    const nonFoldPts = pts.filter(p => !p.isFold);

    // Check if we have segments that need adjustment for visibility
    // Apply adjustments for any segment that might need minimum size enforcement
    const hasExtremeSegments = true; // Always check adjustments to ensure minimum visibility

    // Apply adjustments:
    // - Never during active drawing (continuousDrawing = true)
    // - For new drawings: ONLY when user has edited values in the table (hasEditedInTable = true)
    // - For templates: Always apply adjustments (they come pre-scaled)
    // - For taper mode: ALWAYS apply adjustments for consistent display
    // - EXCEPT: Don't adjust when returning from Edit Drawing before template is saved (isEdit flag)
    const isEditBeforeSave = location.state?.isEdit && location.state?.isNewFromCanvas;
    const shouldAdjust = (isTaperMode || (!isNewDrawing && !isEditBeforeSave) || hasEditedInTable) && hasExtremeSegments && !continuousDrawing;

    // DEBUG: Log adjustment decision for 1000mm bug
    if (labelLens.some(l => Number(l) >= 1000)) {
      console.log('🎨 ADJUSTMENT LOGIC (1000+ detected):', {
        shouldAdjust,
        isTaperMode,
        isNewDrawing,
        isEditBeforeSave,
        hasEditedInTable,
        continuousDrawing,
        locationStateIsEdit: location.state?.isEdit,
        locationStateIsNewFromCanvas: location.state?.isNewFromCanvas,
        labelLens,
        labelLensTypes: labelLens.map((l, i) => ({ index: i, value: l, type: typeof l, number: Number(l) })),
        lengths,
        displayLengths,
        scale
      });
    }

    const adjustedNonFoldPts = shouldAdjust ? getAdjustedPointsForMinimumSegments(nonFoldPts, labelLens, scale, isTaperMode) : nonFoldPts;

    // Reconstruct the full points array with fold points
    // IMPORTANT: Fold points need to be recalculated based on adjusted positions
    let adjustedPts = [];
    let nonFoldIndex = 0;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].isFold) {
        // For fold points, we need to recalculate their position based on the adjusted parent point
        // Find the parent segment point (the non-fold point this fold is attached to)
        const foldData = pts[i];

        // Check if this is a START fold (indices 0, 1 are fold points before first segment)
        // Also check startFoldLength > 0 to avoid rendering fold when length is cleared
        if (i < 2 && startFoldType && startFoldLength > 0 && adjustedNonFoldPts.length >= 2) {
          // START fold - recalculate based on adjusted first and second segment points
          const adjustedFirst = adjustedNonFoldPts[0];
          const adjustedSecond = adjustedNonFoldPts[1];

          if (adjustedFirst && adjustedSecond) {
            const fold = getFoldSegments(startFoldType, startFoldLength);
            const baseAngle = Math.atan2(adjustedSecond.y - adjustedFirst.y, adjustedSecond.x - adjustedFirst.x);

            if (i === 0) { // First fold point (p2 - second in the pair, added first)
              // This will be calculated after p1
              adjustedPts.push(pts[i]); // Temporarily use original
            } else if (i === 1) { // Second fold point (p1 - first in the pair)
              const rad1 = baseAngle - (fold.angles[1] * Math.PI) / 180;
              const p1 = {
                x: adjustedFirst.x - fold.lengths[1] * Math.cos(rad1),
                y: adjustedFirst.y - fold.lengths[1] * Math.sin(rad1),
                label: fold.label,
                isFold: true,
                dir: fold.dir,
              };

              // Now calculate p2
              const rad2 = baseAngle - ((fold.angles[1] + fold.angles[0]) * Math.PI) / 180;
              const p2 = {
                x: p1.x - fold.lengths[0] * Math.cos(rad2),
                y: p1.y - fold.lengths[0] * Math.sin(rad2),
                label: fold.label,
                isFold: true,
                dir: fold.dir,
              };

              // Replace the first fold point we temporarily added
              adjustedPts[0] = p2;
              adjustedPts.push(p1);
            }
          } else {
            adjustedPts.push(pts[i]);
          }
        }
        // Check if this is an END fold (last 2 points after last segment)
        // Also check endFoldLength > 0 to avoid rendering fold when length is cleared
        else if (i >= pts.length - 2 && endFoldType && endFoldLength > 0 && adjustedNonFoldPts.length >= 2) {
          // END fold - recalculate based on adjusted last and second-to-last segment points
          const adjustedLast = adjustedNonFoldPts[adjustedNonFoldPts.length - 1];
          const adjustedPrev = adjustedNonFoldPts[adjustedNonFoldPts.length - 2];

          if (adjustedLast && adjustedPrev) {
            const fold = getFoldSegments(endFoldType, endFoldLength);
            const baseAngle = Math.atan2(adjustedLast.y - adjustedPrev.y, adjustedLast.x - adjustedPrev.x);

            if (i === pts.length - 2) { // First END fold point (p1)
              const rad1 = baseAngle + (fold.angles[0] * Math.PI) / 180;
              adjustedPts.push({
                x: adjustedLast.x + fold.lengths[0] * Math.cos(rad1),
                y: adjustedLast.y + fold.lengths[0] * Math.sin(rad1),
                label: fold.label,
                isFold: true,
                dir: fold.dir,
              });
            } else { // Second END fold point (p2)
              const p1 = adjustedPts[adjustedPts.length - 1];
              if (p1) {
                const rad2 = baseAngle + ((fold.angles[0] + fold.angles[1]) * Math.PI) / 180;
                adjustedPts.push({
                  x: p1.x + fold.lengths[1] * Math.cos(rad2),
                  y: p1.y + fold.lengths[1] * Math.sin(rad2),
                  label: fold.label,
                  isFold: true,
                  dir: fold.dir,
                });
              } else {
                adjustedPts.push(pts[i]);
              }
            }
          } else {
            adjustedPts.push(pts[i]);
          }
        } else {
          // Unknown fold point or not enough points - use original
          adjustedPts.push(pts[i]);
        }
      } else {
        adjustedPts.push(adjustedNonFoldPts[nonFoldIndex]);
        nonFoldIndex++;
      }
    }

    // Check if any points were actually adjusted
    const hasAdjustments = adjustedPts.some((p, i) =>
      pts[i] && (Math.abs(p.x - pts[i].x) > 0.001 || Math.abs(p.y - pts[i].y) > 0.001)
    );

    // Use adjusted points for labels only if adjustments were made
    const labelPoints = hasAdjustments ? adjustedPts : pts;


    // Show a dot indicator for the first click point when no segments exist yet
    if (firstClickPoint && firstClickPixelPos && labelLens.length === 0 && !showTaper) {
      guideLines.push(
        <Circle
          key="first-click-indicator"
          x={firstClickPixelPos.x}
          y={firstClickPixelPos.y}
          radius={6}
          fill="blue"
          stroke="white"
          strokeWidth={2}
          opacity={0.8}
        />
      );
    }

    // Preview line to show where segment will be created
    // Only show preview AFTER first segment is created (labelLens.length > 0)
    if (hoverPoint && firstClickPoint && !showTaper && labelLens.length > 0) {
      // ALWAYS calculate the start point fresh from current state
      let actualStartPoint;

      if (labelLens.length === 0) {
        // No segments yet - if we have firstClickPixelPos, convert it to drawing coords
        // Otherwise use originOffset
        if (firstClickPixelPos) {
          actualStartPoint = {
            x: (firstClickPixelPos.x - offsetX) / scale,
            y: (firstClickPixelPos.y - offsetY) / scale
          };
        } else {
          actualStartPoint = originOffset || { x: 0, y: 0 };
        }
      } else {
        // Have segments - calculate the actual last point RIGHT NOW
        // For template create mode or when segmentAbsoluteAngles might be stale,
        // recalculate absolute angles fresh
        let absoluteAnglesToUse = segmentAbsoluteAngles;

        // Check if we need fresh calculation (template create mode or mismatch in lengths)
        const needsFreshCalc = isInTemplateCreateMode ||
          (segmentAbsoluteAngles.length !== labelLens.length);

        if (needsFreshCalc) {
          // Recalculate absolute angles fresh
          const directionMap = DIRECTION_MAP;

          const freshAbsoluteAngles = [];
          let currentAngle = firstSegmentAngle !== null ? firstSegmentAngle : (directionMap[direction] ?? 0);

          for (let i = 0; i < labelLens.length; i++) {
            if (i === 0) {
              freshAbsoluteAngles.push(currentAngle);
            } else {
              currentAngle += labelAngs[i - 1] || 0;
              freshAbsoluteAngles.push(currentAngle);
            }
          }
          absoluteAnglesToUse = freshAbsoluteAngles;
        }

        // This ensures it matches exactly what's being rendered
        const currentCalcPoints = calculatePointsLocal(labelLens, labelAngs, direction, absoluteAnglesToUse, [], false);
        const currentNonFoldPoints = currentCalcPoints.filter(p => !p.isFold);
        actualStartPoint = currentNonFoldPoints[currentNonFoldPoints.length - 1];
      }

      // Don't apply flip to preview - use points directly for accurate preview
      // The flip is already handled in the coordinate system
      const start = actualStartPoint;
      const end = hoverPoint;

      // No preview - just like first segment drawing
    }

    // ➤ Calculate fold information for tick/gradient exclusion
    // Helper function to calculate fold extent and perpendicular direction
    const calculateFoldInfo = (adjustedPts, pts, segmentIndex, foldType, foldLength, isEndFold = false, currentScale = 1, parentSegmentLength = null, isTaperModeParam = false) => {
      if (!foldType || !foldLength || parseFloat(foldLength) <= 0) return null;

      // Get the corner point for this fold
      const cornerIdx = isEndFold ? adjustedPts.length - 3 : 2;
      const cornerRaw = adjustedPts[cornerIdx];
      const prevRaw = adjustedPts[cornerIdx - 1];
      const nextRaw = adjustedPts[cornerIdx + 1];

      if (!cornerRaw || !prevRaw || !nextRaw) return null;

      // Apply flip transformations
      const corner = applyFlipToPoint(cornerRaw, pts);
      const prev = applyFlipToPoint(prevRaw, pts);
      const next = applyFlipToPoint(nextRaw, pts);

      // Determine segment direction
      const segDir = isEndFold ?
        { x: prev.x - corner.x, y: prev.y - corner.y } :
        { x: next.x - corner.x, y: next.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

      // No flip compensation needed - dropdown value already reflects the flipped direction
      // When user clicks flip, dropdown changes (Up<->Down), so foldType is already correct

      // Perpendicular direction based on fold type
      const typeLower = foldType.toLowerCase();
      let perpDir;

      if (typeLower === 'up' || typeLower === 'openup') {
        perpDir = { x: -segUnit.y, y: segUnit.x };
      } else { // down or opendn
        perpDir = { x: segUnit.y, y: -segUnit.x };
      }

      // Calculate fold extent to match visual arc rendering
      // Must use the same calculation as drawFoldAt for consistency
      const foldLengthNum = parseFloat(foldLength) || 0;
      const actualSegLen = Number(parentSegmentLength) || segLen; // Use passed segment length, fallback to calculated
      const scaleRatio = segLen / actualSegLen; // drawing units per mm

      // Determine if this is a full arc (fold equals or exceeds segment)
      const isFullArc = foldLengthNum >= actualSegLen;

      // Use zero gap for full arc (no visible color at start)
      // For proportional arc, use normal gap
      const gapFromCorner = isFullArc ? 0 : Math.min(3, segLen * 0.05);

      // Arc extent logic - FIXED (same as drawFoldAt):
      let arcExtent;
      if (foldLengthNum > actualSegLen) {
        // Fold EXCEEDS segment - scale fold length to drawing units
        arcExtent = foldLengthNum * scaleRatio;
      } else if (foldLengthNum >= actualSegLen) {
        // Fold EQUALS segment - end at segment end (full arc)
        arcExtent = Math.max(segLen - gapFromCorner, 0);
      } else {
        // Fold is less than segment - arc ends at proportional position
        const proportionalEnd = (foldLengthNum / actualSegLen) * segLen;
        arcExtent = Math.max(proportionalEnd - gapFromCorner, 0);
      }

      // MINIMUM FOLD ARC SIZE: Match visual fold arc scaling
      // Must use same logic as drawFoldAt for color exclusion consistency
      if (foldLengthNum > 1) {
        // Use smaller minimums for taper mode
        const minFoldPixels = isTaperModeParam
          ? Math.min(25 + (foldLengthNum * 1.5), 100)
          : Math.min(40 + (foldLengthNum * 2), 160);
        const minArcExtent = minFoldPixels / currentScale;
        const currentArcPixels = arcExtent * currentScale;

        // Apply minimum if fold arc is too small
        // Use proportional for large ratios (>50%) to show SF 9 vs SF 10 difference
        // Use minimum with cap for small ratios to ensure visibility
        const foldLessThanSegment = foldLengthNum < actualSegLen;
        const foldRatio = foldLengthNum / actualSegLen;

        if (currentArcPixels < minFoldPixels) {
          if (foldLessThanSegment && foldRatio > 0.5) {
            // Fold is more than half of segment - use exact proportion for visible difference
            const maxProportionalExtent = foldRatio * segLen;
            arcExtent = Math.min(minArcExtent, maxProportionalExtent, segLen - gapFromCorner);
          } else if (foldLessThanSegment) {
            // Fold is less than half - apply minimum but cap to avoid covering too much
            // Ensure at least 15% visibility for small fold ratios in taper mode
            const minVisibleExtent = isTaperModeParam ? 0.15 * segLen : 0.1 * segLen;
            const maxReasonableExtent = Math.max(minVisibleExtent, Math.min(0.5 * segLen, foldRatio * segLen * 3));
            arcExtent = Math.min(minArcExtent, maxReasonableExtent, segLen - gapFromCorner);
          } else {
            // Fold >= segment: apply minimum normally
            arcExtent = Math.min(minArcExtent, segLen - gapFromCorner);
          }
        }
      }

      const foldExtent = gapFromCorner + arcExtent;

      // Return fold information
      return {
        segmentIndex,
        foldExtent,
        perpDir,
        isEndFold,
        corner
      };
    };

    // Helper to check if fold and color are on same side
    const isFoldOnColorSide = (foldPerpDir, colorPerpDir) => {
      // Dot product > 0 means same direction (same side)
      const dot = foldPerpDir.x * colorPerpDir.x + foldPerpDir.y * colorPerpDir.y;
      return dot > 0;
    };

    // Calculate fold info for start and end folds BEFORE drawing ticks
    // Pass scale so fold extent matches visual arc rendering across screen sizes
    // IMPORTANT: Use labelLens (parameter) not lengths (closure) for taper mode to work correctly
    let startFoldInfo = null;
    let endFoldInfo = null;

    if (adjustedPts.length >= 2) {
      if (startFoldType && startFoldLength > 0) {
        startFoldInfo = calculateFoldInfo(adjustedPts, pts, 0, startFoldType, startFoldLength, false, scale, labelLens[0], isTaperMode);
      }
      if (endFoldType && endFoldLength > 0) {
        endFoldInfo = calculateFoldInfo(adjustedPts, pts, adjustedPts.length - 2, endFoldType, endFoldLength, true, scale, labelLens[labelLens.length - 1], isTaperMode);
      }
    }

    // Check for 180° angles that hide color when color side is outside
    // When reverseColor = false (outside) and there's a 180° angle, segments with that angle should NOT show ticks
    const has180Angle = labelAngs ? labelAngs.map((angle) => {
      const absAngle = Math.abs(Math.abs(angle) - 180);
      return absAngle < 0.1; // Check if ±180° or -180°
    }) : [];

    // Calculate centroid to determine which side is "outside" for tick marks
    // This ensures color side is always on the outside by default, regardless of drawing direction
    let centroidX = null;
    let centroidY = null;
    let useCentroidCorrection = false;

    if (adjustedPts.length >= 3) { // Need at least 3 points to form a shape with inside/outside
      const nonFoldPoints = adjustedPts.filter(p => !p.isFold);
      if (nonFoldPoints.length >= 3) {
        // Calculate centroid (center of mass) of all non-fold points
        let sumX = 0;
        let sumY = 0;
        nonFoldPoints.forEach(pt => {
          const flipped = applyFlipToPoint(pt, pts);
          sumX += flipped.x;
          sumY += flipped.y;
        });
        centroidX = sumX / nonFoldPoints.length;
        centroidY = sumY / nonFoldPoints.length;

        // Only use centroid correction if values are valid (not NaN or Infinity)
        if (isFinite(centroidX) && isFinite(centroidY)) {
          useCentroidCorrection = true;
          console.log('📍 Centroid calculated for outside detection:', {
            centroidX,
            centroidY,
            pointCount: nonFoldPoints.length
          });
        }
      }
    }

    // ➤ Tick marks
    // Track if we've passed a 180° angle to offset tick positions
    let passed180 = false;

    for (let i = 0; i < adjustedPts.length - 1; i++) {
      if (adjustedPts[i].isFold || adjustedPts[i + 1].isFold) continue;

      // Calculate non-fold index to match with has180Angle array
      const nonFoldIndex = adjustedPts.slice(0, i + 1).filter(p => !p.isFold).length - 1;

      // Check for 180° angles and calculate how they affect tick visibility
      // When reverseColor = false (color outside) and there's a 180° fold:
      // - Segment AFTER the 180° angle: completely hidden (skip all ticks)
      // - Segment BEFORE the 180° angle: show ticks from start to middle, hide from middle to end

      // Check if PREVIOUS angle was 180° (this segment comes AFTER a 180° angle)
      const hasPrevious180 = !reverseColor && nonFoldIndex > 0 && nonFoldIndex - 1 < has180Angle.length && has180Angle[nonFoldIndex - 1];

      // For segment AFTER 180°, calculate where ticks should START (the part that sticks out)
      let ratio180Start = 0; // By default, start from beginning
      const lengthsToUse = showTaper && farLengths.length > 0 ? farLengths : lengths;

      if (hasPrevious180) {
        const prevSegmentIndex = nonFoldIndex - 1;
        if (prevSegmentIndex >= 0 && prevSegmentIndex < lengthsToUse.length && nonFoldIndex < lengthsToUse.length) {
          const prevSegmentLength = lengthsToUse[prevSegmentIndex];
          const currentSegmentLength = lengthsToUse[nonFoldIndex];

          if (currentSegmentLength <= prevSegmentLength) {
            // This segment is fully covered by the previous segment when folded, skip it
            continue;
          }
          // This segment is LONGER than previous, show ticks on the part that sticks out
          // Ticks should be from (prevLength/currentLength) to end
          ratio180Start = prevSegmentLength / currentSegmentLength;
        }
      }

      // Check if NEXT angle is 180° (this segment comes BEFORE a 180° angle)
      const hasNext180 = !reverseColor && nonFoldIndex < has180Angle.length && has180Angle[nonFoldIndex];

      // Calculate the ratio limit for 180° folds (where ticks should END)
      let ratio180Limit = 1.0; // By default, show all ticks (no 180° limit)

      if (hasNext180) {
        // Find the next segment's length
        const nextSegmentIndex = nonFoldIndex + 1;

        if (nextSegmentIndex < lengthsToUse.length) {
          const currentSegmentLength = lengthsToUse[nonFoldIndex];
          const nextSegmentLength = lengthsToUse[nextSegmentIndex];

          if (currentSegmentLength > nextSegmentLength) {
            // Current is longer, show ticks from start to (current - next) / current
            const visibleLength = currentSegmentLength - nextSegmentLength;
            ratio180Limit = visibleLength / currentSegmentLength;
          } else {
            // Current is shorter or equal, fully covered - show nothing
            ratio180Limit = 0;
          }
        }
      }

      // Check if there's a 180° angle at the start of this segment
      let has180AtStart = false;

      if (labelAngs && i > 0) {
        // Find the angle index for non-fold points
        const nonFoldIndexStart = adjustedPts.slice(0, i + 1).filter(p => !p.isFold).length - 1;

        // Check angle at start point
        if (nonFoldIndexStart > 0 && nonFoldIndexStart < labelAngs.length) {
          const angleAtStart = labelAngs[nonFoldIndexStart];
          if (Math.abs(Math.abs(angleAtStart) - 180) < 0.1) {
            has180AtStart = true;
            passed180 = true; // We've encountered a 180° angle
          }
        }
      }

      const start = applyFlipToPoint(adjustedPts[i], pts);
      const end = applyFlipToPoint(adjustedPts[i + 1], pts);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy);
      if (!isFinite(len) || len === 0) continue;

      const perp = getPerpendicularVector(dx, dy, len);
      let perpX = perp.x;
      let perpY = perp.y;

      // Calculate centroid correction factor using winding order
      let centroidCorrection = 1; // Default: no correction

      // For auto-set drawings, LOCK centroidCorrection = 1 immediately on first segment
      const isAutoSetDrawing = hasAutoSetColorSideRef.current;

      // Check if we already have a locked value
      if (lockedCentroidCorrectionRef.current !== null) {
        // Always use locked value once set
        centroidCorrection = lockedCentroidCorrectionRef.current;
      } else if (isAutoSetDrawing && i === 0) {
        // Auto-set drawings: lock to 1 immediately (reverseColor controls direction)
        lockedCentroidCorrectionRef.current = 1;
        centroidCorrection = 1;
        console.log(`✨ Auto-set drawing: LOCKING centroidCorrection = 1, reverseColor = ${reverseColor}`);
      } else if (useCentroidCorrection && !isAutoSetDrawing) {
        // MANUAL drawings only: calculate from winding order
        const nonFoldPts = adjustedPts.filter(p => !p.isFold);
        let signedArea = 0;
        for (let j = 0; j < nonFoldPts.length; j++) {
          const p1 = nonFoldPts[j];
          const p2 = nonFoldPts[(j + 1) % nonFoldPts.length];
          signedArea += (p2.x - p1.x) * (p2.y + p1.y);
        }

        // signedArea > 0 means CLOCKWISE → perpendicular CCW points OUTWARD
        // signedArea < 0 means COUNTER-CLOCKWISE → perpendicular CCW points INWARD
        const perpPointsOutward = signedArea > 0;

        // If perpendicular points inward, flip it to point outward
        centroidCorrection = perpPointsOutward ? 1 : -1;

        // Lock this value for first segment (i === 0)
        if (i === 0) {
          lockedCentroidCorrectionRef.current = centroidCorrection;
          console.log(`🔒 LOCKING centroid correction (manual drawing):`, {
            signedArea: signedArea.toFixed(2),
            winding: signedArea > 0 ? 'CW' : 'CCW',
            centroidCorrection,
            reverseColor
          });
        }
      }

      const visualLength = len * scale;
      let tickCount = Math.round(visualLength / 40);
      tickCount = Math.max(2, Math.min(9, tickCount));
      const sideParity = (flipH ? -1 : 1) * (flipV ? -1 : 1);

      // For both auto-set and manual drawings: use reverseColor to flip sides
      // LEFT (reverseColor=false) → OUTSIDE
      // RIGHT (reverseColor=true) → INSIDE
      const offsetDir = (reverseColor ? -1 : 1) * sideParity * centroidCorrection;
      const visualTickLen = 6 / scale;

      // Check if this segment has a fold on the same side as color
      // nonFoldIndex already calculated above for 180° check, reuse it here
      const totalNonFoldSegments = adjustedPts.filter(p => !p.isFold).length - 1;
      let startFoldExtentRatio = 0;
      let endFoldExtentRatio = 0;

      // Check start fold - affects the FIRST non-fold segment
      if (startFoldInfo && nonFoldIndex === 0) {
        // IMPORTANT: Apply offsetDir to get the ACTUAL color perpendicular direction
        // offsetDir accounts for reverseColor, flipH, and flipV
        const colorPerpDir = { x: perpX * offsetDir, y: perpY * offsetDir };
        const dotProduct = startFoldInfo.perpDir.x * colorPerpDir.x + startFoldInfo.perpDir.y * colorPerpDir.y;
        const sameSide = isFoldOnColorSide(startFoldInfo.perpDir, colorPerpDir);

        console.log('🔍 START FOLD check:', {
          segmentIndex: i,
          nonFoldIndex,
          foldPerpDir: startFoldInfo.perpDir,
          colorPerpDirRaw: { x: perpX, y: perpY },
          colorPerpDir: colorPerpDir,
          offsetDir,
          dotProduct,
          sameSide,
          reverseColor
        });

        if (sameSide) {
          startFoldExtentRatio = startFoldInfo.foldExtent / len;
          console.log('✅ START FOLD on SAME side - EXCLUDING ticks:', {
            foldExtent: startFoldInfo.foldExtent,
            segmentLen: len,
            ratio: startFoldExtentRatio
          });
        } else {
          console.log('❌ START FOLD on OPPOSITE side - NOT excluding ticks');
        }
      }

      // Check end fold - affects the LAST non-fold segment
      if (endFoldInfo && nonFoldIndex === totalNonFoldSegments - 1) {
        // IMPORTANT: Apply offsetDir to get the ACTUAL color perpendicular direction
        // offsetDir accounts for reverseColor, flipH, and flipV
        const colorPerpDir = { x: perpX * offsetDir, y: perpY * offsetDir };
        const dotProduct = endFoldInfo.perpDir.x * colorPerpDir.x + endFoldInfo.perpDir.y * colorPerpDir.y;
        const sameSide = isFoldOnColorSide(endFoldInfo.perpDir, colorPerpDir);

        console.log('🔍 END FOLD check:', {
          segmentIndex: i,
          nonFoldIndex,
          totalNonFoldSegments,
          foldPerpDir: endFoldInfo.perpDir,
          colorPerpDirRaw: { x: perpX, y: perpY },
          colorPerpDir: colorPerpDir,
          offsetDir,
          dotProduct,
          sameSide,
          reverseColor
        });

        if (sameSide) {
          endFoldExtentRatio = endFoldInfo.foldExtent / len;
          console.log('✅ END FOLD on SAME side - EXCLUDING ticks:', {
            foldExtent: endFoldInfo.foldExtent,
            segmentLen: len,
            ratio: endFoldExtentRatio
          });
        } else {
          console.log('❌ END FOLD on OPPOSITE side - NOT excluding ticks');
        }
      }

      for (let t = 1; t <= tickCount; t++) {
        // If we've passed a 180° angle, offset the tick positions slightly
        // This prevents ticks from overlapping when segments are in a straight line
        let ratio = t / (tickCount + 1);

        if (passed180 && has180AtStart) {
          // Shift tick positions by 0.15 (15%) after a 180° angle
          // This staggers them from the previous segment's ticks
          ratio = (t + 0.5) / (tickCount + 1);
        }

        // Skip tick if it's in the fold area when fold and color are on same side
        if (startFoldExtentRatio > 0 && ratio < startFoldExtentRatio) continue; // Start fold area
        if (endFoldExtentRatio > 0 && ratio > (1 - endFoldExtentRatio)) continue; // End fold area

        // Skip tick if it's in the covered area of a 180° fold (segment AFTER 180°)
        if (ratio180Start > 0 && ratio < ratio180Start) continue; // Before the sticking out portion

        // Skip tick if it's beyond the visible area of a 180° fold (segment BEFORE 180°)
        if (ratio > ratio180Limit) continue; // Beyond visible portion

        const x = start.x + dx * ratio;
        const y = start.y + dy * ratio;

        const tx1 = x;
        const ty1 = y;
        const tx2 = x + perpX * visualTickLen * offsetDir;
        const ty2 = y + perpY * visualTickLen * offsetDir;

        tickElements.push(
          <Line
            key={`tick-${i}-${t}`}
            points={[
              tx1 * scale + offsetX,
              ty1 * scale + offsetY,
              tx2 * scale + offsetX,
              ty2 * scale + offsetY
            ]}
            stroke="black"
            strokeWidth={2}
          />
        );
      }
    }

    // ➤ Extend handle (end) - show for templates or when continuous drawing is stopped (but not in edit mode)
    // Hide green square when end fold is SF or SSF
    const isEditMode = searchParams.get('isEdit') === 'true' || location.state?.isEdit === true;
    const shouldHideForFold = endFoldType === 'Up' || endFoldType === 'Down' || endFoldType === 'OpenUp' || endFoldType === 'OpenDn';
    // Use points state since pts parameter might not be properly passed in current structure
    const ptsToUse = pts || points || [];
    if (!hideGreenSquare && !showTaper && (!isEditMode || !continuousDrawing) && !shouldHideForFold && (!isNewDrawing || (isNewDrawing && !continuousDrawing)) && ptsToUse.length >= 2 && !isInTemplateCreateMode) {
      // Check if adjustments are being applied
      const nonFoldPts = ptsToUse.filter(p => !p.isFold);
      const nonFoldAdjusted = adjustedPts.filter(p => !p.isFold);
      const hasAdjustments = nonFoldAdjusted.length > 0 &&
        nonFoldPts.length > 0 &&
        (Math.abs(nonFoldAdjusted[nonFoldAdjusted.length - 1].x - nonFoldPts[nonFoldPts.length - 1].x) > 0.001 ||
          Math.abs(nonFoldAdjusted[nonFoldAdjusted.length - 1].y - nonFoldPts[nonFoldPts.length - 1].y) > 0.001);

      // Use adjusted points if available and different, otherwise use raw points
      const pointsToUse = hasAdjustments ? nonFoldAdjusted : nonFoldPts;

      logger.debug('🟩 Green Square Position Base:', {
        hasAdjustments,
        usingAdjusted: hasAdjustments,
        adjustedLastPoint: nonFoldAdjusted[nonFoldAdjusted.length - 1],
        originalLastPoint: nonFoldPts[nonFoldPts.length - 1],
        stateLastPoint: points[points.length - 1],
        visualShift: hasAdjustments && nonFoldAdjusted[nonFoldAdjusted.length - 1] && nonFoldPts[nonFoldPts.length - 1] ? {
          x: nonFoldAdjusted[nonFoldAdjusted.length - 1].x - nonFoldPts[nonFoldPts.length - 1].x,
          y: nonFoldAdjusted[nonFoldAdjusted.length - 1].y - nonFoldPts[nonFoldPts.length - 1].y
        } : null,
        segmentCount: lengths.length
      });

      if (pointsToUse.length >= 2) {
        const last = pointsToUse[pointsToUse.length - 1];
        const prev = pointsToUse[pointsToUse.length - 2];

        // Calculate offset for green square visibility
        const dx = last.x - prev.x;
        const dy = last.y - prev.y;
        const len = Math.hypot(dx, dy);

        // Position green square with offset for visibility
        // but we'll use the actual endpoint for angle calculations
        let markerX = last.x;
        let markerY = last.y;

        if (isFinite(len) && len > 0) {
          const unitX = dx / len;
          const unitY = dy / len;

          // Check if the last segment is 500mm or more
          // If so, we need a larger offset since it displays at fixed width
          let minOffset = 12;
          if (lengths && lengths.length > 0) {
            const lastSegmentLength = Number(lengths[lengths.length - 1]) || 0;
            if (lastSegmentLength >= 1000) {
              // For 1000mm+ segments that display at 200px width, use larger offset
              // Ensures clear separation from the fixed width display
              minOffset = 50; // Fixed 50px offset for 1000mm+ segments
            } else if (lastSegmentLength >= 500) {
              // For 500-999mm segments that display at 150px width, use medium offset
              minOffset = 35; // Fixed 35px offset for 500-999mm segments
            }
          }

          markerX = last.x + unitX * minOffset;
          markerY = last.y + unitY * minOffset;
        }

        const flippedMarker = applyFlipToPoint({ x: markerX, y: markerY }, ptsToUse);
        extraMarkers.push(
          <Rect
            key="extend-handle"
            x={flippedMarker.x * scale + offsetX - 6}
            y={flippedMarker.y * scale + offsetY - 6}
            width={12}
            height={12}
            fill="green"
            stroke="black"
            strokeWidth={0.8}
            draggable
            onDragMove={(e) => {
              // Get the center position of the dragged square and snap to grid
              const rawCenterX = e.target.x() + 6;
              const rawCenterY = e.target.y() + 6;
              const draggedCenterX = snapToGrid(rawCenterX);
              const draggedCenterY = snapToGrid(rawCenterY);

              // Update square position to snapped coordinates
              e.target.x(draggedCenterX - 6);
              e.target.y(draggedCenterY - 6);

              // Check if dragged position is within grid boundaries
              const gridPadding = GRID_PADDING;
              const minX = gridPadding;
              const maxX = dynamicStageWidth - gridPadding;
              const minY = gridPadding;
              const maxY = dynamicStageHeight - gridPadding;

              // If outside boundaries, constrain to nearest valid position
              let constrainedX = draggedCenterX;
              let constrainedY = draggedCenterY;

              if (draggedCenterX < minX) constrainedX = minX;
              if (draggedCenterX > maxX) constrainedX = maxX;
              if (draggedCenterY < minY) constrainedY = minY;
              if (draggedCenterY > maxY) constrainedY = maxY;

              // Update the dragged position if it was constrained
              if (constrainedX !== draggedCenterX || constrainedY !== draggedCenterY) {
                e.target.x(constrainedX - 6);
                e.target.y(constrainedY - 6);
              }

              // Convert to logical coordinates using the snapped positions
              // Use draggedCenterX/Y which are already snapped to grid, not constrainedX/Y
              let dragX = (draggedCenterX - offsetX) / scale;
              let dragY = (draggedCenterY - offsetY) / scale;

              // Debug: Log the state when dragging green square
              logger.debug('🔍 Green square drag debug:', {
                lengthsCount: lengths.length,
                anglesCount: angles.length,
                pointsStateCount: points.length,
                dragPosition: { x: dragX, y: dragY },
                visualLastPoint: pointsToUse[pointsToUse.length - 1],
                pointsToUseLength: pointsToUse ? pointsToUse.length : 0,
                usingAdjusted: hasAdjustments,
                greenSquareBasePoint: last,
                greenSquareVisualPosition: { x: markerX, y: markerY }
              });

              // Un-flip the coordinates to get the logical position
              // Use main points only (exclude folds) for consistent center calculation
              const mainPtsForCenter = ptsToUse.filter(pt => !pt.isFold);
              const ptsForCenter = mainPtsForCenter.length > 0 ? mainPtsForCenter : ptsToUse;
              const center = getBoundingBoxCenter(ptsForCenter);
              if (flipH) {
                dragX = reflectPoint({ x: dragX, y: 0 }, { x: center.x, y: 0 }).x;
              }
              if (flipV) {
                dragY = reflectPoint({ x: 0, y: dragY }, { x: 0, y: center.y }).y;
              }

              startTransition(() => {
                setExtensionPoint({ x: dragX, y: dragY, side: 'end' });
              });
            }}
            onDragEnd={() => {
              if (!extensionPoint || extensionPoint.side !== 'end') return;

              // CRITICAL FIX: Use the same points that positioned the green square
              // This ensures consistency between visual position and calculation
              // If we used adjusted points to show the green square, use them here too
              const trueLastPoint = pointsToUse[pointsToUse.length - 1];

              // Calculate new segment directly (same as Create New Drawing mode)
              const trueDx = extensionPoint.x - trueLastPoint.x;
              const trueDy = extensionPoint.y - trueLastPoint.y;
              const newLength = Math.round(Math.hypot(trueDx, trueDy));

              if (newLength < 10) {
                // Too short, ignore
                setExtensionPoint(null);
                return;
              }

              // Calculate absolute angle using atan2
              let absAngle = Math.atan2(trueDy, trueDx) * (180 / Math.PI);

              // Get the actual current direction from the last segment
              let currentDirection = 0;
              let shouldBeStraight = false;

              if (pointsToUse.length >= 2) {
                const lastPt = pointsToUse[pointsToUse.length - 1];
                const prevPt = pointsToUse[pointsToUse.length - 2];
                currentDirection = Math.atan2(lastPt.y - prevPt.y, lastPt.x - prevPt.x) * (180 / Math.PI);

                // Check if the new segment is nearly in line with the current direction OR perpendicular
                const angleDiff = normalizeDegrees(absAngle - currentDirection);

                // Check for straight line (continuing in same direction)
                const STRAIGHT_THRESHOLD = 8;  // Reduced for more precision
                // Check for perpendicular lines (90° or -90° from current direction)
                // More conservative threshold to allow diagonal angles
                const PERPENDICULAR_THRESHOLD = 8;  // Only snap if very close to perpendicular

                // Normal angle detection for all segments
                const perpDiff90 = Math.abs(normalizeDegrees(angleDiff - 90));
                const perpDiffNeg90 = Math.abs(normalizeDegrees(angleDiff + 90));

                // If close to straight, force it to be PERFECTLY straight
                if (Math.abs(angleDiff) <= STRAIGHT_THRESHOLD) {
                  absAngle = currentDirection; // Use exact same angle as previous segment
                  shouldBeStraight = true;
                }
                // If close to 90°, force perfect right angle
                else if (perpDiff90 <= PERPENDICULAR_THRESHOLD) {
                  absAngle = normalizeDegrees(currentDirection + 90);
                }
                // If close to -90°, force perfect left angle
                else if (perpDiffNeg90 <= PERPENDICULAR_THRESHOLD) {
                  absAngle = normalizeDegrees(currentDirection - 90);
                }
              }

              // Calculate cumulative angle EXACTLY like Create New Drawing mode
              const directionMap = {
                'Up': 90,
                'Down': -90,
                'Right': 0,
                'Left': 180,
              };

              let cumulativeAngle = firstSegmentAngle !== null ? firstSegmentAngle : (directionMap[direction] ?? 0);

              // Add all existing angles to get the current direction
              for (let i = 0; i < angles.length; i++) {
                cumulativeAngle += angles[i];
              }

              // Normalize cumulative angle to -180 to 180 range
              cumulativeAngle = normalizeDegrees(cumulativeAngle);

              // Calculate relative angle from the cumulative direction
              let relativeAngle;

              // If we determined this should be straight, FORCE it to be 0
              if (shouldBeStraight) {
                relativeAngle = 0;
              } else {
                // Normal angle calculation
                // Add tiny epsilon for consistent rounding of symmetric corners (134.4999... vs 134.5000...)
                relativeAngle = Math.round(normalizeDegrees(absAngle - cumulativeAngle) + 1e-9);

                // Snap to common angles for consistent symmetric shapes
                relativeAngle = snapToCommonAngle(relativeAngle);
              }

              logger.debug(`🎯 Segment ${lengths.length + 1} Angle Calculation (Create Drawing Logic):`, {
                segmentNumber: lengths.length + 1,
                firstSegmentAngle,
                anglesArray: angles,
                cumulativeAngle,
                absAngle: absAngle,
                rawRelativeAngle: normalizeDegrees(absAngle - cumulativeAngle),
                snappedRelativeAngle: relativeAngle,
                trueLastPoint: trueLastPoint,
                extensionPoint: extensionPoint
              });


              logger.debug('📐 Green square drag end angles:', {
                extensionPoint,
                lastPointUsed: points[points.length - 1],
                newLength,
                relativeAngle,
                absAngle,
                cumulativeAngle,
                segmentNumber: lengths.length + 1
              });

              // If this is the first segment, store its angle and update direction
              // BUT not if SSF is at START - let it use direction instead
              const hasStartSSF = startFoldType === 'OpenUp' || startFoldType === 'OpenDn';
              if (lengths.length === 0 && !hasStartSSF) {
                setFirstSegmentAngle(absAngle);
                logger.debug('Setting firstSegmentAngle to:', absAngle);

                // Update direction based on the actual drawing angle
                // Map the angle to the closest cardinal direction
                const newDirection = angleToCardinalDirection(absAngle);

                setDirection(newDirection);
                logger.debug('Updated direction to:', newDirection, 'based on angle:', absAngle);
              }

              // Save state before adding segment
              saveToHistory();

              // Set skip flag to prevent duplicate history from any auto-focus after adding segment
              skipNextHistorySaveRef.current = true;
              setTimeout(() => {
                skipNextHistorySaveRef.current = false;
              }, 200);

              setLengths(prev => [...prev, newLength]);

              // Validate angle before adding
              const validAngle = !isNaN(relativeAngle) && isFinite(relativeAngle) ? relativeAngle : 0;
              if (relativeAngle !== validAngle) {
                console.warn('Invalid angle calculated, using 0 instead:', relativeAngle);
              }
              setAngles(prev => [...prev, validAngle]);

              // Initialize display angle and length for table sync
              setDisplayAngles(prev => [...prev, validAngle]); // Use validated angle
              setDisplayLengths(prev => [...prev, newLength]); // Sync display lengths with table
              setExtensionPoint(null);

              // Force draggingPoints to null to trigger recalculation with auto-centering
              // This ensures the drawing re-centers after adding a segment
              setDraggingPoints(null);

              // CRITICAL FIX: Clear both coordOffsets and labelOffsets to force label position recalculation
              // When the drawing recenters, old label coordinates become invalid because scale/offset change
              setCoordOffsets({});
              setLabelOffsets({
                segmentLabels: {},
                angleLabels: {},
                foldLabels: {}
              });

              // Debug: Check if points will be updated correctly
              logger.debug('🔄 After adding segment, expecting points update:', {
                newLengths: [...lengths, newLength],
                newAngles: [...angles, validAngle],
                willCalculateNewPoints: true,
                currentPointsCount: points.length,
                expectedPointsCount: lengths.length + 2,  // +1 for origin, +1 for new segment
                willTriggerAutoCenter: true
              });
            }}
          />
        );
      }
    }

    // ➤ Preview line for drag - use appropriate points based on adjustments
    if (extensionPoint && pts.length >= 1) {
      // Check if adjustments are being applied
      const nonFoldPts = pts.filter(p => !p.isFold);
      const nonFoldAdjusted = adjustedPts.filter(p => !p.isFold);
      const hasAdjustments = nonFoldAdjusted.length > 0 &&
        nonFoldPts.length > 0 &&
        (Math.abs(nonFoldAdjusted[nonFoldAdjusted.length - 1].x - nonFoldPts[nonFoldPts.length - 1].x) > 0.001 ||
          Math.abs(nonFoldAdjusted[nonFoldAdjusted.length - 1].y - nonFoldPts[nonFoldPts.length - 1].y) > 0.001);

      const pointsToUse = hasAdjustments ? nonFoldAdjusted : nonFoldPts;
      const anchor = extensionPoint.side === 'start' ? pointsToUse[0] : pointsToUse[pointsToUse.length - 1];

      if (anchor) {
        const fpAnchor = applyFlipToPoint(anchor, pts);
        const fpExt = applyFlipToPoint(extensionPoint, pts);

        // Calculate where the segment will actually end (with rounding/snapping)
        const dx = extensionPoint.x - anchor.x;
        const dy = extensionPoint.y - anchor.y;
        const actualLength = Math.round(Math.hypot(dx, dy));
        let actualAngle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Apply same angle snapping as in onDragEnd
        // Get the cumulative angle for the reference
        let cumulativeAngle = 0;
        if (lengths.length > 0) {
          const currentPoints = calculatePointsLocal(lengths, angles, direction, segmentAbsoluteAngles, displayLengths, false);
          const currentNonFold = currentPoints.filter(p => !p.isFold);
          if (currentNonFold.length >= 2) {
            const last = currentNonFold[currentNonFold.length - 1];
            const prev = currentNonFold[currentNonFold.length - 2];
            cumulativeAngle = Math.atan2(last.y - prev.y, last.x - prev.x) * 180 / Math.PI;
          }
        }

        // Add tiny epsilon for consistent rounding of symmetric corners
        let relativeAngle = Math.round(actualAngle - cumulativeAngle + 1e-9);

        // Snap to common angles for consistent symmetric shapes
        const snappedAngle = snapToCommonAngle(relativeAngle);
        if (snappedAngle !== relativeAngle) {
          relativeAngle = snappedAngle;
          actualAngle = cumulativeAngle + snappedAngle;
        }

        // Calculate actual endpoint with rounded length and snapped angle
        const actualRad = actualAngle * Math.PI / 180;
        const actualEndpoint = {
          x: anchor.x + actualLength * Math.cos(actualRad),
          y: anchor.y + actualLength * Math.sin(actualRad)
        };
        const fpActualEnd = applyFlipToPoint(actualEndpoint, pts);

        // Draw preview line to drag position (green dashed)
        guideLines.push(
          <Line
            key="preview-line"
            points={[
              fpAnchor.x * scale + offsetX,
              fpAnchor.y * scale + offsetY,
              fpExt.x * scale + offsetX,
              fpExt.y * scale + offsetY
            ]}
            stroke={extensionPoint.side === 'start' ? 'purple' : 'green'}
            strokeWidth={0.8}
            dash={[5, 5]}
            opacity={0.5}
          />
        );

        // Removed the blue preview line to simplify the UI
        // Now only the green drag line is shown for cleaner visualization
      }
    }

    // ➤ Fold arcs and labels
    let startFoldLabelPos = null;
    let endFoldLabelPos = null;
    {
      // helper to draw at a given hinge
      const drawFoldAt = (i, type, len, isEndFold = false, parentSegmentLength = null) => {
        const cornerRaw = adjustedPts[i], prevRaw = adjustedPts[i - 1], nextRaw = adjustedPts[i + 1];
        if (!cornerRaw || !prevRaw || !nextRaw) return;

        // Apply flip transformations to the points for correct positioning
        const corner = applyFlipToPoint(cornerRaw, pts);
        const prev = applyFlipToPoint(prevRaw, pts);
        const next = applyFlipToPoint(nextRaw, pts);

        // No flip compensation needed - dropdown value already reflects the flipped direction
        // When user clicks flip, dropdown changes (Up<->Down), so type is already correct
        const renderType = type;

        // Get the fold definition - type and renderType are same now
        const { angles: spans, dir, label: baseLabel } = getFoldSegments(renderType, len);

        // For SSF types, append gap to label on new line if gap exists (e.g., "SSF 10\n4mm Gap")
        // Note: Gap values are stored as strings, need to convert to number for comparison
        const customGap = Number(isEndFold ? endFoldGap : startFoldGap) || 0;
        const label = (renderType === 'OpenUp' || renderType === 'OpenDn') && customGap > 0
          ? `${baseLabel}\n${customGap}mm Gap`
          : baseLabel;

        // Base angle of incoming edge (in degrees)
        const baseRad = Math.atan2(prev.y - corner.y, prev.x - corner.x);
        const baseDeg = (baseRad * 180) / Math.PI;

        // Draw fold indicators along the fold segments
        const foldSize = 6;

        // Find a good position along the fold segments for the indicator
        // Use the first fold segment (usually the longer one)
        let foldIndicatorX, foldIndicatorY;

        if (i === 2) { // START fold
          // Calculate fold points using flipped corner point
          const baseAngle = Math.atan2(next.y - corner.y, next.x - corner.x);
          const rad1 = baseAngle - (spans[1] * Math.PI) / 180;

          const foldPt1 = {
            x: corner.x - getFoldSegments(renderType, len).lengths[1] * Math.cos(rad1),
            y: corner.y - getFoldSegments(renderType, len).lengths[1] * Math.sin(rad1)
          };

          // Position indicator in middle of first fold segment
          foldIndicatorX = ((corner.x + foldPt1.x) / 2) * scale + offsetX;
          foldIndicatorY = ((corner.y + foldPt1.y) / 2) * scale + offsetY;
        } else { // END fold
          // Calculate fold points using flipped corner point
          const baseAngle = Math.atan2(corner.y - prev.y, corner.x - prev.x);
          const rad1 = baseAngle + (spans[0] * Math.PI) / 180;

          const foldPt1 = {
            x: corner.x + getFoldSegments(renderType, len).lengths[0] * Math.cos(rad1),
            y: corner.y + getFoldSegments(renderType, len).lengths[0] * Math.sin(rad1)
          };

          // Position indicator in middle of first fold segment
          foldIndicatorX = ((corner.x + foldPt1.x) / 2) * scale + offsetX;
          foldIndicatorY = ((corner.y + foldPt1.y) / 2) * scale + offsetY;
        }

        // Draw simple curved line arc exactly like reference image
        const arcProps = getFoldArcProps(prev, corner, next, scale, offsetX, offsetY);

        // Create arc INSIDE the corner angle for both up and down - exactly like reference
        const baseAngle = arcProps.rotation * Math.PI / 180;
        const numPoints = 12;

        const arcPoints = [];
        // Start from the orange corner point itself
        arcPoints.push(arcProps.x, arcProps.y);

        // Create consistent inward arcs for both start and end segments    
        let baseAngleAdjusted = baseAngle;
        let direction = 1;
        let arcSpan;

        if (isEndFold) {
          // Use same logic as start segment but adjust geometry for end segment
          if (renderType === 'Up' || renderType === 'Down') {
            // SF (Square Fold) - for end segment, use same approach as SSF
            arcSpan = Math.abs(arcProps.angle) * Math.PI / 180;

            // Different positioning for Up vs Down (like SSF does)
            // FIXED: Swapped the angle adjustments to correct the arc direction
            if (renderType === 'Up') {
              baseAngleAdjusted = baseAngle + (Math.PI * 0.5); // Actually go up (was going down before)
              direction = -1; // Reverse direction for correct upward curve
            } else { // renderType === 'Down'
              baseAngleAdjusted = baseAngle + (Math.PI * 1.5); // Actually go down (was going up before)
              direction = 1; // Normal direction for downward curve
            }
          } else {
            // SSF (Semi-Square Fold) - start from middle of orange dot like first segment
            baseAngleAdjusted = baseAngle + (Math.PI * 1.5); // Start from center + inward rotation
            arcSpan = 45 * Math.PI / 180; // Fixed 45 degree arc angle

            // Different positioning for Open Up vs Open Down
            // FIXED: Swapped the angle adjustments to correct the arc direction
            if (renderType === 'OpenUp') {
              baseAngleAdjusted = baseAngle + (Math.PI * 0.5); // Actually go up (was going down before)
              direction = -1; // Reverse direction for correct upward curve
            } else if (renderType === 'OpenDn') {
              baseAngleAdjusted = baseAngle + (Math.PI * 1.5); // Actually go down (was going up before)
              direction = 1; // Normal direction for downward curve
            }
          }
        } else {
          // For start segments
          if (renderType === 'Up' || renderType === 'Down') {
            // SF (Square Fold) - keep the original working logic
            baseAngleAdjusted = baseAngle;
            direction = arcProps.clockwise ? 1 : -1;
            arcSpan = Math.abs(arcProps.angle) * Math.PI / 180;

          } else {
            // SSF (Semi-Square Fold) - restore working inward arc logic
            const lineAngle = Math.atan2(prev.y - corner.y, prev.x - corner.x);

            // SSF (Semi-Square Fold) - keep original arc shape and position
            baseAngleAdjusted = lineAngle;
            arcSpan = 45 * Math.PI / 180; // Fixed 45 degree arc angle
            direction = arcProps.clockwise ? 1 : -1;
          }
        }

        // Create clear, well-defined arc
        if (renderType === 'OpenUp' || renderType === 'OpenDn') {
          // SSF: Draw using quadratic Bezier curve approach
          // The curve extends along the segment for 'len' distance with fixed curvature

          // Determine segment direction first (needed for proportional gap calculation)
          const segDir = isEndFold ?
            { x: prev.x - corner.x, y: prev.y - corner.y } :
            { x: next.x - corner.x, y: next.y - corner.y };
          const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
          const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

          // Control point for quadratic bezier: perpendicular offset for curvature
          // Flip perpendicular direction based on OpenUp vs OpenDn
          let perpDir;
          if (renderType === 'OpenUp') {
            // OpenUp: arc on one side (flipped from original)
            perpDir = { x: -segUnit.y, y: segUnit.x };
          } else { // OpenDn
            // OpenDn: arc on opposite side (flipped from original)
            perpDir = { x: segUnit.y, y: -segUnit.x };
          }

          // Arc extent logic - FIXED:
          // Use parentSegmentLength (actual segment length in mm) for comparisons
          // segLen is in drawing units, actualSegLen is in mm - need to scale fold values
          const foldLengthNum = Number(len);
          const actualSegLen = Number(parentSegmentLength) || segLen; // Use passed segment length, fallback to calculated
          const scaleRatio = segLen / actualSegLen; // drawing units per mm

          // Determine if this is a full arc (fold equals segment)
          const isFullArc = foldLengthNum >= actualSegLen;

          // Use zero gap for full arc (no visible color at start)
          // For proportional arc, use normal gap
          const gapFromCorner = isFullArc ? 0 : Math.min(3, segLen * 0.05);

          let arcExtent;
          if (foldLengthNum > actualSegLen) {
            // Fold EXCEEDS segment - scale fold length to drawing units
            arcExtent = foldLengthNum * scaleRatio;
          } else if (foldLengthNum >= actualSegLen) {
            // Fold EQUALS segment - end at segment end (full arc)
            arcExtent = Math.max(segLen - gapFromCorner, 0);
          } else {
            // Fold is less than segment - arc ends at proportional position
            const proportionalEnd = (foldLengthNum / actualSegLen) * segLen;
            arcExtent = Math.max(proportionalEnd - gapFromCorner, 0);
          }

          // MINIMUM FOLD ARC SIZE: Ensure small folds are visible
          // But maintain proportion when fold < small parent segment
          if (foldLengthNum > 1) {
            // Use smaller minimums for taper mode
            const minFoldPixels = isTaperMode
              ? Math.min(25 + (foldLengthNum * 1.5), 100)
              : Math.min(40 + (foldLengthNum * 2), 160);
            const minArcExtent = minFoldPixels / scale;
            const currentArcPixels = arcExtent * scale;

            // Apply minimum if fold arc is too small
            // Use proportional for large ratios (>50%) to show SF 9 vs SF 10 difference
            // Use minimum with cap for small ratios to ensure visibility
            const foldLessThanSegment = foldLengthNum < actualSegLen;
            const foldRatio = foldLengthNum / actualSegLen;

            if (currentArcPixels < minFoldPixels) {
              if (foldLessThanSegment && foldRatio > 0.5) {
                // Fold is more than half of segment - use exact proportion for visible difference
                const maxProportionalExtent = foldRatio * segLen;
                arcExtent = Math.min(minArcExtent, maxProportionalExtent, segLen - gapFromCorner);
              } else if (foldLessThanSegment) {
                // Fold is less than half - apply minimum but cap to avoid covering too much
                // Ensure at least 15% visibility for small fold ratios in taper mode
                const minVisibleExtent = isTaperMode ? 0.15 * segLen : 0.1 * segLen;
                const maxReasonableExtent = Math.max(minVisibleExtent, Math.min(0.5 * segLen, foldRatio * segLen * 3));
                arcExtent = Math.min(minArcExtent, maxReasonableExtent, segLen - gapFromCorner);
              } else {
                // Fold >= segment: apply minimum normally
                arcExtent = Math.min(minArcExtent, segLen - gapFromCorner);
              }
            }
          }

          // FIXED curve depth - constant in screen pixels, not mm
          // TAPER MODE FIX: Use smaller curve depth in taper mode
          const curveDepth = isTaperMode ? 5 / scale : 8 / scale;

          // Draw straight line offset from segment (not curved)
          // Offset perpendicular to the line so it doesn't touch the segment
          // Use constant pixel offset to maintain visual width across all drawing sizes
          // TAPER MODE FIX: Use smaller offset in taper mode
          const lineOffset = isTaperMode ? 11 / scale : 15 / scale; // Gap between line and arc (constant pixels)

          // Start point: gap from corner + perpendicular offset
          const startX = corner.x + segUnit.x * gapFromCorner + perpDir.x * lineOffset;
          const startY = corner.y + segUnit.y * gapFromCorner + perpDir.y * lineOffset;

          // End point: gap + arc extent + perpendicular offset
          const endX = corner.x + segUnit.x * (gapFromCorner + arcExtent) + perpDir.x * lineOffset;
          const endY = corner.y + segUnit.y * (gapFromCorner + arcExtent) + perpDir.y * lineOffset;

          // Draw straight line between start and end (just 2 points)
          arcPoints.push(startX * scale + offsetX, startY * scale + offsetY);
          arcPoints.push(endX * scale + offsetX, endY * scale + offsetY);
        } else {
          // SF (Square Fold): Draw using smooth curved arc
          // Arc extends along the segment with smooth curvature
          // KEY DIFFERENCE: SF touches the line segment (curves toward it)

          // Determine segment direction first (needed for proportional gap calculation)
          const segDir = isEndFold ?
            { x: prev.x - corner.x, y: prev.y - corner.y } :
            { x: next.x - corner.x, y: next.y - corner.y };
          const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
          const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

          // Perpendicular direction based on Up vs Down
          let perpDir;
          if (renderType === 'Up') {
            // Up: arc on one side
            perpDir = { x: -segUnit.y, y: segUnit.x };
          } else { // Down
            // Down: arc on opposite side
            perpDir = { x: segUnit.y, y: -segUnit.x };
          }

          // Arc extent logic - FIXED:
          // Use parentSegmentLength (actual segment length in mm) for comparisons
          // segLen is in drawing units, actualSegLen is in mm - need to scale fold values
          const foldLengthNum = Number(len);
          const actualSegLen = Number(parentSegmentLength) || segLen; // Use passed segment length, fallback to calculated
          const scaleRatio = segLen / actualSegLen; // drawing units per mm

          // Determine if this is a full arc (fold equals segment)
          const isFullArc = foldLengthNum >= actualSegLen;

          // Use zero gap for full arc (no visible color at start)
          // For proportional arc, use normal gap
          const gapFromCorner = isFullArc ? 0 : Math.min(3, segLen * 0.05);

          let arcExtent;
          if (foldLengthNum > actualSegLen) {
            // Fold EXCEEDS segment - scale fold length to drawing units
            arcExtent = foldLengthNum * scaleRatio;
          } else if (foldLengthNum >= actualSegLen) {
            // Fold EQUALS segment - end at segment end (full arc)
            arcExtent = Math.max(segLen - gapFromCorner, 0);
          } else {
            // Fold is less than segment - arc ends at proportional position
            const proportionalEnd = (foldLengthNum / actualSegLen) * segLen;
            arcExtent = Math.max(proportionalEnd - gapFromCorner, 0);
          }

          // MINIMUM FOLD ARC SIZE: Ensure small folds are visible
          // But maintain proportion when fold < small parent segment
          if (foldLengthNum > 1) {
            // Use smaller minimums for taper mode
            const minFoldPixels = isTaperMode
              ? Math.min(25 + (foldLengthNum * 1.5), 100)
              : Math.min(40 + (foldLengthNum * 2), 160);
            const minArcExtent = minFoldPixels / scale;
            const currentArcPixels = arcExtent * scale;

            // Apply minimum if fold arc is too small
            // Use proportional for large ratios (>50%) to show SF 9 vs SF 10 difference
            // Use minimum with cap for small ratios to ensure visibility
            const foldLessThanSegment = foldLengthNum < actualSegLen;
            const foldRatio = foldLengthNum / actualSegLen;

            if (currentArcPixels < minFoldPixels) {
              if (foldLessThanSegment && foldRatio > 0.5) {
                // Fold is more than half of segment - use exact proportion for visible difference
                const maxProportionalExtent = foldRatio * segLen;
                arcExtent = Math.min(minArcExtent, maxProportionalExtent, segLen - gapFromCorner);
              } else if (foldLessThanSegment) {
                // Fold is less than half - apply minimum but cap to avoid covering too much
                // Ensure at least 15% visibility for small fold ratios in taper mode
                const minVisibleExtent = isTaperMode ? 0.15 * segLen : 0.1 * segLen;
                const maxReasonableExtent = Math.max(minVisibleExtent, Math.min(0.5 * segLen, foldRatio * segLen * 3));
                arcExtent = Math.min(minArcExtent, maxReasonableExtent, segLen - gapFromCorner);
              } else {
                // Fold >= segment: apply minimum normally
                arcExtent = Math.min(minArcExtent, segLen - gapFromCorner);
              }
            }
          }

          // Draw straight line with gap, then curve at the end to touch the segment
          // Use constant pixel values to maintain visual width across all drawing sizes
          // TAPER MODE FIX: Use smaller values in taper mode
          const lineOffset = isTaperMode ? 6 / scale : 8 / scale; // Constant pixel gap for most of the line
          const curveLength = isTaperMode ? 6 / scale : 8 / scale; // Length of the curve at the end (constant pixels)
          const numCurvePoints = 10; // Points for the curve portion

          // Check if fold length exceeds parent segment (e.g., SF 11 on 10mm segment)
          // Use actual segment length for this comparison
          const foldExceedsSegment = foldLengthNum > actualSegLen;

          // Start point
          const startX = corner.x + segUnit.x * gapFromCorner + perpDir.x * lineOffset;
          const startY = corner.y + segUnit.y * gapFromCorner + perpDir.y * lineOffset;
          arcPoints.push(startX * scale + offsetX, startY * scale + offsetY);

          // For small segments where curveLength > arcExtent, skip the curve and draw straight
          const skipCurve = curveLength >= arcExtent;

          if (foldExceedsSegment || skipCurve) {
            // Fold exceeds parent segment OR arc too small for curve - draw straight line
            const endX = corner.x + segUnit.x * (gapFromCorner + arcExtent) + perpDir.x * lineOffset;
            const endY = corner.y + segUnit.y * (gapFromCorner + arcExtent) + perpDir.y * lineOffset;
            arcPoints.push(endX * scale + offsetX, endY * scale + offsetY);
          } else {
            // Normal case - fold fits within segment, draw straight portion then curve to touch line
            const straightExtent = arcExtent - curveLength;

            // End of straight portion (where curve begins)
            const curveStartX = corner.x + segUnit.x * (gapFromCorner + straightExtent) + perpDir.x * lineOffset;
            const curveStartY = corner.y + segUnit.y * (gapFromCorner + straightExtent) + perpDir.y * lineOffset;
            arcPoints.push(curveStartX * scale + offsetX, curveStartY * scale + offsetY);

            // Curved portion: transition from lineOffset to 0 (touching the segment)
            for (let i = 1; i <= numCurvePoints; i++) {
              const t = i / numCurvePoints; // 0 to 1 along the curve
              const alongSegment = gapFromCorner + straightExtent + curveLength * t;

              // Interpolate offset from lineOffset to 0
              const currentOffset = lineOffset * (1 - t);

              const px = corner.x + segUnit.x * alongSegment + perpDir.x * currentOffset;
              const py = corner.y + segUnit.y * alongSegment + perpDir.y * currentOffset;

              arcPoints.push(px * scale + offsetX, py * scale + offsetY);
            }
          }
        }

        // Draw different arc styles for SF vs SSF
        // Use same stroke width as main line segments for consistency
        const arcStrokeWidth = 4;

        if (renderType === 'Up' || renderType === 'Down') {
          // Square Fold (SF) - solid straight line (DARK BLUE)
          extraMarkers.push(
            <Line
              key={`fold-arc-${renderType}-${i}`}
              points={arcPoints}
              stroke="#1E3A8A"
              strokeWidth={arcStrokeWidth}
              lineCap="round"
              lineJoin="round"
            />
          );
        } else if (renderType === 'OpenUp' || renderType === 'OpenDn') {
          // Semi-Square Fold (SSF) - solid line with rounded caps
          extraMarkers.push(
            <Line
              key={`fold-arc-${renderType}-${i}`}
              points={arcPoints}
              stroke="brown"
              strokeWidth={arcStrokeWidth}
              lineCap="round"
              lineJoin="round"
            />
          );
        }

        // single label placed just outside the last arc:
        // Use flipped points (same as arc rendering) for correct label positioning
        // Pass flip flags to adjust label offset direction when flipped
        const { x: lx, y: ly } =
          getFoldLabelPosition(prev, corner, next, scale, offsetX, offsetY, flipH, flipV, type, len, isEndFold);

        // Capture fold label position for smart overlap detection with length labels
        if (isEndFold) {
          endFoldLabelPos = { x: lx, y: ly };
        } else {
          startFoldLabelPos = { x: lx, y: ly };
        }

        // Determine fold key for drag handling (start vs end fold)
        // For taper mode, include profile in the key
        const foldPosition = isEndFold ? 'end' : 'start';
        let foldKey;
        let coordFoldKey;
        if (taperProfile === 'far') {
          foldKey = `fold-far-${foldPosition}`;
          coordFoldKey = foldKey;
        } else if (taperProfile === 'near') {
          foldKey = `fold-near-${foldPosition}`;
          coordFoldKey = foldKey;
        } else {
          foldKey = isEndFold ? 'fold-end' : 'fold-start';
          coordFoldKey = foldKey;
        }

        // Apply validation to initial position to ensure it's outside arc
        const validatedInitialPos = validateFoldLabelPosition(lx, ly, foldKey);

        // Check for saved offsets from database, then temporary drag offsets, then calculated position
        // For taper mode, use profile-specific offsets (far/near independent)
        let savedFoldOffset;
        if (taperProfile === 'far') {
          savedFoldOffset = labelOffsets?.farFoldLabels?.[foldPosition];
        } else if (taperProfile === 'near') {
          savedFoldOffset = labelOffsets?.nearFoldLabels?.[foldPosition];
        } else {
          savedFoldOffset = labelOffsets?.foldLabels?.[foldPosition];
        }

        // Apply saved offset as RELATIVE to the calculated position
        // This allows manual adjustments to move with the geometry when angles change
        let drag;
        if (coordOffsets[coordFoldKey]) {
          // Use temporary drag position during active dragging
          drag = coordOffsets[coordFoldKey];
        } else if (savedFoldOffset) {
          // Apply relative offset to current calculated position
          drag = {
            x: validatedInitialPos.x + savedFoldOffset.x,
            y: validatedInitialPos.y + savedFoldOffset.y
          };
          console.log(`🏷️ Applying RELATIVE offset for ${foldPosition} (${taperProfile || 'default'}):`, savedFoldOffset, 'to calculated:', validatedInitialPos, '= final:', drag);
        } else {
          // No saved offset, use calculated position
          drag = validatedInitialPos;
        }

        // Calculate text dimensions for proper centering (especially for multi-line SSF labels with gap)
        const labelFontSize = showTaper ? 16 : 22;
        const isMultiLine = label.includes('\n');
        const lineCount = isMultiLine ? label.split('\n').length : 1;
        // Estimate text height based on font size and line count (with line spacing)
        const estimatedHeight = labelFontSize * lineCount * 1.2;
        // Estimate text width (approximate character width * max line length)
        const maxLineLength = Math.max(...label.split('\n').map(line => line.length));
        const estimatedWidth = maxLineLength * labelFontSize * 0.6;

        extraMarkers.push(
          <Text
            key={`fold-label-${type}-${i}${taperProfile ? `-${taperProfile}` : ''}`}
            x={drag.x}
            y={drag.y}
            text={label}
            fontSize={labelFontSize}
            fill={type === 'Up' || type === 'Down' ? "#1E3A8A" : "brown"}
            fontStyle="bold"
            align="center"
            offsetX={estimatedWidth / 2}
            offsetY={estimatedHeight / 2}
            draggable
            onDragMove={(e) => handleCoordDrag(e, coordFoldKey, validatedInitialPos, taperProfile, false)}
            onDragEnd={(e) => handleCoordDrag(e, coordFoldKey, validatedInitialPos, taperProfile, true)}
          />
        );
      };

      // START hinge at pts[2] - parent segment is labelLens[0]
      // IMPORTANT: Use labelLens (parameter) not lengths (closure) for taper mode to work correctly
      if (startFoldType && startFoldLength > 0) {
        drawFoldAt(2, startFoldType, startFoldLength, false, labelLens[0]);
      }
      // END hinge at adjustedPts.length-3 - parent segment is labelLens[labelLens.length - 1]
      // IMPORTANT: Use labelLens (parameter) not lengths (closure) for taper mode to work correctly
      if (endFoldType && endFoldLength > 0) {
        drawFoldAt(adjustedPts.length - 3, endFoldType, endFoldLength, true, labelLens[labelLens.length - 1]);
      }
    }

    // ➤ Reset global label positions for collision avoidance
    resetGlobalLabelPositions();

    // ➤ Length labels
    console.log('🏷️🏷️🏷️ RENDERING LENGTH LABELS - coordOffsets state:', coordOffsets);
    console.log('🏷️🏷️🏷️ RENDERING LENGTH LABELS - FULL labelOffsets:', labelOffsets);
    console.log('🏷️🏷️🏷️ RENDERING LENGTH LABELS - labelOffsets.segmentLabels:', labelOffsets?.segmentLabels);
    console.log('🏷️🏷️🏷️ RENDERING LENGTH LABELS - labelOffsets.angleLabels:', labelOffsets?.angleLabels);

    let labelIdx = 0;
    const lengthLabels = [];
    for (let i = 0; i < labelPoints.length - 1; i++) {
      const start = labelPoints[i];
      const end = labelPoints[i + 1];
      if (start.isFold || end.isFold) continue;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy);
      const fpStart = applyFlipToPoint(start, pts);
      const fpEnd = applyFlipToPoint(end, pts);
      if (!isFinite(len) || len === 0) continue;

      // Create flipped points array for collision detection
      // IMPORTANT: Use ORIGINAL points (pts) for centroid calculation, not adjusted points
      // This ensures labels are placed on the correct side even when segments are stretched
      const flippedPts = pts.filter(p => !p.isFold).map(p => applyFlipToPoint(p, pts));
      // Only use extra offset when segments are actually adjusted (stretched for visibility)
      const needsExtraOffset = hasAdjustments;

      // Check if this segment is adjacent to a 180° angle
      let has180AtStart = false;
      let has180AtEnd = false;
      if (labelAngs) {
        // Check angle at start point (i)
        if (i > 0 && labelAngs[i]) {
          const angleAtStart = labelAngs[i];
          if (Math.abs(Math.abs(angleAtStart) - 180) < 0.1) {
            has180AtStart = true;
          }
        }
        // Check angle at end point (i+1)
        if (i < labelPoints.length - 2 && labelAngs[i + 1]) {
          const angleAtEnd = labelAngs[i + 1];
          if (Math.abs(Math.abs(angleAtEnd) - 180) < 0.1) {
            has180AtEnd = true;
          }
        }
      }
      // Determine if a fold label might overlap this segment's length label
      const totalMainSegs = flippedPts.length - 1;
      const foldLabelPixelPos = (labelIdx === 0 && startFoldLabelPos) ? startFoldLabelPos
        : (labelIdx === totalMainSegs - 1 && endFoldLabelPos) ? endFoldLabelPos
        : null;
      let { x, y } = getSegmentLabelPosition(fpStart, fpEnd, scale, offsetX, offsetY, reverseColor, flipH, flipV, flippedPts, labelIdx, needsExtraOffset, isTaperMode, foldLabelPixelPos);

      // Adjust label position if adjacent to 180° angle to avoid overlap
      if (has180AtStart || has180AtEnd) {
        // Move the label further away from the line to avoid overlapping with angle label
        const midX = (fpStart.x + fpEnd.x) / 2;
        const midY = (fpStart.y + fpEnd.y) / 2;
        const dx = fpEnd.x - fpStart.x;
        const dy = fpEnd.y - fpStart.y;
        const lineLen = Math.hypot(dx, dy);

        if (lineLen > 0) {
          // Calculate perpendicular direction
          const perp = getPerpendicularVector(dx, dy, lineLen);
          let perpX = perp.x;
          let perpY = perp.y;

          // Calculate centroid correction for 180° labels if available
          let centroidCorrection180 = 1; // Default: no correction (backward compatibility)

          if (useCentroidCorrection) {
            // Use centroid-based correction for consistent direction
            const toCentroidX = centroidX - midX;
            const toCentroidY = centroidY - midY;
            const dotProduct180 = perpX * toCentroidX + perpY * toCentroidY;

            // Only apply correction if dotProduct is valid
            if (isFinite(dotProduct180)) {
              centroidCorrection180 = dotProduct180 > 0 ? -1 : 1;
            }
          }

          // Scale-aware offset for 180° angles
          const pixelOffset = 35; // Pixel distance for 180° segments
          const scaledOffset = pixelOffset / scale; // Convert to drawing units
          const sideParity180 = (flipH ? -1 : 1) * (flipV ? -1 : 1);
          // Apply centroid correction for consistent perpendicular direction
          // Falls back to old behavior if centroid unavailable
          const totalOffset = (reverseColor ? -1 : 1) * sideParity180 * centroidCorrection180 * scaledOffset;

          x = midX * scale + offsetX + perpX * totalOffset * scale;
          y = midY * scale + offsetY + perpY * totalOffset * scale;
        }
      }

      // Check for saved offsets from database, then temporary drag offsets, then calculated position
      // savedOffset is a RELATIVE offset that should be added to calculated position
      // For taper mode, use profile-specific offsets (far/near independent)
      let savedOffset;
      let coordKey;
      if (taperProfile === 'far') {
        savedOffset = labelOffsets?.farSegmentLabels?.[labelIdx];
        coordKey = `len-far-${labelIdx}`;
      } else if (taperProfile === 'near') {
        savedOffset = labelOffsets?.nearSegmentLabels?.[labelIdx];
        coordKey = `len-near-${labelIdx}`;
      } else {
        savedOffset = labelOffsets?.segmentLabels?.[labelIdx];
        coordKey = `len-${labelIdx}`;
      }
      let drag = coordOffsets[coordKey] || (savedOffset ? { x: x + savedOffset.x, y: y + savedOffset.y } : { x, y });

      // If a fold label exists on this segment, check if the drag/saved position
      // still overlaps with it. If so, snap back to the computed (flipped) position.
      if (foldLabelPixelPos && (coordOffsets[coordKey] || savedOffset)) {
        const segPixelLen = len * scale;
        if (segPixelLen < 150) {
          const startPx = fpStart.x * scale + offsetX;
          const startPy = fpStart.y * scale + offsetY;
          const segDxPx = (fpEnd.x - fpStart.x) * scale;
          const segDyPx = (fpEnd.y - fpStart.y) * scale;
          const dragSide = segDxPx * (drag.y - startPy) - segDyPx * (drag.x - startPx);
          const foldSide = segDxPx * (foldLabelPixelPos.y - startPy) - segDyPx * (foldLabelPixelPos.x - startPx);
          const sameSide = (dragSide > 0 && foldSide > 0) || (dragSide < 0 && foldSide < 0);
          if (sameSide) {
            drag = { x, y }; // Use the computed (already flipped) position
          }
        }
      }

      // Store calculated position for use in drag handler
      const calculatedPos = { x, y };

      // Debug ALL length labels to see which ones have saved positions
      if (savedOffset || coordOffsets[coordKey]) {
        console.log(`🏷️ Rendering segment label ${labelIdx} (${taperProfile || 'default'}):`, {
          savedOffset,
          coordOffset: coordOffsets[coordKey],
          coordKey,
          finalDrag: drag,
          calculated: { x, y },
          usingCalculated: !savedOffset && !coordOffsets[coordKey]
        });
      }

      // Display "1" for length 0 in the drawing (but keep 0 in the table)
      const rawLength = labelLens[labelIdx];
      const displayLength = rawLength === 0 ? 1 : (rawLength || '');

      // Debug potential issue with first segment after library load
      if (labelIdx === 0 && rawLength > 1000) {
        console.warn('⚠️ Suspicious length value detected:', rawLength, 'labelIdx:', labelIdx, 'labelLens:', labelLens);
      }

      // CRITICAL FIX: Check if user cleared the input - if so, don't show label
      // labelLens[labelIdx] will be '' when user clears the input (works for both normal and taper mode)
      const isInputCleared = labelLens[labelIdx] === '' || labelLens[labelIdx] === null || labelLens[labelIdx] === undefined;

      // Only render label if input is not cleared
      if (!isInputCleared) {
        // Ensure we're working with a number, not a string or concatenated value
        // Limit to max 4 digits
        const lengthText = String(Math.round(Number(displayLength))).slice(0, 4);
        console.log(`Label ${labelIdx}: rawLength=${rawLength}, displayLength=${displayLength}, lengthText="${lengthText}", type=${typeof lengthText}`);
        // Calculate width based on text length - use generous space for large numbers
        const lengthTextWidth = lengthText.length * 18; // 18 pixels per character
        const lengthTextHeight = 36;

        // Calculate segment midpoint for reference line (always from center)
        const segmentMidpointX = (fpStart.x + fpEnd.x) / 2 * scale + offsetX;
        const segmentMidpointY = (fpStart.y + fpEnd.y) / 2 * scale + offsetY;

        // Calculate direction from midpoint to label
        const lineDx = drag.x - segmentMidpointX;
        const lineDy = drag.y - segmentMidpointY;
        const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

        // Use directional offset - larger for horizontal approach (label is wider than tall)
        const isHorizontalApproach = Math.abs(lineDx) > Math.abs(lineDy);
        const labelEdgeOffset = isHorizontalApproach ? 22 : 15;
        let lineEndX = drag.x;
        let lineEndY = drag.y;
        if (lineLen > labelEdgeOffset) {
          const shortenRatio = (lineLen - labelEdgeOffset) / lineLen;
          lineEndX = segmentMidpointX + lineDx * shortenRatio;
          lineEndY = segmentMidpointY + lineDy * shortenRatio;
        }

        // Add thin reference line from segment midpoint to label edge
        if (lineLen > 5) {
          lengthLabels.push(
            <Arrow
              key={`ref-line-${coordKey}`}
              points={[segmentMidpointX, segmentMidpointY, lineEndX, lineEndY]}
              stroke="#0033CC"
              strokeWidth={1}
              listening={false}
              pointerWidth={8}
              pointerAtBeginning={true}
              pointerAtEnding={false}
            />
          );
        }

        // Check if this label is being edited in the grid
        const isEditingThisLength = editingIndex.type === 'length' &&
          editingIndex.index === labelIdx &&
          (taperProfile === null ? editingIndex.profile === null : editingIndex.profile === taperProfile);

        lengthLabels.push(
          <Group
            key={coordKey}
            x={drag.x}
            y={drag.y}
            draggable
            onDragMove={(e) => handleCoordDrag(e, coordKey, calculatedPos, taperProfile)}
            onDragEnd={(e) => handleCoordDrag(e, coordKey, calculatedPos, taperProfile)}
          >
            <Text
              x={0}
              y={0}
              text={lengthText}
              fontSize={showTaper ? 18 : 22}
              fontStyle="bold"
              fontFamily="Verdana, Geneva, sans-serif"
              fontWeight="bold"
              fill={isEditingThisLength ? "#FF6600" : "#0033CC"}
              align="center"
              verticalAlign="middle"
              width={lengthTextWidth}
              height={lengthTextHeight}
              wrap="none"
              ellipsis={false}
              offsetX={lengthTextWidth / 2}
              offsetY={lengthTextHeight / 2}
              shadowColor={isEditingThisLength ? "#FF6600" : undefined}
              shadowBlur={isEditingThisLength ? 15 : 0}
              shadowOpacity={isEditingThisLength ? 1 : 0}
            />
          </Group>
        );
      }
      labelIdx++;
    }

    // CAD-like constraint behavior for dragging points
    const getLockedDragPosition = (pts, i, newX, newY, lengths, lockLegends, mainPtIndex = null) => {
      // Apply segment locking behavior for both Lock Legends ON and OFF
      // Lock Legends ON: preserve lengths, only angles change
      // Lock Legends OFF: allow length changes, but keep other segments fixed

      // For Lock Legends OFF, we still want constraint behavior to prevent entire drawing from moving

      // CRITICAL: When fold points are present, use mainPtIndex for length array indexing
      // The 'i' parameter is actualIndex in the full pts array (includes fold points)
      // The 'mainPtIndex' parameter is the index in the non-fold points array
      // The 'lengths' array corresponds to main segments (no fold points)
      const usedIndex = mainPtIndex !== null ? mainPtIndex : i;

      // Edge case: single point
      if (pts.length === 1) {
        return { x: newX, y: newY };
      }

      // Filter out fold points to get main points for proper neighbor detection
      const mainPts = pts.filter(pt => !pt.isFold);

      // First point: maintain distance from second point (when Lock Legends ON) or move freely (when OFF)
      if (usedIndex === 0 && mainPts.length > 1) {
        // Find the next main point (not fold point)
        let nextMainPt = mainPts[1];

        // If Lock Legends is OFF, only move this point, keep next point fixed
        if (!lockLegends) {
          return { x: newX, y: newY };
        }

        // Lock Legends ON: maintain distance
        const lockedLen = lengths[0] ?? 0;

        if (lockedLen > 0) {
          const dx = newX - nextMainPt.x;
          const dy = newY - nextMainPt.y;
          const vecLen = Math.hypot(dx, dy);

          if (vecLen > 0.01) {
            return {
              x: nextMainPt.x + (dx * lockedLen) / vecLen,
              y: nextMainPt.y + (dy * lockedLen) / vecLen
            };
          }
        }
        return { x: mainPts[0].x, y: mainPts[0].y };
      }

      // Last point: maintain distance from previous point (when Lock Legends ON) or move freely (when OFF)
      if (usedIndex === mainPts.length - 1 && mainPts.length > 1) {
        // Find the previous main point (not fold point)
        let prevMainPt = mainPts[usedIndex - 1];

        // If Lock Legends is OFF, only move this point, keep prev point fixed
        if (!lockLegends) {
          return { x: newX, y: newY };
        }

        // Lock Legends ON: maintain distance
        const lockedLen = lengths[usedIndex - 1] ?? 0;

        if (lockedLen > 0) {
          const dx = newX - prevMainPt.x;
          const dy = newY - prevMainPt.y;
          const vecLen = Math.hypot(dx, dy);

          if (vecLen > 0.01) {
            return {
              x: prevMainPt.x + (dx * lockedLen) / vecLen,
              y: prevMainPt.y + (dy * lockedLen) / vecLen
            };
          }
        }
        return { x: mainPts[usedIndex].x, y: mainPts[usedIndex].y };
      }

      // Middle points: maintain distance from previous point (when Lock Legends ON) or move freely (when OFF)
      if (usedIndex > 0 && usedIndex < mainPts.length - 1) {
        // Find the previous main point (not fold point)
        let prevMainPt = mainPts[usedIndex - 1];

        // If Lock Legends is OFF, only move this point, keep adjacent points fixed
        if (!lockLegends) {
          return { x: newX, y: newY };
        }

        // Lock Legends ON: maintain distance from previous point
        const lockedLen = lengths[usedIndex - 1] ?? 0;

        if (lockedLen > 0) {
          const dx = newX - prevMainPt.x;
          const dy = newY - prevMainPt.y;
          const vecLen = Math.hypot(dx, dy);

          if (vecLen > 0.01) {
            return {
              x: prevMainPt.x + (dx * lockedLen) / vecLen,
              y: prevMainPt.y + (dy * lockedLen) / vecLen
            };
          }
        }
      }

      // Default: keep current position
      return { x: newX, y: newY };
    };

    // Check for 180° angles in middle segments for visual separation
    const segments180 = [];
    const nonFoldPtsForShape = adjustedPts.filter(p => !p.isFold);

    // Build segments with visual separation at 180° angles
    const lineSegments = [];

    // Identify points that have 180° angles
    // labelAngs[i] is the angle AFTER segment i (between segment i and segment i+1)
    const points180 = new Set();

    // labelAngs array corresponds to angles BETWEEN segments
    // labelAngs[0] = angle after first segment (between seg 0-1 and seg 1-2)
    // labelAngs[1] = angle after second segment (between seg 1-2 and seg 2-3)
    // labelAngs[2] = angle after third segment (between seg 2-3 and seg 3-4)
    for (let i = 0; i < labelAngs.length; i++) {
      if (labelAngs[i]) {
        const angle = labelAngs[i];
        if (Math.abs(Math.abs(angle) - 180) < 0.1) {
          // The 180° angle is between segment i and segment i+1
          // So we mark the point where these segments meet
          points180.add(i + 1); // The point where the angle occurs
        }
      }
    }

    // Build line segments between consecutive points
    for (let i = 0; i < nonFoldPtsForShape.length - 1; i++) {
      const p1 = applyFlipToPoint(nonFoldPtsForShape[i], pts);
      const p2 = applyFlipToPoint(nonFoldPtsForShape[i + 1], pts);

      // For a 180° angle at point j, the two segments that form the angle should be thick:
      // - Segment ending at point j (segment from j-1 to j)
      // - Segment starting from point j (segment from j to j+1)
      let isThick = false;

      // Check if the 180° angle is between segment i-1 and segment i
      // This happens when labelAngs[i-1] is 180°
      if (i > 0 && labelAngs && labelAngs[i - 1] && Math.abs(Math.abs(labelAngs[i - 1]) - 180) < 0.1) {
        // The 180° angle is right before this segment
        isThick = true;
      }
      // Check if the 180° angle is between segment i and segment i+1
      // This happens when labelAngs[i] is 180°
      else if (labelAngs && labelAngs[i] && Math.abs(Math.abs(labelAngs[i]) - 180) < 0.1) {
        // The 180° angle is right after this segment
        isThick = true;
      }

      lineSegments.push(
        <Line
          key={`segment-${i}`}
          points={[
            p1.x * scale + offsetX,
            p1.y * scale + offsetY,
            p2.x * scale + offsetX,
            p2.y * scale + offsetY
          ]}
          stroke="black"
          strokeWidth={isThick ? 5 : 4}
        />
      );
    }

    // ========== COLOR GRADIENT RENDERING ==========
    // Draw gradient lines with 3 colors (red, orange, blue) on the color side
    // Only render gradients when NOT in template creation mode (i.e., after material/color is selected)
    const gradientElements = [];

    if (!isInTemplateCreateMode) {
      const gradientLayers = 12;
      const maxOffset = 12; // 12px wide gradients for better visibility

      // Define 3 colors
      const colors = [
        { r: 255, g: 0, b: 0 },     // Red
        { r: 255, g: 165, b: 0 },   // Orange
        { r: 0, g: 128, b: 255 }    // Blue
      ];

      // Note: has180Angle is already calculated earlier in this function (line ~3785)

      // Render gradient layers
      for (let layer = 0; layer < gradientLayers; layer++) {
        const offset = (layer + 1) * (maxOffset / gradientLayers);
        const opacity = 0.6 * (1 - layer / gradientLayers);

        // Draw each segment with offset - divided into 3 color sections
        for (let i = 0; i < nonFoldPtsForShape.length - 1; i++) {
          const p = nonFoldPtsForShape[i];
          const next = nonFoldPtsForShape[i + 1];

          // Check if PREVIOUS angle was 180° (segment comes AFTER a 180° angle)
          const hasPrevious180 = !reverseColor && i > 0 && i - 1 < has180Angle.length && has180Angle[i - 1];

          // For segment AFTER 180°, calculate where colors should START (the part that sticks out)
          let ratio180Start = 0; // By default, start from beginning

          if (hasPrevious180) {
            const prevSegmentLength = labelLens[i - 1];
            const currentSegmentLength = labelLens[i];

            if (currentSegmentLength <= prevSegmentLength) {
              // This segment is fully covered by the previous segment when folded, skip it
              continue;
            }
            // This segment is LONGER than previous, show the part that sticks out
            // Colors should be from (prevLength/currentLength) to end
            ratio180Start = prevSegmentLength / currentSegmentLength;
          }

          // Check if NEXT angle is 180° (segment comes BEFORE a 180° angle)
          const hasNext180 = !reverseColor && i < has180Angle.length && has180Angle[i];

          // Calculate the ratio limit for 180° folds (where colors should END)
          let ratio180Limit = 1.0; // By default, show all gradients
          if (hasNext180 && i + 1 < labelLens.length) {
            const currentSegmentLength = labelLens[i];
            const nextSegmentLength = labelLens[i + 1];
            if (currentSegmentLength > nextSegmentLength) {
              // Current is longer, show from start to (current - next) / current
              const visibleLength = currentSegmentLength - nextSegmentLength;
              ratio180Limit = visibleLength / currentSegmentLength;
            } else {
              // Current is shorter or equal, fully covered - show nothing
              ratio180Limit = 0;
            }
          }

          // Calculate perpendicular direction
          // CRITICAL: Must use FLIPPED coordinates (same as tick marks at line 4202-4203)
          // because fold perpendicular is also calculated in flipped space (calculateFoldInfo line 4020)
          const start = applyFlipToPoint(p, pts);
          const end = applyFlipToPoint(next, pts);
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const len = Math.hypot(dx, dy);

          if (!isFinite(len) || len === 0) continue;

          // Perpendicular vector (same as tick marks at line 4209-4211)
          const perp = getPerpendicularVector(dx, dy, len);
          let perpX = perp.x;
          let perpY = perp.y;

          // Calculate winding order correction (same as tick marks at line 4213-4255)
          let centroidCorrection = 1;

          // For auto-set drawings, LOCK centroidCorrection = 1 immediately on first segment
          const isAutoSetDrawing = hasAutoSetColorSideRef.current;

          // Check if we already have a locked value
          if (lockedCentroidCorrectionRef.current !== null) {
            // Always use locked value once set
            centroidCorrection = lockedCentroidCorrectionRef.current;
          } else if (isAutoSetDrawing && i === 0) {
            // Auto-set drawings: lock to 1 immediately (reverseColor controls direction)
            lockedCentroidCorrectionRef.current = 1;
            centroidCorrection = 1;
          } else if (useCentroidCorrection && !isAutoSetDrawing) {
            // MANUAL drawings only: calculate from winding order
            const nonFoldPts = adjustedPts.filter(p => !p.isFold);
            let signedArea = 0;
            for (let j = 0; j < nonFoldPts.length; j++) {
              const p1 = nonFoldPts[j];
              const p2 = nonFoldPts[(j + 1) % nonFoldPts.length];
              signedArea += (p2.x - p1.x) * (p2.y + p1.y);
            }
            const perpPointsOutward = signedArea > 0;
            centroidCorrection = perpPointsOutward ? 1 : -1;

            // Lock this value for first segment (i === 0)
            if (i === 0) {
              lockedCentroidCorrectionRef.current = centroidCorrection;
            }
          }

          // Apply offset direction (same as tick marks at line 4260-4265)
          const sideParity = (flipH ? -1 : 1) * (flipV ? -1 : 1);
          const offsetDir = (reverseColor ? -1 : 1) * sideParity * centroidCorrection;

          // Check if this segment has a fold on the same side as color
          let startFoldExtentRatio = 0;
          let endFoldExtentRatio = 0;
          const totalNonFoldSegments = nonFoldPtsForShape.length - 1;

          // CRITICAL: Create colorPerpDir same as tick marks (line 4278)
          // Do NOT modify perpX/perpY in place - keep them for rendering
          if (startFoldInfo && i === 0) {
            const colorPerpDir = { x: perpX * offsetDir, y: perpY * offsetDir };
            const dotProduct = startFoldInfo.perpDir.x * colorPerpDir.x + startFoldInfo.perpDir.y * colorPerpDir.y;
            if (dotProduct > 0) { // Same side
              startFoldExtentRatio = startFoldInfo.foldExtent / len;
            }
          }

          if (endFoldInfo && i === totalNonFoldSegments - 1) {
            const colorPerpDir = { x: perpX * offsetDir, y: perpY * offsetDir };
            const dotProduct = endFoldInfo.perpDir.x * colorPerpDir.x + endFoldInfo.perpDir.y * colorPerpDir.y;
            if (dotProduct > 0) { // Same side
              endFoldExtentRatio = endFoldInfo.foldExtent / len;
            }
          }

          // Divide the segment into 3 equal color sections
          for (let colorSection = 0; colorSection < 3; colorSection++) {
            const color = colors[colorSection];

            // Calculate start and end points for this color section (1/3 of segment)
            let sectionStart = colorSection / 3;
            let sectionEnd = (colorSection + 1) / 3;

            // Adjust section if fold is on same side as color (start fold)
            if (startFoldExtentRatio > 0) {
              if (sectionEnd <= startFoldExtentRatio) continue; // Entire section is in fold area
              if (sectionStart < startFoldExtentRatio) sectionStart = startFoldExtentRatio;
            }

            // Adjust section if fold is on same side as color (end fold)
            if (endFoldExtentRatio > 0) {
              const endFoldStart = 1 - endFoldExtentRatio;
              if (sectionStart >= endFoldStart) continue; // Entire section is in fold area
              if (sectionEnd > endFoldStart) sectionEnd = endFoldStart;
            }

            // Adjust section for 180° fold START (segment AFTER 180° - show END portion)
            if (ratio180Start > 0) {
              if (sectionEnd <= ratio180Start) continue; // Entire section is covered by folded segment
              if (sectionStart < ratio180Start) sectionStart = ratio180Start;
            }

            // Adjust section for 180° fold LIMIT (segment BEFORE 180° - show START portion)
            if (sectionStart >= ratio180Limit) continue;
            if (sectionEnd > ratio180Limit) sectionEnd = ratio180Limit;

            // Apply flip transformation to points
            const pFlipped = applyFlipToPoint(p, pts);
            const nextFlipped = applyFlipToPoint(next, pts);

            // Calculate section start and end positions
            const startX = pFlipped.x + (nextFlipped.x - pFlipped.x) * sectionStart;
            const startY = pFlipped.y + (nextFlipped.y - pFlipped.y) * sectionStart;
            const endX = pFlipped.x + (nextFlipped.x - pFlipped.x) * sectionEnd;
            const endY = pFlipped.y + (nextFlipped.y - pFlipped.y) * sectionEnd;

            // Draw this color section with offset
            // Apply offsetDir to perpendicular for correct side (same as tick rendering)
            gradientElements.push(
              <Line
                key={`gradient-${layer}-${i}-${colorSection}`}
                points={[
                  startX * scale + offsetX + (perpX * offsetDir) * offset,
                  startY * scale + offsetY + (perpY * offsetDir) * offset,
                  endX * scale + offsetX + (perpX * offsetDir) * offset,
                  endY * scale + offsetY + (perpY * offsetDir) * offset
                ]}
                stroke={`rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`}
                strokeWidth={5}
                listening={false}
              />
            );
          }
        }
      }
    }
    // ========== END COLOR GRADIENT RENDERING ==========

    // If no 180° angles found, create a single line as before
    const mainShape = lineSegments.length > 0 ? lineSegments : (
      <Line
        points={nonFoldPtsForShape.flatMap(p => {
          const fp = applyFlipToPoint(p, pts);
          return [fp.x * scale + offsetX, fp.y * scale + offsetY];
        })}
        stroke="black"
        strokeWidth={showTaper ? 3 : 4}
      />
    );

    // ➤ Angle labels - build array like length labels
    const angleLabels = [];
    if (labelAngs) {
      const nonFoldPoints = labelPoints.filter(p => !p.isFold);
      for (let i = 0; i < Math.min(labelAngs.length, labelLens.length - 1); i++) {
        const a = labelAngs[i];

        // Validate the angle value first
        const validatedAngle = !isNaN(Number(a)) && isFinite(Number(a)) ? Number(a) : null;
        if (validatedAngle === null) {
          console.warn(`Skipping invalid angle at index ${i}:`, a, 'from labelAngs:', labelAngs);
          continue;
        }

        // Check the actual display value for hiding 90/-90 and 180/-180
        const displayValue = displayAngles && displayAngles[i] !== undefined ? displayAngles[i] : validatedAngle;
        if (Math.abs(displayValue) === 90 || Math.abs(displayValue) === 180) continue;

        // Use appropriate points for positioning
        const prev = nonFoldPoints[i];
        const curr = nonFoldPoints[i + 1];
        const next = nonFoldPoints[i + 2];
        if (!prev || !curr || !next) continue;

        const len = Math.hypot(next.x - curr.x, next.y - curr.y);
        if (!isFinite(len) || len === 0) continue;

        const { x, y } = getAngleLabelPosition(
          applyFlipToPoint(prev, pts),
          applyFlipToPoint(curr, pts),
          applyFlipToPoint(next, pts),
          scale,
          offsetX,
          offsetY,
          nonFoldPoints.map(p => applyFlipToPoint(p, pts)),
          i
        );

        // Validate calculated position
        if (!isFinite(x) || !isFinite(y)) {
          console.warn(`Invalid angle label position for angle ${i}:`, { x, y });
          continue;
        }

        // Check for saved offsets from database, then temporary drag offsets, then calculated position
        let savedAngleOffset;
        let coordKey;
        if (taperProfile === 'far') {
          savedAngleOffset = labelOffsets?.farAngleLabels?.[i];
          coordKey = `ang-far-${i}`;
        } else if (taperProfile === 'near') {
          savedAngleOffset = labelOffsets?.nearAngleLabels?.[i];
          coordKey = `ang-near-${i}`;
        } else {
          savedAngleOffset = labelOffsets?.angleLabels?.[i];
          coordKey = `ang-${i}`;
        }

        // Apply saved offset as RELATIVE to the calculated position
        let drag;
        if (coordOffsets[coordKey]) {
          drag = coordOffsets[coordKey];
        } else if (savedAngleOffset) {
          drag = {
            x: x + savedAngleOffset.x,
            y: y + savedAngleOffset.y
          };
        } else {
          drag = { x, y };
        }

        // Check if user cleared the angle input
        const isAngleInputCleared = (displayAngles && displayAngles[i] === '') ||
          (displayAngles && displayAngles[i] === '-');
        if (isAngleInputCleared) continue;

        // Get angle value with proper validation and normalization
        let angleValue;
        if (labelAngs && labelAngs[i] !== undefined && labelAngs[i] !== null && labelAngs[i] !== '') {
          angleValue = Number(labelAngs[i]);
        } else if (displayAngles && displayAngles[i] !== undefined && displayAngles[i] !== null && displayAngles[i] !== '') {
          angleValue = Number(displayAngles[i]);
        } else if (validatedAngle !== null) {
          angleValue = validatedAngle;
        } else {
          continue;
        }

        angleValue = normalizeDegrees(angleValue);
        if (isNaN(angleValue) || !isFinite(angleValue)) continue;

        const flippedAngle = getFlippedAngle(angleValue);
        const angleText = `${flippedAngle}\u00B0`; // \u00B0 is Unicode for degree symbol °

        // Calculate width: digits at 18px each, degree symbol at 12px
        const digitCount = String(Math.abs(flippedAngle)).length + (flippedAngle < 0 ? 1 : 0); // count digits + minus sign
        const angleTextWidth = (digitCount * 18) + 12; // 12px for degree symbol
        const angleTextHeight = 30; // Slightly smaller height for tighter hit area

        // Calculate vertex position for reference line
        const flippedCurr = applyFlipToPoint(curr, pts);
        const vertexX = flippedCurr.x * scale + offsetX;
        const vertexY = flippedCurr.y * scale + offsetY;

        // Calculate direction from vertex to label
        const angleLineDx = drag.x - vertexX;
        const angleLineDy = drag.y - vertexY;
        const angleLineLen = Math.sqrt(angleLineDx * angleLineDx + angleLineDy * angleLineDy);

        const isAngleHorizontalApproach = Math.abs(angleLineDx) > Math.abs(angleLineDy);
        const angleLabelEdgeOffset = isAngleHorizontalApproach ? 22 : 15;
        let angleLineEndX = drag.x;
        let angleLineEndY = drag.y;
        if (angleLineLen > angleLabelEdgeOffset) {
          const angleShortenRatio = (angleLineLen - angleLabelEdgeOffset) / angleLineLen;
          angleLineEndX = vertexX + angleLineDx * angleShortenRatio;
          angleLineEndY = vertexY + angleLineDy * angleShortenRatio;
        }

        const isEditingThisAngle = editingIndex.type === 'angle' &&
          editingIndex.index === i &&
          (taperProfile === null ? editingIndex.profile === null : editingIndex.profile === taperProfile);

        // Push Arrow first (like length labels)
        if (angleLineLen > 5) {
          angleLabels.push(
            <Arrow
              key={`arrow-${coordKey}`}
              points={[vertexX, vertexY, angleLineEndX, angleLineEndY]}
              stroke="#008000"
              strokeWidth={1}
              listening={false}
              pointerWidth={8}
              pointerAtBeginning={true}
              pointerAtEnding={false}
            />
          );
        }

        // Push Group (like length labels)
        angleLabels.push(
          <Group
            key={coordKey}
            x={drag.x}
            y={drag.y}
            draggable
            onDragMove={(e) => handleCoordDrag(e, coordKey, { x, y }, taperProfile)}
            onDragEnd={(e) => handleCoordDrag(e, coordKey, { x, y }, taperProfile)}
          >
            <Text
              x={0}
              y={0}
              text={angleText}
              fontSize={showTaper ? 18 : 22}
              fontStyle="bold"
              fontFamily="Verdana, Geneva, sans-serif"
              fontWeight="bold"
              fill={isEditingThisAngle ? "#FF6600" : "#008000"}
              align="center"
              verticalAlign="middle"
              width={angleTextWidth}
              height={angleTextHeight}
              wrap="none"
              ellipsis={false}
              offsetX={angleTextWidth / 2}
              offsetY={angleTextHeight / 2}
              shadowColor={isEditingThisAngle ? "#FF6600" : undefined}
              shadowBlur={isEditingThisAngle ? 15 : 0}
              shadowOpacity={isEditingThisAngle ? 1 : 0}
            />
          </Group>
        );
      }
    }

    return (
      <>
        {gradientElements}
        {mainShape}
        {tickElements}
        {extraMarkers}
        {guideLines}
        {lengthLabels}
        {angleLabels}

        {adjustedPts.map((p, i) => {
          const adjustedP = adjustedPts[i];
          const fp = applyFlipToPoint(adjustedP, pts);
          // Don't render draggable circles for fold points
          if (adjustedP.isFold) return null;

          // SWI-style: Don't show any dots when canvas is empty (no segments created yet)
          // Only show dots after at least one segment exists
          // Use labelLens which is passed to drawLines (could be lengths, farLengths, or nearLengths)
          if (labelLens.length === 0) return null;

          // Calculate the index in mainPts (non-fold points only)
          let mainPtIndex = 0;
          for (let j = 0; j < i; j++) {
            if (!adjustedPts[j].isFold) {
              mainPtIndex++;
            }
          }

          // Check if we're in create drawing mode where vertices shouldn't be draggable
          // This includes template mode with empty canvas when drawing is enabled
          // When isInTemplateCreateMode is true, we're in template create mode
          const isInCreateMode = (continuousDrawing && !templateId) || isInTemplateCreateMode;

          return (
            <Circle
              key={`pt-${i}`}
              x={fp.x * scale + offsetX}
              y={fp.y * scale + offsetY}
              radius={5}
              fill="orange"
              stroke="black"
              strokeWidth={0.5}
              draggable={!adjustedP.isFold && !isInCreateMode && !isTaperMode}
              // Prevent canvas drag/pan on ALL relevant events:
              onMouseDown={e => { e.cancelBubble = true; }}
              onDragStart={e => {
                e.cancelBubble = true;
                // Initialize dragging state with current points (use original pts for logic)
                if (!draggingPoints) {
                  setDraggingPoints([...pts]);
                }
                // Store flip center at drag start
                if ((flipH || flipV)) {
                  let centerX = 0, centerY = 0;
                  if (flipH) {
                    // Use all points for flip center to avoid straight line issue
                    const xs = pts.map(pt => pt.x);
                    centerX = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
                  }
                  if (flipV) {
                    // For first point in Flip V, exclude it (this was working)
                    const ys = (mainPtIndex === 0 && pts.length > 1)
                      ? pts.slice(1).map(pt => pt.y)
                      : pts.map(pt => pt.y);
                    centerY = ys.length > 0 ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
                  }
                  setDragStartCenter({ x: centerX, y: centerY });
                }
              }}
              // ─── Drag Move ───
              onDragMove={(e) => {
                e.cancelBubble = true;
                const node = e.target;
                // Get the actual position based on the original point, not adjusted
                const originalPt = pts[i];
                let newX = (node.x() - offsetX) / scale;
                let newY = (node.y() - offsetY) / scale;

                // Use stored center if available (for consistent flip during drag)
                let originalCenterX = 0, originalCenterY = 0;
                if (dragStartCenter) {
                  // Use the center stored at drag start for consistency
                  originalCenterX = dragStartCenter.x;
                  originalCenterY = dragStartCenter.y;
                } else {
                  // Calculate center if not stored - use same logic as drag start
                  if (flipH) {
                    // Use all points for flip center to avoid straight line issue
                    const xs = pts.map(pt => pt.x);
                    originalCenterX = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
                  }
                  if (flipV) {
                    // For first point in Flip V, exclude it (this was working)
                    const ys = (mainPtIndex === 0 && pts.length > 1)
                      ? pts.slice(1).map(pt => pt.y)
                      : pts.map(pt => pt.y);
                    originalCenterY = ys.length > 0 ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
                  }
                }

                // Un-flip the coordinates to get the logical position
                if (flipH) {
                  newX = 2 * originalCenterX - newX;
                }
                if (flipV) {
                  newY = 2 * originalCenterY - newY;
                }

                const updated = [...pts];

                // Map mainPtIndex to actual index in the full array (including fold points)
                let actualIndex = 0;
                let mainPtCount = 0;
                for (let idx = 0; idx < updated.length; idx++) {
                  if (!updated[idx].isFold) {
                    if (mainPtCount === mainPtIndex) {
                      actualIndex = idx;
                      break;
                    }
                    mainPtCount++;
                  }
                }

                // Allow all points including first to affect segments
                if (false) {
                  // Disabled: Move the whole drawing by shifting the origin offset
                  setOriginOffset({
                    x: newX,
                    y: newY
                  });
                } else {
                  // Get constrained position for the dragged point (use actualIndex for correct array position)
                  // CRITICAL FIX: Pass mainPtIndex for correct length indexing when folds are present
                  const { x: snappedX, y: snappedY } = getLockedDragPosition(updated, actualIndex, newX, newY, lengths, lockLegends, mainPtIndex);

                  // Apply flip back for visual display using original center
                  let displayX = snappedX;
                  let displayY = snappedY;
                  if (flipH) {
                    displayX = 2 * originalCenterX - snappedX;
                  }
                  if (flipV) {
                    displayY = 2 * originalCenterY - snappedY;
                  }

                  // Update the node position for correct visual feedback
                  node.position({
                    x: displayX * scale + offsetX,
                    y: displayY * scale + offsetY,
                  });

                  // IMPORTANT: Only update the dragged point, keep others fixed (use actualIndex for full array)
                  // Preserve other properties like isFold when updating
                  updated[actualIndex] = { ...updated[actualIndex], x: snappedX, y: snappedY };

                  // Update dragging points immediately for visual feedback
                  setDraggingPoints([...updated]);

                  // When Lock Legends is ON, we need to cascade the constraint
                  // but keep other segments in place
                  if (lockLegends && mainPtIndex > 0 && mainPtIndex < pts.length - 1) {
                    // For middle points, we may need to adjust ONE adjacent segment
                    // to maintain the constraint, but keep the rest fixed
                  }
                  startTransition(() => {
                    handlePointDrag({ target: { x: () => snappedX * scale + offsetX, y: () => snappedY * scale + offsetY } }, mainPtIndex);
                    if (lockLegends) {
                      // When Lock Legends is ON, lengths stay fixed, only angles change
                      // DO NOT update lengths - they should remain constant

                      // Filter out fold points for angle calculations
                      const mainPts = updated.filter(pt => !pt.isFold);

                      // Only update angles that actually changed
                      const newAngles = [...angles];

                      // Update angle at the dragged point (if it's not first or last)
                      // Use mainPtIndex which correctly maps to non-fold points
                      if (mainPtIndex > 0 && mainPtIndex < mainPts.length - 1) {
                        const prev = mainPts[mainPtIndex - 1];
                        const curr = mainPts[mainPtIndex];
                        const next = mainPts[mainPtIndex + 1];
                        if (prev && curr && next) {
                          newAngles[mainPtIndex - 1] = Math.round(calculateAngleBetweenPoints(prev, curr, next));
                        }
                      }

                      // Update angle at previous point if dragging last point
                      if (mainPtIndex === mainPts.length - 1 && mainPtIndex > 1) {
                        const prev = mainPts[mainPtIndex - 2];
                        const curr = mainPts[mainPtIndex - 1];
                        const next = mainPts[mainPtIndex];
                        if (prev && curr && next) {
                          newAngles[mainPtIndex - 2] = Math.round(calculateAngleBetweenPoints(prev, curr, next));
                        }
                      }

                      // Update angle at next point if dragging first point
                      if (mainPtIndex === 0 && mainPts.length > 2) {
                        const prev = mainPts[0];
                        const curr = mainPts[1];
                        const next = mainPts[2];
                        if (prev && curr && next) {
                          newAngles[0] = Math.round(calculateAngleBetweenPoints(prev, curr, next));
                        }
                      }

                      setAngles(newAngles);
                      setDisplayAngles(newAngles); // Also update display angles for table
                      // Lengths remain unchanged - this is the key for Lock Legends!
                    } else {
                      // Lock Legends OFF - DON'T update lengths/angles during drag
                      // This keeps other segments fixed in place
                      // Lengths and angles will be updated on drag end
                    }
                  });
                }
              }}

              onDragEnd={(e) => {
                e.cancelBubble = true;
                let newX = (e.target.x() - offsetX) / scale;
                let newY = (e.target.y() - offsetY) / scale;

                // Use stored center if available (for consistent flip during drag)
                let originalCenterX = 0, originalCenterY = 0;
                if (dragStartCenter) {
                  // Use the center stored at drag start for consistency
                  originalCenterX = dragStartCenter.x;
                  originalCenterY = dragStartCenter.y;
                } else {
                  // Calculate center if not stored - use same logic as drag start
                  if (flipH) {
                    // Use all points for flip center to avoid straight line issue
                    const xs = pts.map(pt => pt.x);
                    originalCenterX = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
                  }
                  if (flipV) {
                    // For first point in Flip V, exclude it (this was working)
                    const ys = (mainPtIndex === 0 && pts.length > 1)
                      ? pts.slice(1).map(pt => pt.y)
                      : pts.map(pt => pt.y);
                    originalCenterY = ys.length > 0 ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
                  }
                }

                // Un-flip the coordinates to get the logical position
                if (flipH) {
                  newX = 2 * originalCenterX - newX;
                }
                if (flipV) {
                  newY = 2 * originalCenterY - newY;
                }

                const updated = [...pts];

                // Map mainPtIndex to actual index in the full array (including fold points)
                let actualIndex = 0;
                let mainPtCount = 0;
                for (let idx = 0; idx < updated.length; idx++) {
                  if (!updated[idx].isFold) {
                    if (mainPtCount === mainPtIndex) {
                      actualIndex = idx;
                      break;
                    }
                    mainPtCount++;
                  }
                }

                // Allow all points including first to affect segments
                if (false) {
                  // Disabled: setOriginOffset({
                  //   x: newX,
                  //   y: newY
                  // });
                } else {
                  // CRITICAL FIX: Pass mainPtIndex to getLockedDragPosition, not actualIndex
                  // This ensures correct length indexing when fold points are present
                  console.log('🔍 Before getLockedDragPosition:', {
                    mainPtIndex,
                    actualIndex,
                    newX,
                    newY,
                    startFoldType,
                    endFoldType,
                    updatedLength: updated.length,
                    updatedPoints: updated.map((pt, i) => ({ i, x: pt.x, y: pt.y, isFold: pt.isFold }))
                  });
                  const { x: snappedX, y: snappedY } = getLockedDragPosition(updated, actualIndex, newX, newY, lengths, lockLegends, mainPtIndex);
                  console.log('🔍 After getLockedDragPosition:', { snappedX, snappedY });
                  // Preserve other properties like isFold when updating
                  updated[actualIndex] = { ...updated[actualIndex], x: snappedX, y: snappedY };

                  // Apply flip back for visual display using original center
                  let displayX = snappedX;
                  let displayY = snappedY;
                  if (flipH) {
                    displayX = 2 * originalCenterX - snappedX;
                  }
                  if (flipV) {
                    displayY = 2 * originalCenterY - snappedY;
                  }

                  // Update the target position for visual consistency
                  e.target.position({
                    x: displayX * scale + offsetX,
                    y: displayY * scale + offsetY,
                  });

                  // Calculate new lengths and angles from the updated positions
                  // IMPORTANT: Filter out fold points before calculations
                  const mainPts = updated.filter(pt => !pt.isFold);

                  if (lockLegends) {
                    // Lock Legends ON: Only update angles, keep lengths locked
                    const newAngles = mainPts.slice(1, -1).map((pt, idx) => {
                      const prev = mainPts[idx];
                      const curr = pt;
                      const next = mainPts[idx + 2];
                      if (!prev || !curr || !next) return 0;
                      return Math.round(calculateAngleBetweenPoints(prev, curr, next));
                    });
                    setAngles(newAngles);
                    setDisplayAngles(newAngles); // Also update display angles
                    // DO NOT update lengths - they should remain locked
                  } else {
                    // Lock Legends OFF: Keep other points fixed, only move dragged point
                    // DO NOT update lengths/angles during drag - only update draggingPoints
                    // This prevents recalculation of all points

                    // Just update the draggingPoints with the new position
                    // This keeps all other points exactly where they are
                    setDraggingPoints([...updated]);

                    // DO NOT update lengths and angles during drag
                    // They will be updated when drag ends (onDragEnd)
                  }

                  // If Lock Legends is OFF, update lengths and angles from the final dragging points
                  // IMPORTANT: Update lengths/angles FIRST, then recalculate absolute angles from the NEW values
                  if (!lockLegends && draggingPoints) {
                    // CRITICAL: Filter out fold points BEFORE calculating lengths
                    // Fold points are NOT part of the actual segment geometry
                    const finalMainPts = draggingPoints.filter(pt => !pt.isFold);

                    console.log('🔍 Drag End - Points Analysis:', {
                      draggingPointsTotal: draggingPoints.length,
                      draggingPoints: draggingPoints.map((pt, i) => ({ i, x: pt.x, y: pt.y, isFold: pt.isFold })),
                      finalMainPtsTotal: finalMainPts.length,
                      finalMainPts: finalMainPts.map((pt, i) => ({ i, x: pt.x, y: pt.y })),
                      mainPtIndex,
                      currentLengths: lengths,
                      startFoldType,
                      endFoldType
                    });

                    // IMPORTANT: Only update lengths/angles for segments ADJACENT to the dragged point
                    // When dragging point at mainPtIndex:
                    // - Update segment [mainPtIndex-1] if mainPtIndex > 0
                    // - Update segment [mainPtIndex] if mainPtIndex < finalMainPts.length - 1
                    // - Update angles at dragged point and adjacent points

                    const newLengths = [...lengths]; // Start with existing lengths
                    const newAngles = [...angles]; // Start with existing angles

                    // Update length of segment BEFORE dragged point (if exists)
                    if (mainPtIndex > 0) {
                      const segmentIndex = mainPtIndex - 1;
                      const startPt = finalMainPts[mainPtIndex - 1];
                      const endPt = finalMainPts[mainPtIndex];
                      const newLength = Math.round(Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y));
                      newLengths[segmentIndex] = newLength;
                      console.log(`📏 Updated length[${segmentIndex}] (before dragged point): ${lengths[segmentIndex]} → ${newLength}`);
                    }

                    // Update length of segment AFTER dragged point (if exists)
                    if (mainPtIndex < finalMainPts.length - 1) {
                      const segmentIndex = mainPtIndex;
                      const startPt = finalMainPts[mainPtIndex];
                      const endPt = finalMainPts[mainPtIndex + 1];
                      const newLength = Math.round(Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y));
                      newLengths[segmentIndex] = newLength;
                      console.log(`📏 Updated length[${segmentIndex}] (after dragged point): ${lengths[segmentIndex]} → ${newLength}`);
                    }

                    // Update angles at and around the dragged point
                    // Angle at dragged point (if it's a middle point)
                    if (mainPtIndex > 0 && mainPtIndex < finalMainPts.length - 1) {
                      const angleIndex = mainPtIndex - 1;
                      const prev = finalMainPts[mainPtIndex - 1];
                      const curr = finalMainPts[mainPtIndex];
                      const next = finalMainPts[mainPtIndex + 1];
                      if (prev && curr && next) {
                        newAngles[angleIndex] = Math.round(calculateAngleBetweenPoints(prev, curr, next));
                        console.log(`📐 Updated angle[${angleIndex}] at dragged point: ${angles[angleIndex]} → ${newAngles[angleIndex]}`);
                      }
                    }

                    // Update angle at point BEFORE dragged point (if exists)
                    if (mainPtIndex > 1) {
                      const angleIndex = mainPtIndex - 2;
                      const prev = finalMainPts[mainPtIndex - 2];
                      const curr = finalMainPts[mainPtIndex - 1];
                      const next = finalMainPts[mainPtIndex];
                      if (prev && curr && next) {
                        newAngles[angleIndex] = Math.round(calculateAngleBetweenPoints(prev, curr, next));
                        console.log(`📐 Updated angle[${angleIndex}] before dragged point: ${angles[angleIndex]} → ${newAngles[angleIndex]}`);
                      }
                    }

                    // Update angle at point AFTER dragged point (if exists)
                    if (mainPtIndex < finalMainPts.length - 2) {
                      const angleIndex = mainPtIndex;
                      const prev = finalMainPts[mainPtIndex];
                      const curr = finalMainPts[mainPtIndex + 1];
                      const next = finalMainPts[mainPtIndex + 2];
                      if (prev && curr && next) {
                        newAngles[angleIndex] = Math.round(calculateAngleBetweenPoints(prev, curr, next));
                        console.log(`📐 Updated angle[${angleIndex}] after dragged point: ${angles[angleIndex]} → ${newAngles[angleIndex]}`);
                      }
                    }

                    console.log('🔧 Drag End - Selective Update:', {
                      mainPtIndex,
                      totalMainPoints: finalMainPts.length,
                      oldLengths: lengths,
                      newLengths,
                      oldAngles: angles,
                      newAngles,
                      startFoldType,
                      endFoldType
                    });

                    // CRITICAL FIX: Calculate ALL absolute angles from the actual final point positions
                    // This ensures we preserve the exact geometry from the drag
                    const updatedAbsoluteAngles = [];
                    for (let i = 0; i < finalMainPts.length - 1; i++) {
                      const startPt = finalMainPts[i];
                      const endPt = finalMainPts[i + 1];
                      const segmentAngle = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) * 180 / Math.PI;
                      updatedAbsoluteAngles.push(segmentAngle);
                    }

                    // Update first segment angle
                    const hasStartSSF = startFoldType === 'OpenUp' || startFoldType === 'OpenDn';
                    if (updatedAbsoluteAngles.length > 0 && !hasStartSSF) {
                      setFirstSegmentAngle(updatedAbsoluteAngles[0]);
                    }

                    console.log('🔧 Calculated absoluteAngles from ACTUAL point positions:', updatedAbsoluteAngles);

                    // CRITICAL: Set skipPointRecalc BEFORE updating any state to prevent useEffect from firing
                    skipPointRecalc.current = true;

                    // Update all state
                    setLengths(newLengths);
                    setAngles(newAngles);
                    setDisplayAngles(newAngles);
                    setDisplayLengths(newLengths); // Sync display lengths for table
                    setSegmentAbsoluteAngles(updatedAbsoluteAngles);

                    // Set points directly to the dragged positions to preserve exact geometry
                    setPoints([...draggingPoints]);
                    console.log('🔧 Set points directly from draggingPoints to preserve exact positions');
                  }

                  // Clear dragging state after React updates complete
                  setTimeout(() => {
                    setDraggingPoints(null);
                    setDragStartCenter(null); // Clear stored center after drag
                  }, 10); // Slightly longer delay to ensure state updates complete
                }
              }}
            />
          );
        })}
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // TAPER MODE: PRE-RENDER CALCULATIONS
  // Calculate point coordinates for Far and Near profiles independently
  // These will be rendered side-by-side in split canvas view
  // ═══════════════════════════════════════════════════════════════
  // Use the actual direction instead of hardcoded 'Right'
  // MUST use segmentAbsoluteAngles for correct shape in taper mode
  const farPts = calculatePointsLocal(farLengths, farAngles, direction, segmentAbsoluteAngles, displayLengths, false);
  const nearPts = calculatePointsLocal(nearLengths, nearAngles, direction, segmentAbsoluteAngles, displayLengths, false);

  // Filter out fold points for scale calculation to prevent position shift
  const farMainPts = farPts.filter(p => !p.isFold);
  const nearMainPts = nearPts.filter(p => !p.isFold);

  // ───────────────────────────────────────────────────────────────
  // TAPER MODE: CANVAS SIZING AND LAYOUT
  // Calculate optimal sizes for Far and Near canvas grids to fit screen
  // Layout: [Far Grid] [Far Table] [Controls] [Near Table] [Near Grid]
  // ───────────────────────────────────────────────────────────────
 const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Get actual container width with better fallback
  const containerElement = canvasContainerRef.current;
  let actualContainerWidth;

  if (containerElement && containerElement.offsetWidth > 0) {
    actualContainerWidth = containerElement.offsetWidth;
  } else if (containerSize.width > 0) {
    actualContainerWidth = containerSize.width;
  } else {
    // Fallback calculation based on viewport and sidebar state
    const sidebarWidth = viewportWidth > 1200 ? 300 : 250;
    actualContainerWidth = viewportWidth - sidebarWidth;
  }

  // PERFECT BALANCE - make grids as large as possible without cutoff
  const farTableWidth = 100;
  const nearTableWidth = 100;
  const middleControlsWidth = 160;
  const minimalGaps = 15;

  // Space used by middle elements only
  const middleSpace = farTableWidth + nearTableWidth + middleControlsWidth + minimalGaps;

  // Use MOST of the available space but leave tiny margin to prevent cutoff
  const safeMargin = 10;
  const availableForGrids = actualContainerWidth - middleSpace - safeMargin;

  // Each grid gets HALF but ensure they're not too small
  const gridWidth = Math.max(Math.floor(availableForGrids / 2), 500);

  // CRITICAL FIX: Use dynamic height based on viewport instead of fixed 540px
  // Calculate available height similar to normal mode
  const reservedHeightTaper = showTaper ? 220 : 185; // Account for header, controls, etc.
  const availableHeightTaper = viewportHeight - reservedHeightTaper;
  // Ensure height is multiple of 20 for grid alignment, minimum 400px
  const gridHeight = Math.round(Math.max(availableHeightTaper, 400) / 20) * 20;

  // ───────────────────────────────────────────────────────────────
  // TAPER MODE: GIRTH-BASED DYNAMIC SCALING
  // Far and Near canvases scale independently based on their girth
  // Girth tiers: ≤250mm, ≤500mm, ≤1000mm, >1000mm each have different shrinkFactors
  // ───────────────────────────────────────────────────────────────
  // CRITICAL FIX: Use ACTUAL lengths for girth calculation, not capped values
  // The girth should be calculated from real segment values for proper tier detection
  const farLengthsForScale = farLengths.map(len => {
    const numLen = typeof len === 'number' ? len : Number(len);
    return isNaN(numLen) || !isFinite(numLen) || len === '' || len == null ? 0 : numLen;
  });

  const nearLengthsForScale = nearLengths.map(len => {
    const numLen = typeof len === 'number' ? len : Number(len);
    return isNaN(numLen) || !isFinite(numLen) || len === '' || len == null ? 0 : numLen;
  });

  // Use calculated dimensions - maximize canvas area
  const farStageWidth = gridWidth;
  const farStageHeight = gridHeight; // Use full available height instead of min(width, height)

  // Helper function to determine girth tier (same as normal mode)
  const getGirthTier = (girth) => {
    if (girth <= 250) return 1;
    if (girth <= 500) return 2;
    if (girth <= 1000) return 3;
    return 4;
  };

  // Calculate dynamic shrinkFactor for Far canvas based on girth changes
  let farShrinkFactorToUse = null;
  if (farLengthsForScale.length > 0) {
    const farGirth = farLengthsForScale.reduce((sum, len) => sum + (Number(len) || 0), 0);
    const farCurrentTier = getGirthTier(farGirth);
    const farPreviousTier = getGirthTier(preservedFarGirth);

    // Use preserved value if tier hasn't changed, otherwise recalculate
    if (farCurrentTier !== farPreviousTier || preservedFarShrinkFactor === null) {
      farShrinkFactorToUse = null; // Will trigger fresh calculation
    } else {
      farShrinkFactorToUse = preservedFarShrinkFactor;
    }
  }

  // Only calculate far scale if we have valid far points (taper mode)
  const { scale: farScale, offsetX: farOffsetX, offsetY: farOffsetY } =
    farMainPts.length > 1
      ? getScale(farMainPts, farStageWidth, farStageHeight, 50, canvasScale, canvasOffset, farShrinkFactorToUse, farLengthsForScale,
        false, // Always auto-center in taper mode for consistent display
        null // No firstClickPixelPos for taper mode
      )
      : { scale: 1, offsetX: 0, offsetY: 0 }; // Default values when not in taper mode

  // Calculate dynamic shrinkFactor for Near canvas based on girth changes
  let nearShrinkFactorToUse = null;
  if (nearLengthsForScale.length > 0) {
    const nearGirth = nearLengthsForScale.reduce((sum, len) => sum + (Number(len) || 0), 0);
    const nearCurrentTier = getGirthTier(nearGirth);
    const nearPreviousTier = getGirthTier(preservedNearGirth);

    // Use preserved value if tier hasn't changed, otherwise recalculate
    if (nearCurrentTier !== nearPreviousTier || preservedNearShrinkFactor === null) {
      nearShrinkFactorToUse = null; // Will trigger fresh calculation
    } else {
      nearShrinkFactorToUse = preservedNearShrinkFactor;
    }
  }

  const nearStageWidth = gridWidth; // Same as Far - use full width
  const nearStageHeight = gridHeight; // Same height as Far - use full available height
  // Only calculate near scale if we have valid near points (taper mode)
  const { scale: nearScale, offsetX: nearOffsetX, offsetY: nearOffsetY } =
    nearMainPts.length > 1
      ? getScale(nearMainPts, nearStageWidth, nearStageHeight, 50, canvasScale, canvasOffset, nearShrinkFactorToUse, nearLengthsForScale,
        false, // Always auto-center in taper mode for consistent display
        null // No firstClickPixelPos for taper mode
      )
      : { scale: 1, offsetX: 0, offsetY: 0 }; // Default values when not in taper mode

  // Note: Taper shrinkFactor preservation is now handled in useEffect (lines 1207-1275)
  // This ensures proper timing after state updates complete

  return (
    <div className={styles.drawingLayout}>
      {/* Duplicate Drawing Modal */}
      <DuplicateDrawingModal
        isOpen={duplicateModalOpen}
        onConfirm={() => {
          if (duplicateModalCallback) {
            duplicateModalCallback();
          }
        }}
        onCancel={() => {
          setDuplicateModalOpen(false);
          setDuplicateModalCallback(null);
          setIsSaving(false); // Reset saving state so buttons are re-enabled
        }}
        libraryName={duplicateModalLibrary}
      />

      {/* Professional Drawings Overlay */}
      {showDrawingsOverlay && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { transform: translateY(30px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes pulse {
              0% { transform: scale(1); }
              50% { transform: scale(1.02); }
              100% { transform: scale(1); }
            }
          `}</style>

          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: libraryCanvasDimensions.modalWidth,
            maxWidth: libraryCanvasDimensions.modalMaxWidth,
            height: '80vh',
            maxHeight: '750px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            animation: 'slideUp 0.3s ease-out',
            marginTop: '-30px'
          }}>
            {/* Header Section */}
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: '600',
                color: '#ffffff'
              }}>
                {libraryPartClasses[currentPartClassIndex] || 'Drawing Library'}
              </h2>

              <button
                onClick={() => {
                  setShowDrawingsOverlay(false);
                  setDrawingSearchTerm(''); // Clear search when closing
                }}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  color: '#ffffff',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ✕
              </button>
            </div>

            {/* Search Bar */}
            <div style={{
              padding: '8px 16px',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <input
                type="text"
                placeholder="Search drawings by name..."
                value={drawingSearchTerm}
                onChange={(e) => setDrawingSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  fontSize: '12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '10px',
                  outline: 'none',
                  transition: 'all 0.2s',
                  backgroundColor: 'white'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#667eea';
                  e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Content Area - Scrollable with infinite scroll */}
            <div
              ref={quickLibraryScrollRef}
              style={{
                flex: 1,
                padding: '16px',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0
              }}
            >
              {(() => {
                // Filter drawings based on search term
                const filteredDrawings = selectedPartClassDrawings.filter(drawing => {
                  const name = (drawing.templateName || drawing.name || 'Untitled').toLowerCase();
                  return name.includes(drawingSearchTerm.toLowerCase());
                });

                return filteredDrawings.length > 0 ? (
                  <>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: '12px',
                      width: '100%'
                    }}>
                      {filteredDrawings.map((drawing, index) => (
                        <div
                          key={drawing._id}
                          onClick={() => handleDrawingSelect(drawing)}
                          style={{
                            border: '2px solid transparent',
                            borderRadius: '6px',
                            padding: '8px 6px',
                            cursor: 'pointer',
                            transition: 'box-shadow 0.2s, transform 0.2s',
                            backgroundColor: '#ffffff',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                            height: `${libraryCanvasDimensions.cardHeight}px`,
                            minHeight: `${libraryCanvasDimensions.cardHeight}px`,
                            fontSize: '10px',
                            overflow: 'visible',
                            animation: `slideUp 0.3s ease-out ${index * 0.05}s both`
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.12)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)';
                          }}
                        >
                          {/* Drawing Preview */}
                          <div style={{
                            marginBottom: '4px',
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            flex: 1,
                            position: 'relative'
                          }}>
                            <PreviewCanvas
                              lines={drawing.lengths || []}
                              angles={drawing.angles || []}
                              direction={drawing.direction}  // No default
                              firstSegmentAngle={drawing.firstSegmentAngle}  // Use saved orientation
                              flipH={drawing.flipH}
                              flipV={drawing.flipV}
                              width={libraryCanvasDimensions.width}
                              height={libraryCanvasDimensions.height}
                              hidePoints
                              thinStroke
                              fontSize={libraryCanvasDimensions.fontSize}
                            />
                          </div>

                          {/* Drawing Name */}
                          <div style={{
                            marginTop: '2px',
                            fontSize: '9px',
                            color: '#6b7280',
                            fontWeight: '500',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            width: '100%'
                          }}>
                            {drawing.templateName || drawing.name || 'Click to add name'}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Loading More Indicator */}
                    {quickLibraryLoadingMore && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '16px 0',
                        color: '#667eea'
                      }}>
                        Loading more...
                      </div>
                    )}

                    {/* No More Results */}
                    {!quickLibraryHasMore && filteredDrawings.length > 0 && !drawingSearchTerm && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '16px 0',
                        color: '#94a3b8',
                        fontSize: '14px'
                      }}>
                        No more drawings
                      </div>
                    )}
                  </>
                ) : drawingSearchTerm ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#94a3b8'
                  }}>
                    <div style={{
                      fontSize: '64px',
                      marginBottom: '16px',
                      opacity: '0.5'
                    }}>🔍</div>
                    <h3 style={{
                      fontSize: '20px',
                      fontWeight: '600',
                      color: '#475569',
                      marginBottom: '8px'
                    }}>No Results Found</h3>
                    <p style={{
                      fontSize: '14px',
                      color: '#94a3b8'
                    }}>No drawings match "{drawingSearchTerm}"</p>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#94a3b8'
                  }}>
                    <div style={{
                      fontSize: '64px',
                      marginBottom: '16px',
                      opacity: '0.5'
                    }}>📐</div>
                    <h3 style={{
                      fontSize: '20px',
                      fontWeight: '600',
                      color: '#475569',
                      marginBottom: '8px'
                    }}>No Drawings Found</h3>
                    <p style={{
                      fontSize: '14px',
                      color: '#94a3b8'
                    }}>No drawings available for {libraryPartClasses[currentPartClassIndex]}</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* code change by rahul */}
      {orderDetails && (
        <Card className={`ProfileBasicDetailLeftHeader pt-0 pb-1`}>
          <Grid
            container
            className={` DetailHeader`}
            alignItems="center"
            sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' } }}
          >
            <Grid item xs={12} sm={6} md={6} lg={5}>
              <HeadingThree style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', margin: 0, fontWeight: 'bold', paddingLeft: '20px' }}>
                {orderDetails.order_customer_name} - {orderDetails.order_number}
              </HeadingThree>
            </Grid>
            <Grid item xs={6} sm={3} md={3} lg={2}>
              <h5 style={{ fontWeight: "bold", fontSize: 'clamp(0.875rem, 1.5vw, 1rem)', margin: 0 }}>
                Delivery Date {orderDetails.order_delivery_date}
              </h5>
            </Grid>
            <Grid item xs={6} sm={3} md={3} lg={2.5} className="text-end" sx={{ textAlign: { xs: 'start', md: 'end' } }}>
              <HeadingThree title="Delivery Day" style={{ fontSize: 'clamp(1rem, 2vw, 1.45rem)', margin: 0, fontWeight: 'bold' }}>
                <GetDayFromDate deliveryDate={orderDetails.order_delivery_date} />
              </HeadingThree>
            </Grid>
            <Grid item xs={6} sm={3} md={2} lg={1.5} className="text-end" sx={{ textAlign: { xs: 'start', md: 'end' } }}>
              <h5 style={{ fontWeight: "bold", fontSize: 'clamp(0.875rem, 1.5vw, 1rem)', margin: 0 }}>
                Tag: {loadingTag ? '...' : suggestedTag}
              </h5>
            </Grid>
          </Grid>
        </Card>)}
      {loadingOrderDetails && <p>Loading order details...</p>}
      {/* ---- Top Bar: Only show when not in taper mode ---- */}
      {!showTaper && (
        <div className={styles.topBar}>
          {/* Left side - icon only buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              ref={firstBtnRef}
              className={`${styles.btn} ${styles.gray}`}
              title="Back"
              tabIndex={1}
              onFocus={(e) => {
                e.target.style.outline = 'none';
              }}
              onBlur={(e) => {
                e.target.style.outline = '';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                  // Tab forward to Reset/Clear button
                  e.preventDefault();
                  const resetBtn = document.querySelector('[tabIndex="2"]');
                  resetBtn?.focus();
                } else if (e.key === 'Tab' && e.shiftKey) {
                  // Shift+Tab loops back from Finish button
                  e.preventDefault();
                  finishButtonRef.current?.focus();
                }
              }}
              onClick={() => navigate('/template-library', {
                state: {
                  orderNumber,
                  customerName,
                  customerId,
                  orderId,
                  deliveryDate: promiseDate,
                  enteredDate,
                  partGroup: 'Flashing',
                  partClass: 'My Library',
                  currentPage: location.state?.previousPage || 'designers'
                }
              })}
              style={{
                border: 'none',
                outline: 'none'
              }}
            >
              <ArrowLeft size={24} />
            </button>

            <button
              className={`${styles.btn} ${styles.gray}`}
              title="Undo"
              tabIndex={2}
              disabled={!hasValidDrawing || !canUndo}
              onFocus={(e) => {
                e.target.style.outline = 'none';
              }}
              onBlur={(e) => {
                e.target.style.outline = '';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault();
                  const redoBtn = document.querySelector('[tabIndex="3"]');
                  redoBtn?.focus();
                } else if (e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault();
                  firstBtnRef.current?.focus();
                }
              }}
              onClick={handleUndo}
              style={{
                border: 'none',
                outline: 'none',
                opacity: (!hasValidDrawing || !canUndo) ? 0.5 : 1,
                cursor: (!hasValidDrawing || !canUndo) ? 'not-allowed' : 'pointer'
              }}
            >
              <FiRotateCcw size={24} />
            </button>

            {/* Redo Button */}
            <button
              className={`${styles.btn} ${styles.gray}`}
              title="Redo"
              tabIndex={3}
              disabled={!canRedo}
              onFocus={(e) => {
                e.target.style.outline = 'none';
              }}
              onBlur={(e) => {
                e.target.style.outline = '';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault();
                  const flipHBtn = document.querySelector('[tabIndex="4"]');
                  flipHBtn?.focus();
                } else if (e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault();
                  const undoBtn = document.querySelector('[tabIndex="2"]');
                  undoBtn?.focus();
                }
              }}
              onClick={handleRedo}
              style={{
                border: 'none',
                outline: 'none',
                opacity: !canRedo ? 0.5 : 1,
                cursor: !canRedo ? 'not-allowed' : 'pointer'
              }}
            >
              <FiRotateCw size={24} />
            </button>
            {/* Flip H Button */}
            <button
              className={`${styles.btn} ${styles.gray}`}
              title="Flip Horizontal"
              tabIndex={4}
              disabled={!hasValidDrawing}
              onFocus={(e) => {
                e.target.style.outline = 'none';
              }}
              onBlur={(e) => {
                e.target.style.outline = '';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault();
                  const flipVBtn = document.querySelector('[title="Flip Vertical"]');
                  flipVBtn?.focus();
                } else if (e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault();
                  const redoBtn = document.querySelector('[tabIndex="3"]');
                  redoBtn?.focus();
                }
              }}
              onClick={() => {
                if (!hasValidDrawing) return;
                setFlipH(prev => !prev);
                // Also flip fold directions in dropdown to match visual
                if (startFoldType) {
                  if (startFoldType === 'Up') setStartFoldType('Down');
                  else if (startFoldType === 'Down') setStartFoldType('Up');
                  else if (startFoldType === 'OpenUp') setStartFoldType('OpenDn');
                  else if (startFoldType === 'OpenDn') setStartFoldType('OpenUp');
                }
                if (endFoldType) {
                  if (endFoldType === 'Up') setEndFoldType('Down');
                  else if (endFoldType === 'Down') setEndFoldType('Up');
                  else if (endFoldType === 'OpenUp') setEndFoldType('OpenDn');
                  else if (endFoldType === 'OpenDn') setEndFoldType('OpenUp');
                }
              }}
              style={{
                border: flipH ? '3px solid #2196F3' : 'none',
                outline: 'none',
                marginLeft: '50px',
                backgroundColor: flipH ? '#E3F2FD' : '',
                borderRadius: '4px',
                opacity: !hasValidDrawing ? 0.5 : 1,
                cursor: !hasValidDrawing ? 'not-allowed' : 'pointer'
              }}
            >
              <FiRefreshCcw size={24} color={flipH ? '#2196F3' : 'inherit'} />
            </button>

            {/* Flip V Button */}
            <button
              className={`${styles.btn} ${styles.gray}`}
              title="Flip Vertical"
              onClick={() => {
                if (!hasValidDrawing) return;
                setFlipV(prev => !prev);
                // Also flip fold directions in dropdown to match visual
                if (startFoldType) {
                  if (startFoldType === 'Up') setStartFoldType('Down');
                  else if (startFoldType === 'Down') setStartFoldType('Up');
                  else if (startFoldType === 'OpenUp') setStartFoldType('OpenDn');
                  else if (startFoldType === 'OpenDn') setStartFoldType('OpenUp');
                }
                if (endFoldType) {
                  if (endFoldType === 'Up') setEndFoldType('Down');
                  else if (endFoldType === 'Down') setEndFoldType('Up');
                  else if (endFoldType === 'OpenUp') setEndFoldType('OpenDn');
                  else if (endFoldType === 'OpenDn') setEndFoldType('OpenUp');
                }
              }}
              disabled={!hasValidDrawing || !canUndo}
              style={{
                border: flipV ? '3px solid #2196F3' : 'none',
                outline: 'none',
                backgroundColor: flipV ? '#E3F2FD' : '',
                borderRadius: '4px'
              }}
            >
              <FiRefreshCcw size={24} color={flipV ? '#2196F3' : 'inherit'} style={{ transform: 'rotate(90deg)' }} />
            </button>

            {/* Lock Button */}
            <button
              className={`${styles.btn} ${styles.gray}`}
              title={lockLegends ? "Unlock Legends" : "Lock Legends"}
              disabled={!hasValidDrawing}
              onClick={() => hasValidDrawing && setLockLegends(prev => !prev)}
              style={{
                border: lockLegends ? '3px solid #2196F3' : 'none',
                outline: 'none',
                backgroundColor: lockLegends ? '#E3F2FD' : '',
                borderRadius: '4px',
                opacity: !hasValidDrawing ? 0.5 : 1,
                cursor: !hasValidDrawing ? 'not-allowed' : 'pointer'
              }}
            >
              {lockLegends ? <FiLock size={24} color="#2196F3" /> : <FiUnlock size={24} />}
            </button>

            {/* Remove First Button (RF) */}
            <button
              className={`${styles.btn} ${styles.gray}`}
              title="Remove First"
              disabled={!hasValidDrawing}
              style={{
                border: 'none',
                outline: 'none',
                marginLeft: '50px',
                opacity: !hasValidDrawing ? 0.5 : 1,
                cursor: !hasValidDrawing ? 'not-allowed' : 'pointer'
              }}
              onClick={() => {
                if (!hasValidDrawing) return;
                // When removing first segment, need to update firstSegmentAngle
                // to maintain the shape's orientation
                if (lengths.length > 1) {
                  // Calculate what the absolute angle of the second segment was
                  const directionMap = {
                    'Up': 90,
                    'Down': -90,
                    'Right': 0,
                    'Left': 180,
                  };

                  // Start with the current first segment angle
                  let currentAngle = firstSegmentAngle !== null ? firstSegmentAngle : (directionMap[direction] ?? 0);

                  // Add the first angle to get the second segment's absolute direction
                  if (angles[0] != null) {
                    currentAngle += angles[0];
                  }

                  // Set this as the new first segment angle
                  setFirstSegmentAngle(currentAngle);
                }

                // Save state before removing first segment
                saveToHistory();

                const newLengths = lengths.slice(1);
                setLengths(newLengths);
                setAngles(prev => prev.slice(1));
                setDisplayLengths(prev => prev.slice(1));
                setDisplayAngles(prev => prev.slice(1));
                // If removing makes canvas empty, enable drawing mode
                if (newLengths.length === 0) {
                  setTemplateCreateMode(false);
                  setContinuousDrawing(true); // Enable drawing mode when empty
                  // Clear navigation state to remove template context
                  navigate(window.location.pathname, { replace: true, state: {} });
                }
              }}
            >
              <FiSkipBack size={24} />
            </button>

            {/* Clear/Delete Button */}
            <button
              className={`${styles.btn} ${styles.gray}`}
              title='Clear'
              onFocus={(e) => {
                e.target.style.outline = 'none';
              }}
              onBlur={(e) => {
                e.target.style.outline = '';
              }}
              onClick={() => {
                // 🗑 CLEAR: Always clear everything
                console.log('🗑️ CLEAR - Before:', {
                  lengths: lengths.length,
                  firstSegmentAngle,
                  direction,
                  continuousDrawing,
                  firstClickPoint,
                  originOffset
                });

                setDraggingPoints(null); // Clear dragging state first
                setLengths([]);
                setAngles([]);
                setDisplayAngles([]); // Clear display angles
                setDisplayLengths([]); // Clear display lengths
                setBaseLengths([]); // Clear base template lengths
                setBaseAngles([]); // Clear base template angles
                setFarLengths([]); // Clear taper far lengths
                setFarAngles([]); // Clear taper far angles
                setNearLengths([]); // Clear taper near lengths
                setNearAngles([]); // Clear taper near angles
                setShowTaper(false); // Exit taper mode
                // setReverseColor(false);
                setFlipH(false); // Reset flip horizontal
                setFlipV(false); // Reset flip vertical
                setCoordOffsets({}); // Reset label positions
                setFirstSegmentAngle(null); // Reset first segment angle
                // CRITICAL FIX: Reset color side auto-detection flag so new drawing can auto-detect
                // Without this, the flag stays true from Edit mode load and skips auto-detection
                hasAutoSetColorSideRef.current = false;
                console.log('🧹 Reset hasAutoSetColorSideRef.current = false (from Clear button)');
                // Also reset locked centroid correction for color positioning
                lockedCentroidCorrectionRef.current = null;
                console.log('🧹 Reset lockedCentroidCorrectionRef.current = null (from Clear button)');
                setSegmentAbsoluteAngles([]); // Reset absolute angles
                setFirstClickPoint(null); // Clear first click point
                setFirstClickPixelPos(null); // Clear pixel position
                setHoverPoint(null); // Clear hover point for preview
                setOriginOffset({ x: 0, y: 0 }); // Reset origin to default
                setCanvasOffset({ x: 0, y: 0 }); // Reset canvas position
                setCanvasScale(1); // Reset canvas zoom
                setPreservedShrinkFactor(null); // Reset preserved shrinkFactor
                setPreservedGirth(0); // Reset preserved girth
                setPreservedFarShrinkFactor(null); // Reset taper far shrinkFactor
                setPreservedFarGirth(0);
                setPreservedNearShrinkFactor(null); // Reset taper near shrinkFactor
                setPreservedNearGirth(0);
                setPoints([]); // Clear points
                setDirection('Right'); // Reset direction to default
                // Clear SF/SSF fold settings
                setStartFoldType('');
                setStartFoldLength(10); // Reset to default 10
                setEndFoldType('');
                setEndFoldLength(10); // Reset to default 10
                // Clear special state flags
                setHasEditedInTable(false); // Reset table edit flag
                setIsFromLibrary(false); // Reset library flag to prevent auto-focus useEffect from triggering
                // IMPORTANT: Always enable drawing mode after clear so user can start drawing
                setContinuousDrawing(true); // Enable drawing mode after clear
                setTemplateCreateMode(false); // Exit template create mode
                // Force re-render of Stage
                setResetKey(prev => prev + 1);

              // SPECIAL CONDITION: Check if this is Edit Drawing with NO template saved yet (no SWI record)
              // If isFromEditDrawingNoTemplate is true → Don't preserve edit mode (create new)
              // Otherwise → Preserve edit mode (update existing) - WORKING FLOW UNCHANGED
              const isInEditMode = location.state?.isEdit === true && !location.state?.isCopy && !location.state?.isFlip;

              const isFromEditWithNoTemplate = location.state?.isFromEditDrawingNoTemplate === true;

              const preservedState = (isInEditMode && !isFromEditWithNoTemplate) ? {
                isEdit: true,
                preservedTemplateId: templateId || location.state?.preservedTemplateId || location.state?.templateId,
                orderId: location.state?.orderId,
                orderNumber: location.state?.orderNumber,
                customerId: location.state?.customerId,
                customerName: location.state?.customerName,
                promiseDate: location.state?.promiseDate,
                enteredDate: location.state?.enteredDate,
                previousPage: location.state?.previousPage
              } : {
                // No SWI record - only preserve order context
                orderId: location.state?.orderId,
                orderNumber: location.state?.orderNumber,
                customerId: location.state?.customerId,
                customerName: location.state?.customerName,
                promiseDate: location.state?.promiseDate,
                enteredDate: location.state?.enteredDate,
                previousPage: location.state?.previousPage
              };

              console.log('🗑️ CLEAR - Decision:', {
                isInEditMode,
                isFromEditWithNoTemplate,
                willPreserveEditMode: isInEditMode && !isFromEditWithNoTemplate,
                behavior: (isInEditMode && !isFromEditWithNoTemplate)
                  ? '✅ UPDATE existing SWI record (working flow)'
                  : '🆕 CREATE new SWI record (special condition)',
                preservedState
              });

                console.log('🗑️ CLEAR - Before navigate, continuousDrawing set to true', {
                  isInEditMode,
                  isEditFlag: location.state?.isEdit,
                  templateIdFromURL: templateId,
                  preservedState
                });

                // Delay navigate to ensure all state updates complete first
                setTimeout(() => {
                  navigate(window.location.pathname, { replace: true, state: preservedState });
                }, 0);
              }}
              style={{
                color: '#fff',
                border: 'none',
                outline: 'none'
              }}
            >
              <FiTrash2 size={24} />
            </button>

            {/* Remove Last Button (RL) */}
            <button
              className={`${styles.btn} ${styles.gray}`}
              title="Remove Last"
              disabled={!hasValidDrawing}
              onClick={() => {
                if (!hasValidDrawing) return;
                // Save state before removing last segment
                saveToHistory();

                const newLengths = lengths.slice(0, -1);
                setLengths(newLengths);
                setAngles(prev => prev.slice(0, -1));
                setDisplayLengths(prev => prev.slice(0, -1));
                setDisplayAngles(prev => prev.slice(0, -1));
                if (newLengths.length === 0) {
                  setTemplateCreateMode(false);
                  setContinuousDrawing(true);
                  navigate(window.location.pathname, { replace: true, state: {
                    orderId: location.state?.orderId,
                    orderNumber: location.state?.orderNumber,
                    customerId: location.state?.customerId,
                    customerName: location.state?.customerName,
                    promiseDate: location.state?.promiseDate,
                    enteredDate: location.state?.enteredDate,
                    previousPage: location.state?.previousPage
                  } });
                }
              }}
              style={{
                border: 'none',
                outline: 'none',
                opacity: !hasValidDrawing ? 0.5 : 1,
                cursor: !hasValidDrawing ? 'not-allowed' : 'pointer'
              }}
            >
              <FiSkipForward size={24} />
            </button>

            {/* START Fold Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginLeft: '50px'}}>
              <span style={{ fontWeight: 'bold', fontSize: '12px' }}>START</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <select
                  value={startFoldType}
                  disabled={!hasValidDrawing}
                  onChange={(e) => {
                    if (!hasValidDrawing) return;
                    const newType = e.target.value;
                    setStartFoldType(newType);
                    if (newType && !startFoldLength) {
                      setStartFoldLength(10);
                      handleStartFold(newType, 10);
                    } else if (newType) {
                      handleStartFold(newType, startFoldLength);
                    } else {
                      setStartFoldSegment(null);
                    }
                  }}
                  style={{
                    width: '70px',
                    padding: '4px',
                    fontSize: '11px',
                    height: '28px',
                    border: '1px solid #bdbdbd',
                    borderRadius: '4px',
                    opacity: !hasValidDrawing ? 0.5 : 1,
                    cursor: !hasValidDrawing ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">Select</option>
                  <option value="Down">Up</option>
                  <option value="Up">Down</option>
                  <option value="OpenDn">OpenUp</option>
                  <option value="OpenUp">OpenDn</option>
                </select>
                <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <input
                    type="text"
                    value={startFoldLength}
                    disabled={!hasValidDrawing || !startFoldType}
                    onChange={(e) => {
                      if (!hasValidDrawing) return;
                      const value = e.target.value;
                      // Allow empty string
                      if (value === '') {
                        setStartFoldLength('');
                        setStartFoldLengthError('');
                        return;
                      }
                      // Only allow numeric input (digits only)
                      if (!/^\d*$/.test(value)) {
                        return; // Reject non-numeric input
                      }
                      const len = Number(value);

                      // Don't allow values greater than 2000
                      if (len > 2000) {
                        return; // Reject input
                      }

                      // Always save the value so user can see what they typed
                      setStartFoldLength(len);

                      // Check if fold is outside using centroid-based detection
                      const isOutside = isFoldOutside(startFoldType, false);

                      // Only apply max validation for INSIDE folds
                      if (!isOutside) {
                        // Inside fold - apply max validation
                        const parentLineLength = lengths[0] || Infinity;
                        if (len > parentLineLength) {
                          setStartFoldLengthError(`Max ${parentLineLength}mm`);
                        } else {
                          setStartFoldLengthError('');
                        }
                      } else {
                        // Outside fold - no limit (but still capped at 2000)
                        setStartFoldLengthError('');
                      }
                      // Always render the fold (even with error) so user can see full length
                      if (startFoldType) handleStartFold(startFoldType, len);
                    }}
                    maxLength={4}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // Blur to trigger any pending validation
                        e.target.blur();
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder="value"
                    style={{
                      width: '50px',
                      padding: '4px',
                      fontSize: '11px',
                      height: '28px',
                      border: (startFoldLengthError || (startFoldType && !startFoldLength)) ? '2px solid #d32f2f' : '1px solid #bdbdbd',
                      borderRadius: '4px',
                      color: (startFoldLengthError || (startFoldType && !startFoldLength)) ? '#d32f2f' : 'inherit',
                      backgroundColor: (startFoldLengthError || (startFoldType && !startFoldLength)) ? '#ffebee' : 'white',
                      fontWeight: (startFoldLengthError || (startFoldType && !startFoldLength)) ? '600' : 'normal',
                      opacity: (!hasValidDrawing || !startFoldType) ? 0.5 : 1,
                      cursor: (!hasValidDrawing || !startFoldType) ? 'not-allowed' : 'pointer'
                    }}
                  />
                  {(startFoldLengthError || (startFoldType && !startFoldLength)) && (
                    <span style={{
                      position: 'absolute',
                      top: '-16px',
                      left: '0',
                      fontSize: '10px',
                      fontWeight: '600',
                      color: '#d32f2f',
                      whiteSpace: 'nowrap',
                      zIndex: 1000,
                      background: '#ffebee',
                      padding: '1px 4px',
                      borderRadius: '2px'
                    }}>
                      {startFoldLengthError || 'Enter value'}
                    </span>
                  )}
                </div>
                {(startFoldType === 'OpenUp' || startFoldType === 'OpenDn') && (
                  <input
                    type="text"
                    placeholder="Gap"
                    value={startFoldGap}
                    disabled={!hasValidDrawing}
                    maxLength={3}
                    inputMode="numeric"
                    onChange={(e) => {
                      if (!hasValidDrawing) return;
                      const value = e.target.value;
                      // Only allow numeric input (digits only)
                      if (value === '' || /^\d*$/.test(value)) {
                        setStartFoldGap(value);
                      }
                    }}
                    style={{
                      width: '45px',
                      padding: '4px',
                      fontSize: '11px',
                      height: '28px',
                      border: '1px solid #bdbdbd',
                      borderRadius: '4px',
                      opacity: !hasValidDrawing ? 0.5 : 1,
                      cursor: !hasValidDrawing ? 'not-allowed' : 'pointer'
                    }}
                  />
                )}
              </div>
            </div>

            {/* END Fold Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '12px' }}>END</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <select
                  value={endFoldType}
                  disabled={!hasValidDrawing}
                  onChange={(e) => {
                    if (!hasValidDrawing) return;
                    const newType = e.target.value;
                    setEndFoldType(newType);
                    if (newType && !endFoldLength) {
                      setEndFoldLength(10);
                      handleEndFold(newType, 10);
                    } else if (newType) {
                      handleEndFold(newType, endFoldLength);
                    } else {
                      setEndFoldSegment(null);
                    }
                  }}
                  style={{
                    width: '70px',
                    padding: '4px',
                    fontSize: '11px',
                    height: '28px',
                    border: '1px solid #bdbdbd',
                    borderRadius: '4px',
                    opacity: !hasValidDrawing ? 0.5 : 1,
                    cursor: !hasValidDrawing ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">Select</option>
                  <option value="Up">Up</option>
                  <option value="Down">Down</option>
                  <option value="OpenUp">OpenUp</option>
                  <option value="OpenDn">OpenDn</option>
                </select>
                <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <input
                    type="text"
                    value={endFoldLength}
                    disabled={!hasValidDrawing || !endFoldType}
                    onChange={(e) => {
                      if (!hasValidDrawing) return;
                      const value = e.target.value;
                      // Allow empty string
                      if (value === '') {
                        setEndFoldLength('');
                        setEndFoldLengthError('');
                        return;
                      }
                      // Only allow numeric input (digits only)
                      if (!/^\d*$/.test(value)) {
                        return; // Reject non-numeric input
                      }
                      const len = Number(value);

                      // Don't allow values greater than 2000
                      if (len > 2000) {
                        return; // Reject input
                      }

                      // Always save the value so user can see what they typed
                      setEndFoldLength(len);

                      // Check if fold is outside using centroid-based detection
                      const isOutside = isFoldOutside(endFoldType, true);

                      // Check if last segment is diagonal (angle not 90°, -90°, 180°, or 0°)
                      // For diagonal END segments, always apply max validation regardless of inside/outside
                      const lastAngle = angles.length > 0 ? Math.abs(Number(angles[angles.length - 1])) : 0;
                      const isDiagonalEnd = lastAngle !== 0 && lastAngle !== 90 && lastAngle !== 180;

                      // Apply max validation for INSIDE folds OR diagonal END segments
                      if (!isOutside || isDiagonalEnd) {
                        // Inside fold OR diagonal end segment - apply max validation
                        const parentLineLength = lengths[lengths.length - 1] || Infinity;
                        if (len > parentLineLength) {
                          setEndFoldLengthError(`Max ${parentLineLength}mm`);
                        } else {
                          setEndFoldLengthError('');
                        }
                      } else {
                        // Outside fold on non-diagonal segment - no limit (but still capped at 2000)
                        setEndFoldLengthError('');
                      }
                      // Always render the fold (even with error) so user can see full length
                      if (endFoldType) handleEndFold(endFoldType, len);
                    }}
                    maxLength={4}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.target.blur();
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder="value"
                    style={{
                      width: '50px',
                      padding: '4px',
                      fontSize: '11px',
                      height: '28px',
                      border: (endFoldLengthError || (endFoldType && !endFoldLength)) ? '2px solid #d32f2f' : '1px solid #bdbdbd',
                      borderRadius: '4px',
                      color: (endFoldLengthError || (endFoldType && !endFoldLength)) ? '#d32f2f' : 'inherit',
                      backgroundColor: (endFoldLengthError || (endFoldType && !endFoldLength)) ? '#ffebee' : 'white',
                      fontWeight: (endFoldLengthError || (endFoldType && !endFoldLength)) ? '600' : 'normal',
                      opacity: (!hasValidDrawing || !endFoldType) ? 0.5 : 1,
                      cursor: (!hasValidDrawing || !endFoldType) ? 'not-allowed' : 'pointer'
                    }}
                  />
                  {(endFoldLengthError || (endFoldType && !endFoldLength)) && (
                    <span style={{
                      position: 'absolute',
                      top: '-16px',
                      left: '0',
                      fontSize: '10px',
                      fontWeight: '600',
                      color: '#d32f2f',
                      whiteSpace: 'nowrap',
                      zIndex: 1000,
                      background: '#ffebee',
                      padding: '1px 4px',
                      borderRadius: '2px'
                    }}>
                      {endFoldLengthError || 'Enter value'}
                    </span>
                  )}
                </div>
                {(endFoldType === 'OpenUp' || endFoldType === 'OpenDn') && (
                  <input
                    type="text"
                    placeholder="Gap"
                    value={endFoldGap}
                    disabled={!hasValidDrawing}
                    maxLength={3}
                    inputMode="numeric"
                    onChange={(e) => {
                      if (!hasValidDrawing) return;
                      const value = e.target.value;
                      // Only allow numeric input (digits only)
                      if (value === '' || /^\d*$/.test(value)) {
                        setEndFoldGap(value);
                      }
                    }}
                    style={{
                      width: '45px',
                      padding: '4px',
                      fontSize: '11px',
                      height: '28px',
                      border: '1px solid #bdbdbd',
                      borderRadius: '4px',
                      opacity: !hasValidDrawing ? 0.5 : 1,
                      cursor: !hasValidDrawing ? 'not-allowed' : 'pointer'
                    }}
                  />
                )}
              </div>
            </div>

            {/* Save Icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginLeft: '50px' }}>
              {/* Save to Library */}
              {RolePermission && RolePermission.SaveDrawingLibrary && RolePermission.SaveDrawingLibrary.add === "1" && (
              <button
                className={`${styles.btn} ${styles.gray}`}
                onClick={hasValidDrawing && !isSaving ? handleSave : undefined}
                disabled={!hasValidDrawing || isSaving}
                title="Save to Library"
                style={{
                  border: savedToLibrary ? '3px solid #4CAF50' : 'none',
                  outline: 'none',
                  backgroundColor: savedToLibrary ? '#E8F5E9' : '',
                  borderRadius: '4px',
                  opacity: (!hasValidDrawing || isSaving) ? 0.5 : 1,
                  cursor: (!hasValidDrawing || isSaving) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                <FiSave size={24} color={savedToLibrary ? '#4CAF50' : 'inherit'} />
              </button>
              )}

              {/* My Library */}
              <button
                className={`${styles.btn} ${styles.gray}`}
                onClick={hasValidDrawing && !isSaving ? handleMyLibrarySave : undefined}
                disabled={!hasValidDrawing || isSaving}
                title="My Library"
                style={{
                  border: savedToMyLibrary ? '3px solid #4CAF50' : 'none',
                  outline: 'none',
                  backgroundColor: savedToMyLibrary ? '#E8F5E9' : '',
                  borderRadius: '4px',
                  opacity: (!hasValidDrawing || isSaving) ? 0.5 : 1,
                  cursor: (!hasValidDrawing || isSaving) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                <FiFolder size={24} color={savedToMyLibrary ? '#4CAF50' : 'inherit'} />
              </button>

              {/* Customer Library */}
              {RolePermission && RolePermission.SaveDrawingLibrary && RolePermission.SaveDrawingLibrary.add === "1" && (
              <button
                className={`${styles.btn} ${styles.gray}`}
                onClick={hasValidDrawing && !isSaving ? handleCustomerLibrarySave : undefined}
                disabled={!hasValidDrawing || isSaving}
                title="Customer Library"
                style={{
                  border: savedToCustomerLibrary ? '3px solid #4CAF50' : 'none',
                  outline: 'none',
                  backgroundColor: savedToCustomerLibrary ? '#E8F5E9' : '',
                  borderRadius: '4px',
                  opacity: (!hasValidDrawing || isSaving) ? 0.5 : 1,
                  cursor: (!hasValidDrawing || isSaving) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                <FiUsers size={24} color={savedToCustomerLibrary ? '#4CAF50' : 'inherit'} />
              </button>
              )}
            </div>

            {/* Quick Library */}
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginLeft: 'auto', paddingLeft: '50px' }}
              tabIndex={0}
              onKeyDown={(e) => {
                if (libraryPartClasses.length === 0) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePartClassClick(libraryPartClasses[currentPartClassIndex]);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const newIndex = currentPartClassIndex > 0 ? currentPartClassIndex - 1 : libraryPartClasses.length - 1;
                  setCurrentPartClassIndex(newIndex);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const newIndex = currentPartClassIndex < libraryPartClasses.length - 1 ? currentPartClassIndex + 1 : 0;
                  setCurrentPartClassIndex(newIndex);
                }
              }}
              onFocus={() => quickLibraryInputRef.current?.focus()}
            >
              <span style={{ fontWeight: 'bold', fontSize: '12px' }}>QUICK LIBRARY</span>
              <div style={{
                position: 'relative',
                width: '150px'
              }}>
                <input
                  ref={quickLibraryInputRef}
                  type="text"
                  readOnly
                  value={
                    loadingLibrary ? 'Loading...' :
                      libraryPartClasses.length === 0 ? 'No items' :
                        libraryPartClasses[currentPartClassIndex] || 'My Library'
                  }
                  onClick={() => {
                    if (libraryPartClasses.length > 0) {
                      handlePartClassClick(libraryPartClasses[currentPartClassIndex]);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && libraryPartClasses.length > 0) {
                      handlePartClassClick(libraryPartClasses[currentPartClassIndex]);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (libraryPartClasses.length > 0) {
                        const newIndex = currentPartClassIndex > 0 ? currentPartClassIndex - 1 :
                          libraryPartClasses.length - 1;
                        setCurrentPartClassIndex(newIndex);
                      }
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (libraryPartClasses.length > 0) {
                        const newIndex = currentPartClassIndex < libraryPartClasses.length - 1 ?
                          currentPartClassIndex + 1 : 0;
                        setCurrentPartClassIndex(newIndex);
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '4px 25px 4px 8px',
                    fontSize: '11px',
                    border: '1px solid #bdbdbd',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    cursor: libraryPartClasses.length > 0 ? 'pointer' : 'default',
                    textAlign: 'left',
                    outline: 'none',
                    height: '28px',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#bdbdbd'}
                  placeholder="My Library"
                />

                {/* Spinner arrows */}
                <div style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '14px',
                  height: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '0px'
                }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (libraryPartClasses.length > 0) {
                        const newIndex = currentPartClassIndex > 0 ? currentPartClassIndex - 1 :
                          libraryPartClasses.length - 1;
                        setCurrentPartClassIndex(newIndex);
                      }
                    }}
                    disabled={libraryPartClasses.length === 0}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: '0',
                      cursor: libraryPartClasses.length > 0 ? 'pointer' : 'default',
                      color: libraryPartClasses.length > 0 ? '#555' : '#ccc',
                      transition: 'color 0.2s',
                      height: '10px',
                      width: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: '1'
                    }}
                    onMouseEnter={(e) => { if (libraryPartClasses.length > 0) e.currentTarget.style.color = '#000'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                    title="Previous part class"
                  >
                    <span style={{ fontSize: '10px', lineHeight: '1' }}>▲</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (libraryPartClasses.length > 0) {
                        const newIndex = currentPartClassIndex < libraryPartClasses.length - 1 ?
                          currentPartClassIndex + 1 : 0;
                        setCurrentPartClassIndex(newIndex);
                      }
                    }}
                    disabled={libraryPartClasses.length === 0}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: '0',
                      cursor: libraryPartClasses.length > 0 ? 'pointer' : 'default',
                      color: libraryPartClasses.length > 0 ? '#555' : '#ccc',
                      transition: 'color 0.2s',
                      height: '10px',
                      width: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: '1'
                    }}
                    onMouseEnter={(e) => { if (libraryPartClasses.length > 0) e.currentTarget.style.color = '#000'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                    title="Next part class"
                  >
                    <span style={{ fontSize: '10px', lineHeight: '1' }}>▼</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Continue/Stop Drawing button removed - use ESC key to stop drawing */}

        </div>
      )}

      <Grid container gap={1}>
        <Grid item lg={showTaper ? 12 : 10.44} style={{ flex: 1 }} ref={canvasContainerRef} position={'relative'}>

          {/* ═══════════════════════════════════════════════════════════════
              MAIN RENDER: TAPER MODE vs NORMAL MODE
              Conditional rendering based on showTaper state
              - TAPER MODE: Split view with Far and Near canvases side-by-side
              - NORMAL MODE: Single canvas with full controls
              ═══════════════════════════════════════════════════════════════ */}
          {showTaper ? (
            <Grid container spacing={2} sx={{ position: 'relative', paddingTop: '10px' }}>
              {/* Back Button - Positioned in Grid */}
              <Grid item xs={12} sx={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10 }}>
                <button
                  className={`${styles.btn} ${styles.gray}`}
                  style={{
                    minWidth: 'fit-content',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px'
                  }}
                  tabIndex={-1}
                  onClick={() => navigate('/template-library', {
                    state: {
                      orderNumber,
                      customerName,
                      customerId,
                      orderId,
                      deliveryDate: promiseDate,
                      enteredDate,
                      partGroup: 'Flashing',
                      partClass: 'My Library',
                      currentPage: location.state?.previousPage || 'designers'
                    }
                  })}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              </Grid>

              {/* Main content area */}
              {/* <div style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 10,
                width: '100%',
                justifyContent: 'space-evenly',
                padding: '0',
                flex: 1,
                alignItems: 'flex-start'
              }}> */}

              {/* FAR VIEW - Left Half */}
              <Grid item xs={12} md={6}>
                {/* Far Label */}
                <Grid container justifyContent="center" sx={{ marginBottom: '10px' }}>
                  <Grid item>
                    <Typography variant="h4" fontWeight="bold" fontSize="clamp(20px, 2vw, 28px)">
                      Far
                    </Typography>
                  </Grid>
                </Grid>

                {/* Far Canvas and Table */}
                <Grid container spacing={1}>
                  {/* Far Canvas */}
                  <Grid item xs={12} md={9} lg={10}>
                    <Stage
                      width={farStageWidth}
                      height={gridHeight} // Use dynamic grid height instead of fixed dynamicStageHeight
                      ref={farRef}
                      className={styles.gridBackground}
                      pixelRatio={2}
                      style={{
                        maxWidth: '100%',
                        height: 'auto'
                      }}>
                      <Layer>
                        <Group
                          scaleX={canvasScale}
                          scaleY={canvasScale}
                          x={farStageWidth / 2}
                          y={gridHeight / 2}
                          offsetX={farStageWidth / 2}
                          offsetY={gridHeight / 2}
                        >
                          {drawLines(farPts, farScale, farOffsetX, farOffsetY, farLengths, farAngles, displayAngles, false, true, 'far')}
                        </Group>
                      </Layer>
                    </Stage>
                  </Grid>


                  {/* Far Ln/Ang + Controls */}
                  <Grid item xs={12} md={3} lg={2}>
                    {/* Zero or empty length error message for far lengths */}
                    {(farLengths.some(l => l === 0) || farLengths.some(l => l === '' || l === null || l === undefined)) && (
                      <div style={{
                        backgroundColor: '#ffebee',
                        color: '#d32f2f',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textAlign: 'center',
                        marginBottom: '4px',
                        border: '1px solid #d32f2f'
                      }}>
                        {farLengths.some(l => l === '' || l === null || l === undefined) ? 'Length cannot be empty' : 'Length cannot be 0'}
                      </div>
                    )}
                    {hasAngleOver180 && (
                      <div style={{
                        backgroundColor: '#ffebee',
                        color: '#d32f2f',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textAlign: 'center',
                        marginBottom: '4px',
                        border: '1px solid #d32f2f'
                      }}>
                        Angle cannot be more than 180°
                      </div>
                    )}
                    {/* Far Ln/Ang Table */}
                    <Grid container spacing={1}>
                      <Grid item xs={12}>
                        <div className={styles.taperTable} style={{
                          minWidth: '100px',
                          maxWidth: '100%'
                        }}>
                          <div className={styles.tableHeader}>
                            <span>Ln</span><span>Ang</span>
                          </div>
                          <div className={styles.tableBody} style={{
                            maxHeight: '307px',
                            overflowY: 'auto',
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#999 #f1f1f1'
                          }}>
                            {farLengths.map((ln, i) => (
                              <div key={i} className={styles.tableRow}>
                                {/* ——— Ln cell ——— */}
                                <input
                                  ref={el => farLengthRefs.current[i] = el}
                                  type="text"
                                  className={`${styles.taperInput} ${styles.noSpinner}`}
                                  inputMode="numeric"
                                  tabIndex={1 + i * 2}
                                  style={ln === 0 ? {
                                    border: '2px solid #d32f2f',
                                    backgroundColor: '#ffebee',
                                    color: '#d32f2f'
                                  } : {}}
                                  onMouseDown={() => {
                                    // Stop continuous drawing when user clicks on length input
                                    // Using onMouseDown instead of onFocus to avoid triggering on programmatic focus
                                    if (continuousDrawing) {
                                      setContinuousDrawing(false);
                                    }
                                  }}
                                  onMouseUp={(e) => { const target = e.target; setTimeout(() => target.select(), 0); }}
                                  onFocus={e => {
                                    // Save state before user edits the value
                                    saveToHistory();
                                    e.target.select();
                                    e.target.style.outline = '1px solid #ccc';
                                    e.target.style.outlineOffset = '0px';
                                    // Highlight corresponding label on canvas
                                    setEditingIndex({ type: 'length', index: i, profile: 'far' });
                                  }}
                                  onBlur={e => {
                                    e.target.style.outline = '';
                                    e.target.style.outlineOffset = '';
                                    // Clear highlight
                                    setEditingIndex({ type: null, index: null, profile: null });
                                  }}
                                  onWheel={e => e.target.blur()}
                                  value={ln === '' ? '' : ln}
                                  maxLength={4}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Tab' && !e.shiftKey) {
                                      e.preventDefault();
                                      // Navigate to next far length, then to first far angle, then loop to near
                                      if (i < farLengths.length - 1 && farLengthRefs.current?.[i + 1]) {
                                        farLengthRefs.current[i + 1]?.focus();
                                      } else if (farAngles.length > 0 && farAngleRefs.current?.[0]) {
                                        // After last Far length, go to first Far angle
                                        farAngleRefs.current[0]?.focus();
                                      } else {
                                        // No angles - if Finish disabled, loop to first Near; else go to Finish
                                        if (hasZeroLength || hasEmptyLength) {
                                          nearLengthRefs.current[0]?.focus();
                                        } else {
                                          nearLengthRefs.current[0]?.focus();
                                        }
                                      }
                                    } else if (e.key === 'Tab' && e.shiftKey) {
                                      e.preventDefault();
                                      // Navigate to previous far length or go to Finish button
                                      if (i > 0 && farLengthRefs.current?.[i - 1]) {
                                        farLengthRefs.current[i - 1]?.focus();
                                      } else {
                                        // At first FAR length, go to Finish button
                                        finishButtonRef.current?.focus();
                                      }
                                    }
                                  }}
                                  onChange={e => {
                                    const next = [...farLengths]
                                    const v = e.target.value

                                    if (v === '') {
                                      // Store current value as display length before clearing
                                      if (farLengths[i] && farLengths[i] !== '') {
                                        const nextDisplay = [...displayLengths];
                                        nextDisplay[i] = farLengths[i];
                                        setDisplayLengths(nextDisplay);
                                      }
                                      next[i] = '';
                                    } else {
                                      const parsedValue = Number(v) || 0;
                                      next[i] = parsedValue;

                                      // Check if the new value triggers a scaling range change (same as normal mode)
                                      const oldValue = farLengths[i] || 0;
                                      const needsRescaling = (
                                        // Crossing into/out of 1000+ range
                                        (oldValue < 1000 && parsedValue >= 1000) ||
                                        (oldValue >= 1000 && parsedValue < 1000) ||
                                        // Crossing into/out of 500-999 range
                                        (oldValue < 500 && parsedValue >= 500) ||
                                        (oldValue >= 500 && parsedValue < 500) ||
                                        // Crossing into/out of 100-499 range
                                        (oldValue < 100 && parsedValue >= 100) ||
                                        (oldValue >= 100 && parsedValue < 100) ||
                                        // Crossing into/out of 11-99 range
                                        (oldValue < 11 && parsedValue >= 11) ||
                                        (oldValue >= 11 && parsedValue < 11) ||
                                        // Crossing into/out of 0-10 range
                                        (oldValue > 10 && parsedValue <= 10) ||
                                        (oldValue <= 10 && parsedValue > 10)
                                      );

                                      // Set the flag to trigger rescaling if needed
                                      if (needsRescaling) {
                                        console.log(`Taper Far: Value change from ${oldValue} to ${parsedValue} triggers rescaling`);
                                        setHasEditedInTable(true);
                                        // GIRTH-BASED SCALING: Stop continuous drawing and reset canvas
                                        setContinuousDrawing(false);
                                        setCanvasOffset({ x: 0, y: 0 });
                                        setCanvasScale(1); // Reset zoom to default
                                      }

                                      // Update display length with new valid value
                                      const nextDisplay = [...displayLengths];
                                      nextDisplay[i] = parsedValue;
                                      setDisplayLengths(nextDisplay);
                                    }

                                    setFarLengths(next)
                                  }}
                                />

                                {/* ——— Ang cell or blank placeholder ——— */}
                                {i < farAngles.length ? (
                                  <input
                                    ref={el => farAngleRefs.current[i] = el}
                                    type="text"
                                    className={`${styles.taperInput} ${styles.noSpinner}`}
                                    inputMode="numeric"
                                    tabIndex={100 + i * 2}
                                    onMouseUp={(e) => { const target = e.target; setTimeout(() => target.select(), 0); }}
                                    onFocus={e => {
                                      // Save state before user edits the value
                                      saveToHistory();
                                      // Stop continuous drawing when user clicks on angle input
                                      // This prevents Tab handler from redirecting to length
                                      if (continuousDrawing) {
                                        setContinuousDrawing(false);
                                      }
                                      if (!farAngleRefs.current.originalAngles) {
                                        farAngleRefs.current.originalAngles = {};
                                      }
                                      const currentNormalized = (farAngles[i] !== '' && farAngles[i] !== '-' && farAngles[i] !== null && farAngles[i] !== undefined)
                                        ? normalizeDegrees(farAngles[i])
                                        : farAngles[i];
                                      farAngleRefs.current.originalAngles[i] = currentNormalized;
                                      e.target.select();
                                      e.target.style.outline = '1px solid #ccc';
                                      e.target.style.outlineOffset = '0px';
                                      // Highlight corresponding label on canvas
                                      setEditingIndex({ type: 'angle', index: i, profile: 'far' });
                                    }}
                                    onBlur={e => {
                                      // Update actual angles when user leaves the field
                                      let v = displayAngles[i] !== undefined ? displayAngles[i] : farAngles[i];

                                      // Sanitize: remove trailing +/- that user may have accidentally typed
                                      if (typeof v === 'string') {
                                        v = v.replace(/[+\-]+$/, '');
                                      }

                                      if (v === '' || v === '-') {
                                        // Handle empty input - check if previous angle should be restored (matching normal mode)
                                        const previousAngle = farAngles[i];
                                        const previousAngleStr = String(previousAngle);

                                        if (previousAngle !== undefined &&
                                          previousAngle !== null &&
                                          previousAngle !== '' &&
                                          previousAngleStr.length > 1) {
                                          // Restore the previous angle
                                          const nextDisplay = [...displayAngles];
                                          nextDisplay[i] = previousAngle;
                                          setDisplayAngles(nextDisplay);
                                        } else {
                                          // Set to 0 if no valid previous angle
                                          const next = [...farAngles];
                                          next[i] = 0;
                                          const trimmed = next.slice(0, Math.max(0, farLengths.length - 1));
                                          setFarAngles(trimmed);
                                          setNearAngles(trimmed);
                                          setAngles(trimmed);
                                          setDisplayAngles(trimmed);
                                        }
                                        e.target.style.outline = '';
                                        e.target.style.outlineOffset = '';
                                        // Clear highlight
                                        setEditingIndex({ type: null, index: null, profile: null });
                                        return;
                                      }

                                      const inputValue = Number(v);
                                      const absInput = Math.abs(inputValue);

                                      // Angle > 180 validation
                                      if (absInput > 180) {
                                        // Restore geometry arrays only (keep displayAngles showing the invalid value + error)
                                        const prevAngle = farAngleRefs.current.originalAngles?.[i];
                                        const restoreAngle = (prevAngle !== undefined && prevAngle !== null) ? prevAngle : 0;
                                        const next = [...farAngles];
                                        next[i] = restoreAngle;
                                        const trimmed = next.slice(0, Math.max(0, farLengths.length - 1));
                                        setFarAngles(trimmed);
                                        setNearAngles(trimmed);
                                        setAngles(trimmed);
                                        // Don't restore displayAngles - keep showing invalid value so error persists
                                        e.target.style.outline = '';
                                        e.target.style.outlineOffset = '';
                                        setEditingIndex({ type: null, index: null, profile: null });
                                        return;
                                      }

                                      const originalAngle = farAngleRefs.current.originalAngles?.[i];

                                      let finalAngle;
                                      if (originalAngle === undefined || originalAngle === null || originalAngle === '' || originalAngle === '-' || originalAngle === 0) {
                                        finalAngle = normalizeDegrees(absInput);
                                      } else {
                                        finalAngle = originalAngle >= 0 ? absInput : -absInput;
                                        finalAngle = normalizeDegrees(finalAngle);
                                      }

                                      const next = [...farAngles];
                                      next[i] = finalAngle;
                                      const trimmed = next.slice(0, Math.max(0, farLengths.length - 1));
                                      setFarAngles(trimmed);
                                      setNearAngles(trimmed);
                                      setAngles(trimmed);
                                      // FIX: Also sync displayAngles so Near table shows updated value
                                      setDisplayAngles(trimmed);

                                      //Code change by rahul
                                      // NEW CODE FOR SEGMENT 0 ROTATION (Far Angles)
                                      if (i === 0 && segmentAbsoluteAngles.length > 0) {
                                        const secondSegmentAngle = segmentAbsoluteAngles[1]; // Angle of second segment (stays fixed)
                                        const newFirstSegmentAngle = normalizeDegrees(secondSegmentAngle - finalAngle);

                                        // Update all absolute angles starting from the new first segment angle
                                        const updatedAbsoluteAngles = [newFirstSegmentAngle];
                                        for (let j = 1; j < segmentAbsoluteAngles.length; j++) {
                                          const prevAngle = updatedAbsoluteAngles[j - 1];
                                          const turnAngle = trimmed[j - 1] || 0;
                                          updatedAbsoluteAngles.push(normalizeDegrees(prevAngle + turnAngle));
                                        }
                                        setSegmentAbsoluteAngles(updatedAbsoluteAngles);

                                        // Update firstSegmentAngle if second segment is vertical
                                        for (let j = 0; j < updatedAbsoluteAngles.length; j++) {
                                          const angle = updatedAbsoluteAngles[j];
                                          if (Math.abs(angle - 90) < 1.0 || Math.abs(angle + 90) < 1.0) {
                                            if (j === 1) {
                                              setFirstSegmentAngle(newFirstSegmentAngle);
                                            }
                                            break;
                                          }
                                        }
                                      } else if (segmentAbsoluteAngles.length > 0) {
                                        // For non-first angles, update subsequent segments
                                        const updatedAbsoluteAngles = [...segmentAbsoluteAngles];
                                        const updatedAngles = [...farAngles];
                                        updatedAngles[i] = finalAngle;

                                        if (i + 1 < updatedAbsoluteAngles.length) {
                                          for (let j = i + 1; j < updatedAbsoluteAngles.length; j++) {
                                            const prevSegmentAngle = updatedAbsoluteAngles[j - 1];
                                            const turnAngle = updatedAngles[j - 1] || 0;
                                            updatedAbsoluteAngles[j] = normalizeDegrees(prevSegmentAngle + turnAngle);
                                          }
                                        }
                                        setSegmentAbsoluteAngles(updatedAbsoluteAngles);

                                        // Recalculate points with updated angles
                                        const newPoints = calculatePointsLocal(farLengths, trimmed, direction, updatedAbsoluteAngles, displayLengths, false);
                                        setPoints(newPoints);
                                        skipPointRecalc.current = true;
                                      }

                                      e.target.style.outline = '';
                                      e.target.style.outlineOffset = '';
                                      // Clear highlight
                                      setEditingIndex({ type: null, index: null, profile: null });
                                    }}
                                    onWheel={e => e.target.blur()}
                                    value={(() => {
                                      // FIX: Normalize angle display to match Near table and drawing labels
                                      const rawValue = displayAngles[i] !== undefined ? displayAngles[i] : farAngles[i];
                                      if (rawValue === '' || rawValue === null || rawValue === undefined || rawValue === '-') return rawValue || '';
                                      const numValue = Number(rawValue);
                                      if (isNaN(numValue)) return rawValue;
                                      // Don't normalize if > 180 - show raw value so user sees what they typed
                                      if (Math.abs(numValue) > 180) return numValue;
                                      return normalizeDegrees(numValue);
                                    })()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        // Trigger blur to update the angle
                                        e.target.blur();
                                      } else if (e.key === 'Tab' && !e.shiftKey) {
                                        e.preventDefault();
                                        // Trigger update before moving to next field
                                        e.target.blur();
                                        setTimeout(() => {
                                          // Navigate to next far angle or first near length
                                          if (i < farAngles.length - 1 && farAngleRefs.current?.[i + 1]) {
                                            farAngleRefs.current[i + 1]?.focus();
                                          } else if (nearLengthRefs.current?.[0]) {
                                            nearLengthRefs.current[0]?.focus();
                                          } else {
                                            // Go to Taper button if no near lengths
                                            taperButtonRef.current?.focus();
                                          }
                                        }, 0);
                                      } else if (e.key === 'Tab' && e.shiftKey) {
                                        e.preventDefault();
                                        // Trigger update before moving to previous field
                                        e.target.blur();
                                        setTimeout(() => {
                                          // Navigate to previous far angle or last far length
                                          if (i > 0 && farAngleRefs.current?.[i - 1]) {
                                            farAngleRefs.current[i - 1]?.focus();
                                          } else if (farLengthRefs.current?.[farLengths.length - 1]) {
                                            farLengthRefs.current[farLengths.length - 1]?.focus();
                                          }
                                        }, 0);
                                      }
                                    }}
                                    onChange={e => {
                                      // Update both display value AND actual angles immediately (like length input)
                                      const v = e.target.value;

                                      // Only allow: empty, minus sign, or optional +/- prefix followed by digits only
                                      // Reject any special characters, alphabets, etc.
                                      if (v !== '' && v !== '-' && !/^[+-]?\d+$/.test(v)) {
                                        return; // Reject invalid input
                                      }

                                      const nextDisplay = [...displayAngles];
                                      nextDisplay[i] = v;
                                      setDisplayAngles(nextDisplay.slice(0, Math.max(0, farLengths.length - 1)));

                                      // CRITICAL FIX: Only apply angle changes when input has 2 or more digits
                                      // This prevents premature application when typing multi-digit angles
                                      if (v === '' || v === '-') {
                                        // If empty, set to 0 but DON'T apply geometry changes yet
                                        // Just update the display - user is still editing
                                        return;
                                      }

                                      const inputValue = Number(v);
                                      if (isNaN(inputValue)) return; // Invalid input, skip update

                                      // Only apply angle changes when we have 2 or more digits
                                      // This allows users to type multi-digit angles without premature application
                                      // Also prevents application when clearing a value (empty string was already handled above)
                                      const hasMinimumDigits = Math.abs(inputValue) >= 10 || v.length >= 2;

                                      if (!hasMinimumDigits) {
                                        // Still updating, don't apply angle changes yet
                                        // This covers: typing first digit, or after clearing when typing new value
                                        return;
                                      }

                                      const absInput = Math.abs(inputValue);

                                      // Angle > 180 validation - restore original angle to undo any intermediate changes
                                      if (absInput > 180) {
                                        // Restore original angle to ALL arrays (undo intermediate e.g. "20" from "200")
                                        const prevAngle = farAngleRefs.current.originalAngles?.[i];
                                        const restoreAngle = (prevAngle !== undefined && prevAngle !== null) ? prevAngle : 0;
                                        const next = [...farAngles];
                                        next[i] = restoreAngle;
                                        const trimmed = next.slice(0, Math.max(0, farLengths.length - 1));
                                        setFarAngles(trimmed);
                                        setNearAngles(trimmed);
                                        setAngles(trimmed);
                                        return;
                                      }

                                      const originalAngle = farAngleRefs.current.originalAngles?.[i];

                                      let finalAngle;
                                      if (originalAngle === undefined || originalAngle === null || originalAngle === '' || originalAngle === '-' || originalAngle === 0) {
                                        finalAngle = normalizeDegrees(absInput);
                                      } else {
                                        finalAngle = originalAngle >= 0 ? absInput : -absInput;
                                        finalAngle = normalizeDegrees(finalAngle);
                                      }

                                      const next = [...farAngles];
                                      next[i] = finalAngle;
                                      const trimmed = next.slice(0, Math.max(0, farLengths.length - 1));
                                      setFarAngles(trimmed);
                                      setNearAngles(trimmed);
                                      setAngles(trimmed);
                                      // FIX: Sync displayAngles so Near table shows updated value
                                      setDisplayAngles(trimmed);

                                      // Handle segment rotation logic for first segment
                                      if (i === 0 && segmentAbsoluteAngles.length > 0) {
                                        const secondSegmentAngle = segmentAbsoluteAngles[1];
                                        const newFirstSegmentAngle = normalizeDegrees(secondSegmentAngle - finalAngle);

                                        const updatedAbsoluteAngles = [newFirstSegmentAngle];
                                        for (let j = 1; j < segmentAbsoluteAngles.length; j++) {
                                          const prevAngle = updatedAbsoluteAngles[j - 1];
                                          const turnAngle = trimmed[j - 1] || 0;
                                          updatedAbsoluteAngles.push(normalizeDegrees(prevAngle + turnAngle));
                                        }
                                        setSegmentAbsoluteAngles(updatedAbsoluteAngles);

                                        for (let j = 0; j < updatedAbsoluteAngles.length; j++) {
                                          const angle = updatedAbsoluteAngles[j];
                                          if (Math.abs(angle - 90) < 1.0 || Math.abs(angle + 90) < 1.0) {
                                            if (j === 1) {
                                              setFirstSegmentAngle(newFirstSegmentAngle);
                                            }
                                            break;
                                          }
                                        }
                                      } else if (segmentAbsoluteAngles.length > 0) {
                                        const updatedAbsoluteAngles = [...segmentAbsoluteAngles];
                                        const updatedAngles = [...farAngles];
                                        updatedAngles[i] = finalAngle;

                                        if (i + 1 < updatedAbsoluteAngles.length) {
                                          for (let j = i + 1; j < updatedAbsoluteAngles.length; j++) {
                                            const prevSegmentAngle = updatedAbsoluteAngles[j - 1];
                                            const turnAngle = updatedAngles[j - 1] || 0;
                                            updatedAbsoluteAngles[j] = normalizeDegrees(prevSegmentAngle + turnAngle);
                                          }
                                        }
                                        setSegmentAbsoluteAngles(updatedAbsoluteAngles);

                                        const newPoints = calculatePointsLocal(farLengths, trimmed, direction, updatedAbsoluteAngles, displayLengths, false);
                                        setPoints(newPoints);
                                        skipPointRecalc.current = true;
                                      }
                                    }}
                                  />
                                ) : (
                                  <div style={{ flex: 1 }} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </Grid>

                      {/* Girth/Bends & Buttons */}
                      {/* Girth Display */}
                      <Grid item xs={12} sx={{ marginTop: '10px' }}  style={{display:'flex', justifyContent:'space-evenly'}}>
                        <Typography
                          className={`${styles.girth} ${styles.girthDisplay}`}>
                          <span style={{ fontWeight: 'bold' }}>G: {getGirth(farLengths, startFoldType, startFoldLength, endFoldType, endFoldLength)}</span>
                          {' | '}
                          <span style={{ fontWeight: 'bold' }}>B: {(() => {
                            const hasFolds = startFoldType || endFoldType;

                            // Count base bends - angles in 170-180 range count as 2 bends
                            let baseBends = 0;
                            if (farAngles.length > 0) {
                              for (let i = 0; i < farAngles.length; i++) {
                                const absAngle = Math.abs(farAngles[i]);
                                // Angles between 170-180 degrees are fold-backs, count as 2 bends
                                if (absAngle >= 170 && absAngle <= 180) {
                                  baseBends += 2;
                                } else {
                                  baseBends += 1;
                                }
                              }
                            }

                            let bends = 0;

                            if (hasFolds) {
                              // When there are folds, ALWAYS ignore base geometry and count ONLY fold bends
                              bends = baseBends; // Start with base bends from angles

                              // Add fold bends
                              if (startFoldType === 'Up' || startFoldType === 'Down' || startFoldType === 'OpenUp' || startFoldType === 'OpenDn') {
                                bends += 2;
                              }
                              if (endFoldType === 'Up' || endFoldType === 'Down' || endFoldType === 'OpenUp' || endFoldType === 'OpenDn') {
                                bends += 2;
                              }
                            } else {
                              // No folds: count base geometry bends, minimum 1 for straight line
                              bends = Math.max(1, baseBends);
                            }

                            return bends;
                          })()}</span>
                        </Typography>
                      </Grid>


                      {/* Taper Toggle Button */}
                      <Grid item xs={12}>
                        <button
                          className={`${styles.btn} ${styles.gray} ${styles.girthDisplay}`}
                          tabIndex={-1}
                          onFocus={(e) => {
                            e.target.style.outline = '1px solid #ccc';
                            e.target.style.outlineOffset = '0px';
                          }}
                          onBlur={(e) => {
                            e.target.style.outline = '';
                            e.target.style.outlineOffset = '';
                          }}
                          onClick={() => {
                            if (showTaper) {
                              // Coming back to normal mode → copy Far side data to normal mode
                              setLengths([...farLengths]);
                              setAngles([...farAngles]);
                              // FIX: Sync displayAngles and displayLengths when exiting taper mode
                              // But preserve any > 180 values so the error stays visible
                              if (!hasAngleOver180) {
                                setDisplayAngles([...farAngles]);
                              }
                              setDisplayLengths([...farLengths]);

                              // Sync label offsets: Copy far labels to normal mode labels
                              setLabelOffsets(prev => ({
                                ...prev,
                                segmentLabels: { ...prev.farSegmentLabels },
                                angleLabels: { ...prev.farAngleLabels },
                                foldLabels: { ...prev.farFoldLabels }
                              }));

                              // IMPROVED: Auto-center for normal mode with proper scale calculation
                              const pts = calculatePointsLocal(farLengths, farAngles, direction, segmentAbsoluteAngles, displayLengths, false);
                              const { offsetX, offsetY } = getScale(
                                pts,
                                dynamicStageWidth,
                                dynamicStageHeight,
                                40,
                                1,
                                { x: 0, y: 0 },
                                null,
                                farLengths,
                                false, // Allow auto-centering when switching modes
                                null
                              );
                              
                              // Apply the centering
                              setCanvasOffset({ x: 0, y: 0 });
                              setCanvasScale(1);

                            } else {
                              // Going from normal → taper mode → copy normal mode to Far & Near
                              setFarLengths([...lengths]);
                              setNearLengths([...lengths]);
                              setFarAngles([...angles]);
                              setNearAngles([...angles]);
                              // FIX: Sync displayAngles with angles when entering taper mode
                              // But preserve any > 180 values so the error stays visible
                              if (!hasAngleOver180) {
                                setDisplayAngles([...angles]);
                              }

                              // Sync label offsets: Copy normal labels to far and near labels
                              setLabelOffsets(prev => ({
                                ...prev,
                                farSegmentLabels: { ...prev.segmentLabels },
                                nearSegmentLabels: { ...prev.segmentLabels },
                                farAngleLabels: { ...prev.angleLabels },
                                nearAngleLabels: { ...prev.angleLabels },
                                farFoldLabels: { ...prev.foldLabels },
                                nearFoldLabels: { ...prev.foldLabels }
                              }));

                              // CRITICAL FIX: Auto-center BOTH Far and Near views with proper dimensions
                              const farPts = calculatePointsLocal(lengths, angles, direction, segmentAbsoluteAngles, displayLengths, false);
                              const farMainPts = farPts.filter(p => !p.isFold);
                              
                              // Use the dynamic grid dimensions for proper centering
                              const { offsetX: farOffsetX, offsetY: farOffsetY } = getScale(
                                farMainPts,
                                gridWidth,  // Use calculated grid width
                                gridHeight, // Use calculated grid height (responsive)
                                50,
                                1,
                                { x: 0, y: 0 },
                                null,
                                lengths,
                                false, // Allow auto-centering when switching to taper
                                null
                              );
                              
                              // Reset canvas state to ensure clean centering
                              setCanvasOffset({ x: 0, y: 0 });
                              setCanvasScale(1);
                            }

                            setShowTaper(!showTaper);
                          }}
                          style={{
                            width: '100%',
                            fontSize: 'clamp(11px, 1.2vw, 14px)',
                            padding: '6px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            flexWrap:'wrap',
                            height:'auto'
                          }}
                        >
                          <FiZap size={16} />
                          {showTaper ? 'Not Tapered' : 'Taper'}
                        </button>
                      </Grid>

                      <Grid item xs={12}>
                        <button
                          className={`${styles.btn} ${reverseColor ? styles.gray : styles.blue} ${styles.girthDisplay}`}
                          tabIndex={-1}
                        onFocus={(e) => {
                          e.target.style.outline = '1px solid #ccc';
                          e.target.style.outlineOffset = '0px';
                        }}
                        onBlur={(e) => {
                          e.target.style.outline = '';
                          e.target.style.outlineOffset = '';
                        }}
                          onClick={() => setReverseColor(rc => !rc)}
                          style={{
                            width: '100%',
                            fontSize: 'clamp(11px, 1.2vw, 14px)',
                            padding: '6px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            color: 'black',
                            flexWrap:'wrap',
                            height:'auto'
                          }}
                        >
                          <BiColorFill size={16} />
                          Reverse Color
                        </button>
                      </Grid>

                      <Grid item xs={12}>
                        <button
                          ref={finishButtonRef}
                          className={`${styles.btn} ${styles.gray} ${styles.girthDisplay} taperFinishBtn`}
                          tabIndex={502}
                          disabled={!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180}
                        onFocus={(e) => {
                          e.target.style.border = '3px solid #007bff';
                          e.target.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.3)';
                        }}
                        onBlur={(e) => {
                          const isDisabled = !hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength);
                          e.target.style.border = `1.5px solid ${isDisabled ? '#bdbdbd' : '#000000'}`;
                          e.target.style.boxShadow = '';
                        }}
                          onClick={handleFinish}
                          style={{
                            width: '100%',
                            fontSize: 'clamp(11px, 1.2vw, 14px)',
                            padding: '6px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            color: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#9e9e9e' : 'black',
                            background: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#f5f5f5' : 'white',
                            borderColor: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#bdbdbd' : '#000000',
                            border: `1.5px solid ${(!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#bdbdbd' : '#000000'}`,
                            fontWeight: '500',
                            opacity: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? 0.6 : 1,
                            cursor: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? 'not-allowed' : 'pointer'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            // Loop back to first Far length
                            if (farLengthRefs.current?.[0]) {
                              farLengthRefs.current[0]?.focus();
                            } else {
                              firstBtnRef.current?.focus();
                            }
                          } else if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault();
                            // Go back to last Near length (skip disabled Near angles)
                            if (nearLengthRefs.current?.[nearLengths.length - 1]) {
                              nearLengthRefs.current[nearLengths.length - 1]?.focus();
                            }
                          }
                          }}
                        >
                          <HiCheckCircle size={16} style={{ color: '#000000' }} />
                          Finish
                        </button>
                    </Grid>

                    {/* Zoom controls for taper canvases */}
                    <Grid item xs={12} style={{ marginTop: '8px' }}>
                      <div className={styles.bottomArrowControls} style={{ position: 'relative', top: 'auto', right: 'auto', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          <button
                            className={styles.arrowBtn}
                            title="Zoom Out"
                            onClick={() => handleControl('zoom-out')}>➖</button>
                          <button
                            className={styles.arrowBtn}
                            title="Zoom In"
                            onClick={() => handleControl('zoom-in')}>➕</button>
                        </div>
                      </div>
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>

              {/* NEAR VIEW - Right Half */}
              <Grid item xs={12} md={6}>
                {/* Near Label */}
                <Grid container justifyContent="center" sx={{ marginBottom: '10px' }}>
                  <Grid item>
                    <Typography variant="h4" fontWeight="bold" fontSize="clamp(20px, 2vw, 28px)">
                      Near
                    </Typography>
                  </Grid>
                </Grid>

                {/* Near Canvas and Table */}
                <Grid container spacing={1}>
                  {/* Near Canvas */}
                  <Grid item xs={12} md={9} lg={10}>
                    <Stage 
                      width={nearStageWidth} 
                      height={gridHeight} // Use dynamic grid height instead of fixed dynamicStageHeight
                      ref={nearRef} 
                      className={styles.gridBackground} 
                      pixelRatio={2} 
                      style={{
                        maxWidth: '100%',
                        height: 'auto'
                      }}>
                      <Layer>
                        <Group
                          scaleX={canvasScale}
                          scaleY={canvasScale}
                          x={nearStageWidth / 2}
                          y={gridHeight / 2}
                          offsetX={nearStageWidth / 2}
                          offsetY={gridHeight / 2}
                        >
                          {drawLines(nearPts, nearScale, nearOffsetX, nearOffsetY, nearLengths, nearAngles, displayAngles, false, true, 'near')}
                        </Group>
                      </Layer>
                    </Stage>
                  </Grid>

                  {/* Near Ln/Ang Table */}
                  <Grid item xs={12} md={4} lg={2}>
                    {/* Zero or empty length error message for near lengths */}
                    {(nearLengths.some(l => l === 0) || nearLengths.some(l => l === '' || l === null || l === undefined)) && (
                      <div style={{
                        backgroundColor: '#ffebee',
                        color: '#d32f2f',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textAlign: 'center',
                        marginBottom: '4px',
                        border: '1px solid #d32f2f'
                      }}>
                        {nearLengths.some(l => l === '' || l === null || l === undefined) ? 'Length cannot be empty' : 'Length cannot be 0'}
                      </div>
                    )}
                    <Grid container>
                      <Grid item xs={12}>
                        <div className={styles.taperTable} style={{
                          minWidth: '100px',
                          maxWidth: '100%'
                        }}>
                          <div className={styles.tableHeader}>
                            <span>Ln</span><span>Ang</span>
                          </div>
                          <div className={styles.tableBody} style={{
                            maxHeight: '307px',
                            overflowY: 'auto',
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#999 #f1f1f1'
                          }}>
                            {nearLengths.map((ln, i) => (
                              <div key={i} className={styles.tableRow}>
                                {/* ——— Ln cell ——— */}
                                <input
                                  ref={el => nearLengthRefs.current[i] = el}
                                  type="text"
                                  className={`${styles.taperInput} ${styles.noSpinner}`}
                                  inputMode="numeric"
                                  tabIndex={200 + i * 2}
                                  style={ln === 0 ? {
                                    border: '2px solid #d32f2f',
                                    backgroundColor: '#ffebee',
                                    color: '#d32f2f'
                                  } : {}}
                                  onMouseDown={() => {
                                    // Stop continuous drawing when user clicks on length input
                                    // Using onMouseDown instead of onFocus to avoid triggering on programmatic focus
                                    if (continuousDrawing) {
                                      setContinuousDrawing(false);
                                    }
                                  }}
                                  onMouseUp={(e) => { const target = e.target; setTimeout(() => target.select(), 0); }}
                                  onFocus={e => {
                                    // Save state before user edits the value
                                    saveToHistory();
                                    e.target.select();
                                    e.target.style.outline = '1px solid #ccc';
                                    e.target.style.outlineOffset = '1px';
                                    // Highlight corresponding label on canvas
                                    setEditingIndex({ type: 'length', index: i, profile: 'near' });
                                  }}
                                  onBlur={e => {
                                    e.target.style.outline = '';
                                    e.target.style.outlineOffset = '';
                                    // Clear highlight
                                    setEditingIndex({ type: null, index: null, profile: null });
                                  }}
                                  onWheel={e => e.target.blur()}
                                  value={ln === '' ? '' : ln}
                                  maxLength={4}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Tab' && !e.shiftKey) {
                                      e.preventDefault();
                                      // Navigate to next near length, then finish (or skip to FAR if disabled)
                                      if (i < nearLengths.length - 1) {
                                        nearLengthRefs.current[i + 1]?.focus();
                                      } else {
                                        // After last Near length, check if finish is disabled
                                        if (hasZeroLength || hasEmptyLength) {
                                          // Skip finish, go directly to FAR
                                          farLengthRefs.current[0]?.focus();
                                        } else {
                                          // Go to finish button
                                          e.target.blur();
                                          requestAnimationFrame(() => {
                                            finishButtonRef.current?.focus();
                                          });
                                        }
                                      }
                                    } else if (e.key === 'Tab' && e.shiftKey) {
                                      e.preventDefault();
                                      // Navigate to previous near length or last far angle
                                      if (i > 0) {
                                        nearLengthRefs.current[i - 1]?.focus();
                                      } else if (farAngleRefs.current?.[farAngles.length - 1]) {
                                        farAngleRefs.current[farAngles.length - 1]?.focus();
                                      } else if (farLengthRefs.current?.[farLengths.length - 1]) {
                                        farLengthRefs.current[farLengths.length - 1]?.focus();
                                      }
                                    }
                                  }}
                                  onChange={e => {
                                    const next = [...nearLengths]
                                    const v = e.target.value

                                    if (v === '') {
                                      // Store current value as display length before clearing
                                      if (nearLengths[i] && nearLengths[i] !== '') {
                                        const nextDisplay = [...displayLengths];
                                        nextDisplay[i] = nearLengths[i];
                                        setDisplayLengths(nextDisplay);
                                      }
                                      next[i] = '';
                                    } else {
                                      const parsedValue = Number(v) || 0;
                                      next[i] = parsedValue;

                                      // Check if the new value triggers a scaling range change (same as normal mode)
                                      const oldValue = nearLengths[i] || 0;
                                      const needsRescaling = (
                                        // Crossing into/out of 1000+ range
                                        (oldValue < 1000 && parsedValue >= 1000) ||
                                        (oldValue >= 1000 && parsedValue < 1000) ||
                                        // Crossing into/out of 500-999 range
                                        (oldValue < 500 && parsedValue >= 500) ||
                                        (oldValue >= 500 && parsedValue < 500) ||
                                        // Crossing into/out of 100-499 range
                                        (oldValue < 100 && parsedValue >= 100) ||
                                        (oldValue >= 100 && parsedValue < 100) ||
                                        // Crossing into/out of 11-99 range
                                        (oldValue < 11 && parsedValue >= 11) ||
                                        (oldValue >= 11 && parsedValue < 11) ||
                                        // Crossing into/out of 0-10 range
                                        (oldValue > 10 && parsedValue <= 10) ||
                                        (oldValue <= 10 && parsedValue > 10)
                                      );

                                      // Set the flag to trigger rescaling if needed
                                      if (needsRescaling) {
                                        console.log(`Taper Near: Value change from ${oldValue} to ${parsedValue} triggers rescaling`);
                                        setHasEditedInTable(true);
                                        // GIRTH-BASED SCALING: Stop continuous drawing and reset canvas
                                        setContinuousDrawing(false);
                                        setCanvasOffset({ x: 0, y: 0 });
                                        setCanvasScale(1); // Reset zoom to default
                                      }

                                      // Update display length with new valid value
                                      const nextDisplay = [...displayLengths];
                                      nextDisplay[i] = parsedValue;
                                      setDisplayLengths(nextDisplay);
                                    }

                                    setNearLengths(next)
                                  }}
                                />

                                {/* ——— Ang cell or blank placeholder ——— */}
                                {i < nearAngles.length ? (
                                  <input
                                    ref={el => nearAngleRefs.current[i] = el}
                                    type="text"
                                    className={`${styles.taperInput} ${styles.noSpinner}`}
                                    inputMode="numeric"
                                    tabIndex={-1}
                                    onMouseUp={(e) => { const target = e.target; setTimeout(() => target.select(), 0); }}
                                    onFocus={e => {
                                      e.target.select();
                                      e.target.style.outline = '1px solid #ccc';
                                      e.target.style.outlineOffset = '0px';
                                      // Highlight corresponding label on canvas
                                      setEditingIndex({ type: 'angle', index: i, profile: 'near' });
                                    }}
                                    onBlur={(e) => {
                                      e.target.style.outline = '';
                                      e.target.style.outlineOffset = '';
                                      // Clear highlight
                                      setEditingIndex({ type: null, index: null, profile: null });
                                    }}
                                    onWheel={e => e.target.blur()}
                                    value={(() => {
                                      // FIX: Simply mirror displayAngles (which syncs with Far) or fall back to nearAngles
                                      const rawValue = displayAngles[i] !== undefined ? displayAngles[i] : nearAngles[i];
                                      // Handle empty, null, undefined, or just "-" (user typing negative)
                                      if (rawValue === '' || rawValue === null || rawValue === undefined || rawValue === '-') return rawValue || '';
                                      // Only normalize if it's a valid number
                                      const numValue = Number(rawValue);
                                      if (isNaN(numValue)) return rawValue;
                                      // Don't normalize if > 180 - show raw value so user sees what they typed
                                      if (Math.abs(numValue) > 180) return numValue;
                                      return normalizeDegrees(numValue);
                                    })()}
                                    disabled
                                    onKeyDown={(e) => {
                                      if (e.key === 'Tab' && !e.shiftKey) {
                                        e.preventDefault();
                                        // Navigate to next near angle or finish button
                                        if (i < nearAngles.length - 1 && nearAngleRefs.current?.[i + 1]) {
                                          nearAngleRefs.current[i + 1]?.focus();
                                        } else {
                                          // After last Near angle, check if finish is disabled
                                          if (hasZeroLength || hasEmptyLength) {
                                            farLengthRefs.current[0]?.focus();
                                          } else {
                                            finishButtonRef.current?.focus();
                                          }
                                        }
                                      } else if (e.key === 'Tab' && e.shiftKey) {
                                        e.preventDefault();
                                        // Navigate to previous near angle or last near length
                                        if (i > 0 && nearAngleRefs.current?.[i - 1]) {
                                          nearAngleRefs.current[i - 1]?.focus();
                                        } else if (nearLengthRefs.current?.[nearLengths.length - 1]) {
                                          nearLengthRefs.current[nearLengths.length - 1]?.focus();
                                        }
                                      }
                                    }}
                                  />
                                ) : (
                                  <div style={{ flex: 1 }} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </Grid>
                    </Grid>

                    {/* Girth/Bends Display */}
                    <Grid container sx={{ marginTop: '10px' }}>
                      <Grid item xs={12}>
                        <Typography className={`${styles.girth} ${styles.girthDisplay}`} style={{textAlign:'center'}} >
                          <span style={{ fontWeight: 'bold' }}>
                          G: {getGirth(nearLengths, startFoldType, startFoldLength, endFoldType, endFoldLength)}</span> | <span style={{ fontWeight: 'bold' }}>B: {(() => {
                            const hasFolds = startFoldType || endFoldType;

                            // Count base bends - angles in 170-180 range count as 2 bends
                            let baseBends = 0;
                            if (nearAngles.length > 0) {
                              for (let i = 0; i < nearAngles.length; i++) {
                                const absAngle = Math.abs(nearAngles[i]);
                                // Angles between 170-180 degrees are fold-backs, count as 2 bends
                                if (absAngle >= 170 && absAngle <= 180) {
                                  baseBends += 2;
                                } else {
                                  baseBends += 1;
                                }
                              }
                            }

                            let bends = 0;

                            if (hasFolds) {
                              // When there are folds, ALWAYS ignore base geometry and count ONLY fold bends
                              bends = baseBends;

                              // Add fold bends
                              if (startFoldType === 'Up' || startFoldType === 'Down' || startFoldType === 'OpenUp' || startFoldType === 'OpenDn') {
                                bends += 2;
                              }
                              if (endFoldType === 'Up' || endFoldType === 'Down' || endFoldType === 'OpenUp' || endFoldType === 'OpenDn') {
                                bends += 2;
                              }
                            } else {
                              // No folds: count base geometry bends, minimum 1 for straight line
                              bends = Math.max(1, baseBends);
                            }

                            return bends;
                          })()}</span>
                        </Typography>
                      </Grid>
                    </Grid>
                  </Grid>

                </Grid>
                {/* </div> */}

              </Grid>
            </Grid>

          ) : (

            <Grid container gap={1}>
              <Stage
                key={resetKey}
                width={dynamicStageWidth}
                height={dynamicStageHeight}
                ref={stageRef}
                className={styles.gridBackground}
                style={{
                  backgroundSize: `${20 * canvasScale}px ${20 * canvasScale}px`
                }}
                pixelRatio={2}
                onMouseDown={(e) => {
                  // Check if we should allow drawing
                  const isCreateDrawingMode = continuousDrawing && (
                    !templateId || // Normal create drawing mode
                    templateCreateMode // Template in create mode
                  );
                  if (!isCreateDrawingMode) return;

                  // When in template create mode, treat it exactly like pure create mode
                  const treatAsNewDrawing = !templateId || templateCreateMode;

                  const stage = e.target.getStage();
                  const pointer = stage.getPointerPosition();
                  if (!pointer) return;

                  const stageWidth = dynamicStageWidth;
                  const stageHeight = dynamicStageHeight;

                  // Apply grid snapping to pointer coordinates
                  // Allow drawing anywhere on canvas - getScale() will handle fitting
                  const snappedPointerX = snapToGrid(pointer.x);
                  const snappedPointerY = snapToGrid(pointer.y);

                  console.log('🖱️ Click position:', {
                    rawX: pointer.x,
                    rawY: pointer.y,
                    snappedX: snappedPointerX,
                    snappedY: snappedPointerY,
                    stageWidth,
                    stageHeight
                  });

                  // For create modes, use fresh points calculation
                  const ptsForScale = treatAsNewDrawing ? calculatePointsLocal(lengths, angles, direction, segmentAbsoluteAngles, displayLengths, false) : points;

                  // For first click in create mode, use current click position as firstClickPixelPos
                  const effectiveFirstClickPixelPos = (treatAsNewDrawing && lengths.length === 0 && !firstClickPixelPos)
                    ? { x: snappedPointerX, y: snappedPointerY }
                    : firstClickPixelPos;

                  const { scale, offsetX, offsetY } = getScale(
                    ptsForScale,
                    stageWidth,
                    stageHeight,
                    40,
                    canvasScale,
                    canvasOffset,
                    null,
                    lengths,
                    treatAsNewDrawing, // Prevent auto-center when creating
                    effectiveFirstClickPixelPos
                  );

                  const x = (snappedPointerX - offsetX) / scale;
                  const y = (snappedPointerY - offsetY) / scale;

                  // Simple SWI-style drawing - just click to click
                  if (!firstClickPoint && lengths.length === 0) {
                    // Very first click - always start from origin for consistency
                    console.log('🎯 FIRST CLICK - State:', {
                      firstClickPoint,
                      lengths: lengths.length,
                      firstSegmentAngle,
                      direction,
                      originOffset
                    });
                    setOriginOffset({ x: 0, y: 0 });
                    setFirstClickPoint({ waiting: true, isOrigin: true, x: 0, y: 0 });
                    // Store the snapped pixel position to maintain it when drawing grows
                    setFirstClickPixelPos({ x: snappedPointerX, y: snappedPointerY });
                    console.log('🎯 FIRST CLICK - Pixel:', pointer.x, pointer.y, 'Snapped:', snappedPointerX, snappedPointerY);
                  } else if (!firstClickPoint && lengths.length > 0) {
                    // Need to set up for next segment - just set a flag
                    setFirstClickPoint({ waiting: true, isOrigin: false });
                    logger.debug('🎯 Ready for next segment');
                  } else if (firstClickPoint) {
                    // Second click: Create the segment from first click to second click
                    let newLength, relAngle; // Declare variables outside the if/else blocks

                    if (firstClickPoint.isOrigin) {
                      // Creating the very first segment from origin (0,0)
                      // Make sure the origin is at a grid intersection point
                      console.log('🎯 SECOND CLICK - State:', {
                        x, y,
                        firstSegmentAngle,
                        direction,
                        originOffset
                      });

                      // Calculate the vector from origin to current click
                      const dx = x - 0;
                      const dy = y - 0;
                      // Don't round yet - keep precision
                      const exactLength = Math.hypot(dx, dy);
                      newLength = Math.round(exactLength);

                      if (newLength < 10) {
                        // Too short, ignore
                        return;
                      }

                      const absAngle = Math.atan2(dy, dx) * (180 / Math.PI);

                      console.log('🎯 SECOND CLICK - Calculated:', {
                        dx, dy,
                        length: newLength,
                        absAngle
                      });

                      // Store the first segment angle and update direction
                      const hasStartSSF = startFoldType === 'OpenUp' || startFoldType === 'OpenDn';
                      if (!hasStartSSF) {
                        setFirstSegmentAngle(absAngle);

                        // Update direction based on the actual drawing angle
                        const newDirection = angleToCardinalDirection(absAngle);

                        setDirection(newDirection);
                        console.log('🎯 SECOND CLICK - New direction:', newDirection, 'angle:', absAngle);
                      }

                      // Don't set points manually - let calculatePoints handle it
                      // For the first segment, we don't need a relative angle
                      // Save state before adding first segment
                      saveToHistory();

                      // Set skip flag to prevent duplicate history from any auto-focus
                      skipNextHistorySaveRef.current = true;
                      setTimeout(() => {
                        skipNextHistorySaveRef.current = false;
                      }, 200);

                      setLengths([newLength]);
                      setAngles([]);
                      // FIX: Initialize displayAngles and displayLengths for first segment
                      setDisplayAngles([]);
                      setDisplayLengths([newLength]); // Sync display lengths with table
                      relAngle = 0; // Set relAngle to 0 for first segment

                      // Immediately update segmentAbsoluteAngles for template create mode
                      // For the first segment, we have the absolute angle directly
                      if (templateCreateMode) {
                        setSegmentAbsoluteAngles([absAngle]);
                      }

                      logger.debug('🎯 SWI Drawing: Created first segment:', {
                        from: firstClickPoint,
                        to: { x, y },
                        length: newLength,
                        angle: absAngle
                      });
                    } else {
                      // Creating a subsequent segment - calculate from last endpoint
                      const calcPoints = calculatePointsLocal(lengths, angles, direction, segmentAbsoluteAngles, displayLengths, false);
                      const nonFoldPoints = calcPoints.filter(p => !p.isFold);
                      const lastPoint = nonFoldPoints[nonFoldPoints.length - 1];

                      const dx = x - lastPoint.x;
                      const dy = y - lastPoint.y;
                      // Keep precision for angle calculation
                      const exactLength = Math.hypot(dx, dy);
                      newLength = Math.round(exactLength);

                      if (newLength < 10) {
                        // Too short, ignore
                        return;
                      }

                      const absAngle = Math.atan2(dy, dx) * (180 / Math.PI);

                      // Calculate cumulative angle
                      const directionMap = {
                        'Up': 90,
                        'Down': -90,
                        'Right': 0,
                        'Left': 180,
                      };

                      let cumulativeAngle = firstSegmentAngle !== null ? firstSegmentAngle : (directionMap[direction] ?? 0);

                      // Add all existing angles to get the current direction
                      for (let i = 0; i < angles.length; i++) {
                        cumulativeAngle += angles[i];
                      }

                      // Calculate relative angle
                      // Add tiny epsilon for consistent rounding of symmetric corners
                      relAngle = Math.round(normalizeDegrees(absAngle - cumulativeAngle) + 1e-9);

                      // Snap to common angles for consistent symmetric shapes
                      relAngle = snapToCommonAngle(relAngle);

                      // Save state before adding segment
                      saveToHistory();

                      // Set skip flag to prevent duplicate history from any auto-focus
                      skipNextHistorySaveRef.current = true;
                      setTimeout(() => {
                        skipNextHistorySaveRef.current = false;
                      }, 200);

                      setLengths((prev) => [...prev, newLength]);
                      setAngles((prev) => [...prev, relAngle]);
                      // FIX: Also update displayAngles and displayLengths to keep them in sync
                      // This prevents first angle corruption when adding segments via green square later
                      setDisplayAngles((prev) => [...prev, relAngle]);
                      setDisplayLengths((prev) => [...prev, newLength]);

                      // Clear label offsets to force recalculation with new geometry
                      // This prevents labels from being misplaced when drawing recenters/rescales
                      setCoordOffsets({});
                      setLabelOffsets({
                        segmentLabels: {},
                        angleLabels: {},
                        foldLabels: {}
                      });

                      // Immediately update segmentAbsoluteAngles for template create mode
                      // This ensures the preview line works correctly without waiting for useEffect
                      if (templateCreateMode) {
                        const directionMap = {
                          'Up': 90,
                          'Down': -90,
                          'Right': 0,
                          'Left': 180,
                        };

                        const newAbsoluteAngles = [];
                        let currentAngle = firstSegmentAngle !== null ? firstSegmentAngle : (directionMap[direction] ?? 0);

                        // Calculate for all segments including the new one
                        const newLengths = [...lengths, newLength];
                        const newAngles = [...angles, relAngle];

                        for (let i = 0; i < newLengths.length; i++) {
                          if (i === 0) {
                            newAbsoluteAngles.push(currentAngle);
                          } else {
                            currentAngle += newAngles[i - 1] || 0;
                            newAbsoluteAngles.push(currentAngle);
                          }
                        }

                        setSegmentAbsoluteAngles(newAbsoluteAngles);
                      }

                      logger.debug('🎯 SWI Drawing: Created segment:', {
                        from: firstClickPoint,
                        to: { x, y },
                        length: newLength,
                        relativeAngle: relAngle
                      });
                    }

                    // After creating segment, set up for the next one
                    if (continuousDrawing) {
                      // Just set a flag - we'll calculate the actual position when needed
                      setFirstClickPoint({ waiting: true, isOrigin: false });
                    } else {
                      setFirstClickPoint(null);
                    }
                    setHoverPoint(null);
                  }
                }}
                onMouseMove={(e) => {
                  // Show preview line when drawing
                  if (!firstClickPoint || !continuousDrawing) {
                    setHoverPoint(null);
                    return;
                  }

                  const stage = e.target.getStage();
                  const pointer = stage.getPointerPosition();
                  if (!pointer) return;

                  const stageWidth = dynamicStageWidth;
                  const stageHeight = dynamicStageHeight;

                  // Normal cursor for drawing
                  e.target.getStage().container().style.cursor = 'default';

                  // Apply grid snapping to hover position for preview line
                  const snappedHoverX = snapToGrid(pointer.x);
                  const snappedHoverY = snapToGrid(pointer.y);

                  // Use the appropriate points for scale calculation
                  const treatAsNew = !templateId || templateCreateMode;
                  const ptsForPreview = treatAsNew ? calculatePointsLocal(lengths, angles, direction, segmentAbsoluteAngles, displayLengths, false) : points;

                  // For hover preview, only use firstClickPixelPos if it exists (after first click)
                  // Don't use hover position as it changes every frame and causes jittering
                  const effectiveFirstClickPixelPosPreview = firstClickPixelPos;

                  const { scale, offsetX, offsetY } = getScale(
                    ptsForPreview,
                    stageWidth,
                    stageHeight,
                    40,
                    canvasScale,
                    canvasOffset,
                    null,
                    lengths,
                    treatAsNew,
                    effectiveFirstClickPixelPosPreview
                  );

                  // Apply grid snapping to pointer coordinates
                  const snappedPointerX = snapToGrid(pointer.x);
                  const snappedPointerY = snapToGrid(pointer.y);

                  const x = (snappedPointerX - offsetX) / scale;
                  const y = (snappedPointerY - offsetY) / scale;

                  // Set hover point to show preview line
                  setHoverPoint({ x, y });
                }}
                onMouseLeave={() => setHoverPoint(null)}
              >
                <Layer>
                  {/* Transform group for zoom and pan */}
                  <Group
                    x={dynamicStageWidth / 2 + canvasOffset.x}
                    y={dynamicStageHeight / 2 + canvasOffset.y}
                    scaleX={canvasScale}
                    scaleY={canvasScale}
                    offsetX={dynamicStageWidth / 2}
                    offsetY={dynamicStageHeight / 2}
                  >
                    {/* Drawing content */}
                    {drawLines(
                      draggingPoints || allPts,
                      scale,
                      offsetX,
                      offsetY,
                      draggingPoints && !lockLegends ?
                        // CRITICAL FIX: Filter out fold points before calculating lengths
                        // Fold points are NOT part of the actual segment geometry
                        calculateSegmentLengths(draggingPoints.filter(pt => !pt.isFold)) :
                        effectiveLengths, // Use effective lengths (with preserved values) when not dragging or Lock Legends ON
                      draggingPoints ?
                        // CRITICAL FIX: Filter out fold points before calculating angles
                        (() => {
                          const mainPts = draggingPoints.filter(pt => !pt.isFold);
                          return mainPts.slice(1, -1).map((pt, idx) => {
                            const prev = mainPts[idx];
                            const curr = pt;
                            const next = mainPts[idx + 2];
                            if (!prev || !curr || !next) return 0;
                            return Math.round(calculateAngleBetweenPoints(prev, curr, next));
                          });
                        })() :
                        angles,
                      displayAngles,
                      templateCreateMode
                    )}
                  </Group>
                </Layer>
              </Stage>

              {/* Zoom Controls */}
              <div className={styles.bottomArrowControls}>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button
                    className={styles.arrowBtn}
                    tabIndex={12}
                    title="Zoom Out"
                    onClick={() => handleControl('zoom-out')}>➖</button>
                  <button
                    className={styles.arrowBtn}
                    tabIndex={13}
                    title="Zoom In"
                    onClick={() => handleControl('zoom-in')}>➕</button>
                </div>
              </div>

            </Grid>
          )}
        </Grid>

        {/* RIGHT PANEL: Ln/Ang table, G&B, Icon buttons, and Finish */}
        {
          !showTaper && (
            <Grid item lg={1.46} >
              {/* Zero or empty length error message */}
              {(hasZeroLength || hasEmptyLength) && (
                <div style={{
                  backgroundColor: '#ffebee',
                  color: '#d32f2f',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  textAlign: 'center',
                  marginBottom: '4px',
                  border: '1px solid #d32f2f'
                }}>
                  {hasEmptyLength ? 'Length cannot be empty' : 'Length cannot be 0'}
                </div>
              )}
              {hasAngleOver180 && (
                <div style={{
                  backgroundColor: '#ffebee',
                  color: '#d32f2f',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  textAlign: 'center',
                  marginBottom: '4px',
                  border: '1px solid #d32f2f'
                }}>
                  Angle cannot be more than 180°
                </div>
              )}
              {/* Ln/Ang Table */}
              <Grid container spacing={1} style={{maxHeight:'420px', overflowY:"scroll"}}>
                <Grid item lg={6}>
                  <Typography fontWeight={"bold"} style={{textAlign: 'center'}}>Ln</Typography>
                  {/* <span style={{ width: '54px', textAlign: 'center' }}>Ang</span> */}
                  {/* <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}> */}
                  <Grid container rowSpacing={.5}>
                    {lengths.map((l, i) => (
                      <Grid item lg={12}>
                        <input
                          key={`len-${i}`}
                          ref={el => lengthRefs.current[i] = el}
                          type="text"
                          className="no-spinner"
                          value={l === '' ? '' : l}
                          maxLength={4}
                          tabIndex={18 + i * 2}
                          inputMode="numeric"
                          style={{
                            width: '100%',
                            padding: '2px 4px',
                            fontSize: '15px',
                            textAlign: 'center',
                            border: l === 0 ? '2px solid #d32f2f' : '1px solid #ccc',
                            borderRadius: '6px',
                            boxSizing: 'border-box',
                            backgroundColor: l === 0 ? '#ffebee' : 'white',
                            color: l === 0 ? '#d32f2f' : 'inherit'
                          }}
                          onMouseDown={() => {
                            // Stop continuous drawing when user clicks on length input
                            // Using onMouseDown instead of onFocus to avoid triggering on programmatic focus
                            if (continuousDrawing) {
                              setContinuousDrawing(false);
                            }
                          }}
                          onMouseUp={(e) => { const target = e.target; setTimeout(() => target.select(), 0); }}
                          onFocus={e => {
                            saveToHistory();
                            e.target.select();
                            e.target.style.outline = '1px solid #ccc';
                            e.target.style.outlineOffset = '1px';
                            // Highlight corresponding label on canvas
                            setEditingIndex({ type: 'length', index: i, profile: null });
                          }}
                          onBlur={e => {
                            e.target.style.outline = '';
                            e.target.style.outlineOffset = '';
                            // Clear highlight
                            setEditingIndex({ type: null, index: null, profile: null });
                          }}
                          onChange={e => {
                            const v = e.target.value;
                            const next = [...lengths];

                            if (v === '') {
                              const currentValue = lengths[i];
                              const nextDisplay = [...displayLengths];
                              while (nextDisplay.length <= i) {
                                nextDisplay.push(null);
                              }
                              if (currentValue !== '' && currentValue != null) {
                                nextDisplay[i] = currentValue;
                              } else if (!nextDisplay[i]) {
                                nextDisplay[i] = lengths[i] || 0;
                              }
                              setDisplayLengths(nextDisplay);
                              next[i] = '';
                            } else {
                              const parsedValue = parseInt(v, 10) || 0;
                              next[i] = parsedValue;
                              setHasEditedInTable(true);
                              // GIRTH-BASED SCALING: Reset canvas state and stop continuous drawing
                              // This triggers re-centering and girth-based scale recalculation
                              setContinuousDrawing(false);
                              setCanvasOffset({ x: 0, y: 0 });
                              setCanvasScale(1);
                              setForceRecalculate(prev => prev + 1); // Force recalculation even if girth happens to match
                              const nextDisplay = [...displayLengths];
                              while (nextDisplay.length <= i) {
                                nextDisplay.push(null);
                              }
                              nextDisplay[i] = parsedValue;
                              setDisplayLengths(nextDisplay);
                            }
                            setLengths(next);
                          }}
                          onWheel={e => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && !e.shiftKey) {
                              e.preventDefault();
                              if (i < lengths.length - 1) {
                                lengthRefs.current[i + 1]?.focus();
                              } else if (angles.length > 0 && angleRefs.current?.[0]) {
                                angleRefs.current[0]?.focus();
                              } else {
                                // If no angles, go to Finish button
                                finishButtonRef.current?.focus();
                              }
                            } else if (e.key === 'Tab' && e.shiftKey) {
                              e.preventDefault();
                              if (i > 0) {
                                lengthRefs.current[i - 1]?.focus();
                              } else {
                                // At first length, go back to Finish or skip to last Angle if Finish disabled
                                if (hasZeroLength || hasEmptyLength) {
                                  // Skip Finish, go to last Angle or Taper button
                                  if (angles.length > 0 && angleRefs.current?.[angles.length - 1]) {
                                    angleRefs.current[angles.length - 1]?.focus();
                                  } else {
                                    taperButtonRef.current?.focus();
                                  }
                                } else {
                                  finishButtonRef.current?.focus();
                                }
                              }
                            }
                          }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                  {/* </div> */}
                </Grid>
                <Grid item lg={6}>
                  {/* column 1 – all lengths */}
                  <Typography fontWeight={"bold"} style={{ textAlign: 'center' }}>Ang</Typography>

                  {/* column 2 – all angles */}
                  {/* <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}> */}
                  <Grid container rowSpacing={.5}>
                    {angles.slice(0, lengths.length - 1).map((a, i) => {
                      // FIX: Always normalize angle display to match drawing labels
                      const rawValue = displayAngles[i] !== undefined && displayAngles[i] !== null
                        ? displayAngles[i]
                        : angles[i];
                      let displayVal;
                      if (rawValue === '' || rawValue === null || rawValue === undefined || rawValue === '-') {
                        displayVal = rawValue || '';
                      } else {
                        const numValue = Number(rawValue);
                        // Don't normalize if > 180 - show raw value so user sees what they typed
                        displayVal = isNaN(numValue) ? rawValue : (Math.abs(numValue) > 180 ? numValue : normalizeDegrees(numValue));
                      }
                      return (
                        <Grid item lg={12}>
                          <input
                            key={`ang-${i}`}
                            ref={el => angleRefs.current[i] = el}
                            type="text"
                            className="no-spinner"
                            value={displayVal}
                            tabIndex={19 + i * 2}
                            inputMode="numeric"
                            style={{ width: '100%', padding: '2px 4px', fontSize: '15px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '6px', boxSizing: 'border-box' }}
                            onMouseUp={(e) => { const target = e.target; setTimeout(() => target.select(), 0); }}
                            onFocus={e => {
                              saveToHistory();
                              // Stop continuous drawing when user clicks on angle input
                              // This prevents Tab handler from redirecting to length
                              if (continuousDrawing) {
                                setContinuousDrawing(false);
                              }
                              if (!angleRefs.current.originalAngles) {
                                angleRefs.current.originalAngles = {};
                              }
                              const currentNormalized = (angles[i] !== '' && angles[i] !== '-' && angles[i] !== null && angles[i] !== undefined)
                                ? normalizeDegrees(angles[i])
                                : angles[i];
                              angleRefs.current.originalAngles[i] = currentNormalized;
                              e.target.select();
                              e.target.style.outline = '1px solid #ccc';
                              e.target.style.outlineOffset = '1px';
                              // Highlight corresponding label on canvas
                              setEditingIndex({ type: 'angle', index: i, profile: null });
                            }}
                            onBlur={e => {
                              // Update actual angles when user leaves the field
                              let v = displayAngles[i] !== undefined ? displayAngles[i] : angles[i];

                              // Sanitize: remove trailing +/- that user may have accidentally typed
                              if (typeof v === 'string') {
                                v = v.replace(/[+\-]+$/, '');
                              }

                              if (v === '' || v === '-') {
                                // Handle empty input (existing code)
                                const previousAngle = angles[i];
                                const previousAngleStr = String(previousAngle);

                                if (previousAngle !== undefined &&
                                  previousAngle !== null &&
                                  previousAngle !== '' &&
                                  previousAngleStr.length > 1) {
                                  const nextDisplay = [...displayAngles];
                                  nextDisplay[i] = previousAngle;
                                  setDisplayAngles(nextDisplay);
                                } else {
                                  const next = [...angles];
                                  next[i] = 0;
                                  const trimmed = next.slice(0, Math.max(0, lengths.length - 1));
                                  setAngles(trimmed);
                                  setFarAngles(trimmed);
                                  setNearAngles(trimmed);
                                  setDisplayAngles(trimmed);
                                }
                                e.target.style.outline = '';
                                e.target.style.outlineOffset = '';
                                return;
                              }

                              const inputValue = Number(v);

                              // Angle > 180 validation
                              if (Math.abs(inputValue) > 180) {
                                // Restore geometry arrays only (keep displayAngles showing the invalid value + error)
                                const prevAngle = angleRefs.current.originalAngles?.[i];
                                const restoreAngle = (prevAngle !== undefined && prevAngle !== null) ? prevAngle : 0;
                                const next = [...angles];
                                next[i] = restoreAngle;
                                const trimmed = next.slice(0, Math.max(0, lengths.length - 1));
                                setAngles(trimmed);
                                setFarAngles(trimmed);
                                setNearAngles(trimmed);
                                // Don't restore displayAngles - keep showing invalid value so error persists
                                e.target.style.outline = '';
                                e.target.style.outlineOffset = '';
                                setEditingIndex({ type: null, index: null, profile: null });
                                return;
                              }

                              const originalAngle = angleRefs.current.originalAngles?.[i];
                              //Code change by rahul
                              if (originalAngle !== undefined && originalAngle !== null) {
                                // If we have an original angle, we can use it
                                const normalizedOriginal = normalizeDegrees(originalAngle);
                                const normalizedInput = normalizeDegrees(inputValue);
                                if (normalizedInput !== normalizedOriginal) {
                                  // If the normalized values are different, we have a change
                                  console.log('Angle changed:', {
                                    index: i,
                                    original: normalizedOriginal,
                                    new: normalizedInput
                                  });
                                }
                              }

                              // CRITICAL FIX: Compare using NORMALIZED angles
                              // The originalAngle is already normalized when saved in onFocus
                              // So we must normalize the inputValue too for accurate comparison
                              const normalizedInput = normalizeDegrees(inputValue);
                              const normalizedOriginal = originalAngle !== undefined && originalAngle !== null 
                                ? normalizeDegrees(originalAngle) 
                                : 0;
                              
                              // Check if value actually changed (with tolerance for floating point)
                              const actuallyChanged = Math.abs(normalizedInput - normalizedOriginal) > 0.001;
                              
                              let finalAngle;
                              
                              if (!actuallyChanged) {
                                // User just tabbed through - keep EXACT same value
                                finalAngle = normalizedOriginal;
                              } else {
                                // User changed the value - apply sign preservation
                                const absInput = Math.abs(inputValue);

                                if (originalAngle === undefined || originalAngle === null ||
                                    originalAngle === '' || originalAngle === '-' || originalAngle === 0) {
                                  finalAngle = normalizeDegrees(absInput);
                                } else {
                                  finalAngle = originalAngle >= 0 ? absInput : -absInput;
                                  finalAngle = normalizeDegrees(finalAngle);
                                }
                              }
                              
                              // Rest of your code remains the same...
                              const next = [...angles];
                              next[i] = finalAngle;
                              const trimmed = next.slice(0, Math.max(0, lengths.length - 1));
                              setAngles(trimmed);
                              setFarAngles(trimmed);
                              setNearAngles(trimmed);

                              //code change by Rahul
                              // NEW CODE FOR SEGMENT 0 ROTATION
                              if (i === 0 && segmentAbsoluteAngles.length > 0) {
                                const secondSegmentAngle = segmentAbsoluteAngles[1]; // Angle of second segment (stays fixed)
                                const newFirstSegmentAngle = normalizeDegrees(secondSegmentAngle - finalAngle);
                                // Update first segment angle

                                // Update all absolute angles starting from the new first segment angle
                                const updatedAbsoluteAngles = [newFirstSegmentAngle];
                                for (let j = 1; j < segmentAbsoluteAngles.length; j++) {
                                  const prevAngle = updatedAbsoluteAngles[j - 1];
                                  const turnAngle = trimmed[j - 1] || 0;
                                  updatedAbsoluteAngles.push(normalizeDegrees(prevAngle + turnAngle));
                                }
                                setSegmentAbsoluteAngles(updatedAbsoluteAngles);
                                for (let j = 0; j < updatedAbsoluteAngles.length; j++) {
                                  const angle = updatedAbsoluteAngles[j];
                                  if (Math.abs(angle - 90) < 1.0 || Math.abs(angle + 90) < 1.0) {
                                    if (j === 1) {
                                      setFirstSegmentAngle(newFirstSegmentAngle);
                                    }
                                    break;
                                  }
                                }
                              } else if (segmentAbsoluteAngles.length > 0) {
                                const updatedAbsoluteAngles = [...segmentAbsoluteAngles];
                                const updatedAngles = [...angles];
                                updatedAngles[i] = finalAngle;

                                if (i + 1 < updatedAbsoluteAngles.length) {
                                  for (let j = i + 1; j < updatedAbsoluteAngles.length; j++) {
                                    const prevSegmentAngle = updatedAbsoluteAngles[j - 1];
                                    const turnAngle = updatedAngles[j - 1] || 0;
                                    updatedAbsoluteAngles[j] = normalizeDegrees(prevSegmentAngle + turnAngle);
                                  }
                                }
                                setSegmentAbsoluteAngles(updatedAbsoluteAngles);
                                const newPoints = calculatePointsLocal(lengths, trimmed, direction, updatedAbsoluteAngles, displayLengths, false);
                                setPoints(newPoints);
                                skipPointRecalc.current = true;
                              }

                              e.target.style.outline = '';
                              e.target.style.outlineOffset = '';
                              // Clear highlight
                              setEditingIndex({ type: null, index: null, profile: null });
                            }}
                            onChange={e => {
                              // Update both display value AND actual angles immediately (like length input)
                              const v = e.target.value;

                              // Only allow: empty, minus sign, or optional +/- prefix followed by digits only
                              // Reject any special characters, alphabets, etc.
                              if (v !== '' && v !== '-' && !/^[+-]?\d+$/.test(v)) {
                                return; // Reject invalid input
                              }

                              const nextDisplay = [...displayAngles];
                              nextDisplay[i] = v;
                              setDisplayAngles(nextDisplay.slice(0, Math.max(0, lengths.length - 1)));

                              // CRITICAL FIX: Only apply angle changes when input has 2 or more digits
                              // This prevents premature application when typing multi-digit angles
                              if (v === '' || v === '-') {
                                // If empty, set to 0 but DON'T apply geometry changes yet
                                // Just update the display - user is still editing
                                return;
                              }

                              const inputValue = Number(v);
                              if (isNaN(inputValue)) return; // Invalid input, skip update

                              // Only apply angle changes when we have 2 or more digits
                              // This allows users to type multi-digit angles without premature application
                              // Also prevents application when clearing a value (empty string was already handled above)
                              const hasMinimumDigits = Math.abs(inputValue) >= 10 || v.length >= 2;

                              if (!hasMinimumDigits) {
                                // Still updating, don't apply angle changes yet
                                // This covers: typing first digit, or after clearing when typing new value
                                return;
                              }

                              const absInput = Math.abs(inputValue);

                              // Angle > 180 validation - restore original angle to undo any intermediate changes
                              if (absInput > 180) {
                                // Restore original angle to ALL arrays (undo intermediate e.g. "20" from "200")
                                const prevAngle = angleRefs.current.originalAngles?.[i];
                                const restoreAngle = (prevAngle !== undefined && prevAngle !== null) ? prevAngle : 0;
                                const next = [...angles];
                                next[i] = restoreAngle;
                                const trimmed = next.slice(0, Math.max(0, lengths.length - 1));
                                setAngles(trimmed);
                                setFarAngles(trimmed);
                                setNearAngles(trimmed);
                                return;
                              }

                              const originalAngle = angleRefs.current.originalAngles?.[i];

                              let finalAngle;
                              if (originalAngle === undefined || originalAngle === null || originalAngle === '' || originalAngle === '-' || originalAngle === 0) {
                                finalAngle = normalizeDegrees(absInput);
                              } else {
                                finalAngle = originalAngle >= 0 ? absInput : -absInput;
                                finalAngle = normalizeDegrees(finalAngle);
                              }

                              const next = [...angles];
                              next[i] = finalAngle;
                              const trimmed = next.slice(0, Math.max(0, lengths.length - 1));
                              setAngles(trimmed);
                              setFarAngles(trimmed);
                              setNearAngles(trimmed);

                              // Handle segment rotation logic
                              if (i === 0 && segmentAbsoluteAngles.length > 0) {
                                const secondSegmentAngle = segmentAbsoluteAngles[1];
                                const newFirstSegmentAngle = normalizeDegrees(secondSegmentAngle - finalAngle);

                                const updatedAbsoluteAngles = [newFirstSegmentAngle];
                                for (let j = 1; j < segmentAbsoluteAngles.length; j++) {
                                  const prevAngle = updatedAbsoluteAngles[j - 1];
                                  const turnAngle = trimmed[j - 1] || 0;
                                  updatedAbsoluteAngles.push(normalizeDegrees(prevAngle + turnAngle));
                                }
                                setSegmentAbsoluteAngles(updatedAbsoluteAngles);
                                for (let j = 0; j < updatedAbsoluteAngles.length; j++) {
                                  const angle = updatedAbsoluteAngles[j];
                                  if (Math.abs(angle - 90) < 1.0 || Math.abs(angle + 90) < 1.0) {
                                    if (j === 1) {
                                      setFirstSegmentAngle(newFirstSegmentAngle);
                                    }
                                    break;
                                  }
                                }
                              } else if (segmentAbsoluteAngles.length > 0) {
                                const updatedAbsoluteAngles = [...segmentAbsoluteAngles];
                                const updatedAngles = [...angles];
                                updatedAngles[i] = finalAngle;

                                if (i + 1 < updatedAbsoluteAngles.length) {
                                  for (let j = i + 1; j < updatedAbsoluteAngles.length; j++) {
                                    const prevSegmentAngle = updatedAbsoluteAngles[j - 1];
                                    const turnAngle = updatedAngles[j - 1] || 0;
                                    updatedAbsoluteAngles[j] = normalizeDegrees(prevSegmentAngle + turnAngle);
                                  }
                                }
                                setSegmentAbsoluteAngles(updatedAbsoluteAngles);
                                const newPoints = calculatePointsLocal(lengths, trimmed, direction, updatedAbsoluteAngles, displayLengths, false);
                                setPoints(newPoints);
                                skipPointRecalc.current = true;
                              }
                            }}
                            onWheel={e => e.target.blur()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                // Trigger blur to update the angle
                                e.target.blur();
                              } else if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault();
                                // Trigger update before moving to next field
                                e.target.blur();
                                setTimeout(() => {
                                  if (i < angles.slice(0, lengths.length - 1).length - 1) {
                                    angleRefs.current[i + 1]?.focus();
                                  } else {
                                    // After last angle, go to Finish or skip to first Length if Finish disabled
                                    if (!showTaper) {
                                      if (hasZeroLength || hasEmptyLength) {
                                        // Skip Finish, loop to first Length
                                        lengthRefs.current[0]?.focus();
                                      } else {
                                        finishButtonRef.current?.focus();
                                      }
                                    } else {
                                      taperButtonRef.current?.focus();
                                    }
                                  }
                                }, 0);
                              } else if (e.key === 'Tab' && e.shiftKey) {
                                e.preventDefault();
                                // Trigger update before moving to previous field
                                e.target.blur();
                                setTimeout(() => {
                                  if (i > 0) {
                                    angleRefs.current[i - 1]?.focus();
                                  } else if (lengths.length > 0 && lengthRefs.current[lengths.length - 1]) {
                                    lengthRefs.current[lengths.length - 1]?.focus();
                                  }
                                }, 0);
                              }
                            }}
                          />
                        </Grid>
                      )
                    })}
                    {/* </div> */}
                  </Grid>
                </Grid>
              </Grid>
              <hr />
              {/* G & B Display */}
              <Grid container>
                <Grid item lg={6}>
                  <Typography fontWeight={"bold"} textAlign={"center"}>G: {getGirth(lengths, startFoldType, startFoldLength, endFoldType, endFoldLength)}</Typography>
                </Grid>
                <Grid item lg={6}>
                  <Typography fontWeight={"bold"} textAlign={"center"}>B: {(() => {
                    const hasFolds = startFoldType || endFoldType;

                    // Count base bends - angles in 170-180 range count as 2 bends
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

                    let bends = 0;

                    // DEBUG: Log to see what's happening
                    if (hasFolds) {
                      console.log('🔍 DEBUG - Lengths array:', lengths);
                      console.log('🔍 DEBUG - Base bends:', baseBends, 'Points count:', lengths.length);
                      console.log('🔍 DEBUG - Start fold:', startFoldType, 'End fold:', endFoldType);
                    }

                    if (hasFolds) {
                      // When there are folds, only add base bends if baseBends > 0
                      // If baseBends = 0 (straight line), don't add the "1" - just count fold bends
                      bends = baseBends;

                      // Add fold bends
                      if (startFoldType === 'Up' || startFoldType === 'Down' || startFoldType === 'OpenUp' || startFoldType === 'OpenDn') {
                        bends += 2;
                      }
                      if (endFoldType === 'Up' || endFoldType === 'Down' || endFoldType === 'OpenUp' || endFoldType === 'OpenDn') {
                        bends += 2;
                      }

                      console.log('🔍 DEBUG - Final bends with folds:', bends);
                    } else {
                      // No folds: count base geometry bends, minimum 1 for straight line
                      bends = Math.max(1, baseBends);
                    }

                    return bends;
                  })()}
                  </Typography>
                </Grid>
              </Grid>

              <Grid container spacing={1}>
                {/* Taper Button */}
                <Grid item lg={6} style={{display:'flex', justifyContent:"space-evenly"}}>
                  <button
                    ref={taperButtonRef}
                    className={`${styles.btn} ${styles.gray}`}
                    tabIndex={500}
                    title="Taper"
                    onMouseDown={() => {
                      // Stop continuous drawing when user clicks on Taper button
                      if (continuousDrawing) {
                        setContinuousDrawing(false);
                      }
                    }}
                    onFocus={(e) => {
                      e.target.style.backgroundColor = '#e3f2fd';
                      e.target.style.border = '2px solid #007bff';
                      e.target.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.3)';
                    }}
                    onBlur={(e) => {
                      e.target.style.backgroundColor = '';
                      e.target.style.border = '';
                      e.target.style.boxShadow = '';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault();
                        reverseColorRef.current?.focus();
                      } else if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault();
                        // Go back to last angle or last length
                        if (angles.length > 0 && angleRefs.current?.[angles.length - 1]) {
                          angleRefs.current[angles.length - 1]?.focus();
                        } else if (lengthRefs.current?.[lengths.length - 1]) {
                          lengthRefs.current[lengths.length - 1]?.focus();
                        }
                      }
                    }}
                    onClick={() => {
                      if (showTaper) {
                        setLengths([...farLengths]);
                        setAngles([...farAngles]);
                        // FIX: Sync displayAngles and displayLengths when exiting taper mode
                        // But preserve any > 180 values so the error stays visible
                        if (!hasAngleOver180) {
                          setDisplayAngles([...farAngles]);
                        }
                        setDisplayLengths([...farLengths]);
                        // Sync label offsets: Copy far labels to normal mode labels
                        setLabelOffsets(prev => ({
                          ...prev,
                          segmentLabels: { ...prev.farSegmentLabels },
                          angleLabels: { ...prev.farAngleLabels },
                          foldLabels: { ...prev.farFoldLabels }
                        }));
                        const pts = calculatePointsLocal(farLengths, farAngles, direction, segmentAbsoluteAngles, [], false);
                        const { offsetX, offsetY } = getScale(pts, 600, 500, 40, 1, { x: 0, y: 0 }, null, farLengths);
                      } else {
                        setFarLengths([...lengths]);
                        setNearLengths([...lengths]);
                        setFarAngles([...angles]);
                        setNearAngles([...angles]);
                        // FIX: Sync displayAngles with angles when entering taper mode
                        // But preserve any > 180 values so the error stays visible
                        if (!hasAngleOver180) {
                          setDisplayAngles([...angles]);
                        }
                        // Sync label offsets: Copy normal labels to far and near labels
                        setLabelOffsets(prev => ({
                          ...prev,
                          farSegmentLabels: { ...prev.segmentLabels },
                          nearSegmentLabels: { ...prev.segmentLabels },
                          farAngleLabels: { ...prev.angleLabels },
                          nearAngleLabels: { ...prev.angleLabels },
                          farFoldLabels: { ...prev.foldLabels },
                          nearFoldLabels: { ...prev.foldLabels }
                        }));
                        const farPts = calculatePointsLocal(lengths, angles, direction, [], [], false);
                        const farMainPts = farPts.filter(p => !p.isFold);
                        const { offsetX, offsetY } = getScale(farMainPts, 400, 400, 40, 1, { x: 0, y: 0 }, 0.5, lengths);
                      }
                      setShowTaper(!showTaper);
                      // Focus is handled by useEffect when showTaper changes
                    }}
                    style={{ width: '40px', height: '40px', padding: '0', minWidth: 'unset', borderRadius: '0', background: 'transparent', border: 'none', outline: 'none' }}
                  >
                    <FiZap size={24} style={{ color: '#000' }} />
                  </button>
                </Grid>
                {/* Reverse Color Button */}
                <Grid item lg={6} style={{display:'flex', justifyContent:"space-evenly"}}>
                  <button
                    ref={reverseColorRef}
                    className={`${styles.btn} ${reverseColor ? styles.gray:  styles.blue}`}
                    tabIndex={501}
                    title="Reverse Color"
                    onFocus={(e) => {
                      e.target.style.backgroundColor = '#e3f2fd';
                      e.target.style.border = '2px solid #007bff';
                      e.target.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.3)';
                    }}
                    onBlur={(e) => {
                      e.target.style.backgroundColor = '';
                      e.target.style.border = '';
                      e.target.style.boxShadow = '';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault();
                        finishButtonRef.current?.focus();
                      } else if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault();
                        taperButtonRef.current?.focus();
                      }
                    }}
                    onClick={() => setReverseColor(!reverseColor)}
                    style={{ width: '40px', height: '40px', padding: '0', minWidth: 'unset', borderRadius: '0', background: 'transparent', border: 'none', outline: 'none' }}
                  >
                    <BiColorFill size={24} style={{ color: '#000' }} />
                  </button>
                </Grid>
              </Grid>

              {/* Finish Button */}
              <button
                ref={finishButtonRef}
                className={`${styles.btn} ${styles.gray} taperFinishBtn`}
                tabIndex={502}
                disabled={!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180}
                onFocus={(e) => {
                  e.target.style.border = '3px solid #007bff';
                  e.target.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.3)';
                }}
                onBlur={(e) => {
                  const isDisabled = !hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180;
                  e.target.style.border = `1.5px solid ${isDisabled ? '#bdbdbd' : '#000000'}`;
                  e.target.style.boxShadow = '';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    // Loop back to first input field
                    if (showTaper) {
                      // In taper mode, go to first far length
                      if (farLengthRefs.current?.[0]) {
                        farLengthRefs.current[0]?.focus();
                      }
                    } else {
                      // In normal mode, go to first length
                      if (lengthRefs.current?.[0]) {
                        lengthRefs.current[0]?.focus();
                      }
                    }
                  } else if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    if (showTaper) {
                      // In taper mode, go back to last near length
                      if (nearLengthRefs.current?.[nearLengths.length - 1]) {
                        nearLengthRefs.current[nearLengths.length - 1]?.focus();
                      }
                    } else {
                      // In normal mode, go back to Reverse Color button
                      reverseColorRef.current?.focus();
                    }
                  }
                }}
                onClick={handleFinish}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  background: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#f5f5f5' : 'white',
                  borderColor: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#bdbdbd' : '#000000',
                  border: `1.5px solid ${(!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#bdbdbd' : '#000000'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  color: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#9e9e9e' : '#000000',
                  opacity: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? 0.6 : 1,
                  cursor: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? 'not-allowed' : 'pointer'
                }}
              >
                <HiCheckCircle size={16} style={{ color: (!hasValidDrawing || startFoldLengthError || endFoldLengthError || hasZeroLength || hasEmptyLength || hasAngleOver180 || (startFoldType && !startFoldLength) || (endFoldType && !endFoldLength)) ? '#9e9e9e' : '#000000' }} />
                Finish
              </button>
            </Grid>
          )
        }
      </Grid>
    </div>
  );
};

export default DrawingCanvas;
