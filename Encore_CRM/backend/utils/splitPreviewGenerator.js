const { createCanvas } = require('canvas');
const logger = require('../logger');
// Removed fs and path - no longer needed for in-memory generation

// Helper function to normalize angles to [-180, 180] range
const normalizeAngle = (angle) => {
  let normalized = angle % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
};

// Helper function to calculate perpendicular vector (rotated 90° counter-clockwise)
const getPerpendicularVector = (dx, dy, len) => {
  if (!len || len === 0) return { x: 0, y: 0 };
  // Rotate 90° counter-clockwise: (x, y) → (-y, x), then normalize
  return {
    x: -dy / len,
    y: dx / len
  };
};

/**
 * Calculate dynamic scale for split taper drawings based on segment count
 * Same logic as frontend getTaperScale function
 * @param {Array} lengths - Array of segment lengths
 * @returns {Number} - Scale factor
 */
const getTaperScale = (lengths) => {
  const segmentCount = (lengths || []).length;
  if (segmentCount <= 4) return 1.3;  // Simple drawings
  if (segmentCount <= 6) return 1.4;  // 5-6 segments
  if (segmentCount <= 8) return 1.3;  // 7-8 segments
  return 1.0;                          // Complex drawings (> 8 segments)
};

/**
 * Generate split preview images with colored tick marks and correct dimensions
 * @param {Object} params - Parameters for generating the preview
 * @returns {Object} - Paths to generated images
 */
async function generateSplitPreview({
  farLengths = [],
  nearLengths = [],
  angles = [],
  direction = 'Right',  // Default to 'Right' if not provided
  firstSegmentAngle = null,  // Actual angle of first segment
  splitIndex = 1,
  splitTotal = 1,
  templateId = '',
  isTaper = true,
  reverseColor = false,
  foldData = {}
}) {
  // logger.debug('🎯 splitPreviewGenerator - Received:', {
  //   direction,
  //   firstSegmentAngle,
  //   hasFirstSegmentAngle: firstSegmentAngle !== null && firstSegmentAngle !== undefined,
  //   firstSegmentAngleType: typeof firstSegmentAngle,
  //   farLengths,
  //   angles
  // });
  const width = 700;  // Increased from 400 to match normal drawing size
  const height = 600; // Increased from 300 to match normal drawing size
  const padding = 10;  // Increased padding for better spacing
  
  // Create canvases for FAR and NEAR views
  const farCanvas = createCanvas(width, height);
  const nearCanvas = createCanvas(width, height);
  const farCtx = farCanvas.getContext('2d');
  const nearCtx = nearCanvas.getContext('2d');
  
  // Set white background
  [farCtx, nearCtx].forEach(ctx => {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
  });
  
  // Calculate points for both FAR and NEAR
  const calculatePoints = (lengths) => {
    const points = [{ x: 0, y: 0 }];
    let x = 0, y = 0;

    // Use firstSegmentAngle if provided, otherwise fall back to direction
    let currentAngle;
    if (firstSegmentAngle !== null && firstSegmentAngle !== undefined) {
      // Use the actual angle of the first segment
      currentAngle = firstSegmentAngle;
      //logger.debug('Using firstSegmentAngle:', currentAngle);
    } else {
      // Fall back to direction-based angle for backward compatibility
      const directionMap = {
        'Up': 90,
        'Down': -90,
        'Right': 0,
        'Left': 180
      };

      currentAngle = directionMap[direction];
      if (currentAngle === undefined) {
        //logger.warn(`Unknown direction: ${direction}, using angle 0`);
        currentAngle = 0;
      }
      //logger.debug('Using direction-based angle:', currentAngle);
    }
    
    lengths.forEach((length, idx) => {
      const angleRad = (currentAngle * Math.PI) / 180;
      x += length * Math.cos(angleRad);
      y += length * Math.sin(angleRad); // Changed from -= to += to match canvas coordinate system
      points.push({ x, y });

      if (idx < angles.length) {
        // Normalize the angle to prevent accumulation beyond ±180°
        const angleIncrement = normalizeAngle(angles[idx]);
        currentAngle += angleIncrement; // Changed from -= to += to match frontend angle calculation
      }
    });
    
    return points;
  };
  
  const farPoints = calculatePoints(farLengths);
  const nearPoints = calculatePoints(nearLengths);
  
  // Draw function for both canvases
  const drawShape = (ctx, points, lengths, label) => {
    // Calculate bounds and scale
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    
    const shapeWidth = maxX - minX || 1;
    const shapeHeight = maxY - minY || 1;

    // Use dynamic scale based on segment count (same as frontend getTaperScale)
    const taperScaleFactor = getTaperScale(lengths);
    // Base scale factor adjusted for canvas size, then apply dynamic taper scaling
    const baseScaleFactor = 0.5; // Base factor for canvas fitting
    const scale = Math.min(
      (width - 2 * padding) / shapeWidth,
      (height - 2 * padding) / shapeHeight
    ) * baseScaleFactor * taperScaleFactor;

    //logger.debug(`📐 Split drawing scale - segments: ${lengths.length}, taperScale: ${taperScaleFactor}, final scale: ${scale.toFixed(2)}`);
    
    const offsetX = (width - shapeWidth * scale) / 2;
    const offsetY = (height - shapeHeight * scale) / 2;
    
    // Transform points
    const transformedPoints = points.map(p => ({
      x: (p.x - minX) * scale + offsetX,
      y: (p.y - minY) * scale + offsetY
    }));

    // Apply tiered minimum widths to maintain proportionality (matches frontend)
    // Larger segments get larger minimums to preserve visual proportions
    for (let i = 0; i < transformedPoints.length - 1; i++) {
      const actualLength = lengths[i];

      // Determine minimum pixels based on actual length to maintain proportions
      let minPixels = 0;
      if (actualLength <= 1) {
        minPixels = 20; // 0-1mm: minimum 20px
      } else if (actualLength <= 10) {
        minPixels = 40; // 2-10mm: minimum 40px
      } else if (actualLength <= 20) {
        minPixels = 50; // 11-20mm: minimum 50px (visibly larger than 10mm)
      } else if (actualLength <= 50) {
        minPixels = 60; // 21-50mm: minimum 60px (visibly larger than 20mm)
      } else if (actualLength <= 100) {
        minPixels = 70; // 51-100mm: minimum 70px
      }
      // Segments > 100mm don't need minimum extension

      if (minPixels > 0) {
        const p1 = transformedPoints[i];
        const p2 = transformedPoints[i + 1];

        // Calculate current rendered length in pixels
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const currentPixelLength = Math.sqrt(dx * dx + dy * dy);

        // If rendered length is less than minimum, extend it
        if (currentPixelLength < minPixels && currentPixelLength > 0) {
          const dirX = dx / currentPixelLength; // Unit direction
          const dirY = dy / currentPixelLength;

          // Calculate how much to extend
          const extension = minPixels - currentPixelLength;

          // Extend this segment by moving all subsequent points
          for (let j = i + 1; j < transformedPoints.length; j++) {
            transformedPoints[j].x += dirX * extension;
            transformedPoints[j].y += dirY * extension;
          }

          //logger.debug(`📏 Split preview: Extended segment ${i} (${actualLength}mm) from ${currentPixelLength.toFixed(1)}px to ${minPixels}px`);
        }
      }
    }

    // Calculate centroid to determine which side is "outside" for tick marks
    // This ensures color side is always on the outside by default, regardless of drawing direction
    let centroidX = null;
    let centroidY = null;
    let useCentroidCorrection = false;

    if (transformedPoints.length >= 3) { // Need at least 3 points to form a shape
      // Calculate centroid (center of mass) of all points
      let sumX = 0;
      let sumY = 0;
      transformedPoints.forEach(pt => {
        sumX += pt.x;
        sumY += pt.y;
      });
      centroidX = sumX / transformedPoints.length;
      centroidY = sumY / transformedPoints.length;

      // Only use centroid correction if values are valid
      if (isFinite(centroidX) && isFinite(centroidY)) {
        useCentroidCorrection = true;
        // logger.debug('📍 Backend split centroid calculated:', {
        //   centroidX,
        //   centroidY,
        //   pointCount: transformedPoints.length
        // });
      }
    }

    // Draw gradient red line on the color side that fades out
    // This creates a professional colored border effect

    // First draw the main black line (thicker for better visibility)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 8; // Thick line for split drawings
    ctx.beginPath();
    transformedPoints.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Now draw gradient lines with 3 colors on the color side
    // Each segment divided into 3 equal color sections
    const gradientLayers = 12; // Increased layers for smoother gradient
    const maxOffset = 12; // Increased width for more visible gradient

    // Define 3 colors
    const colors = [
      { r: 255, g: 0, b: 0 },     // Red
      { r: 255, g: 165, b: 0 },   // Orange
      { r: 0, g: 128, b: 255 }    // Blue
    ];

    for (let layer = 0; layer < gradientLayers; layer++) {
      const offset = (layer + 1) * (maxOffset / gradientLayers);
      const opacity = 0.6 * (1 - layer / gradientLayers); // Fade from 0.6 to 0

      // Draw each segment with offset - divided into 3 color sections
      transformedPoints.slice(0, -1).forEach((p, i) => {
        const next = transformedPoints[i + 1];

        // Calculate perpendicular direction (SAME AS TICK MARKS)
        const dx = next.x - p.x;
        const dy = next.y - p.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        // Perpendicular vector - same as tick marks
        let perpX = -dy / len;
        let perpY = dx / len;

        // Calculate winding order correction for gradients (same logic as tick marks)
        let centroidCorrectionGrad = 1; // Default: no correction

        if (useCentroidCorrection) {
          // Use signed area to determine polygon winding order
          let signedArea = 0;
          for (let j = 0; j < transformedPoints.length; j++) {
            const pt1 = transformedPoints[j];
            const pt2 = transformedPoints[(j + 1) % transformedPoints.length];
            signedArea += (pt2.x - pt1.x) * (pt2.y + pt1.y);
          }

          // signedArea > 0 means CLOCKWISE → perpendicular CCW points OUTWARD
          // signedArea < 0 means COUNTER-CLOCKWISE → perpendicular CCW points INWARD
          const perpPointsOutward = signedArea > 0;

          // If perpendicular points inward, flip it to point outward
          centroidCorrectionGrad = perpPointsOutward ? 1 : -1;
        }

        // Apply offset direction based on reverseColor and winding correction
        const offsetDir = (reverseColor ? -1 : 1) * centroidCorrectionGrad;
        perpX *= offsetDir;
        perpY *= offsetDir;

        // Divide the segment into 3 equal color sections
        for (let colorSection = 0; colorSection < 3; colorSection++) {
          const color = colors[colorSection];
          ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
          ctx.lineWidth = 5; // Increased from 3 to 5 for thicker gradient lines

          // Calculate start and end points for this color section (1/3 of segment)
          const sectionStart = colorSection / 3;
          const sectionEnd = (colorSection + 1) / 3;

          const startX = p.x + (next.x - p.x) * sectionStart;
          const startY = p.y + (next.y - p.y) * sectionStart;
          const endX = p.x + (next.x - p.x) * sectionEnd;
          const endY = p.y + (next.y - p.y) * sectionEnd;

          // Draw this color section with offset
          ctx.beginPath();
          ctx.moveTo(startX + perpX * offset, startY + perpY * offset);
          ctx.lineTo(endX + perpX * offset, endY + perpY * offset);
          ctx.stroke();
        }
      });
    }

    // Draw color side tick marks (same as normal/taper drawings)
    transformedPoints.slice(0, -1).forEach((p, i) => {
      const next = transformedPoints[i + 1];

      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      // Perpendicular vector (same as frontend)
      const perpX = -dy / len;
      const perpY = dx / len;

      // Calculate winding order correction for tick marks
      let centroidCorrection = 1; // Default: no correction

      if (useCentroidCorrection) {
        // Use signed area to determine polygon winding order
        let signedArea = 0;
        for (let j = 0; j < transformedPoints.length; j++) {
          const pt1 = transformedPoints[j];
          const pt2 = transformedPoints[(j + 1) % transformedPoints.length];
          signedArea += (pt2.x - pt1.x) * (pt2.y + pt1.y);
        }

        // signedArea > 0 means CLOCKWISE → perpendicular CCW points OUTWARD
        // signedArea < 0 means COUNTER-CLOCKWISE → perpendicular CCW points INWARD
        const perpPointsOutward = signedArea > 0;

        // If perpendicular points inward, flip it to point outward
        centroidCorrection = perpPointsOutward ? 1 : -1;

        //Code change by Rahul
        // logger.debug(`🎯 Backend split segment ${i} winding check:`, {
        //   signedArea: signedArea.toFixed(2),
        //   winding: signedArea > 0 ? 'CW' : 'CCW',
        //   perpPointsOutward,
        //   centroidCorrection,
        //   description: perpPointsOutward ? 'Perpendicular points OUTWARD' : 'Perpendicular points INWARD - flipping'
        // });
      }

      // Draw ticks on segments
      const tickCount = Math.max(2, Math.min(9, Math.round(len / 40)));
      const tickLen = 6;
      // Apply offset direction based on reverseColor and winding correction
      const offsetDir = (reverseColor ? -1 : 1) * centroidCorrection;

      for (let t = 1; t <= tickCount; t++) {
        const ratio = t / (tickCount + 1);
        const x = p.x + dx * ratio;
        const y = p.y + dy * ratio;

        const tx2 = x + perpX * tickLen * offsetDir;
        const ty2 = y + perpY * tickLen * offsetDir;

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx2, ty2);
        ctx.stroke();
      }
    });

    // Draw colored dots at vertices - match original drawing colors
    transformedPoints.forEach((p, i) => {
      // When reverseColor is true, ALL dots should be ORANGE to match original
      // When reverseColor is false, use green for fold points
      let dotColor = '#FFA500'; // Orange default
      
      // Use consistent orange color for all dots to match normal drawings
      dotColor = '#FF8C00'; // Orange (matching normal drawings)

      // Draw filled circle (dot) with black border
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI); // Reduced from 5 to 4 to match frontend appearance
      ctx.fill();

      // Add black border
      ctx.strokeStyle = '#000000'; // Black border
      ctx.lineWidth = 0.5; // Reduced from 1 to 0.5 to match frontend strokeWidth
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI); // Reduced from 5 to 4 to match frontend appearance
      ctx.stroke();
    });
    

    // Draw dimension labels (matching DrawingCanvas style)
    ctx.fillStyle = '#0000FF'; // Pure blue
    ctx.font = 'bold 32px sans-serif'; // Larger font for better visibility

    // Use already-calculated centroid for consistent outward positioning (matches DrawingCanvas)
    // centroidX and centroidY already calculated above for gradients/ticks (lines 178-179)
    // If not calculated (less than 3 points), calculate now
    if (centroidX === null || centroidY === null) {
      centroidX = transformedPoints.reduce((sum, p) => sum + p.x, 0) / transformedPoints.length;
      centroidY = transformedPoints.reduce((sum, p) => sum + p.y, 0) / transformedPoints.length;
    }

    // SMART OFFSET SYSTEM: Analyze shape complexity to determine appropriate label offsets
    // Simple shapes (3-4 segments) get smaller offsets, complex shapes get larger offsets
    const numSegments = transformedPoints.length - 1;

    // Calculate shape complexity based on segment count and proximity
    let complexityFactor = 1.0; // Default multiplier

    if (numSegments <= 4) {
      // Simple shapes (rectangle, L-shape, etc.) - use minimal offsets
      complexityFactor = 0.6; // 60% of base offset
    } else if (numSegments <= 6) {
      // Medium complexity - use moderate offsets
      complexityFactor = 0.8; // 80% of base offset
    } else {
      // Complex shapes (>6 segments) - analyze segment proximity
      // Calculate average distance between non-adjacent segments
      let totalProximity = 0;
      let proximityCount = 0;

      for (let i = 0; i < transformedPoints.length - 1; i++) {
        for (let j = i + 2; j < transformedPoints.length - 1; j++) {
          const p1 = transformedPoints[i];
          const p2 = transformedPoints[j];
          const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
          totalProximity += dist;
          proximityCount++;
        }
      }

      const avgProximity = proximityCount > 0 ? totalProximity / proximityCount : 100;

      // If segments are close together (avg proximity < 100px), use larger offsets
      if (avgProximity < 100) {
        complexityFactor = 1.2; // 120% of base offset
      } else if (avgProximity < 150) {
        complexityFactor = 1.0; // 100% of base offset
      } else {
        complexityFactor = 0.85; // 85% of base offset - segments are spread out
      }
    }

    // Calculate polygon winding to determine label positioning
    // (labels should always point outward from the shape)
    let signedArea = 0;
    for (let i = 0; i < transformedPoints.length - 1; i++) {
      const p1 = transformedPoints[i];
      const p2 = transformedPoints[i + 1];
      signedArea += (p2.x - p1.x) * (p2.y + p1.y);
    }
    const perpPointsOutward = signedArea > 0;

    // PHASE 1: Calculate all label positions and store for collision detection
    const segmentLabels = [];

    transformedPoints.slice(0, -1).forEach((p, i) => {
      const next = transformedPoints[i + 1];
      const midX = (p.x + next.x) / 2;
      const midY = (p.y + next.y) / 2;

      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        // Calculate perpendicular vector (rotated 90° counter-clockwise from segment)
        let perp = getPerpendicularVector(dx, dy, len);
        let perpX = perp.x;
        let perpY = perp.y;

        // Flip perpendicular if it points inward (labels should always point outward)
        if (!perpPointsOutward) {
          perpX = -perpX;
          perpY = -perpY;
        }

        // Determine offset based on segment orientation
        const isVertical = Math.abs(dx) < 0.01;
        const isHorizontal = Math.abs(dy) < 0.01;

        // Base offsets that will be multiplied by complexity factor
        let rawOffset;
        if (isVertical) {
          rawOffset = 30; // Vertical segments base (slightly higher for better spacing)
        } else if (isHorizontal) {
          rawOffset = 20; // Horizontal segments base
        } else {
          rawOffset = 35; // Diagonal segments base (increased from 22 to prevent overlaps in complex shapes)
        }

        // Apply complexity factor (simple shapes get smaller offsets, complex get larger)
        let baseOffset = rawOffset * complexityFactor;

        // Check if this is a small segment (extended to minimum length)
        // Small segments need extra offset to prevent overlap
        const isSmallSegment = lengths[i] <= 20; // Segments 20mm or smaller
        if (isSmallSegment && !isHorizontal && numSegments > 4) {
          baseOffset += 6; // Add extra for small segments in complex shapes only
        }

        // Check if adjacent to 180° angle (like normal preview does)
        let has180Adjacent = false;
        if (i > 0 && angles[i - 1]) {
          const prevAngle = Math.abs(normalizeAngle(angles[i - 1]));
          if (Math.abs(prevAngle - 180) < 1) has180Adjacent = true;
        }
        if (i < angles.length && angles[i]) {
          const nextAngle = Math.abs(normalizeAngle(angles[i]));
          if (Math.abs(nextAngle - 180) < 1) has180Adjacent = true;
        }

        // If adjacent to 180° angle, add extra offset
        if (has180Adjacent) {
          baseOffset += 10; // Add extra for 180° angles
        }

        // CRITICAL: Ensure label NEVER overlaps gradient
        // Gradient extends 12px from segment, label has ~18px half-height (32px font)
        // Minimum safe offset = 12px (gradient) + 18px (label half-height) + 5px (clearance) = 35px
        const GRADIENT_WIDTH = 12; // Updated for new gradient width
        const LABEL_HALF_SIZE = 18; // For 32px font (bold adds ~2px)
        const SAFETY_MARGIN = 5;
        const MINIMUM_SAFE_OFFSET = GRADIENT_WIDTH + LABEL_HALF_SIZE + SAFETY_MARGIN; // 35px

        baseOffset = Math.max(baseOffset, MINIMUM_SAFE_OFFSET);

        // Apply offset perpendicular to segment
        const labelX = midX + perpX * baseOffset;
        const labelY = midY + perpY * baseOffset;

        // Store label info for collision detection
        const labelText = `${Math.round(lengths[i])}`;
        const labelWidth = ctx.measureText(labelText).width;
        const labelHeight = 18; // 14px font + padding

        segmentLabels.push({
          type: 'segment',
          index: i,
          text: labelText,
          x: labelX,
          y: labelY,
          width: labelWidth,
          height: labelHeight,
          midX,
          midY,
          perpX,
          perpY,
          baseOffset,
          angleVariation: (i % 2 === 0) ? 0.05 : -0.05
        });
      }
    });

    // PHASE 2: Calculate angle label positions
    const angleLabels = [];
    
    // Draw angle labels (skip 90° and -90° angles)
    ctx.fillStyle = '#008000'; // Green to match normal drawings
    ctx.font = 'bold 32px sans-serif'; // Larger font for better visibility
    angles.forEach((angle, i) => {
      // Normalize angle to [-180, 180] range to prevent invalid angles like -225° or 270°
      const normalizedAngle = normalizeAngle(angle);
      // Only show angle labels if they're not 90° or -90° (with tolerance for rounding)
      const roundedAngle = Math.round(normalizedAngle);
      if (i + 1 < transformedPoints.length - 1 && Math.abs(roundedAngle) !== 90) {
        const prev = transformedPoints[i];
        const curr = transformedPoints[i + 1];
        const next = transformedPoints[i + 2];

        // Use angle bisector method (same as DrawingCanvas)
        // Calculate vectors from corner to adjacent points
        const v1x = prev.x - curr.x;
        const v1y = prev.y - curr.y;
        const v2x = next.x - curr.x;
        const v2y = next.y - curr.y;

        // Normalize the vectors
        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);

        let bisectorX, bisectorY;

        if (len1 === 0 || len2 === 0) {
          // Fallback to simple offset if vectors are zero
          bisectorX = 1;
          bisectorY = -1;
        } else {
          const n1x = v1x / len1;
          const n1y = v1y / len1;
          const n2x = v2x / len2;
          const n2y = v2y / len2;

          // Calculate angle bisector (average of the two normalized vectors)
          bisectorX = n1x + n2x;
          bisectorY = n1y + n2y;

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

          // Always place labels outside the angle (flip bisector)
          bisectorX = -bisectorX;
          bisectorY = -bisectorY;
        }

        // ADAPTIVE OFFSET: Different offsets based on segment orientations
        // Vertical corners need more spacing, diagonal corners can be closer

        // Check if segments are vertical, horizontal, or diagonal
        const isVertical1 = Math.abs(v1x) < 0.01 * len1; // First segment vertical
        const isVertical2 = Math.abs(v2x) < 0.01 * len2; // Second segment vertical
        const isHorizontal1 = Math.abs(v1y) < 0.01 * len1; // First segment horizontal
        const isHorizontal2 = Math.abs(v2y) < 0.01 * len2; // Second segment horizontal

        let pixelOffset;
        if (isVertical1 || isVertical2) {
          // Vertical corners need more spacing to prevent overlap
          pixelOffset = 30;
        } else if (isHorizontal1 || isHorizontal2) {
          // Horizontal corners work well with medium spacing
          pixelOffset = 25;
        } else {
          // Diagonal corners can be closer
          pixelOffset = 18;
        }

        // CRITICAL: Ensure angle label NEVER overlaps gradient
        // Same minimum as segment labels to be safe
        const GRADIENT_WIDTH = 12; // Updated for new gradient width
        const LABEL_HALF_SIZE = 18; // For 32px font (bold adds ~2px)
        const SAFETY_MARGIN = 5;
        const MINIMUM_SAFE_OFFSET = GRADIENT_WIDTH + LABEL_HALF_SIZE + SAFETY_MARGIN; // 35px

        pixelOffset = Math.max(pixelOffset, MINIMUM_SAFE_OFFSET);

        // Position label along bisector
        const labelX = curr.x + bisectorX * pixelOffset;
        const labelY = curr.y + bisectorY * pixelOffset;

        // Store angle label info for collision detection
        const labelText = `${roundedAngle}°`;
        const labelWidth = ctx.measureText(labelText).width;
        const labelHeight = 18; // 14px font + padding

        angleLabels.push({
          type: 'angle',
          index: i,
          text: labelText,
          x: labelX,
          y: labelY,
          width: labelWidth,
          height: labelHeight,
          currX: curr.x,
          currY: curr.y,
          bisectorX,
          bisectorY,
          pixelOffset
        });
      }
    });

    // PHASE 3: Collision detection and resolution
    // Helper function to check if two label bounding boxes overlap
    const labelsOverlap = (label1, label2) => {
      const padding = 4; // Extra padding between labels
      const l1Left = label1.x - label1.width / 2 - padding;
      const l1Right = label1.x + label1.width / 2 + padding;
      const l1Top = label1.y - label1.height / 2 - padding;
      const l1Bottom = label1.y + label1.height / 2 + padding;

      const l2Left = label2.x - label2.width / 2 - padding;
      const l2Right = label2.x + label2.width / 2 + padding;
      const l2Top = label2.y - label2.height / 2 - padding;
      const l2Bottom = label2.y + label2.height / 2 + padding;

      return !(l1Right < l2Left || l1Left > l2Right || l1Bottom < l2Top || l1Top > l2Bottom);
    };

    // Combine all labels for collision checking
    const allLabels = [...segmentLabels, ...angleLabels];

    // Iteratively resolve collisions (max 5 iterations to avoid infinite loops)
    for (let iteration = 0; iteration < 5; iteration++) {
      let hadCollision = false;

      for (let i = 0; i < allLabels.length; i++) {
        for (let j = i + 1; j < allLabels.length; j++) {
          if (labelsOverlap(allLabels[i], allLabels[j])) {
            hadCollision = true;

            // Increase offset for both labels
            if (allLabels[i].type === 'segment') {
              const label = allLabels[i];
              label.baseOffset += 8; // Increase offset by 8px
              label.x = label.midX + label.perpX * label.baseOffset;
              label.y = label.midY + label.perpY * label.baseOffset;
            } else {
              const label = allLabels[i];
              label.pixelOffset += 8;
              label.x = label.currX + label.bisectorX * label.pixelOffset;
              label.y = label.currY + label.bisectorY * label.pixelOffset;
            }

            if (allLabels[j].type === 'segment') {
              const label = allLabels[j];
              label.baseOffset += 8;
              label.x = label.midX + label.perpX * label.baseOffset;
              label.y = label.midY + label.perpY * label.baseOffset;
            } else {
              const label = allLabels[j];
              label.pixelOffset += 8;
              label.x = label.currX + label.bisectorX * label.pixelOffset;
              label.y = label.currY + label.bisectorY * label.pixelOffset;
            }
          }
        }
      }

      // If no collisions in this iteration, we're done
      if (!hadCollision) break;
    }

    // PHASE 4: Draw all segment labels without leader lines
    ctx.fillStyle = '#0000FF'; // Blue
    ctx.font = 'bold 32px sans-serif'; // Larger font for better visibility

    segmentLabels.forEach(label => {
      // Leader lines removed for cleaner appearance
      // Draw label text only
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.text, label.x, label.y);
    });

    // PHASE 5: Draw all angle labels without leader lines
    ctx.fillStyle = '#008000'; // Green
    ctx.font = 'bold 32px sans-serif'; // Larger font for better visibility

    angleLabels.forEach(label => {
      // Leader lines removed for cleaner appearance
      // Draw label text only
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.text, label.x, label.y);
    });

    // Reset text alignment
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    
    // Removed FAR/NEAR and Split X of X labels as they're shown outside the drawing
  };

  // Draw both views
  drawShape(farCtx, farPoints, farLengths, 'FAR');
  drawShape(nearCtx, nearPoints, nearLengths, 'NEAR');
  
  // Convert to PNG buffers - IN MEMORY ONLY, no file saving
  const farBuffer = farCanvas.toBuffer('image/png');
  const nearBuffer = nearCanvas.toBuffer('image/png');
  
  // Return base64 data URIs instead of file paths
  // This eliminates the need for file storage completely
  return {
    farImage: `data:image/png;base64,${farBuffer.toString('base64')}`,
    nearImage: `data:image/png;base64,${nearBuffer.toString('base64')}`
  };
}

module.exports = { generateSplitPreview };