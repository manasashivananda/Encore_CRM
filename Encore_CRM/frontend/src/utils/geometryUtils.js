// geometryUtils.js
import { logger } from './logger';

// Consistent label positioning constants - balanced for visibility
const LABEL_OFFSET_DISTANCE = 12; // Balanced distance for all labels from drawing elements

// Minimum rendered segment width in pixels for visibility
const MIN_SEGMENT_WIDTH_TINY = 60; // For length 0-10mm
const MIN_SEGMENT_WIDTH_EXTRA_SMALL = 120; // For length 11-100mm
const MIN_SEGMENT_WIDTH_SMALL = 130; // For length 101-499mm
const MAX_SEGMENT_WIDTH_MEDIUM = 150; // For length 500-999mm
const MAX_SEGMENT_WIDTH_LARGE = 200; // For length 1000mm+
export function getScale(
  pts,
  stageW,
  stageH,
  padding = 40,
  canvasScale = 1,
  canvasOffset = { x: 0, y: 0 },
  shrinkFactor = null, // Auto-calculate from girth if null, or use explicit value
  lengths = [], // Add lengths parameter to check for 1000mm segments
  preventAutoCenter = false, // New flag to prevent auto-centering
  firstClickPixelPos = null // Pixel position where user first clicked to maintain position
) {
  // Safety check for invalid inputs
  if (!pts || pts.length === 0) {
    return { scale: 1, offsetX: stageW / 2, offsetY: stageH / 2 };
  }

  // Ensure canvasOffset is always defined with default values
  const safeCanvasOffset = canvasOffset || { x: 0, y: 0 };
  if (!safeCanvasOffset.x) safeCanvasOffset.x = 0;
  if (!safeCanvasOffset.y) safeCanvasOffset.y = 0;

  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const drawingW = maxX - minX, drawingH = maxY - minY;

  // For very small drawings (like a single line), ensure minimum size
  const minDrawingSize = 50;
  const effectiveDrawingW = Math.max(drawingW, minDrawingSize);
  const effectiveDrawingH = Math.max(drawingH, minDrawingSize);

  // GIRTH-BASED SCALING: Calculate shrinkFactor based on overall girth
  // But apply uniform scaling to maintain aspect ratio
  if (shrinkFactor === null && lengths.length > 0) {
    // Calculate total girth (sum of all segment lengths)
    const girth = lengths.reduce((sum, len) => sum + (len === "" ? 0 : Number(len)), 0);

    // Determine base shrinkFactor from girth tiers
    // This controls how much of the canvas the drawing should fill
    // Higher percentage = more zoom/less whitespace
    if (girth <= 250) {
      shrinkFactor = 0.75; // Small parts → 75% of available space
    } else if (girth <= 500) {
      shrinkFactor = 0.70; // Medium parts → 70% of available space
    } else if (girth <= 1000) {
      shrinkFactor = 0.65; // Large parts → 65% of available space
    } else {
      shrinkFactor = 0.58; // Very large parts → 58% of available space (not 0.6 to avoid taper mode detection)
    }

    console.log('🎯 GIRTH-BASED SCALING:', {
      girth,
      shrinkFactor,
      tierDescription: girth <= 250 ? 'Small (≤250mm)' : girth <= 500 ? 'Medium (250-500mm)' : 'Large (>500mm)',
      lengths,
      drawingW,
      drawingH
    });
  } else if (shrinkFactor === null) {
    // Fallback if no lengths provided
    shrinkFactor = 0.65;
  }

  // Calculate target dimensions based on shrinkFactor
  const targetCanvasW = (stageW - padding) * shrinkFactor;
  const targetCanvasH = (stageH - padding) * shrinkFactor;

  // Calculate scale to fit drawing within target area while maintaining aspect ratio
  const baseScale = Math.min(
    targetCanvasW / (effectiveDrawingW || 1),
    targetCanvasH / (effectiveDrawingH || 1)
  );

  // Apply canvas scale multiplier
  let scale = baseScale * canvasScale;

  console.log('📏 FINAL SCALE CALCULATION:', {
    baseScale,
    canvasScale,
    finalScale: scale,
    shrinkFactor,
    effectiveDrawingW,
    effectiveDrawingH,
    targetCanvasW,
    targetCanvasH
  });

  // Check if this is being called for taper mode (shrinkFactor = 0.6)
  const isTaperMode = shrinkFactor === 0.6;
  
  // ONLY use fixed scale when actively drawing (preventAutoCenter = true)
  // When not drawing, use dynamic scale and normal centering logic below
  if (preventAutoCenter && !isTaperMode) {
    // Use a fixed scale during continuous drawing
    scale = 1.0 * canvasScale;  // Fixed scale for consistent drawing experience

    // Skip all other scale adjustments by returning early
    const stageCenterX = stageW / 2;
    const stageCenterY = stageH / 2;

    let offsetX, offsetY;
    if (firstClickPixelPos && pts.length > 0) {
      // During drawing, maintain position relative to first click
      const firstPoint = pts[0];
      offsetX = firstClickPixelPos.x - (firstPoint.x * scale);
      offsetY = firstClickPixelPos.y - (firstPoint.y * scale);
    } else {
      // Fallback to center
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      offsetX = stageCenterX - (centerX * scale);
      offsetY = stageCenterY - (centerY * scale);
    }

    const finalOffsetX = isFinite(offsetX) ? offsetX : stageCenterX;
    const finalOffsetY = isFinite(offsetY) ? offsetY : stageCenterY;

    return { scale, offsetX: finalOffsetX, offsetY: finalOffsetY };
  }

  // Check if the drawing fits within the stage with current scale
  const drawingPixelWidth = effectiveDrawingW * scale;
  const drawingPixelHeight = effectiveDrawingH * scale;
  const availableWidth = stageW - padding;
  const availableHeight = stageH - padding;

  // GIRTH-BASED SCALING: Don't override the calculated scale!
  // The scale has already been calculated based on girth tiers above
  // Only ensure the drawing fits within canvas if it's too large
  if (!preventAutoCenter && (drawingPixelWidth > availableWidth || drawingPixelHeight > availableHeight)) {
    // Drawing is too large - scale it down to fit
    scale = Math.min(
      availableWidth / effectiveDrawingW,
      availableHeight / effectiveDrawingH
    ) * canvasScale;
    console.log('⚠️ Drawing too large, scaling down to fit:', scale);
  }

  // NO minimum scale enforcement - let girth-based scaling control the final scale
  // Small drawings SHOULD be large (zoomed in), large drawings SHOULD be small (zoomed out)

  // Ensure scale is always a valid positive number
  if (!isFinite(scale) || scale <= 0) {
    scale = 1;
  }

  // Center the drawing properly (unless preventAutoCenter is true)
  let offsetX, offsetY;
  const stageCenterX = stageW / 2;
  const stageCenterY = stageH / 2;
  
  if (preventAutoCenter && firstClickPixelPos && pts.length > 0) {
    // Don't auto-center - keep the drawing where the user placed it
    // The first point of the drawing should stay at the pixel position where user first clicked
    const firstPoint = pts[0];
    // Calculate offset that keeps the first point at the original click position
    // firstPoint is in drawing coordinates, we need to place it at firstClickPixelPos in screen coordinates
    offsetX = firstClickPixelPos.x - (firstPoint.x * scale) + safeCanvasOffset.x;
    offsetY = firstClickPixelPos.y - (firstPoint.y * scale) + safeCanvasOffset.y;
  } else if (preventAutoCenter) {
    // Fallback if we don't have pixel position
    const firstPoint = pts[0];
    offsetX = stageCenterX - firstPoint.x * scale + safeCanvasOffset.x;
    offsetY = stageCenterY - firstPoint.y * scale + safeCanvasOffset.y;
  } else {
    // Auto-center the drawing (for templates and completed drawings)
    const drawingCenterX = (minX + maxX) / 2;
    const drawingCenterY = (minY + maxY) / 2;

    // For zoom to work properly, we need to keep the center point fixed
    // When zooming, the drawing should scale around the center of the stage
    offsetX = stageCenterX - drawingCenterX * scale + safeCanvasOffset.x;
    offsetY = stageCenterY - drawingCenterY * scale + safeCanvasOffset.y;

    // GRID ALIGNMENT: Only apply grid snapping for larger scales
    // For very small scales (like 0.2 for 1000mm segments), skip grid alignment
    // as it causes incorrect positioning
    const GRID_SIZE = 20;
    const MIN_SCALE_FOR_GRID_SNAP = 0.5;

    if (scale >= MIN_SCALE_FOR_GRID_SNAP) {
      // We need to ensure that when the drawing is centered, its points align with grid lines
      // Calculate where the first point would be rendered after centering
      if (pts.length > 0) {
        const firstPoint = pts[0];

        // Calculate the screen position of the first point with current offset
        let firstPointScreenX = firstPoint.x * scale + offsetX;
        let firstPointScreenY = firstPoint.y * scale + offsetY;

        // Calculate the nearest grid line for the first point
        // Grid lines are at positions: 0, 20, 40, 60, 80, 100, etc.
        const nearestGridX = Math.round(firstPointScreenX / GRID_SIZE) * GRID_SIZE;
        const nearestGridY = Math.round(firstPointScreenY / GRID_SIZE) * GRID_SIZE;

        // Adjust the offset to snap the first point to the nearest grid line
        const adjustmentX = nearestGridX - firstPointScreenX;
        const adjustmentY = nearestGridY - firstPointScreenY;

        offsetX += adjustmentX;
        offsetY += adjustmentY;
      } else {
        // Fallback: just snap the offset to grid if no points
        offsetX = Math.round(offsetX / GRID_SIZE) * GRID_SIZE;
        offsetY = Math.round(offsetY / GRID_SIZE) * GRID_SIZE;
      }
    }
  }

  // Ensure offsets are valid numbers
  const finalOffsetX = isFinite(offsetX) ? offsetX : stageCenterX;
  const finalOffsetY = isFinite(offsetY) ? offsetY : stageCenterY;

  return { scale, offsetX: finalOffsetX, offsetY: finalOffsetY };
}

/**
 * Calculate adjusted points to ensure minimum segment visibility
 * This function modifies point positions to ensure small segments are still visible
 */
export function getAdjustedPointsForMinimumSegments(points, lengths, scale, isTaperMode = false) {
  // Safety check - return original points if invalid input
  if (!points || points.length < 2 || !lengths || lengths.length === 0) {
    return points;
  }

  // Create a new array for adjusted points, starting from the first point
  const adjustedPoints = [points[0]]; // Keep first point at origin

  // Process each segment individually
  for (let i = 0; i < lengths.length && i < points.length - 1; i++) {
    const originalLength = Number(lengths[i]) || 0;

    // Get the current segment's start and original end points
    const start = adjustedPoints[i];
    const originalEnd = points[i + 1];

    // Calculate the original segment vector to maintain angle
    const dx = originalEnd.x - points[i].x;
    const dy = originalEnd.y - points[i].y;
    const originalSegmentLength = Math.hypot(dx, dy);

    // Determine the target length for this segment
    let targetLength = originalSegmentLength; // Default to original

    // TIERED MINIMUM WIDTHS: Apply proportional minimums to maintain size relationships
    // Larger segments get larger minimums to preserve visual proportions
    // TAPER MODE: Use reduced minimums to prevent cutoff in smaller canvas
    let minPixels = 0;

    if (isTaperMode) {
      // TAPER mode: Proportional minimum (smaller values for smaller canvas)
      if (originalLength <= 1) {
        minPixels = 10; // 0-1mm: keep small
      } else {
        // Base of 22px + 0.7px per mm - safe for grid, visible differences
        // 15mm = 22 + 10.5 = 32.5px
        // 29mm = 22 + 20.3 = 42.3px (difference: 10px)
        // 60mm = 22 + 42 = 64px
        // 100mm = 70px (capped)
        minPixels = Math.min(22 + (originalLength * 0.7), 70);
      }
    } else {
      // NORMAL mode: Proportional minimum for visible size differences
      if (originalLength <= 1) {
        minPixels = 12; // 0-1mm: keep small
      } else {
        // Base of 32px + 0.9px per mm - safe for grid, visible differences
        // 15mm = 32 + 13.5 = 45.5px
        // 29mm = 32 + 26.1 = 58.1px (difference: 13px - visible)
        // 60mm = 32 + 54 = 86px
        // 100mm = 90px (capped)
        minPixels = Math.min(32 + (originalLength * 0.9), 90);
      }
    }
    // All segments now have minimum thresholds for visibility

    if (minPixels > 0) {
      const actualPixels = originalSegmentLength * scale;
      if (actualPixels < minPixels) {
        targetLength = minPixels / scale;
      }
    }

    // Apply the target length maintaining the original angle
    if (originalSegmentLength > 0) {
      const dirX = dx / originalSegmentLength;
      const dirY = dy / originalSegmentLength;

      const newEndX = start.x + dirX * targetLength;
      const newEndY = start.y + dirY * targetLength;

      // Add the new point to our adjusted points array
      adjustedPoints.push({ ...originalEnd, x: newEndX, y: newEndY });
    } else {
      // Zero-length segment, just copy the point
      adjustedPoints.push({ ...originalEnd });
    }
  }

  // Copy any remaining points that weren't part of segments (if any)
  for (let j = lengths.length + 1; j < points.length; j++) {
    adjustedPoints.push({ ...points[j] });
  }
  
  return adjustedPoints;
}


export function getAngleLabelPosition(prev, curr, next, scale, offsetX, offsetY, allPoints = [], angleIndex = 0) {
  // SIMPLIFIED: Place all angle labels consistently like segment labels

  const cornerX = curr.x;
  const cornerY = curr.y;

  // Calculate vectors from corner to adjacent points
  const v1x = prev.x - cornerX;
  const v1y = prev.y - cornerY;
  const v2x = next.x - cornerX;
  const v2y = next.y - cornerY;

  // Normalize the vectors
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);

  if (len1 === 0 || len2 === 0) {
    // Fallback to simple offset if vectors are zero
    const pixelOffset = 25;
    const drawingOffset = pixelOffset / scale;
    let labelX = cornerX + drawingOffset;
    let labelY = cornerY - drawingOffset;
    return { x: labelX * scale + offsetX, y: labelY * scale + offsetY };
  }

  const n1x = v1x / len1;
  const n1y = v1y / len1;
  const n2x = v2x / len2;
  const n2y = v2y / len2;

  // Calculate angle bisector (average of the two normalized vectors)
  let bisectorX = n1x + n2x;
  let bisectorY = n1y + n2y;
  
  // Normalize bisector
  const bisectorLen = Math.hypot(bisectorX, bisectorY);
  if (bisectorLen > 0.001) {
    bisectorX /= bisectorLen;
    bisectorY /= bisectorLen;
  } else {
    // Vectors are opposite, use perpendicular
    bisectorX = -n1y;
    bisectorY = n1x;
  }

  // SIMPLIFIED: Always place labels outside the angle
  // The bisector currently points to the INSIDE of the angle
  // So we need to flip it to point OUTSIDE
  bisectorX = -bisectorX;
  bisectorY = -bisectorY;

  // Consistent offset for all angle labels
  // Use larger offset to prevent overlap when corners are close (due to minimum segment widths)
  const pixelOffset = 35;  // Balanced to prevent overlap while staying close to corners
  const drawingOffset = pixelOffset / scale;
  
  // Position label along bisector
  let labelX = cornerX + bisectorX * drawingOffset;
  let labelY = cornerY + bisectorY * drawingOffset;
  
  // DUPLICATE PREVENTION: Check if we've already processed this angle position
  const angleKey = `${Math.round(cornerX)},${Math.round(cornerY)},${angleIndex}`;
  if (processedAngles.has(angleKey)) {
    return { x: -9999, y: -9999 }; // Return off-screen position
  }
  processedAngles.add(angleKey);

  // Remove collision detection to ensure consistency - labels should be at fixed offset

  // Add this label position to global tracking
  addLabelPosition(labelX, labelY, 'angle');

  return {
    x: labelX * scale + offsetX,
    y: labelY * scale + offsetY
  };
}

// Helper function to calculate distance from point to line segment
function distancePointToLineSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  
  if (length === 0) return Math.hypot(px - x1, py - y1);
  
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  
  return Math.hypot(px - projX, py - projY);
}

// Helper function to calculate distance between two points
function distancePointToPoint(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// Store all label positions for global collision avoidance
let globalLabelPositions = [];
let processedAngles = new Set(); // Track processed angle positions to prevent duplicates

// Function to reset global label positions (call this at the start of drawing rendering)
export function resetGlobalLabelPositions() {
  globalLabelPositions = [];
  processedAngles.clear();
}

// Function to add a label position to global tracking
function addLabelPosition(x, y, type = 'unknown') {
  globalLabelPositions.push({ x, y, type });
}

// Function to check if a label position overlaps with the previous label only
// This ensures stable behavior - only adjacent labels can cause flips
// Scale parameter normalizes threshold for consistent collision detection across different canvas sizes
function checkLabelOverlap(x, y, threshold = 40, scale = 1) {
  // Only check against the last added label (previous segment)
  // This prevents labels from flipping when new segments are added elsewhere
  if (globalLabelPositions.length === 0) return false;

  const lastPos = globalLabelPositions[globalLabelPositions.length - 1];
  const distance = Math.hypot(x - lastPos.x, y - lastPos.y);

  // Safety guard: ensure scale is valid (positive number, not zero/undefined/NaN)
  const safeScale = (scale && isFinite(scale) && scale > 0) ? scale : 1;

  // Normalize threshold by scale - ensures same collision decisions at any canvas size
  const normalizedThreshold = threshold / safeScale;
  return distance < normalizedThreshold;
}

export function getSegmentLabelPosition(start, end, scale, offsetX, offsetY, reverseColor = false, flipH = false, flipV = false, allPoints = [], segmentIndex = 0, isAdjusted = false, isTaperMode = false, foldLabelPixelPos = null) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (!isFinite(len) || len === 0) return { x: 0, y: 0 };

  // LENGTH LABELS ALWAYS AT THE EXACT MIDDLE OF THE SEGMENT
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Check if this is a vertical segment
  const isVertical = Math.abs(dx) < 0.01;

  let labelX, labelY;

  if (isVertical) {
    // For vertical segments, position labels consistently with proper offset
    // Use same offset as horizontal segments to prevent overlap with line
    // In taper mode, use a larger offset for better spacing
    const baseOffset = isTaperMode ? 40 : 40;  // Increased to 40 to push labels further away
    // Keep offset in pixel space, not drawing units
    const pixelOffset = baseOffset / scale;

    // STABLE POSITIONING: Determine label side based on the polygon's overall structure
    // This ensures labels don't move when folds (SF/SSF) are applied
    let xOffset = -pixelOffset; // Default to left side

    if (segmentIndex === 0 && dy > 0 && allPoints && allPoints.length > 2) {
      // First segment going down - check ALL subsequent points to find the polygon direction
      // Use the furthest point to determine which side is truly "outside"
      const lastPoint = allPoints[allPoints.length - 1];
      if (lastPoint && lastPoint.x > midX) {
        // Polygon extends to the right, so label should be on the left (outside)
        xOffset = -pixelOffset;
      } else {
        // Polygon extends to the left, so label should be on the right (outside)
        xOffset = pixelOffset;
      }
    } else if (allPoints && allPoints.length > 2) {
      // For other vertical segments, check if the polygon bulk is to the left or right
      // Calculate the centroid of all points to determine the polygon's center of mass
      const centroidX = allPoints.reduce((sum, pt) => sum + pt.x, 0) / allPoints.length;
      if (centroidX > midX) {
        // Polygon center is to the right, place label on the left (outside)
        xOffset = -pixelOffset;
      } else {
        // Polygon center is to the left, place label on the right (outside)
        xOffset = pixelOffset;
      }
    }

    if (dy < 0) {
      // UP segment (going upward)
      labelX = midX + xOffset;
      labelY = midY;
    } else {
      // DOWN segment (going downward)
      labelX = midX + xOffset;
      labelY = midY;
    }

    // Collision detection for vertical segments - flip to other side if overlapping
    // Pass scale for consistent collision detection across different canvas sizes
    if (checkLabelOverlap(labelX, labelY, 40, scale)) {
      // Flip to the other side by negating xOffset
      labelX = midX - xOffset;
    }
  } else {
    // Non-vertical segments - use perpendicular calculation
    let perp = getPerpendicularVector(dx, dy, len);
    let perpX = perp.x;
    let perpY = perp.y;

    // STABLE POSITIONING: Determine label side based on the polygon's structure
    // For first/last diagonal segments, use nearby points instead of centroid
    // This prevents label flipping when more segments are added to the shape
    if (allPoints && allPoints.length > 2 && segmentIndex >= 0) {
      let referenceX, referenceY;

      // Calculate total number of segments (points - 1)
      const totalSegments = allPoints.length - 1;
      const isLastSegment = segmentIndex === totalSegments - 1;

      if (segmentIndex === 0 && allPoints.length > 2) {
        // For first segment, use the third point (after the corner) as reference
        // This is more stable than centroid as it doesn't change when segments are added elsewhere
        const nextPoint = allPoints[2];
        referenceX = nextPoint.x;
        referenceY = nextPoint.y;
      } else if (isLastSegment && allPoints.length > 2) {
        // For last segment, use the third-to-last point (before the corner) as reference
        // This ensures stability regardless of what segments exist before it
        const prevPoint = allPoints[allPoints.length - 3];
        referenceX = prevPoint.x;
        referenceY = prevPoint.y;
      } else {
        // For middle segments, use centroid (center of mass) of all points
        referenceX = allPoints.reduce((sum, pt) => sum + pt.x, 0) / allPoints.length;
        referenceY = allPoints.reduce((sum, pt) => sum + pt.y, 0) / allPoints.length;
      }

      // Vector from segment midpoint to reference point
      const toReference = { x: referenceX - midX, y: referenceY - midY };

      // Check if perpendicular points toward or away from reference
      const dotProduct = perpX * toReference.x + perpY * toReference.y;

      // If perpendicular points toward reference (inside), flip it to point outside
      if (dotProduct > 0) {
        perpX = -perpX;
        perpY = -perpY;
      }
    }

    // Check if this is a horizontal segment
    const isHorizontal = Math.abs(dy) < 0.01;

    // Use different offsets for horizontal vs diagonal segments
    // Diagonal segments need larger offset to prevent label overlapping the line
    let baseOffset;
    if (isHorizontal) {
      baseOffset = 25;  // Horizontal segments - smaller offset is fine
    } else {
      baseOffset = isTaperMode ? 40 : 35;  // Diagonal segments - larger offset to prevent overlap
    }

    // Keep offset in pixel space, not drawing units
    const pixelOffset = baseOffset / scale;
    labelX = midX + perpX * pixelOffset;
    labelY = midY + perpY * pixelOffset;

    // Collision detection for non-vertical segments - flip to other side if overlapping
    // Pass scale for consistent collision detection across different canvas sizes
    if (checkLabelOverlap(labelX, labelY, 40, scale)) {
      // Flip to the other side by negating perpendicular direction
      labelX = midX - perpX * pixelOffset;
      labelY = midY - perpY * pixelOffset;
    }
  }

  // Add this label position to global tracking
  addLabelPosition(labelX, labelY, 'segment');

  let finalX = labelX * scale + offsetX;
  let finalY = labelY * scale + offsetY;

  // Smart fold-label overlap detection:
  // If a fold label pixel position was provided, check if both labels are on the
  // SAME SIDE of the segment. If so, they overlap visually → mirror the length label.
  if (foldLabelPixelPos && typeof foldLabelPixelPos.x === 'number') {
    const segPixelLen = Math.hypot(dx, dy) * scale;
    if (segPixelLen < 150) {
      // Use cross product to determine which side of the segment line each label is on
      const startPx = start.x * scale + offsetX;
      const startPy = start.y * scale + offsetY;
      const segDxPx = dx * scale;
      const segDyPx = dy * scale;

      const labelSide = segDxPx * (finalY - startPy) - segDyPx * (finalX - startPx);
      const foldSide = segDxPx * (foldLabelPixelPos.y - startPy) - segDyPx * (foldLabelPixelPos.x - startPx);

      // Flip only when both labels are on the same side (they would visually overlap)
      const sameSide = (labelSide > 0 && foldSide > 0) || (labelSide < 0 && foldSide < 0);
      if (sameSide) {
        const flippedLabelX = 2 * midX - labelX;
        const flippedLabelY = 2 * midY - labelY;
        finalX = flippedLabelX * scale + offsetX;
        finalY = flippedLabelY * scale + offsetY;
        // Update global tracking with the flipped position
        globalLabelPositions[globalLabelPositions.length - 1] = { x: flippedLabelX, y: flippedLabelY, type: 'segment' };
      }
    }
  }

  return {
    x: finalX,
    y: finalY
  };
}


export function getOutsideArc(prev, curr, next, sweepDeg) {
  const vIn = { x: prev.x - curr.x, y: prev.y - curr.y };
  const vOut = { x: next.x - curr.x, y: next.y - curr.y };

  const lenIn = Math.hypot(vIn.x, vIn.y);
  const lenOut = Math.hypot(vOut.x, vOut.y);
  if (lenIn === 0 || lenOut === 0) return { startDeg: 0, clockwise: true };

  vIn.x /= lenIn;
  vIn.y /= lenIn;
  vOut.x /= lenOut;
  vOut.y /= lenOut;

  const bisector = {
    x: vIn.x + vOut.x,
    y: vIn.y + vOut.y
  };

  const bisectorDeg = Math.atan2(bisector.y, bisector.x) * 180 / Math.PI;

  const cross = vIn.x * vOut.y - vIn.y * vOut.x;
  const insideIsCCW = cross > 0;

  const clockwise = insideIsCCW;
  const startDeg = bisectorDeg + (clockwise ? sweepDeg / 2 : -sweepDeg / 2);

  return { startDeg, clockwise };
}

// --- Fold arc center and rotation, for correct SF/SSF arc (like your screenshot) ---
export function getFoldArcProps(prev, corner, next, scale, offsetX, offsetY) {
  //  compute raw span & base rotation
  const v1x = prev.x - corner.x, v1y = prev.y - corner.y;
  const v2x = next.x - corner.x, v2y = next.y - corner.y;
  const angle1 = Math.atan2(v1y, v1x);
  const angle2 = Math.atan2(v2y, v2x);
  let rawSpan = ((angle2 - angle1) * 180) / Math.PI;
  if (rawSpan > 180) rawSpan -= 360;
  if (rawSpan < -180) rawSpan += 360;
  const span = Math.abs(rawSpan);

  const baseAngle = (angle1 * 180) / Math.PI; // start from incoming edge

  // fixed pixel radius
  const pixelRadius = 8;

  //  corner in screen coords
  const cx = corner.x * scale + offsetX;
  const cy = corner.y * scale + offsetY;

  return {
    x: cx,
    y: cy,
    innerRadius: pixelRadius,
    outerRadius: pixelRadius,
    angle: span,
    rotation: baseAngle,
    clockwise: rawSpan > 0
  };
}
export function getFoldLabelPosition(prev, corner, next, scale, offsetX, offsetY, flipH = false, flipV = false, foldType = '', foldLength = 0, isEndSegment = false) {
  const { x: cx, y: cy, angle, rotation, clockwise } =
    getFoldArcProps(prev, corner, next, scale, offsetX, offsetY);

  // mid‐angle of the arc
  let mid = rotation + (clockwise ? angle / 2 : -angle / 2);

  // Special handling for first segment folds - position label away from line overlap
  // NOTE: When points are flipped, the adjustments need to be reversed and increased
  if (!isEndSegment) {
    if (foldType === 'OpenUp' || foldType === 'OpenDn') {
      // SSF on first segment
      if (foldType === 'OpenUp') {
        // Actually controls OpenDn display (names swapped for START)
        // Move label more to the left/down to avoid the "159" length label
        const oldMid = mid;
        if (flipV && !flipH) {
          mid = mid - 35; // Increase to -35 for flipV
        } else {
          mid = mid + (flipH ? -65 : 20); // Changed to 20 to move SSF label away from line
        }
        console.log('SSF OpenUp (controls OpenDn) - flipH:', flipH, 'flipV:', flipV, 'old mid:', oldMid, 'new mid:', mid);
      } else if (foldType === 'OpenDn') {
        // Actually controls OpenUp display (names swapped for START)
        // Nudge the label position slightly upward to avoid line
        // When flipped horizontally, reverse the adjustment direction and increase offset
        mid = mid - (flipH ? -15 : 25); // Increase from 15 to 25 to avoid line when not flipped
      }
    } else if (foldType === 'Up' || foldType === 'Down') {
      // SF on first segment - same pattern as last segment
      if (foldType === 'Up') {
        // Adjust angle for both flipped and non-flipped states (controls Down display)
        const oldMid = mid;
        if (flipV && !flipH) {
          mid = mid - 25; // Try negative to move in opposite direction
        } else {
          mid = mid + 25; // Always add 25 for angle
        }
        console.log('SF Up First Segment - flipH:', flipH, 'flipV:', flipV, 'old mid:', oldMid, 'new mid:', mid);
      } else if (foldType === 'Down') {
        // SF Down first segment - controls SF Up display
        const oldMid = mid;
        mid = mid + (flipH ? 25 : 20); // Reduced to 20 to move SF Up label away from line
        console.log('SF Down First Segment (controls Up) - flipH:', flipH, 'old mid:', oldMid, 'new mid:', mid);
      }
    }
  }

  // Special handling for end segment folds - position label on the arc side
  if (isEndSegment) {
    const dx = next.x - corner.x;
    const dy = next.y - corner.y;
    const lineAngle = Math.atan2(dy, dx) * 180 / Math.PI;

    if (foldType === 'OpenUp' || foldType === 'OpenDn') {
      // SSF on end segment
      if (foldType === 'OpenUp') {
        // For OpenUp, arc curves upward, position label above (at 90 degrees from the line)
        // Adjust angle slightly to avoid overlapping with the line
        // When flipped, need to reverse to stay on arc side
        mid = lineAngle - (flipH ? 75 : 75); // Changed from -75 to 75 when flipH
      } else if (foldType === 'OpenDn') {
        // For OpenDn, arc curves downward, position label below (at -90 degrees from the line)
        // Adjust angle slightly to avoid overlapping with the line
        // When flipped, stay on the same side of the arc but adjust offset
        mid = lineAngle + (flipH ? 75 : 65);
      }
    } else if (foldType === 'Up' || foldType === 'Down') {
      // SF on end segment - needs adjustment for both flipped and non-flipped
      if (foldType === 'Up') {
        // Adjust angle to position label above the arc
        const oldMid = mid;
        // Use smaller adjustment for flipV to keep label closer to arc
        if (flipV && !flipH) {
          mid = mid + 25; // Small adjustment for flipV only
        } else {
          mid = mid + (flipH ? -25 : 135); // Normal adjustments for flipH or no flip
        }
        console.log('SF Up Last Segment - flipH:', flipH, 'flipV:', flipV, 'old mid:', oldMid, 'new mid:', mid, 'lineAngle:', lineAngle);
      } else if (foldType === 'Down') {
        // SF Down last segment - adjust for both states
        const oldMid = mid;
        // Use smaller adjustment for flipV to keep label closer to arc
        if (flipV && !flipH) {
          mid = mid - 25; // Small adjustment for flipV only (opposite of SF Up)
        } else {
          mid = mid + (flipH ? -45 : -135); // Opposite direction from SF Up
        }
        console.log('SF Down Last Segment - flipH:', flipH, 'flipV:', flipV, 'old mid:', oldMid, 'new mid:', mid);
      }
    }
  }

  // NOTE: No need to apply flip transformations to angle since points are already flipped
  // The angle is calculated from already-flipped points, so it's already correct

  const rad = (mid * Math.PI) / 180;

  // Calculate label distance based on fold type and length
  let labelDist;
  if (foldType === 'OpenUp' || foldType === 'OpenDn') {
    // SSF: Account for variable arc depth
    const baseRadius = 8;
    const minDepth = 8;
    const maxDepth = Math.max(Math.min(foldLength * 0.4, 25), minDepth);
    const arcOuterRadius = baseRadius + maxDepth;
    labelDist = arcOuterRadius + LABEL_OFFSET_DISTANCE; // Beyond the arc
  } else {
    // SF or other folds: Use fixed distance
    labelDist = 8 + LABEL_OFFSET_DISTANCE;
  }
  
  // For first segment folds, add extra distance to prevent line overlap
  if (!isEndSegment) {
    if (foldType === 'OpenUp' || foldType === 'OpenDn') {
      // SSF on first segment - separate control for each
      if (foldType === 'OpenUp') {
        // Controls OpenDn display
        if (flipV && !flipH) {
          labelDist += 60; // Increase from 40 to 60 for flipV to avoid arc overlap
        } else {
          labelDist += flipH ? 20 : 65; // Increased to 65 when not flipped for OpenDn to move further from line
        }
      } else {
        // Controls OpenUp display
        labelDist += flipH ? 50 : 40; // Increase from 30 to 40 when not flipped for OpenUp
      }
    } else if (foldType === 'Up' || foldType === 'Down') {
      // SF on first segment
      if (foldType === 'Up') {
        // Increase distance when flipped to move away from arc (controls Down display)
        if (flipV && !flipH) {
          labelDist += 60; // Set back to 60 for flipV distance
        } else {
          labelDist += flipH ? 30 : 65; // Increased to 65 when not flipped to move SF Down label further from line
        }
        console.log('SF Up First Segment Distance - flipH:', flipH, 'flipV:', flipV, 'labelDist:', labelDist);
      } else {
        // SF Down code (controls Up display)
        if (flipV && !flipH) {
          labelDist += 30; // Reduce from 60 to 30 for flipV
        } else {
          labelDist += flipH ? 40 : 35; // Increased to 35 to move SF Up label further from line
        }
      }
    }
  }

  // For end segment folds, add extra distance to prevent overlap with arrows and lines
  if (isEndSegment) {
    if (foldType === 'Up') {
      labelDist += flipH ? 18 : 18; // Same spacing for both states - keep close to arc
    } else if (foldType === 'OpenUp') {
      labelDist += flipH ? 25 : 10; // Reduce not flipped to 10
    } else if (foldType === 'Down') {
      labelDist += flipH ? 40 : 30; // Add extra spacing for SF - increased original from 25 to 30
    } else if (foldType === 'OpenDn') {
      labelDist += flipH ? 25 : 15; // Reduced flip H to 25
    }
  }

  return {
    x: cx + labelDist * Math.cos(rad),
    y: cy + labelDist * Math.sin(rad)
  };
}

/**
 * Normalizes an angle to the range [-180, 180]
 * @param {number} deg - Angle in degrees
 * @returns {number} Normalized angle in degrees
 */
export function normalizeDegrees(deg) {
  return ((deg + 540) % 360) - 180;
}

/**
 * Snaps an angle to DIAGONAL values (45, 135, -45, -135) if within tolerance
 * Only snaps to diagonals - NOT to cardinal angles (0, 90, 180)
 * This fixes symmetric diagonal corners (134→135) while preserving intentional angles like 89°
 * @param {number} angle - Angle in degrees (already rounded to integer)
 * @param {number} tolerance - Tolerance in degrees (default 2 for diagonals)
 * @returns {number} Snapped angle
 */
export function snapToCommonAngle(angle, tolerance = 1) {
  // First normalize the angle to [-180, 180] range
  const normalizedAngle = normalizeDegrees(angle);

  // ONLY snap to DIAGONAL angles - NOT cardinal (0, 90, 180, -90)
  // This preserves 89° (won't snap to 90°) while fixing 134°→135°
  const diagonalAngles = [45, 135, -45, -135];

  for (const snapAngle of diagonalAngles) {
    if (Math.abs(normalizedAngle - snapAngle) <= tolerance) {
      return snapAngle;
    }
  }

  return normalizedAngle; // Return normalized angle if no diagonal snap
}

/**
 * Calculates the angle between three points (prev -> curr -> next)
 * @param {Object} prev - Previous point {x, y}
 * @param {Object} curr - Current point (vertex) {x, y}
 * @param {Object} next - Next point {x, y}
 * @returns {number} Angle in degrees, rounded to nearest integer
 */
export function calculateAngleBetweenPoints(prev, curr, next) {
  // Validate inputs
  if (!prev || !curr || !next) {
    console.warn('Invalid points for angle calculation:', { prev, curr, next });
    return 0;
  }

  const v1x = curr.x - prev.x;
  const v1y = curr.y - prev.y;
  const v2x = next.x - curr.x;
  const v2y = next.y - curr.y;

  const angle1 = Math.atan2(v1y, v1x);
  const angle2 = Math.atan2(v2y, v2x);

  let angleDeg = ((angle2 - angle1) * 180) / Math.PI;

  // Normalize to [-180, 180]
  angleDeg = normalizeDegrees(angleDeg);

  // Add tiny epsilon to ensure consistent rounding for symmetric corners
  // This fixes floating-point precision issues where 134.4999... vs 134.5000...
  // would round to different values (134 vs 135)
  let result = Math.round(angleDeg + 1e-9);

  // Ensure we return a valid number
  if (isNaN(result) || !isFinite(result)) {
    console.warn('Calculated angle is invalid:', result, 'from points:', { prev, curr, next });
    return 0;
  }

  // Snap to common angles for consistent symmetric shapes
  result = snapToCommonAngle(result);

  return result;
}

/**
 * Caps segment length for geometry calculations
 * Large segments (>500mm) are capped to fixed pixel values for better display
 * @param {number} length - Segment length in mm
 * @returns {number} Capped length for geometry calculations
 */
export function capSegmentLength(length) {
  const numLen = Number(length) || 0;
  if (numLen >= 1000) return 200; // Cap 1000+ at 200 units for geometry
  if (numLen >= 500) return 150;  // Cap 500-999 at 150 units for geometry
  return numLen; // Use actual value for < 500
}

/**
 * Calculates perpendicular (normal) vector to a line segment
 * Returns unit perpendicular vector rotated 90 degrees counterclockwise
 * @param {number} dx - X component of direction vector
 * @param {number} dy - Y component of direction vector
 * @param {number} length - Length of the vector (for normalization)
 * @returns {Object} Perpendicular unit vector {x, y}
 */
export function getPerpendicularVector(dx, dy, length) {
  return {
    x: -dy / length,
    y: dx / length
  };
}

/**
 * Reflects/mirrors a point across a center point
 * Uses formula: reflected = 2 * center - original
 * @param {Object} point - Point to reflect {x, y}
 * @param {Object} center - Center point for reflection {x, y}
 * @returns {Object} Reflected point {x, y}
 */
export function reflectPoint(point, center) {
  return {
    x: 2 * center.x - point.x,
    y: 2 * center.y - point.y
  };
}

/**
 * Calculates the center point of a bounding box
 * @param {Array} points - Array of points with x and y coordinates
 * @returns {Object} Center point {x, y}
 */
export function getBoundingBoxCenter(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2
  };
}

/**
 * Converts an absolute angle to the nearest cardinal direction
 * @param {number} absAngle - Absolute angle in degrees
 * @returns {string} Cardinal direction: 'Up', 'Down', 'Left', or 'Right'
 */
export function angleToCardinalDirection(absAngle) {
  const normalizedAngle = ((absAngle % 360) + 360) % 360;

  if (normalizedAngle >= 45 && normalizedAngle < 135) {
    return 'Up';
  } else if (normalizedAngle >= 135 && normalizedAngle < 225) {
    return 'Left';
  } else if (normalizedAngle >= 225 && normalizedAngle < 315) {
    return 'Down';
  } else {
    return 'Right';
  }
}

/**
 * Calculates segment lengths from an array of points
 * @param {Array} points - Array of points with x and y coordinates
 * @returns {Array} Array of rounded distances between consecutive points
 */
export function calculateSegmentLengths(points) {
  if (!points || points.length < 2) return [];

  return points.slice(1).map((pt, idx) => {
    const dx = pt.x - points[idx].x;
    const dy = pt.y - points[idx].y;
    return Math.round(Math.hypot(dx, dy));
  });
}

/**
 * Converts polar coordinates (angle, length) to Cartesian coordinates (dx, dy)
 * @param {number} angleDegrees - Angle in degrees
 * @param {number} length - Length/radius
 * @returns {Object} Cartesian coordinates {dx, dy}
 */
export function polarToCartesian(angleDegrees, length) {
  const rad = (angleDegrees * Math.PI) / 180;
  return {
    dx: length * Math.cos(rad),
    dy: length * Math.sin(rad)
  };
}
/**
 * Snaps a value to the nearest grid intersection
 * @param {number} value - The value to snap
 * @param {number} gridSize - The grid size (default: 20)
 * @param {boolean} enableSnap - Whether grid snapping is enabled (default: true)
 * @param {number} gridPadding - The grid padding offset (default: 20)
 * @returns {number} The snapped value
 */
export function snapToGrid(value, gridSize = 20, enableSnap = true, gridPadding = 20) {
  if (!enableSnap) return value;

  // Account for the grid padding offset
  // Grid intersections are at: 20, 40, 60, 80, 100, etc.
  // This ensures we snap to actual grid line intersections
  const adjustedValue = value - gridPadding;
  const snappedAdjusted = Math.round(adjustedValue / gridSize) * gridSize;
  return snappedAdjusted + gridPadding;
}

/**
 * Normalizes all angles in an array to [-180, 180] range
 * @param {Array} angleArray - Array of angles in degrees
 * @returns {Array} Array of normalized angles
 */
export function normalizeAllAngles(angleArray) {
  if (!Array.isArray(angleArray)) return [];
  return angleArray.map(angle => {
    if (angle === null || angle === undefined || angle === '') return angle;
    const numAngle = typeof angle === 'number' ? angle : parseFloat(angle);
    if (isNaN(numAngle)) return angle;
    return normalizeDegrees(numAngle);
  });
}

/**
 * Gets the initial absolute angle based on direction
 * @param {string} direction - Direction ('Up', 'Down', 'Left', 'Right')
 * @param {Object} directionMap - Optional custom direction map
 * @returns {number} Absolute angle in degrees
 */
export function getInitialAbsoluteAngle(direction = 'Right', directionMap = null) {
  const defaultMap = {
    'Up': 90,
    'Down': -90,
    'Right': 0,
    'Left': 180,
  };
  const map = directionMap || defaultMap;
  return map[direction] ?? 0;
}

/**
 * Calculates the last absolute angle by accumulating all turn angles
 * @param {Array<number>} angles - Array of turn angles
 * @param {string} direction - Initial direction
 * @returns {number} Final absolute angle in degrees
 */
export function getLastAbsoluteAngle(angles, direction = 'Right') {
  const directionMap = {
    'Up': 90,
    'Down': -90,
    'Right': 0,
    'Left': 180,
  };
  const initial = directionMap[direction] ?? 0;
  return angles.reduce((acc, a) => acc + a, initial);
}

/**
 * Calculates the absolute angle of the last segment from two points
 * @param {Array<Object>} pts - Array of points {x, y}
 * @returns {number} Absolute angle in degrees
 */
export function calculateAbsoluteEndAngle(pts) {
  if (pts.length < 2) return 0;
  const prev = pts[pts.length - 2];
  const curr = pts[pts.length - 1];
  return (Math.atan2(curr.y - prev.y, curr.x - prev.x) * 180) / Math.PI;
}
