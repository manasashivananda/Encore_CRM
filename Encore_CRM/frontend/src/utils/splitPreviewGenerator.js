/**
 * Frontend Split Preview Generator
 * Generates split preview images using the EXACT same rendering as DrawingCanvas
 * Uses shared shapeRenderer to ensure 100% consistency
 */

import Konva from 'konva';
import {
  getScale,
  getAdjustedPointsForMinimumSegments
} from './geometryUtils';
import { calculatePoints } from '../Pages/DrawingHelpers/DrawingCalculations';
import { renderShape } from './shapeRenderer';

/**
 * Convert fold type from template format (SF/SSF + direction) to calculatePoints format (Up/Down/OpenUp/OpenDn)
 * @param {string} foldType - Template fold type ('SF', 'SSF', or already converted)
 * @param {string} foldDirection - Fold direction ('Up' or 'Down')
 * @param {boolean} isEndFold - True if this is an end segment fold (needs reversed logic for SF)
 * @returns {string|null} - Converted fold type for calculatePoints
 */
export function convertFoldType(foldType, foldDirection, isEndFold = false) {
  if (!foldType) return null;

  // Normalize direction to lowercase for comparison
  const normalizedDirection = foldDirection ? foldDirection.toLowerCase() : '';

  // If already in Up/Down format (SF), convert based on direction
  if (foldType === 'Up' || foldType === 'Down') {
    // For end segment SF, reverse the direction
    if (isEndFold) {
      return normalizedDirection === 'down' ? 'Up' : 'Down';
    }
    // For start segment SF, use normal direction
    return normalizedDirection === 'down' ? 'Down' : 'Up';
  }

  // If already in OpenUp/OpenDn format (SSF), convert based on direction
  if (foldType === 'OpenUp' || foldType === 'OpenDn') {
    // For start segment SSF, reverse the direction
    if (!isEndFold) {
      return (normalizedDirection === 'opendn' || normalizedDirection === 'down') ? 'OpenUp' : 'OpenDn';
    }
    // For end segment SSF, use normal direction
    return (normalizedDirection === 'opendn' || normalizedDirection === 'down') ? 'OpenDn' : 'OpenUp';
  }

  // Convert from SF/SSF format
  if (foldType === 'SF') {
    // For end segment SF, reverse the direction
    if (isEndFold) {
      return normalizedDirection === 'down' ? 'Up' : 'Down';
    }
    // For start segment SF, use normal direction
    return normalizedDirection === 'down' ? 'Down' : 'Up';
  }

  if (foldType === 'SSF') {
    // For start segment SSF, reverse the direction
    if (!isEndFold) {
      if (normalizedDirection === 'opendn' || normalizedDirection === 'down') {
        return 'OpenUp';
      }
      return 'OpenDn';
    }
    // For end segment SSF, use normal direction
    if (normalizedDirection === 'opendn' || normalizedDirection === 'down') {
      return 'OpenDn';
    }
    return 'OpenUp';
  }

  return null;
}

/**
 * Generate a single drawing at a specific interpolation ratio
 * Used by SelectMaterialsSimplified to show individual split pieces
 * @param {Object} params - Parameters for single drawing generation
 * @returns {Promise<String>} - Base64 data URL of the drawing
 */
export async function generateSingleDrawing({
  farLengths = [],
  nearLengths = [],
  angles = [],
  direction = 'Right',
  firstSegmentAngle = null,
  reverseColor = false,
  flipH = false,
  flipV = false,
  interpolationRatio = 0.5, // 0 = FAR, 1 = NEAR, 0.5 = middle
  width = 300,
  height = 220,
  labelOffsets = null,
  fontSize = 28, // Default 28 for main page, can be overridden
  transparentBackground = false, // Default false to keep white background
  gradientStrokeWidth = 8, // Default 8 for main page
  outlineStrokeWidth = 6, // Default 6 for main page
  startFoldType = null,
  startFoldLength = 0,
  startFoldDirection = null,
  endFoldType = null,
  endFoldLength = 0,
  endFoldDirection = null,
  originalStartFoldLength = null, // NEW: Original fold length for labels
  originalEndFoldLength = null, // NEW: Original fold length for labels
  segmentAbsoluteAngles = [], // Absolute compass angles for precise rendering
  hideLabels = false, // NEW: When true, don't render labels (for draggable label overlay)
  useFixedScaleFromFar = false, // NEW: Use FAR lengths for scale calculation (consistent sizing across all splits)
  startFoldGap = 0, // SSF gap value for start fold
  endFoldGap = 0, // SSF gap value for end fold
  taperProfile = null // 'far', 'near', or null - auto-determined from interpolationRatio if not specified
}) {
  try {
    // Determine taperProfile from interpolationRatio if not explicitly specified
    // For taper/split drawings (nearLengths exists), use 'far' profile for label offsets
    // Since FAR and NEAR label offsets are synced in DrawingCanvas, using 'far' is consistent
    let effectiveTaperProfile = taperProfile;
    if (effectiveTaperProfile === null && nearLengths.length > 0) {
      // Use 'far' for all taper/split drawings to ensure consistent label positioning
      // The only exception is when interpolationRatio is exactly 1 (pure NEAR)
      if (interpolationRatio === 1) {
        effectiveTaperProfile = 'near';
      } else {
        effectiveTaperProfile = 'far';
      }
    }

    // Calculate interpolated lengths at this ratio
    const interpolatedLengths = farLengths.map((farLen, i) => {
      const nearLen = nearLengths[i] !== undefined ? nearLengths[i] : farLen;
      const numFarLen = Number(farLen) || 0;
      const numNearLen = Number(nearLen) || 0;
      return numFarLen + interpolationRatio * (numNearLen - numFarLen);
    });

    // FIXED: Folds should NOT be scaled - they remain constant across all split pieces
    // Fold dimensions (SF 10, SSF 10) are fixed physical dimensions, not tapered
    let interpolatedStartFoldLength = startFoldLength;
    let interpolatedEndFoldLength = endFoldLength;

    // Generate the drawing using shared logic
    const result = await generateSinglePreview({
      lengths: interpolatedLengths,
      angles,
      direction,
      firstSegmentAngle,
      reverseColor,
      flipH,
      flipV,
      label: `Ratio ${interpolationRatio}`,
      width,
      height,
      labelOffsets,
      fontSize,
      transparentBackground,
      gradientStrokeWidth,
      outlineStrokeWidth,
      startFoldType,
      startFoldLength: interpolatedStartFoldLength,
      startFoldDirection,
      endFoldType,
      endFoldLength: interpolatedEndFoldLength,
      endFoldDirection,
      originalStartFoldLength, // Pass through for label correction
      originalEndFoldLength, // Pass through for label correction
      segmentAbsoluteAngles, // Pass through for precise rendering
      hideLabels, // Pass through for draggable label overlay
      useFixedScaleFromFar, // Use FAR lengths for consistent scale
      farLengths: farLengths.map(Number), // Pass FAR lengths for scale calculation
      nearLengths: nearLengths.map(Number), // Pass NEAR lengths for max bounds calculation
      interpolatedStartFoldLength,
      interpolatedEndFoldLength,
      startFoldGap, // Pass SSF gap values
      endFoldGap,
      taperProfile: effectiveTaperProfile // Use FAR/NEAR specific label offsets when applicable
    });

    // Return full result with metadata for overlay alignment
    return result;
  } catch (error) {
    console.error('Error generating single drawing:', error);
    return null;
  }
}

/**
 * Generate split preview images for a single split piece
 * @param {Object} params - Parameters for split preview generation
 * @returns {Promise<Object>} - Object with farImage and nearImage as base64 data URLs
 */
export async function generateSplitPreview({
  farLengths = [],
  nearLengths = [],
  angles = [],
  direction = 'Right',
  firstSegmentAngle = null,
  reverseColor = false,
  flipH = false,
  flipV = false,
  splitIndex = 1,
  splitTotal = 1,
  labelOffsets = null,
  startFoldType = null,
  startFoldLength = 0,
  startFoldDirection = null,
  endFoldType = null,
  endFoldLength = 0,
  endFoldDirection = null,
  startFoldGap = 0, // SSF gap value for start fold
  endFoldGap = 0, // SSF gap value for end fold
  originalFarLengths = null, // Original FAR lengths before split - for consistent scale
  originalNearLengths = null, // Original NEAR lengths before split - for consistent scale
  labelOffsetScale = null // Scale used when saving label offsets (for correct offset application)
}) {
  // Calculate dynamic dimensions based on drawing's aspect ratio
  // This ensures tall drawings get enough canvas height
  // Reduced from 1200x850 to match non-split preview sizing for consistent line thickness
  let width = 800;
  let height = 600;

  try {
    // Convert fold types for point calculation
    const convertedStartFoldType = convertFoldType(startFoldType, startFoldDirection, false);
    const convertedEndFoldType = convertFoldType(endFoldType, endFoldDirection, true);

    // Use original FAR lengths for consistent canvas sizing across all split pieces
    const refLengths = originalFarLengths || farLengths;

    // Calculate points to determine aspect ratio (use original farLengths as reference for consistency)
    const testPoints = calculatePoints(
      refLengths,
      angles,
      direction,
      [], // segmentAbsoluteAngles
      [], // preservedLengths
      false, // applyFixedWidths
      { x: 0, y: 0 }, // originOffset
      firstSegmentAngle,
      convertedStartFoldType,
      startFoldLength,
      convertedEndFoldType,
      endFoldLength
    );

    if (testPoints && testPoints.length > 0) {
      const xs = testPoints.map(p => p.x);
      const ys = testPoints.map(p => p.y);
      const drawingWidth = Math.max(...xs) - Math.min(...xs);
      const drawingHeight = Math.max(...ys) - Math.min(...ys);

      // Only consider "wide" if width is significantly greater than height (ratio > 2)
      // This prevents diagonal step drawings from being classified as wide
      const aspectRatio = drawingHeight > 0 ? drawingWidth / drawingHeight : 1;
      const isWideDrawing = aspectRatio > 2;

      // GIRTH-BASED HEIGHT CALCULATION
      const girth = refLengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0);
      const segmentCount = refLengths.length;

      if (isWideDrawing) {
        // WIDE drawings - use smaller heights
        if (girth <= 500) {
          height = 400; // Small/medium wide
        } else if (girth <= 1000) {
          height = 450; // Large wide
        } else {
          height = 500; // Very large wide
        }
      } else {
        // TALL drawings - use girth + segment count
        if (girth <= 250) {
          height = 600; // Small parts
        } else if (girth <= 500) {
          height = 700; // Medium parts
        } else if (girth <= 1000) {
          // For drawings with many bends (like Monument), increase height
          if (segmentCount > 10) {
            height = 1100; // Complex large parts (16+ bends)
          } else {
            height = 800; // Simple large parts
          }
        } else {
          // Very large parts - check if complex (many segments)
          if (segmentCount > 10) {
            height = 1500; // Complex large drawings
          } else if (segmentCount > 5) {
            height = 1100; // Medium complex large drawings
          } else {
            height = 800; // Simple large drawings
          }
        }
      }
    }
  } catch (error) {
    // Keep default dimensions on error
    console.warn('Error calculating dynamic dimensions:', error);
  }

  try {
    // Use original FAR/NEAR lengths for consistent scale across all split pieces
    // If not provided, fall back to the split-specific lengths
    const scaleRefFarLengths = originalFarLengths || farLengths;
    const scaleRefNearLengths = originalNearLengths || nearLengths;

    // Generate FAR and NEAR previews
    // generateSinglePreview now returns { image, scale, offsetX, offsetY, flippedPts }
    const farResult = await generateSinglePreview({
      lengths: farLengths,
      angles,
      direction,
      firstSegmentAngle,
      reverseColor,
      flipH,
      flipV,
      label: 'FAR',
      width,
      height,
      labelOffsets,
      startFoldType,
      startFoldLength,
      startFoldDirection,
      endFoldType,
      endFoldLength,
      endFoldDirection,
      startFoldGap,
      endFoldGap,
      // Pass fold lengths as original values so label generation includes gap
      originalStartFoldLength: startFoldLength,
      originalEndFoldLength: endFoldLength,
      // Use original lengths for consistent scale across all split pieces
      useFixedScaleFromFar: !!originalFarLengths,
      farLengths: scaleRefFarLengths.map(Number),
      nearLengths: scaleRefNearLengths.map(Number),
      labelOffsetScale,
      taperProfile: 'far' // Use FAR profile label offsets
    });

    const nearResult = await generateSinglePreview({
      lengths: nearLengths,
      angles,
      direction,
      firstSegmentAngle,
      reverseColor,
      flipH,
      flipV,
      label: 'NEAR',
      width,
      height,
      labelOffsets,
      startFoldType,
      startFoldLength,
      startFoldDirection,
      endFoldType,
      endFoldLength,
      endFoldDirection,
      startFoldGap,
      endFoldGap,
      // Pass fold lengths as original values so label generation includes gap
      originalStartFoldLength: startFoldLength,
      originalEndFoldLength: endFoldLength,
      // Use original lengths for consistent scale across all split pieces
      useFixedScaleFromFar: !!originalFarLengths,
      farLengths: scaleRefFarLengths.map(Number),
      nearLengths: scaleRefNearLengths.map(Number),
      labelOffsetScale,
      taperProfile: 'near' // Use NEAR profile label offsets
    });

    // Extract image strings from results
    return {
      farImage: farResult?.image || farResult,
      nearImage: nearResult?.image || nearResult
    };
  } catch (error) {
    console.error('Error generating split preview:', error);
    return null;
  }
}

/**
 * Generate a single preview (FAR or NEAR)
 * Now uses the shared renderShape function - exact same rendering as DrawingCanvas
 */
async function generateSinglePreview({
  lengths,
  angles,
  direction,
  firstSegmentAngle,
  reverseColor,
  flipH = false,
  flipV = false,
  label,
  width,
  height,
  labelOffsets,
  fontSize = 28,
  transparentBackground = false,
  gradientStrokeWidth = 8,
  outlineStrokeWidth = 8,
  startFoldType = null,
  startFoldLength = 0,
  startFoldDirection = null,
  endFoldType = null,
  endFoldLength = 0,
  endFoldDirection = null,
  originalStartFoldLength = null,
  originalEndFoldLength = null,
  segmentAbsoluteAngles = [], // Absolute compass angles for precise rendering
  hideLabels = false, // When true, don't render labels (for draggable label overlay)
  useFixedScaleFromFar = false, // Use maximum bounds for consistent scale
  farLengths = [], // FAR lengths for scale calculation
  nearLengths = [], // NEAR lengths for max bounds calculation
  interpolatedStartFoldLength = 0,
  interpolatedEndFoldLength = 0,
  startFoldGap = 0, // SSF gap value for start fold
  endFoldGap = 0, // SSF gap value for end fold
  labelOffsetScale = null, // Scale used when saving label offsets (for correct offset application)
  taperProfile = null // 'far', 'near', or null - used to look up correct label offsets in taper mode
}) {
  // Create off-screen stage
  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width,
    height
  });

  const layer = new Konva.Layer();
  stage.add(layer);

  // Convert fold types from template format to calculatePoints format
  const convertedStartFoldType = convertFoldType(startFoldType, startFoldDirection, false);
  const convertedEndFoldType = convertFoldType(endFoldType, endFoldDirection, true);

  // Calculate points with fold data
  // Use segmentAbsoluteAngles for precise rendering when available (prevents tilt issues with folds)
  const points = calculatePoints(
    lengths,
    angles,
    direction,
    segmentAbsoluteAngles, // Use absolute angles for precise rendering
    [], // preservedLengths
    false, // applyFixedWidths
    { x: 0, y: 0 }, // originOffset
    firstSegmentAngle,
    convertedStartFoldType,
    startFoldLength,
    convertedEndFoldType,
    endFoldLength
  );

  // CRITICAL: Update fold points to store the INTERPOLATED fold lengths
  // Also fix the labels to use ORIGINAL fold lengths, not interpolated
  // Use POSITION in array (not foldType) to determine start vs end fold,
  // because convertedStartFoldType and convertedEndFoldType can be identical
  // when both folds exist with same direction type (e.g., both SF Up).
  if (points.some(p => p.isFold)) {
    // Start fold points are at the beginning (before first non-fold point)
    // End fold points are at the end (after last non-fold point)
    let lastNonFoldIdx = -1;
    for (let i = points.length - 1; i >= 0; i--) {
      if (!points[i].isFold) { lastNonFoldIdx = i; break; }
    }

    points.forEach((p, idx) => {
      if (p.isFold) {
        const isEndFoldByPosition = idx > lastNonFoldIdx;

        if (isEndFoldByPosition) {
          p.interpolatedFoldLength = endFoldLength;
          p.isEndFold = true;
          if (originalEndFoldLength !== null && originalEndFoldLength !== undefined) {
            const foldTypeLabel = (convertedEndFoldType === 'OpenUp' || convertedEndFoldType === 'OpenDn') ? 'SSF' : 'SF';
            // Include gap in SSF label on new line (e.g., "SSF 10\n4mm Gap")
            const gapValue = Number(endFoldGap) || 0;
            p.label = (foldTypeLabel === 'SSF' && gapValue > 0)
              ? `${foldTypeLabel} ${originalEndFoldLength}\n${gapValue}mm Gap`
              : `${foldTypeLabel} ${originalEndFoldLength}`;
          }
        } else {
          p.interpolatedFoldLength = startFoldLength;
          p.isEndFold = false;
          if (originalStartFoldLength !== null && originalStartFoldLength !== undefined) {
            const foldTypeLabel = (convertedStartFoldType === 'OpenUp' || convertedStartFoldType === 'OpenDn') ? 'SSF' : 'SF';
            // Include gap in SSF label on new line (e.g., "SSF 10\n4mm Gap")
            const gapValue = Number(startFoldGap) || 0;
            p.label = (foldTypeLabel === 'SSF' && gapValue > 0)
              ? `${foldTypeLabel} ${originalStartFoldLength}\n${gapValue}mm Gap`
              : `${foldTypeLabel} ${originalStartFoldLength}`;
          }
        }
      }
    });
  }

  // Get scale and transform
  // When FAR/NEAR lengths are provided, calculate scale based on MAXIMUM bounds
  // This ensures all taper drawings (split and non-split) fit within the canvas
  let scalePoints = points;
  let scaleLengths = lengths;

  // Use maximum bounds for scale ONLY when useFixedScaleFromFar is true (split drawings)
  // For non-split taper views, each drawing (Far/Near) should scale independently to fill its canvas
  if (useFixedScaleFromFar && farLengths.length > 0) {
    // Calculate points from FAR lengths
    const farPoints = calculatePoints(
      farLengths.map(Number),
      angles,
      direction,
      segmentAbsoluteAngles,
      [],
      false,
      { x: 0, y: 0 },
      firstSegmentAngle,
      convertedStartFoldType,
      interpolatedStartFoldLength,
      convertedEndFoldType,
      interpolatedEndFoldLength
    );

    // Calculate bounding box for FAR
    const farXs = farPoints.map(p => p.x);
    const farYs = farPoints.map(p => p.y);
    const farWidth = Math.max(...farXs) - Math.min(...farXs);
    const farHeight = Math.max(...farYs) - Math.min(...farYs);

    // Default to FAR
    scalePoints = farPoints;
    scaleLengths = farLengths.map(Number);

    // If NEAR lengths are provided, calculate NEAR bounds and use the larger one
    if (nearLengths.length > 0) {
      const nearPoints = calculatePoints(
        nearLengths.map(Number),
        angles,
        direction,
        segmentAbsoluteAngles,
        [],
        false,
        { x: 0, y: 0 },
        firstSegmentAngle,
        convertedStartFoldType,
        interpolatedStartFoldLength,
        convertedEndFoldType,
        interpolatedEndFoldLength
      );

      // Calculate bounding box for NEAR
      const nearXs = nearPoints.map(p => p.x);
      const nearYs = nearPoints.map(p => p.y);
      const nearWidth = Math.max(...nearXs) - Math.min(...nearXs);
      const nearHeight = Math.max(...nearYs) - Math.min(...nearYs);

      // Use whichever has the larger bounding box (to ensure all pieces fit)
      const farArea = farWidth * farHeight;
      const nearArea = nearWidth * nearHeight;

      if (nearArea > farArea) {
        scalePoints = nearPoints;
        scaleLengths = nearLengths.map(Number);
      }
    }
  }

  const { scale, offsetX, offsetY } = getScale(
    scalePoints,
    width,
    height,
    50, // padding for labels
    1, // canvasScale
    { x: 0, y: 0 }, // canvasOffset
    0.70, // shrinkFactor to fill 70% of canvas (reduced from 0.85 to give more room for labels)
    scaleLengths,
    false, // preventAutoCenter
    null // firstClickPixelPos
  );

  // CRITICAL FIX: Apply minimum segment lengths even with folds present
  // For split taper drawings with folds, we need to ensure fold segments are visible
  // Build a lengths array that includes fold lengths, then use standard adjustment
  const hasFolds = points.some(p => p.isFold);
  let adjustedPts;

  if (hasFolds) {
    // Build a complete lengths array that includes interpolated fold lengths
    // This allows us to use the standard getAdjustedPointsForMinimumSegments function
    const completeLengths = [];
    let mainSegmentIndex = 0; // Track which main segment we're on

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Check if this segment is a fold segment (either endpoint is a fold point)
      if (p1.isFold || p2.isFold) {
        // This is a fold segment - use interpolated fold length
        const foldLen = p2.interpolatedFoldLength || p2.foldLength || p1.interpolatedFoldLength || p1.foldLength || 20;
        completeLengths.push(foldLen);
      } else {
        // This is a main segment - use from original lengths array
        if (mainSegmentIndex < lengths.length) {
          completeLengths.push(lengths[mainSegmentIndex]);
          mainSegmentIndex++;
        }
      }
    }

    // Now use the standard adjustment function with complete lengths
    adjustedPts = getAdjustedPointsForMinimumSegments(points, completeLengths, scale, true);
  } else {
    // No folds, use standard adjustment
    adjustedPts = getAdjustedPointsForMinimumSegments(points, lengths, scale, true);
  }

  // Draw white background (optional)
  if (!transparentBackground) {
    const background = new Konva.Rect({
      x: 0,
      y: 0,
      width,
      height,
      fill: 'white'
    });
    layer.add(background);
  }

  // Apply flip transformations to points if needed
  let flippedPts = adjustedPts;
  if (flipH || flipV) {
    // Calculate bounding box center for flip axis
    const xs = adjustedPts.map(p => p.x);
    const ys = adjustedPts.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Apply flip to each point
    flippedPts = adjustedPts.map(p => ({
      ...p,
      x: flipH ? centerX - (p.x - centerX) : p.x,
      y: flipV ? centerY - (p.y - centerY) : p.y
    }));
  }

  // =============================================================================
  // CENTERING LOGIC - Separate conditions for each drawing type
  // =============================================================================
  let finalOffsetX;
  let finalOffsetY;

  // CASE 1: Split drawings (useFixedScaleFromFar === true)
  // - Scale and offset both calculated from FAR/NEAR max bounds
  // - Original offset from getScale() works correctly
  const isSplitDrawing = useFixedScaleFromFar === true;

  // CASE 2: Non-split taper (useFixedScaleFromFar === false AND farLengths provided)
  // - Scale uses the actual drawing's dimensions (not FAR/NEAR max)
  // - Each drawing (Far/Near) scales independently to fill its canvas
  // - Still need to recalculate centering based on actual drawn shape
  const isNonSplitTaper = useFixedScaleFromFar === false && farLengths.length > 0;

  // CASE 3: Non-split non-taper (useFixedScaleFromFar === false AND no farLengths)
  // - Regular drawing, scale and offset match the actual shape
  // - Original offset from getScale() works correctly
  const isNonSplitNonTaper = useFixedScaleFromFar === false && farLengths.length === 0;

  if (isSplitDrawing) {
    // SPLIT DRAWINGS: Recalculate centering based on actual flippedPts
    // Each split piece has different proportions, so center each based on its own bounds
    // IMPORTANT: Filter out fold points - only use main shape points for centering
    // Fold points extend perpendicular and shouldn't affect the main shape center
    const mainShapePts = flippedPts.filter(p => !p.isFold);
    const ptsForCenter = mainShapePts.length > 0 ? mainShapePts : flippedPts;

    const actualXs = ptsForCenter.map(p => p.x);
    const actualYs = ptsForCenter.map(p => p.y);
    const actualMinX = Math.min(...actualXs);
    const actualMaxX = Math.max(...actualXs);
    const actualMinY = Math.min(...actualYs);
    const actualMaxY = Math.max(...actualYs);
    const actualCenterX = (actualMinX + actualMaxX) / 2;
    const actualCenterY = (actualMinY + actualMaxY) / 2;

    const stageCenterX = width / 2;
    const stageCenterY = height / 2;
    finalOffsetX = stageCenterX - actualCenterX * scale;
    finalOffsetY = stageCenterY - actualCenterY * scale;
  } else if (isNonSplitTaper) {
    // NON-SPLIT TAPER: Recalculate centering based on actual flippedPts
    // IMPORTANT: Filter out fold points - only use main shape points for centering
    const mainShapePts = flippedPts.filter(p => !p.isFold);
    const ptsForCenter = mainShapePts.length > 0 ? mainShapePts : flippedPts;

    const actualXs = ptsForCenter.map(p => p.x);
    const actualYs = ptsForCenter.map(p => p.y);
    const actualMinX = Math.min(...actualXs);
    const actualMaxX = Math.max(...actualXs);
    const actualMinY = Math.min(...actualYs);
    const actualMaxY = Math.max(...actualYs);
    const actualCenterX = (actualMinX + actualMaxX) / 2;
    const actualCenterY = (actualMinY + actualMaxY) / 2;

    const stageCenterX = width / 2;
    const stageCenterY = height / 2;
    finalOffsetX = stageCenterX - actualCenterX * scale;
    finalOffsetY = stageCenterY - actualCenterY * scale;
  } else if (isNonSplitNonTaper) {
    // NON-SPLIT NON-TAPER: Use original offset from getScale()
    finalOffsetX = offsetX;
    finalOffsetY = offsetY;
  } else {
    // FALLBACK: Should never reach here, but use original offset as safety
    finalOffsetX = offsetX;
    finalOffsetY = offsetY;
  }
  // =============================================================================

  // Use shared rendering logic - exact same as DrawingCanvas
  renderShape({
    layer,
    points: flippedPts,
    lengths,
    angles,
    scale,
    offsetX: finalOffsetX,
    offsetY: finalOffsetY,
    reverseColor,
    flipH,
    flipV,
    labelOffsets,
    isAutoSetDrawing: true, // Most drawings are auto-set
    hasAutoSetColorSide: true,
    fontSize,
    gradientStrokeWidth,
    outlineStrokeWidth,
    isTaperMode: false, // Use same rendering as DrawingCanvas for consistency
    hideLabels, // Pass through to skip label rendering for draggable overlay
    isSplitDrawing: true, // Use fixed fold arc sizing for consistency across all split pieces
    startFoldGap, // SSF gap value for start fold
    endFoldGap, // SSF gap value for end fold
    labelOffsetScale, // Scale used when saving label offsets
    taperProfile // 'far', 'near', or null - for correct label offset lookup in taper mode
  });

  layer.draw();

  // Convert to base64 - use pixelRatio: 4 to match non-split drawings (DrawingCanvas)
  // This ensures consistent line thickness between split and non-split previews
  const dataURL = stage.toDataURL({ pixelRatio: 1 });

  // Clean up
  stage.destroy();

  // Return image and metadata for overlay alignment
  return {
    image: dataURL,
    scale,
    offsetX: finalOffsetX,
    offsetY: finalOffsetY,
    flippedPts
  };
}
