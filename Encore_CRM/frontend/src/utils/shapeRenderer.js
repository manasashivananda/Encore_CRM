/**
 * Shared Shape Renderer
 * Contains the EXACT rendering logic from DrawingCanvas
 * Used by both DrawingCanvas and split preview generation
 * This ensures splits match FAR/NEAR exactly
 */

import Konva from 'konva';
import {
  getPerpendicularVector,
  getSegmentLabelPosition,
  getAngleLabelPosition,
  getFoldLabelPosition,
  resetGlobalLabelPositions,
  normalizeDegrees
} from './geometryUtils';

/**
 * Label collision detection and avoidance utilities
 */

/**
 * Check if two label bounding boxes overlap
 */
function labelsOverlap(label1, label2, padding = 5) {
  if (!label1 || !label2) return false;
  return !(
    label1.right + padding < label2.left ||
    label2.right + padding < label1.left ||
    label1.bottom + padding < label2.top ||
    label2.bottom + padding < label1.top
  );
}

/**
 * Check if a label overlaps with any of the placed labels
 */
function overlapsWithAny(labelBounds, placedLabels, padding = 5) {
  for (const placed of placedLabels) {
    if (labelsOverlap(labelBounds, placed, padding)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a label overlaps with the drawing (shape outline)
 */
function overlapsWithDrawing(labelBounds, shapePoints, scale, offsetX, offsetY, padding = 10) {
  // Check if label bounding box intersects with any segment of the shape
  for (let i = 0; i < shapePoints.length - 1; i++) {
    const p1 = shapePoints[i];
    const p2 = shapePoints[i + 1];
    if (p1.isFold || p2.isFold) continue;
    
    const x1 = p1.x * scale + offsetX;
    const y1 = p1.y * scale + offsetY;
    const x2 = p2.x * scale + offsetX;
    const y2 = p2.y * scale + offsetY;
    
    // Check if segment intersects with label bounding box (with padding)
    const segMinX = Math.min(x1, x2) - padding;
    const segMaxX = Math.max(x1, x2) + padding;
    const segMinY = Math.min(y1, y2) - padding;
    const segMaxY = Math.max(y1, y2) + padding;
    
    // Simple bounding box intersection check
    if (!(labelBounds.right < segMinX || labelBounds.left > segMaxX ||
          labelBounds.bottom < segMinY || labelBounds.top > segMaxY)) {
      return true;
    }
  }
  return false;
}

/**
 * Find a non-overlapping position for a label
 * Tries different offset directions if the initial position causes overlap
 */
function findNonOverlappingPosition(x, y, width, height, placedLabels, shapePoints, scale, offsetX, offsetY, canvasWidth, canvasHeight, labelPadding = 30) {
  const halfW = width / 2;
  const halfH = height / 2;
  
  // Try different offset directions
  const offsets = [
    { dx: 0, dy: 0 },           // Original position
    { dx: 0, dy: -30 },         // Up
    { dx: 0, dy: 30 },          // Down
    { dx: 30, dy: 0 },          // Right
    { dx: -30, dy: 0 },         // Left
    { dx: 25, dy: -25 },        // Up-Right
    { dx: -25, dy: -25 },       // Up-Left
    { dx: 25, dy: 25 },         // Down-Right
    { dx: -25, dy: 25 },        // Down-Left
    { dx: 0, dy: -50 },         // Further up
    { dx: 0, dy: 50 },          // Further down
    { dx: 50, dy: 0 },          // Further right
    { dx: -50, dy: 0 },         // Further left
  ];
  
  for (const offset of offsets) {
    let testX = x + offset.dx;
    let testY = y + offset.dy;
    
    // Clamp to canvas bounds
    testX = Math.max(labelPadding + halfW, Math.min(canvasWidth - labelPadding - halfW, testX));
    testY = Math.max(labelPadding + halfH, Math.min(canvasHeight - labelPadding - halfH, testY));
    
    const testBounds = {
      left: testX - halfW,
      right: testX + halfW,
      top: testY - halfH,
      bottom: testY + halfH,
      x: testX,
      y: testY
    };
    
    // Check if this position overlaps with placed labels or drawing
    if (!overlapsWithAny(testBounds, placedLabels, 8) && 
        !overlapsWithDrawing(testBounds, shapePoints, scale, offsetX, offsetY, 5)) {
      return { x: testX, y: testY };
    }
  }
  
  // If no non-overlapping position found, return clamped original position
  return {
    x: Math.max(labelPadding + halfW, Math.min(canvasWidth - labelPadding - halfW, x)),
    y: Math.max(labelPadding + halfH, Math.min(canvasHeight - labelPadding - halfH, y))
  };
}

/**
 * Render a complete shape with gradients, lines, ticks, dots, and labels
 * This matches DrawingCanvas's rendering exactly
 */
export function renderShape({
  layer,
  points,
  lengths,
  angles,
  scale,
  offsetX,
  offsetY,
  reverseColor = false,
  flipH = false,
  flipV = false,
  labelOffsets = null,
  isAutoSetDrawing = true, // Most drawings are auto-set
  hasAutoSetColorSide = true,
  fontSize = 28, // Configurable font size, default 28 for main page
  gradientStrokeWidth = 8, // Configurable gradient line thickness
  outlineStrokeWidth = 6, // Configurable outline thickness
  isTaperMode = false, // Add isTaperMode parameter for fold scaling
  hideLabels = false, // When true, don't render labels (for draggable label overlay)
  isSplitDrawing = false, // Preserved for API compatibility (no longer affects arc sizing)
  startFoldGap = 0, // SSF gap value for start fold
  endFoldGap = 0, // SSF gap value for end fold
  labelOffsetScale = null, // Scale used when saving label offsets (use this instead of scale for offset application)
  taperProfile = null // 'far', 'near', or null for normal mode - used to look up correct label offsets
}) {
  // For split drawings, if no explicit labelOffsetScale is provided, use a correction factor
  // SelectMaterials uses ~500px canvas, DrawingDetailsTab uses 800px canvas (ratio ~1.6)
  // This correction ensures dragged labels appear at the same relative position
  const labelScale = labelOffsetScale || (isSplitDrawing ? scale / 1.6 : scale);
  // Reset global label positions for this render
  resetGlobalLabelPositions();

  // Helper function to calculate fold extent and perpendicular direction (matching DrawingCanvas)
  const calculateFoldInfo = (points, segmentIndex, foldType, foldLength, isEndFold = false, parentSegmentLength = null, currentScale = 1, isTaperModeParam = false) => {
    if (!foldType || !foldLength || parseFloat(foldLength) <= 0) return null;

    // Get the corner point for this fold
    const cornerIdx = isEndFold ? points.length - 3 : 2;
    const corner = points[cornerIdx];
    const prev = points[cornerIdx - 1];
    const next = points[cornerIdx + 1];

    if (!corner || !prev || !next) return null;

    // Determine segment direction
    const segDir = isEndFold ?
      { x: prev.x - corner.x, y: prev.y - corner.y } :
      { x: next.x - corner.x, y: next.y - corner.y };
    const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
    const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

    // Perpendicular direction based on fold type
    // MUST match drawSingleFoldArc perpDir calculations exactly
    const typeLower = foldType.toLowerCase();
    const isSF = typeLower === 'up' || typeLower === 'down';
    let perpDir;

    if (isSF) {
      // SF folds (Up/Down) - matches drawSingleFoldArc
      if (typeLower === 'up') {
        perpDir = { x: segUnit.y, y: -segUnit.x };
      } else { // down
        perpDir = { x: -segUnit.y, y: segUnit.x };
      }
    } else {
      // SSF folds (OpenUp/OpenDn) - matches drawSingleFoldArc
      if (typeLower === 'openup') {
        perpDir = { x: -segUnit.y, y: segUnit.x };
      } else { // opendn
        perpDir = { x: segUnit.y, y: -segUnit.x };
      }
    }

    // Calculate fold extent to match visual arc rendering (matching DrawingCanvas)
    const foldLengthNum = parseFloat(foldLength) || 0;
    const actualSegLen = Number(parentSegmentLength) || segLen;
    const scaleRatio = segLen / actualSegLen; // drawing units per mm

    // Determine if this is a full arc (fold equals or exceeds segment)
    const isFullArc = foldLengthNum >= actualSegLen;

    // Use zero gap for full arc (no visible color at start)
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

    // MINIMUM FOLD ARC SIZE: Match visual fold arc scaling (matching DrawingCanvas)
    if (foldLengthNum > 1) {
      // Use smaller minimums for taper mode
      const minFoldPixels = isTaperModeParam
        ? Math.min(25 + (foldLengthNum * 1.5), 100)
        : Math.min(40 + (foldLengthNum * 2), 160);
      const minArcExtent = minFoldPixels / currentScale;
      const currentArcPixels = arcExtent * currentScale;

      // Apply minimum if fold arc is too small
      const foldLessThanSegment = foldLengthNum < actualSegLen;
      const foldRatio = foldLengthNum / actualSegLen;

      if (currentArcPixels < minFoldPixels) {
        if (foldLessThanSegment && foldRatio > 0.5) {
          // Fold is more than half of segment - use exact proportion for visible difference
          const maxProportionalExtent = foldRatio * segLen;
          arcExtent = Math.min(minArcExtent, maxProportionalExtent, segLen - gapFromCorner);
        } else if (foldLessThanSegment) {
          // Fold is less than half - apply minimum but cap to avoid covering too much
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

    return {
      segmentIndex,
      foldExtent,
      perpDir,
      isEndFold,
      corner
    };
  };

  // Helper to check if fold and color are on same side (matching DrawingCanvas line 4198)
  const isFoldOnColorSide = (foldPerpDir, colorPerpDir) => {
    const dot = foldPerpDir.x * colorPerpDir.x + foldPerpDir.y * colorPerpDir.y;
    return dot > 0;
  };

  // Calculate fold info for start and end folds
  let startFoldInfo = null;
  let endFoldInfo = null;

  // Extract fold information from points
  const startFoldPoint = points.find(p => p.isFold && !p.isEndFold);
  const endFoldPoint = points.find(p => p.isFold && p.isEndFold);

  if (startFoldPoint) {
    // Use interpolatedFoldLength if available (for split drawings), otherwise use foldLength
    const foldLen = startFoldPoint.interpolatedFoldLength || startFoldPoint.foldLength;
    // Pass first segment length (in mm) for proper fold extent calculation
    const parentSegLen = lengths && lengths.length > 0 ? lengths[0] : null;
    startFoldInfo = calculateFoldInfo(points, 0, startFoldPoint.foldType, foldLen, false, parentSegLen, scale, isTaperMode);
  }
  if (endFoldPoint) {
    // Use interpolatedFoldLength if available (for split drawings), otherwise use foldLength
    const foldLen = endFoldPoint.interpolatedFoldLength || endFoldPoint.foldLength;
    // Pass last segment length (in mm) for proper fold extent calculation
    const parentSegLen = lengths && lengths.length > 0 ? lengths[lengths.length - 1] : null;
    endFoldInfo = calculateFoldInfo(points, points.length - 3, endFoldPoint.foldType, foldLen, true, parentSegLen, scale, isTaperMode);
  }

  // Gradient settings (matching DrawingCanvas lines 5833-5834)
  const gradientLayers = 15;
  const maxOffset = 14; // Thickness of gradient effect

  const colors = [
    { r: 255, g: 0, b: 0 },     // Red
    { r: 255, g: 165, b: 0 },   // Orange
    { r: 0, g: 128, b: 255 }    // Blue
  ];

  // Check for 180° angles (matching DrawingCanvas line 4231)
  const has180Angle = angles ? angles.map((angle) => {
    const absAngle = Math.abs(Math.abs(angle) - 180);
    return absAngle < 0.1; // Check if ±180° or -180°
  }) : [];

  // Track locked centroidCorrection (same as DrawingCanvas)
  let lockedCentroidCorrection = null;

  // Calculate non-fold segment indices
  const nonFoldSegments = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (!points[i].isFold && !points[i + 1].isFold) {
      nonFoldSegments.push(i);
    }
  }

  // Draw gradient layers (matching DrawingCanvas lines 5845-6001)
  for (let layer_idx = 0; layer_idx < gradientLayers; layer_idx++) {
    const offset = (layer_idx + 1) * (maxOffset / gradientLayers);
    const opacity = 0.6 * (1 - layer_idx / gradientLayers);

    for (let segIdx = 0; segIdx < nonFoldSegments.length; segIdx++) {
      const i = nonFoldSegments[segIdx];
      const p = points[i];
      const next = points[i + 1];

      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.hypot(dx, dy);

      if (!isFinite(len) || len === 0) continue;

      // Perpendicular vector (same as DrawingCanvas line 5883)
      const perp = getPerpendicularVector(dx, dy, len);
      const perpX = perp.x;
      const perpY = perp.y;

      // Calculate centroidCorrection (matching DrawingCanvas lines 5887-5917)
      let centroidCorrection = 1;

      if (lockedCentroidCorrection !== null) {
        // Use locked value once set
        centroidCorrection = lockedCentroidCorrection;
      } else if (isAutoSetDrawing && i === 0) {
        // Auto-set drawings: lock to 1 immediately (reverseColor controls direction)
        lockedCentroidCorrection = 1;
        centroidCorrection = 1;
      } else if (!isAutoSetDrawing) {
        // Manual drawings: calculate from winding order
        const nonFoldPts = points.filter(p => !p.isFold);
        let signedArea = 0;
        for (let j = 0; j < nonFoldPts.length; j++) {
          const p1 = nonFoldPts[j];
          const p2 = nonFoldPts[(j + 1) % nonFoldPts.length];
          signedArea += (p2.x - p1.x) * (p2.y + p1.y);
        }
        const perpPointsOutward = signedArea > 0;
        centroidCorrection = perpPointsOutward ? 1 : -1;

        // Lock for first segment
        if (i === 0) {
          lockedCentroidCorrection = centroidCorrection;
        }
      }

      // Apply offset direction (same as DrawingCanvas lines 5919-5921)
      const sideParity = (flipH ? -1 : 1) * (flipV ? -1 : 1);
      const offsetDir = (reverseColor ? -1 : 1) * sideParity * centroidCorrection;

      // Check for 180° angle before this segment (matching DrawingCanvas line 5861-5862)
      const hasPrevious180 = !reverseColor && i > 0 && i - 1 < has180Angle.length && has180Angle[i - 1];
      if (hasPrevious180) continue; // Skip this segment entirely

      // Check if NEXT angle is 180° (matching DrawingCanvas line 5865)
      const hasNext180 = !reverseColor && i < has180Angle.length && has180Angle[i];

      // Calculate the ratio limit for 180° folds (matching DrawingCanvas lines 5868-5874)
      let ratio180Limit = 1.0;
      if (hasNext180 && i + 1 < lengths.length) {
        const currentSegmentLength = lengths[i];
        const nextSegmentLength = lengths[i + 1];
        const visibleLength = Math.max(0, currentSegmentLength - nextSegmentLength);
        ratio180Limit = visibleLength / currentSegmentLength;
      }

      // Check if this segment has a fold on the same side as color (matching DrawingCanvas lines 5929-5949)
      let startFoldExtentRatio = 0;
      let endFoldExtentRatio = 0;

      // segIdx is the index in the non-fold segments array (0 = first non-fold segment)
      // CRITICAL: Start and end folds work DIFFERENTLY
      if (startFoldInfo && segIdx === 0) {
        const colorPerpDir = { x: perpX * offsetDir, y: perpY * offsetDir };
        const dotProduct = startFoldInfo.perpDir.x * colorPerpDir.x + startFoldInfo.perpDir.y * colorPerpDir.y;
        // Start fold: hide if dotProduct > 0 (fold and color on same side)
        if (dotProduct > 0) {
          startFoldExtentRatio = startFoldInfo.foldExtent / len;
        }
      }

      if (endFoldInfo && segIdx === nonFoldSegments.length - 1) {
        const colorPerpDir = { x: perpX * offsetDir, y: perpY * offsetDir };
        // End fold: check if fold and color are on same side
        // Use same logic as start fold (dotProduct > 0 means same side)
        const dotProduct = endFoldInfo.perpDir.x * colorPerpDir.x + endFoldInfo.perpDir.y * colorPerpDir.y;
        if (dotProduct > 0) {
          endFoldExtentRatio = endFoldInfo.foldExtent / len;
        }
      }

      // Draw 3 color sections (matching DrawingCanvas lines 5946-5997)
      for (let colorSection = 0; colorSection < 3; colorSection++) {
        const color = colors[colorSection];

        // Calculate start and end points for this color section (1/3 of segment)
        let sectionStart = colorSection / 3;
        let sectionEnd = (colorSection + 1) / 3;

        // Adjust section if fold is on same side as color (matching DrawingCanvas lines 5960-5974)
        if (startFoldExtentRatio > 0) {
          if (sectionEnd <= startFoldExtentRatio) {
            continue; // Entire section is in fold area
          }
          if (sectionStart < startFoldExtentRatio) {
            sectionStart = startFoldExtentRatio;
          }
        }

        if (endFoldExtentRatio > 0) {
          const endFoldStart = 1 - endFoldExtentRatio;
          if (sectionStart >= endFoldStart) continue; // Entire section is in fold area
          if (sectionEnd > endFoldStart) sectionEnd = endFoldStart;
        }

        // Adjust section for 180° fold limit
        if (sectionStart >= ratio180Limit) continue;
        if (sectionEnd > ratio180Limit) sectionEnd = ratio180Limit;

        const startX = p.x + (next.x - p.x) * sectionStart;
        const startY = p.y + (next.y - p.y) * sectionStart;
        const endX = p.x + (next.x - p.x) * sectionEnd;
        const endY = p.y + (next.y - p.y) * sectionEnd;

        const line = new Konva.Line({
          points: [
            startX * scale + offsetX + (perpX * offsetDir) * offset,
            startY * scale + offsetY + (perpY * offsetDir) * offset,
            endX * scale + offsetX + (perpX * offsetDir) * offset,
            endY * scale + offsetY + (perpY * offsetDir) * offset
          ],
          stroke: `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`,
          strokeWidth: gradientStrokeWidth, // Configurable thickness
          listening: false
        });
        layer.add(line);
      }
    }
  }

  // Draw main black shape outline (matching DrawingCanvas lines 6004-6013)
  // IMPORTANT: Exclude fold points from the main outline
  const shapePoints = [];
  points.forEach(p => {
    if (!p.isFold) {
      shapePoints.push(p.x * scale + offsetX);
      shapePoints.push(p.y * scale + offsetY);
    }
  });

  const mainLine = new Konva.Line({
    points: shapePoints,
    stroke: '#000000',
    strokeWidth: outlineStrokeWidth, // Configurable thickness
    lineCap: 'round',
    listening: false
  });
  layer.add(mainLine);

  // Draw tick marks (same logic as DrawingCanvas)
  // Reset lockedCentroidCorrection for tick marks
  lockedCentroidCorrection = null;

  for (let segIdx = 0; segIdx < nonFoldSegments.length; segIdx++) {
    const i = nonFoldSegments[segIdx];
    const p = points[i];
    const next = points[i + 1];

    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const len = Math.hypot(dx, dy);

    if (!isFinite(len) || len === 0) continue;

    const perp = getPerpendicularVector(dx, dy, len);
    const perpX = perp.x;
    const perpY = perp.y;

    // Calculate centroidCorrection (same as gradient)
    let centroidCorrection = 1;

    if (lockedCentroidCorrection !== null) {
      centroidCorrection = lockedCentroidCorrection;
    } else if (isAutoSetDrawing && i === 0) {
      lockedCentroidCorrection = 1;
      centroidCorrection = 1;
    } else if (!isAutoSetDrawing) {
      const nonFoldPts = points.filter(p => !p.isFold);
      let signedArea = 0;
      for (let j = 0; j < nonFoldPts.length; j++) {
        const p1 = nonFoldPts[j];
        const p2 = nonFoldPts[(j + 1) % nonFoldPts.length];
        signedArea += (p2.x - p1.x) * (p2.y + p1.y);
      }
      const perpPointsOutward = signedArea > 0;
      centroidCorrection = perpPointsOutward ? 1 : -1;

      if (i === 0) {
        lockedCentroidCorrection = centroidCorrection;
      }
    }

    const sideParity = (flipH ? -1 : 1) * (flipV ? -1 : 1);
    const offsetDir = (reverseColor ? -1 : 1) * sideParity * centroidCorrection;

    // Check for 180° angle limits (matching DrawingCanvas lines 5868-5874)
    const hasNext180 = !reverseColor && i < has180Angle.length && has180Angle[i];
    let ratio180Limit = 1.0;
    if (hasNext180 && i + 1 < lengths.length) {
      const currentSegmentLength = lengths[i];
      const nextSegmentLength = lengths[i + 1];
      const visibleLength = Math.max(0, currentSegmentLength - nextSegmentLength);
      ratio180Limit = visibleLength / currentSegmentLength;
    }

    // Check if this segment has a fold on the same side as color (matching DrawingCanvas lines 4410-4477)
    let startFoldExtentRatio = 0;
    let endFoldExtentRatio = 0;

    if (startFoldInfo && segIdx === 0) {
      const colorPerpDir = { x: perpX * offsetDir, y: perpY * offsetDir };
      const dotProduct = startFoldInfo.perpDir.x * colorPerpDir.x + startFoldInfo.perpDir.y * colorPerpDir.y;
      // Start fold: hide if dotProduct > 0 (fold and color on same side)
      if (dotProduct > 0) {
        startFoldExtentRatio = startFoldInfo.foldExtent / len;
      }
    }

    if (endFoldInfo && segIdx === nonFoldSegments.length - 1) {
      const colorPerpDir = { x: perpX * offsetDir, y: perpY * offsetDir };
      // For end folds, negate perpDir because segDir is reversed (prev - corner)
      const adjustedPerpDir = { x: -endFoldInfo.perpDir.x, y: -endFoldInfo.perpDir.y };
      const dotProduct = adjustedPerpDir.x * colorPerpDir.x + adjustedPerpDir.y * colorPerpDir.y;
      // End fold: hide if dotProduct < 0 (same logic as start fold, but with adjusted perpDir)
      if (dotProduct < 0) {
        endFoldExtentRatio = endFoldInfo.foldExtent / len;
      }
    }

    const tickCount = Math.max(2, Math.min(9, Math.round(len * scale / 40)));
    const visualTickLen = 8 / scale; // Increased for split preview visual match

    for (let t = 1; t <= tickCount; t++) {
      const ratio = t / (tickCount + 1);

      // Skip tick if it's in the fold area when fold and color are on same side (matching DrawingCanvas lines 4491-4495)
      if (startFoldExtentRatio > 0 && ratio < startFoldExtentRatio) continue; // Start fold area
      if (endFoldExtentRatio > 0 && ratio > (1 - endFoldExtentRatio)) continue; // End fold area

      // Skip tick if it's beyond the middle point of a 180° fold
      if (ratio > ratio180Limit) continue;

      const x = p.x + dx * ratio;
      const y = p.y + dy * ratio;

      const tx2 = x + perpX * visualTickLen * offsetDir;
      const ty2 = y + perpY * visualTickLen * offsetDir;

      const tick = new Konva.Line({
        points: [
          x * scale + offsetX,
          y * scale + offsetY,
          tx2 * scale + offsetX,
          ty2 * scale + offsetY
        ],
        stroke: 'black',
        strokeWidth: 2, // Match DrawingCanvas exactly
        listening: false
      });
      layer.add(tick);
    }
  }

  // Draw vertex dots (matching DrawingCanvas)
  // Skip fold points - only draw dots for main shape vertices
  points.forEach(p => {
    if (p.isFold) return; // Don't draw dots for fold points

    const circle = new Konva.Circle({
      x: p.x * scale + offsetX,
      y: p.y * scale + offsetY,
      radius: 5, // Larger dots for split previews
      fill: '#FF8C00',
      stroke: '#000000',
      strokeWidth: 1, // Thicker stroke
      listening: false
    });
    layer.add(circle);
  });

  // Draw fold arcs (matching DrawingCanvas) - labels are now drawn separately
  drawFoldArcs(layer, points, lengths, scale, offsetX, offsetY, fontSize, isTaperMode, labelOffsets, true, isSplitDrawing, startFoldGap, endFoldGap);

  // Draw all labels with collision detection - skip if hideLabels is true
  if (!hideLabels) {
    drawAllLabels(layer, points, lengths, angles, scale, offsetX, offsetY, labelOffsets, reverseColor, flipH, flipV, fontSize, isTaperMode, startFoldGap, endFoldGap, labelScale, taperProfile, isSplitDrawing);
  }
}

/**
 * Draw fold arcs for SF and SSF folds
 * Matching DrawingCanvas exactly (lines 4953-5480)
 */
function drawFoldArcs(layer, points, lengths, scale, offsetX, offsetY, fontSize = 22, isTaperMode = false, labelOffsets = null, hideLabels = false, isSplitDrawing = false, startFoldGap = 0, endFoldGap = 0) {
  // Check if start fold exists (fold points at indices 0,1, corner at 2)
  if (points.length > 2 && points[0].isFold && points[0].foldType) {
    const type = points[0].foldType;
    const len = points[0].foldLength || 0;
    const label = points[0].label; // Get label from fold point, not corner
    const startFoldOffset = labelOffsets?.foldLabels?.start || null;
    // Pass lengths[0] as parentSegmentLength (first segment length)
    const parentSegmentLength = lengths && lengths.length > 0 ? lengths[0] : null;
    drawSingleFoldArc(layer, points, 2, type, len, false, scale, offsetX, offsetY, fontSize, label, isTaperMode, startFoldOffset, hideLabels, isSplitDrawing, parentSegmentLength, startFoldGap);
  }

  // Check if end fold exists (corner at length-3, fold points at length-2, length-1)
  if (points.length > 2 && points[points.length - 1].isFold && points[points.length - 1].foldType) {
    const type = points[points.length - 1].foldType;
    const len = points[points.length - 1].foldLength || 0;
    const label = points[points.length - 1].label; // Get label from fold point, not corner
    const endFoldOffset = labelOffsets?.foldLabels?.end || null;
    // Pass lengths[lengths.length - 1] as parentSegmentLength (last segment length)
    const parentSegmentLength = lengths && lengths.length > 0 ? lengths[lengths.length - 1] : null;
    drawSingleFoldArc(layer, points, points.length - 3, type, len, true, scale, offsetX, offsetY, fontSize, label, isTaperMode, endFoldOffset, hideLabels, isSplitDrawing, parentSegmentLength, endFoldGap);
  }
}

/**
 * Draw a single fold arc
 * Exact copy from DrawingCanvas drawFoldAt function (lines 4956-5228)
 */
function drawSingleFoldArc(layer, points, i, type, len, isEndFold, scale, offsetX, offsetY, fontSize = 22, customLabel = null, isTaperMode = false, foldLabelOffset = null, hideLabels = false, isSplitDrawing = false, parentSegmentLength = null, foldGap = 0) {
    const corner = points[i];
    const prev = points[i - 1];
    const next = points[i + 1];

    if (!corner || !prev || !next) return;

    const arcPoints = [];

    // EXACT COPY from DrawingCanvas lines 5072-5228
    if (type === 'OpenUp' || type === 'OpenDn') {
      // SSF: Draw using quadratic Bezier curve approach
      const gapFromCorner = 3;

      const segDir = isEndFold ?
        { x: prev.x - corner.x, y: prev.y - corner.y } :
        { x: next.x - corner.x, y: next.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

      let perpDir;
      if (type === 'OpenUp') {
        perpDir = { x: -segUnit.y, y: segUnit.x };
      } else { // OpenDn
        perpDir = { x: segUnit.y, y: -segUnit.x };
      }

      // Arc extent logic - FIXED (matching DrawingCanvas):
      // Use parentSegmentLength (actual segment length in mm) for comparisons
      const foldLengthNum = Number(len);
      const actualSegLen = Number(parentSegmentLength) || segLen; // Use passed segment length, fallback to calculated
      const scaleRatio = segLen / actualSegLen; // drawing units per mm

      // Determine if this is a full arc (fold equals segment)
      const isFullArc = foldLengthNum >= actualSegLen;

      // Use zero gap for full arc (no visible color at start)
      const dynamicGapFromCorner = isFullArc ? 0 : gapFromCorner;

      let arcExtent;
      if (foldLengthNum > actualSegLen) {
        // Fold EXCEEDS segment - scale fold length to drawing units
        arcExtent = foldLengthNum * scaleRatio;
      } else if (foldLengthNum >= actualSegLen) {
        // Fold EQUALS segment - end at segment end (full arc)
        arcExtent = Math.max(segLen - dynamicGapFromCorner, 0);
      } else {
        // Fold is less than segment - arc ends at proportional position
        const proportionalEnd = (foldLengthNum / actualSegLen) * segLen;
        arcExtent = Math.max(proportionalEnd - dynamicGapFromCorner, 0);
      }

      // MINIMUM FOLD ARC SIZE: Match DrawingCanvas visual fold arc scaling for SSF
      if (foldLengthNum > 1) {
        // Use smaller minimums for taper mode (matching DrawingCanvas)
        const minFoldPixels = isTaperMode
          ? Math.min(25 + (foldLengthNum * 1.5), 100)
          : Math.min(40 + (foldLengthNum * 2), 160);
        const minArcExtent = minFoldPixels / scale;
        const currentArcPixels = arcExtent * scale;

        // Apply minimum if fold arc is too small
        const foldLessThanSegment = foldLengthNum < actualSegLen;
        const foldRatio = foldLengthNum / actualSegLen;

        if (currentArcPixels < minFoldPixels) {
          if (foldLessThanSegment && foldRatio > 0.5) {
            const maxProportionalExtent = foldRatio * segLen;
            arcExtent = Math.min(minArcExtent, maxProportionalExtent, segLen - dynamicGapFromCorner);
          } else if (foldLessThanSegment) {
            const minVisibleExtent = isTaperMode ? 0.15 * segLen : 0.1 * segLen;
            const maxReasonableExtent = Math.max(minVisibleExtent, Math.min(0.5 * segLen, foldRatio * segLen * 3));
            arcExtent = Math.min(minArcExtent, maxReasonableExtent, segLen - dynamicGapFromCorner);
          } else {
            arcExtent = Math.min(minArcExtent, segLen - dynamicGapFromCorner);
          }
        }
      }

      // LineOffset stays pixel-based for visibility
      const lineOffset = isTaperMode ? 25 / scale : 20 / scale;
      // Cap curveLength relative to arcExtent to prevent distorted shapes
      const baseCurveLength = isTaperMode ? 12 / scale : 8 / scale;
      const curveLength = Math.min(baseCurveLength, arcExtent * 0.25);
      const numCurvePoints = 10; // Number of points for smooth curve

      // First point: start from orange dot (same as SF)
      const startGap = 1 / scale; // Small gap to touch but not overlap
      const perpStartX = corner.x + segUnit.x * startGap;
      const perpStartY = corner.y + segUnit.y * startGap;
      arcPoints.push(perpStartX * scale + offsetX, perpStartY * scale + offsetY);

      // Curved transition from orange dot (0 offset) to perpendicular offset
      for (let i = 1; i <= numCurvePoints; i++) {
        const t = i / numCurvePoints; // 0 to 1
        const alongSegment = startGap + curveLength * t;
        const currentOffset = lineOffset * t; // Gradually increase offset from 0 to lineOffset
        const px = corner.x + segUnit.x * alongSegment + perpDir.x * currentOffset;
        const py = corner.y + segUnit.y * alongSegment + perpDir.y * currentOffset;
        arcPoints.push(px * scale + offsetX, py * scale + offsetY);
      }

      // Continue with straight horizontal line
      const straightStart = startGap + curveLength;
      const straightEnd = arcExtent;
      const endX = corner.x + segUnit.x * straightEnd + perpDir.x * lineOffset;
      const endY = corner.y + segUnit.y * straightEnd + perpDir.y * lineOffset;
      arcPoints.push(endX * scale + offsetX, endY * scale + offsetY);

      const line = new Konva.Line({
        points: arcPoints,
        stroke: 'brown',
        strokeWidth: 6, // Increased for better visibility in split drawings
        lineCap: 'round',
        lineJoin: 'round',
        listening: false
      });
      layer.add(line);

      // Draw gap arrow indicator if custom gap is provided for SSF (matching DrawingCanvas)
      // When hideLabels is true, gap label is rendered as draggable overlay instead
      if (foldGap && foldGap > 0 && !hideLabels) {
        // Calculate dimension line position (use scaled coordinates)
        const scaledCornerX = corner.x * scale + offsetX;
        const scaledCornerY = corner.y * scale + offsetY;

        // Arrow should point to where the arc actually curves
        let perpAngle;
        if (!isEndFold) {
          // START fold
          if (type === 'OpenUp') {
            perpAngle = (-135 * Math.PI) / 180;
          } else { // OpenDn
            perpAngle = (75 * Math.PI) / 180;
          }
        } else {
          // END fold - point arrow perpendicular to the last segment
          const segmentAngle = Math.atan2(corner.y - prev.y, corner.x - prev.x);
          if (type === 'OpenUp') {
            perpAngle = segmentAngle - (Math.PI / 2);
          } else { // OpenDn
            perpAngle = segmentAngle + (Math.PI / 2);
          }
        }

        // Position arrow
        const actualGapStart = {
          x: scaledCornerX,
          y: scaledCornerY
        };
        const actualGapEnd = {
          x: scaledCornerX + 15 * scale * Math.cos(perpAngle),
          y: scaledCornerY + 15 * scale * Math.sin(perpAngle)
        };

        // Draw dimension line
        const gapStrokeWidth = 2;
        const gapLine = new Konva.Line({
          points: [actualGapStart.x, actualGapStart.y, actualGapEnd.x, actualGapEnd.y],
          stroke: '#000000',
          strokeWidth: gapStrokeWidth,
          listening: false
        });
        layer.add(gapLine);

        // Draw arrow heads on BOTH ends
        const arrowSize = 4;

        // Arrow at start (pointing toward corner)
        const startArrowAngle1 = perpAngle + Math.PI + Math.PI * 0.85;
        const startArrowAngle2 = perpAngle + Math.PI - Math.PI * 0.85;
        const startArrow = new Konva.Line({
          points: [
            actualGapStart.x + arrowSize * Math.cos(startArrowAngle1),
            actualGapStart.y + arrowSize * Math.sin(startArrowAngle1),
            actualGapStart.x,
            actualGapStart.y,
            actualGapStart.x + arrowSize * Math.cos(startArrowAngle2),
            actualGapStart.y + arrowSize * Math.sin(startArrowAngle2)
          ],
          stroke: '#000000',
          strokeWidth: gapStrokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
          listening: false
        });
        layer.add(startArrow);

        // Arrow at end (pointing away from corner)
        const endArrowAngle1 = perpAngle + Math.PI * 0.85;
        const endArrowAngle2 = perpAngle - Math.PI * 0.85;
        const endArrow = new Konva.Line({
          points: [
            actualGapEnd.x + arrowSize * Math.cos(endArrowAngle1),
            actualGapEnd.y + arrowSize * Math.sin(endArrowAngle1),
            actualGapEnd.x,
            actualGapEnd.y,
            actualGapEnd.x + arrowSize * Math.cos(endArrowAngle2),
            actualGapEnd.y + arrowSize * Math.sin(endArrowAngle2)
          ],
          stroke: '#000000',
          strokeWidth: gapStrokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
          listening: false
        });
        layer.add(endArrow);

        // Gap text label is now drawn by drawAllLabels with collision detection
      }

    } else {
      // SF (Square Fold): Draw using smooth curved arc
      // Taper mode: no gap from corner (touch orange dot), others: small gap
      const gapFromCorner = isTaperMode ? 0 : 3;

      const segDir = isEndFold ?
        { x: prev.x - corner.x, y: prev.y - corner.y } :
        { x: next.x - corner.x, y: next.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

      let perpDir;
      if (type === 'Up') {
        perpDir = { x: segUnit.y, y: -segUnit.x };
      } else {
        perpDir = { x: -segUnit.y, y: segUnit.x };
      }

      // Arc extent logic - FIXED (matching DrawingCanvas):
      // Use parentSegmentLength (actual segment length in mm) for comparisons
      // segLen is in drawing units, actualSegLen is in mm - need to scale fold values
      const foldLengthNum = Number(len);
      const actualSegLen = Number(parentSegmentLength) || segLen; // Use passed segment length, fallback to calculated
      const scaleRatio = segLen / actualSegLen; // drawing units per mm

      // Determine if this is a full arc (fold equals segment)
      const isFullArc = foldLengthNum >= actualSegLen;

      // Use zero gap for full arc (no visible color at start)
      // For proportional arc, use normal gap
      const dynamicGapFromCorner = isFullArc ? 0 : gapFromCorner;

      let arcExtent;
      if (foldLengthNum > actualSegLen) {
        // Fold EXCEEDS segment - scale fold length to drawing units
        arcExtent = foldLengthNum * scaleRatio;
      } else if (foldLengthNum >= actualSegLen) {
        // Fold EQUALS segment - end at segment end (full arc)
        arcExtent = Math.max(segLen - dynamicGapFromCorner, 0);
      } else {
        // Fold is less than segment - arc ends at proportional position
        let proportionalEnd = (foldLengthNum / actualSegLen) * segLen;
        if (foldLengthNum <= 20 && actualSegLen > 50) {
          proportionalEnd = (foldLengthNum / actualSegLen) * segLen * 2;
        }
        arcExtent = Math.max(proportionalEnd - dynamicGapFromCorner, 0);
      }

      // MINIMUM FOLD ARC SIZE: Match DrawingCanvas visual fold arc scaling
      if (foldLengthNum > 1) {
        // Use smaller minimums for taper mode (matching DrawingCanvas)
        const minFoldPixels = isTaperMode
          ? Math.min(25 + (foldLengthNum * 1.5), 100)
          : Math.min(40 + (foldLengthNum * 2), 160);
        const minArcExtent = minFoldPixels / scale;
        const currentArcPixels = arcExtent * scale;

        // Apply minimum if fold arc is too small
        const foldLessThanSegment = foldLengthNum < actualSegLen;
        const foldRatio = foldLengthNum / actualSegLen;

        if (currentArcPixels < minFoldPixels) {
          if (foldLessThanSegment && foldRatio > 0.5) {
            const maxProportionalExtent = foldRatio * segLen;
            arcExtent = Math.min(minArcExtent, maxProportionalExtent, segLen - dynamicGapFromCorner);
          } else if (foldLessThanSegment) {
            const minVisibleExtent = isTaperMode ? 0.15 * segLen : 0.1 * segLen;
            const maxReasonableExtent = Math.max(minVisibleExtent, Math.min(0.5 * segLen, foldRatio * segLen * 3));
            arcExtent = Math.min(minArcExtent, maxReasonableExtent, segLen - dynamicGapFromCorner);
          } else {
            arcExtent = Math.min(minArcExtent, segLen - dynamicGapFromCorner);
          }
        }
      }

      // Draw straight line with gap, then curve at the end to touch the segment
      // Use constant pixel values to maintain visual width across all drawing sizes
      // INCREASED: Use larger values to make fold arcs more visible in split drawings
      const lineOffset = isTaperMode ? 11 / scale : 15 / scale; // Perpendicular gap from segment (increased for visibility)
      const curveLength = isTaperMode ? 8 / scale : 10 / scale; // Length of the curve at the end (constant pixels)
      const numCurvePoints = 10; // Points for the curve portion

      // Check if fold length exceeds parent segment (e.g., SF 11 on 10mm segment)
      // Use actual segment length for this comparison
      const foldExceedsSegment = foldLengthNum > actualSegLen;

      if (isTaperMode && !foldExceedsSegment) {
        // TAPER MODE: SF arc with curves at BOTH ends
        // Start touching orange dot, curve away, run straight, curve back to touch line

        // Start point: Add small gap to touch but not overlap the orange dot
        const startGap = 1 / scale; // Small gap to avoid overlapping the dot
        const startX = corner.x + segUnit.x * startGap;
        const startY = corner.y + segUnit.y * startGap;
        arcPoints.push(startX * scale + offsetX, startY * scale + offsetY);

        // Starting curve: transition from 0 offset to lineOffset
        for (let i = 1; i <= numCurvePoints; i++) {
          const t = i / numCurvePoints;
          const alongSegment = startGap + curveLength * t;
          const currentOffset = lineOffset * t; // Grow from 0 to lineOffset
          const px = corner.x + segUnit.x * alongSegment + perpDir.x * currentOffset;
          const py = corner.y + segUnit.y * alongSegment + perpDir.y * currentOffset;
          arcPoints.push(px * scale + offsetX, py * scale + offsetY);
        }

        // Straight portion with full offset
        const straightStart = startGap + curveLength;
        const straightEnd = arcExtent - curveLength;
        const straightMidX = corner.x + segUnit.x * straightEnd + perpDir.x * lineOffset;
        const straightMidY = corner.y + segUnit.y * straightEnd + perpDir.y * lineOffset;
        arcPoints.push(straightMidX * scale + offsetX, straightMidY * scale + offsetY);

        // Ending curve: transition from lineOffset back to 0 (touching line)
        for (let i = 1; i <= numCurvePoints; i++) {
          const t = i / numCurvePoints;
          const alongSegment = straightEnd + curveLength * t;
          const currentOffset = lineOffset * (1 - t); // Shrink from lineOffset to 0
          const px = corner.x + segUnit.x * alongSegment + perpDir.x * currentOffset;
          const py = corner.y + segUnit.y * alongSegment + perpDir.y * currentOffset;
          arcPoints.push(px * scale + offsetX, py * scale + offsetY);
        }
      } else {
        // NORMAL MODE: Symmetrical - start touching orange dot, curve away, run straight, curve back to touch line

        if (foldExceedsSegment) {
          // Fold exceeds segment - start from orange dot, curve away, then continue straight
          // Start point: touching orange dot (small gap to avoid overlap)
          const startGap = 1 / scale;
          const startX = corner.x + segUnit.x * startGap;
          const startY = corner.y + segUnit.y * startGap;
          arcPoints.push(startX * scale + offsetX, startY * scale + offsetY);

          // Curve away from orange dot
          for (let i = 1; i <= numCurvePoints; i++) {
            const t = i / numCurvePoints;
            const alongSegment = startGap + curveLength * t;
            const currentOffset = lineOffset * t; // Grow from 0 to lineOffset
            const px = corner.x + segUnit.x * alongSegment + perpDir.x * currentOffset;
            const py = corner.y + segUnit.y * alongSegment + perpDir.y * currentOffset;
            arcPoints.push(px * scale + offsetX, py * scale + offsetY);
          }

          // Continue straight to the end
          const endX = corner.x + segUnit.x * arcExtent + perpDir.x * lineOffset;
          const endY = corner.y + segUnit.y * arcExtent + perpDir.y * lineOffset;
          arcPoints.push(endX * scale + offsetX, endY * scale + offsetY);
        } else {
          // Normal case: Start touching orange dot, curve away, straight portion, curve back to touch line

          // Start point: touching orange dot (small gap to avoid overlap)
          const startGap = 1 / scale;
          const startX = corner.x + segUnit.x * startGap;
          const startY = corner.y + segUnit.y * startGap;
          arcPoints.push(startX * scale + offsetX, startY * scale + offsetY);

          // Starting curve: transition from 0 offset to lineOffset (curve away from corner)
          for (let i = 1; i <= numCurvePoints; i++) {
            const t = i / numCurvePoints;
            const alongSegment = startGap + curveLength * t;
            const currentOffset = lineOffset * t; // Grow from 0 to lineOffset
            const px = corner.x + segUnit.x * alongSegment + perpDir.x * currentOffset;
            const py = corner.y + segUnit.y * alongSegment + perpDir.y * currentOffset;
            arcPoints.push(px * scale + offsetX, py * scale + offsetY);
          }

          // Straight portion with full offset
          const straightStart = startGap + curveLength;
          const straightEnd = arcExtent - curveLength;
          const straightMidX = corner.x + segUnit.x * straightEnd + perpDir.x * lineOffset;
          const straightMidY = corner.y + segUnit.y * straightEnd + perpDir.y * lineOffset;
          arcPoints.push(straightMidX * scale + offsetX, straightMidY * scale + offsetY);

          // Ending curve: transition from lineOffset back to 0 (curve back to touch line)
          for (let i = 1; i <= numCurvePoints; i++) {
            const t = i / numCurvePoints;
            const alongSegment = straightEnd + curveLength * t;
            const currentOffset = lineOffset * (1 - t); // Shrink from lineOffset to 0
            const px = corner.x + segUnit.x * alongSegment + perpDir.x * currentOffset;
            const py = corner.y + segUnit.y * alongSegment + perpDir.y * currentOffset;
            arcPoints.push(px * scale + offsetX, py * scale + offsetY);
          }

          // Final point: touching the line segment
          const endX = corner.x + segUnit.x * arcExtent;
          const endY = corner.y + segUnit.y * arcExtent;
          arcPoints.push(endX * scale + offsetX, endY * scale + offsetY);
        }
      }

      const line = new Konva.Line({
        points: arcPoints,
        stroke: '#1E3A8A',
        strokeWidth: 6, // Increased for better visibility in split drawings
        lineCap: 'round',
        lineJoin: 'round',
        listening: false
      });
      layer.add(line);
    }

    // Label drawing is now handled by drawAllLabels with collision detection
    // This function only draws the arc geometry
}

/**
 * Get fold label text based on type and length
 * @param {Object} corner - Corner point object
 * @param {string} type - Fold type (Up, Down, OpenUp, OpenDn)
 * @param {number} len - Fold length
 * @param {string} customLabel - Optional custom label
 * @param {number} gap - Optional gap value for SSF folds
 */
function getFoldLabelText(corner, type, len, customLabel = null, gap = 0) {
  const gapNum = Number(gap) || 0;
  const isSSF = type === 'OpenUp' || type === 'OpenDn';

  // Check if existing label already contains gap info
  const existingLabel = customLabel || (corner && corner.label);
  if (existingLabel) {
    // If label already has gap info, use it as is
    if (existingLabel.includes('mm Gap')) {
      return existingLabel;
    }
    // If SSF and gap is provided but not in label, append it on new line
    if (isSSF && gapNum > 0) {
      return `${existingLabel}\n${gapNum}mm Gap`;
    }
    return existingLabel;
  }

  // Generate new label
  const foldLabel = type === 'Up' || type === 'Down' ? 'SF' : 'SSF';
  const baseLabel = `${foldLabel} ${Math.round(len)}`;
  // For SSF types, append gap on new line if provided
  if (isSSF && gapNum > 0) {
    return `${baseLabel}\n${gapNum}mm Gap`;
  }
  return baseLabel;
}

/**
 * Unified label drawing function with collision detection
 * Draws segment labels, angle labels, fold labels, and gap labels
 * Ensures no labels overlap each other or the drawing
 */
function drawAllLabels(layer, points, lengths, angles, scale, offsetX, offsetY, labelOffsets = null, reverseColor = false, flipH = false, flipV = false, fontSize = 28, isTaperMode = false, startFoldGap = 0, endFoldGap = 0, labelOffsetScaleParam = null, taperProfile = null, isSplitDrawing = false) {
  // Use labelOffsetScaleParam if provided, otherwise fall back to scale
  const labelScale = labelOffsetScaleParam || scale;
  // Get canvas dimensions from layer's stage for boundary checking
  const stage = layer.getStage();
  const canvasWidth = stage ? stage.width() : 1000;
  const canvasHeight = stage ? stage.height() : 700;
  const labelPadding = 30;
  
  // Track all placed labels for collision detection
  const placedLabels = [];
  
  // Filter out fold points to get main segment points only
  const mainSegmentPts = points.filter(p => !p.isFold);

  // Helper function to add label with collision detection
  // extraOffsetAfterCollision: optional {x, y} offset to apply AFTER collision detection
  const addLabelWithCollisionDetection = (x, y, text, color, refPoint = null, extraOffsetAfterCollision = null) => {
    // Handle multi-line text (SSF labels with gap)
    const isMultiLine = text.includes('\n');
    const lineCount = isMultiLine ? text.split('\n').length : 1;

    // Calculate proper dimensions for multi-line text
    let textWidth, textHeight;
    if (isMultiLine) {
      // Estimate dimensions for multi-line text (matches SelectMaterialsSimplified)
      const foldFontSize = 16;
      const maxLineLength = Math.max(...text.split('\n').map(line => line.length));
      textWidth = maxLineLength * foldFontSize * 0.6;
      textHeight = foldFontSize * lineCount * 1.2;
    } else {
      const tempText = new Konva.Text({
        text: text,
        fontSize: fontSize,
        fontStyle: 'bold',
        fontFamily: 'Verdana, Geneva, sans-serif'
      });
      textWidth = tempText.width();
      textHeight = tempText.height();
    }
    const halfW = textWidth / 2;
    const halfH = textHeight / 2;

    // Find non-overlapping position
    const adjustedPos = findNonOverlappingPosition(
      x, y, textWidth, textHeight,
      placedLabels, points, scale, offsetX, offsetY,
      canvasWidth, canvasHeight, labelPadding
    );

    // Apply extra offset AFTER collision detection (for split drawing first segments)
    if (extraOffsetAfterCollision) {
      adjustedPos.x += extraOffsetAfterCollision.x || 0;
      adjustedPos.y += extraOffsetAfterCollision.y || 0;
    }
    
    // Register this label's bounds
    const labelBounds = {
      left: adjustedPos.x - halfW,
      right: adjustedPos.x + halfW,
      top: adjustedPos.y - halfH,
      bottom: adjustedPos.y + halfH,
      x: adjustedPos.x,
      y: adjustedPos.y
    };
    placedLabels.push(labelBounds);
    
    // Draw reference line if refPoint is provided
    if (refPoint) {
      const lineDx = adjustedPos.x - refPoint.x;
      const lineDy = adjustedPos.y - refPoint.y;
      const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
      
      if (lineLen > 5) {
        const isHorizontalApproach = Math.abs(lineDx) > Math.abs(lineDy);
        const labelEdgeOffset = isHorizontalApproach ? 22 : 15;
        let lineEndX = adjustedPos.x;
        let lineEndY = adjustedPos.y;
        
        if (lineLen > labelEdgeOffset) {
          const shortenRatio = (lineLen - labelEdgeOffset) / lineLen;
          lineEndX = refPoint.x + lineDx * shortenRatio;
          lineEndY = refPoint.y + lineDy * shortenRatio;
        }
        
        const refLine = new Konva.Arrow({
          points: [refPoint.x, refPoint.y, lineEndX, lineEndY],
          stroke: color,
          strokeWidth: 1,
          listening: false,
          pointerWidth: 8,
          pointerAtBeginning: true,
          pointerAtEnding: false
        });
        layer.add(refLine);
      }
    }
    
    // Draw the label text
    const labelText = new Konva.Text({
      x: adjustedPos.x,
      y: adjustedPos.y,
      text: text,
      fontSize: fontSize,
      fontStyle: 'bold',
      fontFamily: 'Verdana, Geneva, sans-serif',
      fontWeight: 'bold',
      fill: color,
      align: 'center',
      verticalAlign: 'middle',
      offsetX: halfW,
      offsetY: halfH,
      listening: false
    });
    layer.add(labelText);
    
    return adjustedPos;
  };

  // Pre-compute fold label positions for smart overlap detection
  // MUST use the same perpendicular-based positioning as the actual fold label rendering below
  let startFoldLabelPos = null;
  let endFoldLabelPos = null;
  if (points.length > 2 && points[0].isFold && points[0].foldLength > 0) {
    const type = points[0].foldType;
    const corner = points[2], next = points[3];
    if (corner && next) {
      const segDir = { x: next.x - corner.x, y: next.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };
      const perpDir = (type === 'Up') ? { x: segUnit.y, y: -segUnit.x }
        : (type === 'Down') ? { x: -segUnit.y, y: segUnit.x }
        : (type === 'OpenUp') ? { x: -segUnit.y, y: segUnit.x }
        : { x: segUnit.y, y: -segUnit.x }; // OpenDn
      const labelOffset = 35 / scale;
      const alongOffset = 5 / scale;
      startFoldLabelPos = {
        x: (corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset) * scale + offsetX,
        y: (corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset) * scale + offsetY
      };
    }
  }
  if (points.length > 2 && points[points.length - 1].isFold && points[points.length - 1].foldLength > 0) {
    const type = points[points.length - 1].foldType;
    const cornerIdx = points.length - 3;
    const corner = points[cornerIdx], prev = points[cornerIdx - 1];
    if (corner && prev) {
      const segDir = { x: prev.x - corner.x, y: prev.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };
      const perpDir = (type === 'Up') ? { x: segUnit.y, y: -segUnit.x }
        : (type === 'Down') ? { x: -segUnit.y, y: segUnit.x }
        : (type === 'OpenUp') ? { x: -segUnit.y, y: segUnit.x }
        : { x: segUnit.y, y: -segUnit.x }; // OpenDn
      const labelOffset = 35 / scale;
      const alongOffset = 5 / scale;
      endFoldLabelPos = {
        x: (corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset) * scale + offsetX,
        y: (corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset) * scale + offsetY
      };
    }
  }

  // 1. Draw segment labels (blue) first
  for (let segmentIndex = 0; segmentIndex < mainSegmentPts.length - 1; segmentIndex++) {
    const start = mainSegmentPts[segmentIndex];
    const end = mainSegmentPts[segmentIndex + 1];
    const totalMainSegs = mainSegmentPts.length - 1;
    const foldLabelPixelPos = (segmentIndex === 0 && startFoldLabelPos) ? startFoldLabelPos
      : (segmentIndex === totalMainSegs - 1 && endFoldLabelPos) ? endFoldLabelPos
      : null;

    const labelPos = getSegmentLabelPosition(
      start, end, scale, offsetX, offsetY,
      reverseColor, flipH, flipV,
      mainSegmentPts, segmentIndex,
      false, true, foldLabelPixelPos
    );

    let finalX = labelPos.x;
    let finalY = labelPos.y;

    // Apply saved offset - check profile-specific offsets for taper mode, with fallback chain
    let savedSegmentOffset = null;
    if (taperProfile === 'far') {
      // For FAR profile: try farSegmentLabels first, then segmentLabels as fallback
      savedSegmentOffset = labelOffsets?.farSegmentLabels?.[segmentIndex] || labelOffsets?.segmentLabels?.[segmentIndex];
    } else if (taperProfile === 'near') {
      // For NEAR profile: try nearSegmentLabels first, then segmentLabels as fallback
      savedSegmentOffset = labelOffsets?.nearSegmentLabels?.[segmentIndex] || labelOffsets?.segmentLabels?.[segmentIndex];
    } else if (labelOffsets?.segmentLabels?.[segmentIndex]) {
      // Normal mode: use segmentLabels
      savedSegmentOffset = labelOffsets.segmentLabels[segmentIndex];
    }
    if (savedSegmentOffset) {
      finalX += (savedSegmentOffset.x || 0);
      finalY += (savedSegmentOffset.y || 0);
    }

    // Calculate extra offset for first segment in split drawings (applied AFTER collision detection)
    // NOTE: Only apply when isSplitDrawing is true AND canvas is small (split preview size)
    // This prevents affecting non-split drawings that also use generateSingleDrawing
    let extraOffsetForFirstSegment = null;
    const isSmallCanvas = canvasWidth <= 500 && canvasHeight <= 400;
    if (isSplitDrawing && segmentIndex === 0 && isSmallCanvas) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy);
      const isHorizontal = Math.abs(dy) < 0.01;

      // Apply extra offset to non-horizontal first segments (vertical or diagonal)
      if (!isHorizontal && len > 0) {
        // Calculate perpendicular direction
        const perpX = -dy / len;
        const perpY = dx / len;

        // Determine which side the label is on relative to segment midpoint
        const segmentMidX = (start.x + end.x) / 2 * scale + offsetX;
        const segmentMidY = (start.y + end.y) / 2 * scale + offsetY;

        const labelDirX = finalX - segmentMidX;
        const labelDirY = finalY - segmentMidY;
        const dotProduct = labelDirX * perpX + labelDirY * perpY;
        const extraOffset = 25;

        // Store the offset to apply AFTER collision detection
        if (dotProduct > 0) {
          extraOffsetForFirstSegment = { x: perpX * extraOffset, y: perpY * extraOffset };
        } else {
          extraOffsetForFirstSegment = { x: -perpX * extraOffset, y: -perpY * extraOffset };
        }
      }
    }

    const rawLength = lengths[segmentIndex];
    const numLength = Number(rawLength) || 0;
    const displayLength = numLength === 0 ? 1 : numLength;
    const lengthText = `${Math.round(displayLength)}`;

    const segmentMidpointX = (start.x + end.x) / 2 * scale + offsetX;
    const segmentMidpointY = (start.y + end.y) / 2 * scale + offsetY;

    addLabelWithCollisionDetection(finalX, finalY, lengthText, '#0033CC', { x: segmentMidpointX, y: segmentMidpointY }, extraOffsetForFirstSegment);
  }

  // 2. Draw angle labels (green) - skip 90° and 180° angles
  for (let i = 1; i < mainSegmentPts.length - 1; i++) {
    const prevPoint = mainSegmentPts[i - 1];
    const currPoint = mainSegmentPts[i];
    const nextPoint = mainSegmentPts[i + 1];

    const angleIndex = i - 1;
    const angle = angles[angleIndex];
    // Skip undefined, 90°, -90°, 180°, and -180° angles
    if (angle === undefined || Math.abs(angle) === 90 || Math.abs(angle) === 180) continue;

    const labelPos = getAngleLabelPosition(
      prevPoint, currPoint, nextPoint,
      scale, offsetX, offsetY,
      mainSegmentPts, angleIndex
    );

    let finalX = labelPos.x;
    let finalY = labelPos.y;

    // Apply saved offset - check profile-specific offsets for taper mode, with fallback chain
    let savedAngleOffset = null;
    if (taperProfile === 'far') {
      // For FAR profile: try farAngleLabels first, then angleLabels as fallback
      savedAngleOffset = labelOffsets?.farAngleLabels?.[angleIndex] || labelOffsets?.angleLabels?.[angleIndex];
    } else if (taperProfile === 'near') {
      // For NEAR profile: try nearAngleLabels first, then angleLabels as fallback
      savedAngleOffset = labelOffsets?.nearAngleLabels?.[angleIndex] || labelOffsets?.angleLabels?.[angleIndex];
    } else if (labelOffsets?.angleLabels?.[angleIndex]) {
      // Normal mode: use angleLabels
      savedAngleOffset = labelOffsets.angleLabels[angleIndex];
    }
    if (savedAngleOffset) {
      finalX += (savedAngleOffset.x || 0);
      finalY += (savedAngleOffset.y || 0);
    }

    const normalizedAngle = normalizeDegrees(angle);
    const angleText = `${Math.round(normalizedAngle)}°`;
    
    const vertexX = currPoint.x * scale + offsetX;
    const vertexY = currPoint.y * scale + offsetY;
    
    addLabelWithCollisionDetection(finalX, finalY, angleText, '#008000', { x: vertexX, y: vertexY });
  }

  // 3. Draw fold labels (SF/SSF) - blue for SF, brown for SSF
  // Calculate position using SAME perpendicular direction as fold arc drawing
  // This ensures the label is positioned on the SAME SIDE as the arc

  // Start fold
  if (points.length > 2 && points[0].isFold && points[0].foldType) {
    const type = points[0].foldType;
    const len = points[0].foldLength || 0;
    const label = points[0].label;
    const cornerIdx = 2;
    const corner = points[cornerIdx];
    const prev = points[cornerIdx - 1];
    const next = points[cornerIdx + 1];

    if (corner && prev && next) {
      const isSF = type === 'Up' || type === 'Down';

      // Use perpendicular direction calculation for ALL fold types (SF and SSF)
      const segDir = { x: next.x - corner.x, y: next.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

      // Calculate perpendicular direction based on fold type
      let perpDir;
      if (type === 'Up') {
        perpDir = { x: segUnit.y, y: -segUnit.x };
      } else if (type === 'Down') {
        perpDir = { x: -segUnit.y, y: segUnit.x };
      } else if (type === 'OpenUp') {
        perpDir = { x: -segUnit.y, y: segUnit.x };
      } else { // OpenDn
        perpDir = { x: segUnit.y, y: -segUnit.x };
      }

      // Position label offset from corner in the perpendicular direction
      const labelOffset = 35 / scale;
      const alongOffset = 5 / scale;

      const labelX = corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset;
      const labelY = corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset;

      let finalX = labelX * scale + offsetX;
      let finalY = labelY * scale + offsetY;

      // Apply saved offset - check profile-specific offsets for taper mode, with fallback chain
      let savedStartFoldOffset = null;
      if (taperProfile === 'far') {
        // For FAR profile: try farFoldLabels first, then foldLabels as fallback
        savedStartFoldOffset = labelOffsets?.farFoldLabels?.start || labelOffsets?.foldLabels?.start;
      } else if (taperProfile === 'near') {
        // For NEAR profile: try nearFoldLabels first, then foldLabels as fallback
        savedStartFoldOffset = labelOffsets?.nearFoldLabels?.start || labelOffsets?.foldLabels?.start;
      } else if (labelOffsets?.foldLabels?.start) {
        // Normal mode: use foldLabels
        savedStartFoldOffset = labelOffsets.foldLabels.start;
      }
      if (savedStartFoldOffset) {
        finalX += (savedStartFoldOffset.x || 0);
        finalY += (savedStartFoldOffset.y || 0);
      }

      const foldColor = isSF ? '#1E3A8A' : 'brown';
      const labelText = getFoldLabelText(points[0], type, len, label, startFoldGap);

      addLabelWithCollisionDetection(finalX, finalY, labelText, foldColor, null);
    }
  }

  // End fold
  if (points.length > 2 && points[points.length - 1].isFold && points[points.length - 1].foldType) {
    const type = points[points.length - 1].foldType;
    const len = points[points.length - 1].foldLength || 0;
    const label = points[points.length - 1].label;
    const cornerIdx = points.length - 3;
    const corner = points[cornerIdx];
    const prev = points[cornerIdx - 1];
    const next = points[cornerIdx + 1];

    if (corner && prev && next) {
      const isSF = type === 'Up' || type === 'Down';

      // Use perpendicular direction calculation for ALL fold types (SF and SSF)
      // For END fold, segment direction is from corner toward prev (reversed)
      const segDir = { x: prev.x - corner.x, y: prev.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

      // Calculate perpendicular direction based on fold type
      let perpDir;
      if (type === 'Up') {
        perpDir = { x: segUnit.y, y: -segUnit.x };
      } else if (type === 'Down') {
        perpDir = { x: -segUnit.y, y: segUnit.x };
      } else if (type === 'OpenUp') {
        perpDir = { x: -segUnit.y, y: segUnit.x };
      } else { // OpenDn
        perpDir = { x: segUnit.y, y: -segUnit.x };
      }

      // Position label offset from corner in the perpendicular direction
      const labelOffset = 35 / scale;
      const alongOffset = 5 / scale;

      const labelX = corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset;
      const labelY = corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset;

      let finalX = labelX * scale + offsetX;
      let finalY = labelY * scale + offsetY;

      // Apply saved offset - check profile-specific offsets for taper mode, with fallback chain
      let savedEndFoldOffset = null;
      if (taperProfile === 'far') {
        // For FAR profile: try farFoldLabels first, then foldLabels as fallback
        savedEndFoldOffset = labelOffsets?.farFoldLabels?.end || labelOffsets?.foldLabels?.end;
      } else if (taperProfile === 'near') {
        // For NEAR profile: try nearFoldLabels first, then foldLabels as fallback
        savedEndFoldOffset = labelOffsets?.nearFoldLabels?.end || labelOffsets?.foldLabels?.end;
      } else if (labelOffsets?.foldLabels?.end) {
        // Normal mode: use foldLabels
        savedEndFoldOffset = labelOffsets.foldLabels.end;
      }
      if (savedEndFoldOffset) {
        finalX += (savedEndFoldOffset.x || 0);
        finalY += (savedEndFoldOffset.y || 0);
      }

      const foldColor = isSF ? '#1E3A8A' : 'brown';
      const labelText = getFoldLabelText(points[points.length - 1], type, len, label, endFoldGap);

      addLabelWithCollisionDetection(finalX, finalY, labelText, foldColor, null);
    }
  }
}

/**
 * Draw segment length and angle labels
 * Matching DrawingCanvas exactly
 * @deprecated Use drawAllLabels instead for unified collision detection
 */
function drawLabels(layer, points, lengths, angles, scale, offsetX, offsetY, labelOffsets = null, reverseColor = false, flipH = false, flipV = false, fontSize = 28) {
  // fontSize is now passed as parameter
  
  // Get canvas dimensions from layer's stage for boundary checking
  const stage = layer.getStage();
  const canvasWidth = stage ? stage.width() : 1000;
  const canvasHeight = stage ? stage.height() : 700;
  const labelPadding = 30; // Minimum distance from edge
  
  // FIXED: Filter out fold points to get main segment points only (for correct label positioning)
  // This ensures getSegmentLabelPosition receives the correct index and point array
  const mainSegmentPts = points.filter(p => !p.isFold);

  // Pre-compute fold label positions for smart overlap detection
  // MUST use the same perpendicular-based positioning as the actual fold label rendering
  let startFoldLabelPos2 = null;
  let endFoldLabelPos2 = null;
  if (points.length > 2 && points[0].isFold && points[0].foldLength > 0) {
    const type = points[0].foldType;
    const corner = points[2], next = points[3];
    if (corner && next) {
      const segDir = { x: next.x - corner.x, y: next.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };
      const perpDir = (type === 'Up') ? { x: segUnit.y, y: -segUnit.x }
        : (type === 'Down') ? { x: -segUnit.y, y: segUnit.x }
        : (type === 'OpenUp') ? { x: -segUnit.y, y: segUnit.x }
        : { x: segUnit.y, y: -segUnit.x };
      const labelOffset = 35 / scale;
      const alongOffset = 5 / scale;
      startFoldLabelPos2 = {
        x: (corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset) * scale + offsetX,
        y: (corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset) * scale + offsetY
      };
    }
  }
  if (points.length > 2 && points[points.length - 1].isFold && points[points.length - 1].foldLength > 0) {
    const type = points[points.length - 1].foldType;
    const cornerIdx = points.length - 3;
    const corner = points[cornerIdx], prev = points[cornerIdx - 1];
    if (corner && prev) {
      const segDir = { x: prev.x - corner.x, y: prev.y - corner.y };
      const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
      const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };
      const perpDir = (type === 'Up') ? { x: segUnit.y, y: -segUnit.x }
        : (type === 'Down') ? { x: -segUnit.y, y: segUnit.x }
        : (type === 'OpenUp') ? { x: -segUnit.y, y: segUnit.x }
        : { x: segUnit.y, y: -segUnit.x };
      const labelOffset = 35 / scale;
      const alongOffset = 5 / scale;
      endFoldLabelPos2 = {
        x: (corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset) * scale + offsetX,
        y: (corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset) * scale + offsetY
      };
    }
  }

  // Draw segment labels (blue)
  // Iterate over main segment points only
  for (let segmentIndex = 0; segmentIndex < mainSegmentPts.length - 1; segmentIndex++) {
    const start = mainSegmentPts[segmentIndex];
    const end = mainSegmentPts[segmentIndex + 1];

    const totalMainSegs = mainSegmentPts.length - 1;
    const foldLabelPixelPos = (segmentIndex === 0 && startFoldLabelPos2) ? startFoldLabelPos2
      : (segmentIndex === totalMainSegs - 1 && endFoldLabelPos2) ? endFoldLabelPos2
      : null;

    const labelPos = getSegmentLabelPosition(
      start,
      end,
      scale,
      offsetX,
      offsetY,
      reverseColor,
      flipH,
      flipV,
      mainSegmentPts, // Pass filtered points for correct positioning
      segmentIndex,   // Pass correct segment index
      false, // isAdjusted
      true,  // isTaperMode
      foldLabelPixelPos
    );

    let finalX = labelPos.x;
    let finalY = labelPos.y;

    // Apply manual label adjustments if provided
    // Multiply by scale since offsets are saved as scale-normalized values
    if (labelOffsets && labelOffsets.segmentLabels && labelOffsets.segmentLabels[segmentIndex]) {
      const savedOffset = labelOffsets.segmentLabels[segmentIndex];
      finalX += (savedOffset.x || 0) * scale;
      finalY += (savedOffset.y || 0) * scale;
    }

    // Create text to measure dimensions (matching DrawingCanvas)
    // Use segmentIndex to access the correct length value
    const rawLength = lengths[segmentIndex];
    const numLength = Number(rawLength) || 0;
    // Display "1" for length 0 in the drawing (matching DrawingCanvas behavior)
    const displayLength = numLength === 0 ? 1 : numLength;
    const lengthText = `${Math.round(displayLength)}`;
    
    const tempText = new Konva.Text({
      text: lengthText,
      fontSize: fontSize,
      fontStyle: 'bold',
      fontFamily: 'Verdana, Geneva, sans-serif'
    });
    const textWidth = tempText.width();
    const textHeight = tempText.height();

    // BOUNDARY CHECK: Clamp label position to stay within canvas bounds
    // This prevents labels from being pushed off-screen by large offsets
    const halfTextW = textWidth / 2;
    const halfTextH = textHeight / 2;
    finalX = Math.max(labelPadding + halfTextW, Math.min(canvasWidth - labelPadding - halfTextW, finalX));
    finalY = Math.max(labelPadding + halfTextH, Math.min(canvasHeight - labelPadding - halfTextH, finalY));
    

    // Add thin reference line from segment midpoint to label edge
    const segmentMidpointX = (start.x + end.x) / 2 * scale + offsetX;
    const segmentMidpointY = (start.y + end.y) / 2 * scale + offsetY;

    // Calculate direction from midpoint to label
    const lineDx = finalX - segmentMidpointX;
    const lineDy = finalY - segmentMidpointY;
    const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

    // Use directional offset - larger for horizontal approach (label is wider than tall)
    const isHorizontalApproach = Math.abs(lineDx) > Math.abs(lineDy);
    const labelEdgeOffset = isHorizontalApproach ? 22 : 15;
    let lineEndX = finalX;
    let lineEndY = finalY;
    if (lineLen > labelEdgeOffset) {
      const shortenRatio = (lineLen - labelEdgeOffset) / lineLen;
      lineEndX = segmentMidpointX + lineDx * shortenRatio;
      lineEndY = segmentMidpointY + lineDy * shortenRatio;
    }

    // Only draw reference line if it has meaningful length (more than 5 pixels)
    if (lineLen > 5) {
      const refLine = new Konva.Arrow({
        points: [segmentMidpointX, segmentMidpointY, lineEndX, lineEndY],
        stroke: '#0033CC',
        strokeWidth: 1,
        listening: false,
        pointerWidth:8,
        pointerAtBeginning:true,
        pointerAtEnding:false
      });
      layer.add(refLine);
    }

    const text = new Konva.Text({
      x: finalX,
      y: finalY,
      text: lengthText,
      fontSize: fontSize,
      fontStyle: 'bold',
      fontFamily: 'Verdana, Geneva, sans-serif',
      fontWeight: 'bold',
      fill: '#0033CC', // Match DrawingCanvas blue color
      align: 'center',
      verticalAlign: 'middle',
      width: textWidth,
      height: textHeight,
      wrap: 'none',
      ellipsis: false,
      offsetX: textWidth / 2,
      offsetY: textHeight / 2,
      listening: false
    });
    layer.add(text);
  }

  // Draw angle labels (green) - skip 90°, -90°, 180°, and -180° angles
  // FIXED: Use mainSegmentPts for correct indexing (matching SelectMaterialsSimplified fix)
  for (let i = 1; i < mainSegmentPts.length - 1; i++) {
    const prevPoint = mainSegmentPts[i - 1];
    const currPoint = mainSegmentPts[i];
    const nextPoint = mainSegmentPts[i + 1];

    const angleIndex = i - 1; // angles array is indexed from 0, corresponds to vertex at index 1
    const angle = angles[angleIndex];
    // Skip undefined, 90°, -90°, 180°, and -180° angles
    if (angle === undefined || Math.abs(angle) === 90 || Math.abs(angle) === 180) {
      continue;
    }

    const labelPos = getAngleLabelPosition(
      prevPoint,
      currPoint,
      nextPoint,
      scale,
      offsetX,
      offsetY,
      mainSegmentPts, // Pass filtered points for correct positioning
      angleIndex      // Use correct angle index
    );

    let finalX = labelPos.x;
    let finalY = labelPos.y;

    // Apply manual label adjustments if provided
    // Multiply by scale since offsets are saved as scale-normalized values
    if (labelOffsets && labelOffsets.angleLabels && labelOffsets.angleLabels[angleIndex]) {
      const savedOffset = labelOffsets.angleLabels[angleIndex];
      finalX += (savedOffset.x || 0) * scale;
      finalY += (savedOffset.y || 0) * scale;
    }

    // Normalize angle to [-180, 180] range to match DrawingCanvas behavior
    // This prevents displaying invalid angles like -268° instead of 92°
    const normalizedAngle = normalizeDegrees(angle);

    // Create text to measure dimensions (matching DrawingCanvas)
    const angleText = `${Math.round(normalizedAngle)}°`;
    const tempAngleText = new Konva.Text({
      text: angleText,
      fontSize: fontSize,
      fontStyle: 'bold',
      fontFamily: 'Verdana, Geneva, sans-serif'
    });
    const angleTextWidth = tempAngleText.width();
    const angleTextHeight = tempAngleText.height();

    // BOUNDARY CHECK: Clamp angle label position to stay within canvas bounds
    const halfAngleW = angleTextWidth / 2;
    const halfAngleH = angleTextHeight / 2;
    finalX = Math.max(labelPadding + halfAngleW, Math.min(canvasWidth - labelPadding - halfAngleW, finalX));
    finalY = Math.max(labelPadding + halfAngleH, Math.min(canvasHeight - labelPadding - halfAngleH, finalY));

    // Add thin reference line from vertex to angle label edge
    const vertexX = currPoint.x * scale + offsetX;
    const vertexY = currPoint.y * scale + offsetY;

    // Calculate direction from vertex to label
    const angleLineDx = finalX - vertexX;
    const angleLineDy = finalY - vertexY;
    const angleLineLen = Math.sqrt(angleLineDx * angleLineDx + angleLineDy * angleLineDy);

    // Use directional offset - larger for horizontal approach (label is wider than tall)
    const isAngleHorizontalApproach = Math.abs(angleLineDx) > Math.abs(angleLineDy);
    const angleLabelEdgeOffset = isAngleHorizontalApproach ? 22 : 15;
    let angleLineEndX = finalX;
    let angleLineEndY = finalY;
    if (angleLineLen > angleLabelEdgeOffset) {
      const angleShortenRatio = (angleLineLen - angleLabelEdgeOffset) / angleLineLen;
      angleLineEndX = vertexX + angleLineDx * angleShortenRatio;
      angleLineEndY = vertexY + angleLineDy * angleShortenRatio;
    }

    // Only draw reference line if it has meaningful length (more than 5 pixels)
    if (angleLineLen > 5) {
      const angleRefLine = new Konva.Arrow({
        points: [vertexX, vertexY, angleLineEndX, angleLineEndY],
        stroke: '#008000',
        strokeWidth: 1,
        listening: false,
        pointerWidth:8,
        pointerAtBeginning:true,
        pointerAtEnding:false
      });
      layer.add(angleRefLine);
    }

    const text = new Konva.Text({
      x: finalX - 50,
      y: finalY,
      text: angleText,
      fontSize: fontSize,
      fontStyle: 'bold',
      fontFamily: 'Verdana, Geneva, sans-serif',
      fontWeight: 'bold',
      fill: '#008000', // Match DrawingCanvas green color
      align: 'center',
      verticalAlign: 'middle',
      width: 100,
      height: angleTextHeight,
      offsetY: angleTextHeight / 2,
      listening: false
    });
    layer.add(text);
  }
}
