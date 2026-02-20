/**
 * Drawing Constants
 * Centralized constants used throughout the Drawing Canvas
 */

// Direction to angle mapping (in degrees)
// Used to convert cardinal directions to their corresponding angles
export const DIRECTION_MAP = {
  'Up': 90,
  'Down': -90,
  'Right': 0,
  'Left': 180,
};

// Grid snapping configuration
export const GRID_SIZE = 20; // Match the CSS grid size from DrawingToolPage.module.scss
export const ENABLE_GRID_SNAP = true; // Toggle grid snapping on/off
export const GRID_PADDING = 20; // Grid padding from edges
