/**
 * DrawingHelpers.js
 *
 * Business logic helpers for Drawing Canvas
 * These functions handle drawing-specific calculations and initialization logic
 */

import { normalizeAllAngles } from '../../utils/geometryUtils';

/**
 * Initializes display angles array with normalized values
 * Handles angle normalization and rounding for display purposes
 *
 * @param {Array} anglesArray - Array of angles in degrees
 * @param {number|null} currentFirstSegmentAngle - Override angle for first segment
 * @param {string} currentDirection - Initial direction ('Up', 'Down', 'Left', 'Right')
 * @returns {Array} Array of normalized and rounded angles for display
 */
export function initializeDisplayAngles(anglesArray, currentFirstSegmentAngle, currentDirection) {
  if (!anglesArray || anglesArray.length === 0) return [];

  const directionMap = {
    'Up': 90,
    'Down': -90,
    'Right': 0,
    'Left': 180,
  };

  // First normalize all angles to [-180, 180] range
  const normalizedAngles = normalizeAllAngles(anglesArray);
  const displayAngs = [...normalizedAngles];

  // Calculate the absolute angle of the first segment
  const firstSegAbsoluteAngle = currentFirstSegmentAngle !== null ?
    currentFirstSegmentAngle : (directionMap[currentDirection] ?? 0);

  // Round all display angles to avoid decimal display
  return displayAngs.map(angle => angle !== '' && angle != null ? Math.round(angle) : angle);
}

/**
 * Calculates the total girth including segment lengths and fold lengths
 * Girth = sum of all segment lengths + start fold length + end fold length
 *
 * @param {Array} lengthsArray - Array of segment lengths
 * @param {string|null} startFoldType - Type of start fold ('Up', 'Down', 'OpenUp', 'OpenDn', or null)
 * @param {number} startFoldLength - Length of start fold (default: 0)
 * @param {string|null} endFoldType - Type of end fold ('Up', 'Down', 'OpenUp', 'OpenDn', or null)
 * @param {number} endFoldLength - Length of end fold (default: 0)
 * @returns {number} Total girth in mm
 */
export function getGirth(lengthsArray, startFoldType = null, startFoldLength = 0, endFoldType = null, endFoldLength = 0) {
  // Sum all segment lengths (treating empty strings as 0)
  let girth = lengthsArray.reduce((sum, ln) => sum + (ln === "" ? 0 : Number(ln)), 0);

  // Add fold lengths to girth when ANY fold is applied
  // Accept both formats: 'Up'/'Down'/'OpenUp'/'OpenDn' OR 'SF'/'SSF'
  const hasStartFold = startFoldType && (
    startFoldType === 'Up' || startFoldType === 'Down' ||
    startFoldType === 'OpenUp' || startFoldType === 'OpenDn' ||
    startFoldType === 'SF' || startFoldType === 'SSF'
  );

  const hasEndFold = endFoldType && (
    endFoldType === 'Up' || endFoldType === 'Down' ||
    endFoldType === 'OpenUp' || endFoldType === 'OpenDn' ||
    endFoldType === 'SF' || endFoldType === 'SSF'
  );

  if (hasStartFold && startFoldLength) {
    girth += Number(startFoldLength) || 0;
  }

  if (hasEndFold && endFoldLength) {
    girth += Number(endFoldLength) || 0;
  }

  return girth;
}
