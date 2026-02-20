/**
 * DrawingCalculations.js
 *
 * Pure calculation functions for Drawing Canvas
 * These functions handle geometry calculations and point transformations
 * Extracted from DrawingCanvas.js for better code organization
 */

import { capSegmentLength, polarToCartesian } from '../../utils/geometryUtils';
import { DIRECTION_MAP } from './DrawingConstants';

/**
 * Helper function to get fold segment parameters based on fold type
 * @param {string} type - Fold type (Up, Down, OpenUp, OpenDn)
 * @param {number} len - Fold length
 * @returns {Object} Fold configuration with lengths, angles, label, and direction
 */
export function getFoldSegments(type, len) {
  const fixedTip = 8; // small fixed length to preserve corner
  switch (type) {
    case 'Up':
      return {
        lengths: [len, len],
        angles: [90, 90],
        label: `SF ${len}`,
        dir: 'up',
      };

    case 'Down':
      return {
        lengths: [len, len],
        angles: [-90, -90],
        label: `SF ${len}`,
        dir: 'down',
      };

    case 'OpenUp':
      return {
        lengths: [Math.max(len * 0.7, 12), Math.max(len * 0.3, 8)],
        angles: [30, 90],
        label: `SSF ${len}`,
        dir: 'up',
      };

    case 'OpenDn':
      return {
        lengths: [Math.max(len * 0.7, 12), Math.max(len * 0.3, 8)],
        angles: [-30, -90],
        label: `SSF ${len}`,
        dir: 'down',
      };

    default:
      return { lengths: [], angles: [], label: '' };
  }
}

/**
 * Calculates all points for the drawing based on lengths, angles, and direction
 *
 * @param {Array<number>} lengthsArr - Array of segment lengths
 * @param {Array<number>} anglesArr - Array of turn angles between segments
 * @param {string} direction - Initial direction (Up, Down, Left, Right)
 * @param {Array<number>} absoluteAngles - Array of absolute angles for each segment (new system)
 * @param {Array<number>} preservedLengths - Array of preserved lengths for empty inputs
 * @param {boolean} applyFixedWidths - Whether to apply fixed pixel widths for table editing mode
 * @param {Object} originOffset - Starting point {x, y}
 * @param {number|null} firstSegmentAngle - Override angle for first segment
 * @param {string|null} startFoldType - Type of start fold (if any)
 * @param {number|null} startFoldLength - Length of start fold (if any)
 * @param {string|null} endFoldType - Type of end fold (if any)
 * @param {number|null} endFoldLength - Length of end fold (if any)
 * @returns {Array<Object>} Array of point objects {x, y, ...foldMetadata}
 */
export function calculatePoints(
  lengthsArr,
  anglesArr,
  direction = 'Right',
  absoluteAngles = [],
  preservedLengths = [],
  applyFixedWidths = false,
  originOffset = { x: 0, y: 0 },
  firstSegmentAngle = null,
  startFoldType = null,
  startFoldLength = null,
  endFoldType = null,
  endFoldLength = null
) {
  if (!Array.isArray(lengthsArr) || !Array.isArray(anglesArr)) {
    return [{ x: originOffset.x, y: originOffset.y }];
  }

  const directionMap = DIRECTION_MAP;

  // Map lengths based on whether we're editing from table or drawing
  const cappedLengths = lengthsArr.map((len, idx) => {
    // If length is empty, use the preserved length (last valid value) if available
    let effectiveLen;
    if (len === '' || len == null) {
      effectiveLen = preservedLengths[idx];
    } else {
      effectiveLen = len;
    }

    const numLen = Number(effectiveLen) || 0;

    // ONLY apply fixed pixel widths when editing from table (applyFixedWidths = true)
    // During drawing, use actual values for < 500, cap only large values
    if (applyFixedWidths) {
      // Table editing mode: Apply FIXED pixel widths for ALL ranges
      if (numLen >= 1000) return 200;    // 1000mm+ → 200px fixed width
      if (numLen >= 500) return 150;     // 500-999mm → 150px fixed width
      if (numLen >= 100) return 130;     // 100-499mm → 130px fixed width
      if (numLen >= 11) return 120;      // 11-99mm → 120px fixed width
      if (numLen <= 10) return 60;       // 0-10mm → 60px fixed width
      return numLen; // Fallback
    } else {
      // Drawing mode: Use ACTUAL lengths without capping
      // Girth-based scaling in getScale() will handle fitting large drawings
      // This ensures 500mm is drawn as 500 units, not capped to 150
      return numLen;
    }
  });

  let x = originOffset.x, y = originOffset.y;
  const pts = [{ x, y }];

  // NEW ANGLE SYSTEM: Use absolute angles for each segment if available
  // This prevents the drawing from rotating when angles are changed
  if (absoluteAngles.length > 0) {
    // Use the new absolute angle system
    cappedLengths.forEach((len, i) => {
      // Get the absolute angle for this segment
      let segmentAngle;

      if (i < absoluteAngles.length) {
        // Use the stored absolute angle for this segment
        segmentAngle = absoluteAngles[i];
      } else {
        // Fallback: calculate based on previous segment and angle
        if (i === 0) {
          segmentAngle = firstSegmentAngle !== null ? firstSegmentAngle : (directionMap[direction] ?? 0);
        } else {
          // Calculate from previous segment's angle plus the turn
          const prevAngle = absoluteAngles[i - 1] || 0;
          const turn = anglesArr[i - 1] || 0;
          segmentAngle = prevAngle + turn;
        }
      }

      // Treat length 0 as 1 for geometry calculations
      const effectiveLen = len === 0 ? 1 : len;

      const { dx, dy } = polarToCartesian(segmentAngle, effectiveLen);

      x += dx;
      y += dy;

      pts.push({ x, y });
    });
  } else {
    // FALLBACK: Use the old cumulative angle system for compatibility
    // Round firstSegmentAngle to avoid floating point precision errors
    let angle = firstSegmentAngle !== null
      ? Math.round(firstSegmentAngle * 1000) / 1000
      : (directionMap[direction] ?? 0);

    cappedLengths.forEach((len, i) => {
      if (i > 0 && anglesArr[i - 1] != null) {
        angle += anglesArr[i - 1];
        // Round to avoid floating point precision errors that cause shape tilting
        // This ensures angles like 90.00000001 become exactly 90
        angle = Math.round(angle * 1000) / 1000;
      }

      // Treat length 0 as 1 for geometry calculations
      const effectiveLen = len === 0 ? 1 : len;

      const { dx, dy } = polarToCartesian(angle, effectiveLen);

      x += dx;
      y += dy;

      pts.push({ x, y });
    });
  }

  // ➕ START Fold injection
  // Check startFoldLength > 0 to handle string "0" and empty string cases
  const startFoldLengthNum = parseFloat(startFoldLength);
  const hasValidStartFold = startFoldType && !isNaN(startFoldLengthNum) && startFoldLengthNum > 0;
  if (hasValidStartFold) {
    const fold = getFoldSegments(startFoldType, startFoldLength);
    const first = pts[0];
    const second = pts[1] || first;

    const baseAngle = Math.atan2(second.y - first.y, second.x - first.x);

    // Debug SSF
    if (startFoldType === 'OpenUp' || startFoldType === 'OpenDn') {
      console.debug('🔧 SSF START Fold Calculation:', {
        startFoldType,
        foldAngles: fold.angles,
        baseAngle: baseAngle * 180 / Math.PI,
        firstSegmentAngle,
        direction,
        firstPoint: first,
        secondPoint: second
      });
    }

    const rad1 = baseAngle - (fold.angles[1] * Math.PI) / 180;
    const p1 = {
      x: first.x - fold.lengths[1] * Math.cos(rad1),
      y: first.y - fold.lengths[1] * Math.sin(rad1),
      label: fold.label,
      isFold: true,
      dir: fold.dir,
      foldType: startFoldType,
      foldLength: startFoldLength,
    };

    const rad2 = baseAngle - ((fold.angles[1] + fold.angles[0]) * Math.PI) / 180;
    const p2 = {
      x: p1.x - fold.lengths[0] * Math.cos(rad2),
      y: p1.y - fold.lengths[0] * Math.sin(rad2),
      label: fold.label,
      isFold: true,
      dir: fold.dir,
      foldType: startFoldType,
      foldLength: startFoldLength,
    };

    pts.unshift(p1, p2); // only modifying local pts, not main state
  }

  // ➕ END Fold injection
  // Check endFoldLength > 0 to handle string "0" and empty string cases
  const endFoldLengthNum = parseFloat(endFoldLength);
  const hasValidEndFold = endFoldType && !isNaN(endFoldLengthNum) && endFoldLengthNum > 0;
  if (hasValidEndFold) {
    const fold = getFoldSegments(endFoldType, endFoldLength);
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2] || last;

    const baseAngle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const rad1 = baseAngle + (fold.angles[0] * Math.PI) / 180;
    const p1 = {
      x: last.x + fold.lengths[0] * Math.cos(rad1),
      y: last.y + fold.lengths[0] * Math.sin(rad1),
      label: fold.label,
      isFold: true,
      dir: fold.dir,
      foldType: endFoldType,
      foldLength: endFoldLength,
    };

    const rad2 = baseAngle + ((fold.angles[0] + fold.angles[1]) * Math.PI) / 180;
    const p2 = {
      x: p1.x + fold.lengths[1] * Math.cos(rad2),
      y: p1.y + fold.lengths[1] * Math.sin(rad2),
      label: fold.label,
      isFold: true,
      dir: fold.dir,
      foldType: endFoldType,
      foldLength: endFoldLength,
    };

    pts.push(p1, p2); // only for rendering
  }

  return pts;
}
