/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SELECT MATERIALS PAGE - SIMPLIFIED VERSION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Simplified material selection page using the new unified template API.
 *
 * KEY DIFFERENCES FROM OLD VERSION:
 * - NO "Save" stage - everything happens at "Finish"
 * - Single unified API call instead of 9-19+ calls
 * - Atomic transactions with automatic rollback
 * - Much simpler state management
 * - 80% less code
 *
 * WORKFLOW:
 * 1. User fills material details → Adds to list (React state only, no API)
 * 2. User adds more rows → All stored in React state
 * 3. User clicks "Finish" → ONE API call creates everything atomically
 *
 * Created: Day 9 - November 24, 2025
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import swal from 'sweetalert2';
import { Stage, Layer, Text, Group, Line, Arrow } from 'react-konva';
import { logger } from '../../utils/logger';
import { API_BASE_URL, tokenManager, userManager } from '../../config/api.config';
import { createTemplateComplete, updateTemplateComplete } from '../../services/templateApi';
import { generateSingleDrawing, convertFoldType } from '../../utils/splitPreviewGenerator';
import { calculatePoints } from '../DrawingHelpers/DrawingCalculations';
import { getScale, getSegmentLabelPosition, getAngleLabelPosition, getFoldLabelPosition, normalizeDegrees } from '../../utils/geometryUtils';
import '../../styles/SelectMaterialsSimplified.scss';

// Material Icons
import { FaPlus, FaTrash, FaCheck, FaArrowLeft, FaPencilAlt, FaEdit, FaCopy } from 'react-icons/fa';
import { FiLoader } from 'react-icons/fi';
import { Card, Button, TextField, Select, MenuItem, FormControl, InputLabel, IconButton, CircularProgress, Autocomplete } from '@mui/material';
import { DesignHeader } from './Header';
import DrawingPreview from '../../components/DrawingPreview';

// Helper component to generate and display split drawing images
// Wrapped with React.memo to prevent unnecessary re-renders and image regeneration
const SplitDrawingImage = React.memo(function SplitDrawingImage({
  template,
  interpolationRatio,
  width = 320,
  height = 240
}) {
  const [imageData, setImageData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    const generateImage = async () => {
      try {
        setIsGenerating(true);
        setImageData(null);
        const farLengths = template.farLengths || template.lengths || [];
        const nearLengths = template.nearLengths || [];
        const angles = template.angles || [];
        const direction = template.direction || 'Right';
        const firstSegmentAngle = template.firstSegmentAngle;
        const reverseColor = template.reverseColor || false;

        const result = await generateSingleDrawing({
          farLengths,
          nearLengths,
          angles,
          direction,
          firstSegmentAngle,
          reverseColor,
          flipH: template.flipH || false,
          flipV: template.flipV || false,
          interpolationRatio,
          width,
          height,
          labelOffsets: template.labelOffsets,
          fontSize: 18,
          transparentBackground: true,
          gradientStrokeWidth: 5,
          outlineStrokeWidth: 4,
          startFoldType: template.startFoldType,
          startFoldLength: template.startFoldLength || 0,
          startFoldDirection: template.startFoldDirection,
          endFoldType: template.endFoldType,
          endFoldLength: template.endFoldLength || 0,
          endFoldDirection: template.endFoldDirection,
          originalStartFoldLength: template.startFoldLength || 0,
          originalEndFoldLength: template.endFoldLength || 0,
          segmentAbsoluteAngles: template.segmentAbsoluteAngles || [], // For precise rendering with folds
          startFoldGap: template.startFoldGap || 0, // SSF gap value
          endFoldGap: template.endFoldGap || 0 // SSF gap value
        });

        // generateSingleDrawing returns { image, scale, offsetX, offsetY, flippedPts }
        setImageData(result?.image || result);
      } catch (error) {
        logger.error('Error generating split drawing:', error);
      } finally {
        setIsGenerating(false);
      }
    };

    generateImage();
  }, [template, interpolationRatio, width, height]);

  if (isGenerating) {
    return (
      <div style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f0f0'
      }}>
        <FiLoader className="spin" size={24} />
      </div>
    );
  }

  if (!imageData) {
    return (
      <div style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f0f0',
        color: '#666'
      }}>
        Failed to generate
      </div>
    );
  }

  return (
    <img
      src={imageData}
      alt="Split drawing"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
});

/**
 * Interactive Split Drawing Canvas with Draggable Labels
 * Renders the shape without labels, then overlays draggable Konva labels on top
 * Wrapped with React.memo to prevent unnecessary re-renders and image regeneration
 */
const SplitDrawingCanvas = React.memo(function SplitDrawingCanvas({
  template,
  interpolationRatio,
  width = 480,
  height = 360,
  splitIndex = 0,
  onLabelOffsetsChange,
  splitLabelOffsets = {},
  referenceScale = null // FIXED: Use consistent reference scale from FAR lengths for all split pieces
}) {
  const [imageData, setImageData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(true);
  // coordOffsets stores ABSOLUTE positions for Konva display
  const [coordOffsets, setCoordOffsets] = useState({});
  // relativeOffsets stores RELATIVE offsets for saving (matching DrawingCanvas format)
  const [relativeOffsets, setRelativeOffsets] = useState({});
  const [labelPositions, setLabelPositions] = useState({ segments: [], angles: [], folds: [], gaps: [] });
  // Track if we've applied initial offsets
  const [initialOffsetsApplied, setInitialOffsetsApplied] = useState(false);
  // Store current scale factor for offset normalization
  const [currentScale, setCurrentScale] = useState(1);
  // FIXED: Store reference scale (based on FAR lengths) for consistent offset normalization across all split pieces
  const [normalizedRefScale, setNormalizedRefScale] = useState(referenceScale || 1);

  // Update normalizedRefScale when referenceScale prop changes
  useEffect(() => {
    if (referenceScale && referenceScale > 0) {
      setNormalizedRefScale(referenceScale);
    }
  }, [referenceScale]);

  // Convert scale-normalized offsets to absolute positions for display
  // This runs when labelPositions are ready AND we have relative offsets to apply
  // FIXED: Use referenceScale (based on FAR lengths) for consistent positioning across all split pieces
  useEffect(() => {
    if ((labelPositions.segments.length > 0 || labelPositions.folds.length > 0 || (labelPositions.gaps || []).length > 0) && Object.keys(relativeOffsets).length > 0 && currentScale > 0) {
      const absoluteOffsets = {};

      // Convert saved scale-normalized offsets to absolute positions
      // FIXED: Use referenceScale if available, otherwise fall back to currentScale
      // This ensures consistent label positioning across all split pieces
      const effectiveScale = normalizedRefScale > 0 ? normalizedRefScale : currentScale;
      Object.entries(relativeOffsets).forEach(([key, offset]) => {
        const scaledOffsetX = (offset.x || 0) * effectiveScale;
        const scaledOffsetY = (offset.y || 0) * effectiveScale;

        if (key.startsWith('len-')) {
          const idx = parseInt(key.replace('len-', ''), 10);
          const originalPos = labelPositions.segments[idx];
          if (originalPos) {
            absoluteOffsets[key] = {
              x: originalPos.x + scaledOffsetX,
              y: originalPos.y + scaledOffsetY
            };
          }
        } else if (key.startsWith('ang-')) {
          const idx = parseInt(key.replace('ang-', ''), 10);
          const originalPos = labelPositions.angles[idx];
          if (originalPos) {
            absoluteOffsets[key] = {
              x: originalPos.x + scaledOffsetX,
              y: originalPos.y + scaledOffsetY
            };
          }
        } else if (key.startsWith('fold-')) {
          // Fold labels use 'fold-start' or 'fold-end' keys
          const foldType = key.replace('fold-', ''); // 'start' or 'end'
          const originalPos = labelPositions.folds.find(f => f.type === foldType);
          if (originalPos) {
            absoluteOffsets[key] = {
              x: originalPos.x + scaledOffsetX,
              y: originalPos.y + scaledOffsetY
            };
          }
        } else if (key.startsWith('gap-')) {
          // Gap labels use 'gap-start' or 'gap-end' keys
          const gapType = key.replace('gap-', ''); // 'start' or 'end'
          const originalPos = (labelPositions.gaps || []).find(g => g.type === gapType);
          if (originalPos) {
            absoluteOffsets[key] = {
              x: originalPos.x + scaledOffsetX,
              y: originalPos.y + scaledOffsetY
            };
          }
        }
      });

      if (Object.keys(absoluteOffsets).length > 0) {
        setCoordOffsets(absoluteOffsets);
      }
    }
  }, [relativeOffsets, labelPositions, currentScale, normalizedRefScale]);

  // Load saved offsets from prop (runs on mount and when prop changes)
  useEffect(() => {
    if (splitLabelOffsets && Object.keys(splitLabelOffsets).length > 0 && !initialOffsetsApplied) {
      setRelativeOffsets(splitLabelOffsets);
      setInitialOffsetsApplied(true);
    }
  }, [splitLabelOffsets, splitIndex, initialOffsetsApplied]);

  // Generate the static drawing image WITHOUT labels
  useEffect(() => {
    const generateImage = async () => {
      try {
        setIsGenerating(true);
        const farLengths = template.farLengths || template.lengths || [];
        const nearLengths = template.nearLengths || [];
        const angles = template.angles || [];
        const direction = template.direction || 'Right';
        const firstSegmentAngle = template.firstSegmentAngle;
        const reverseColor = template.reverseColor || false;

        // Generate image WITHOUT labels (we'll overlay draggable labels)
        // CRITICAL FIX: generateSingleDrawing now returns { image, scale, offsetX, offsetY, flippedPts }
        // We use the EXACT same scale/offset/flippedPts from image generation for label positioning
        // This eliminates the scale mismatch that was causing labels to be misaligned
        const result = await generateSingleDrawing({
          farLengths,
          nearLengths,
          angles,
          direction,
          firstSegmentAngle,
          reverseColor,
          flipH: template.flipH || false,
          flipV: template.flipV || false,
          interpolationRatio,
          width,
          height,
          labelOffsets: null, // Don't render labels in the image
          fontSize: 18,
          transparentBackground: true,
          gradientStrokeWidth: 5,
          outlineStrokeWidth: 4,
          startFoldType: template.startFoldType,
          startFoldLength: template.startFoldLength || 0,
          startFoldDirection: template.startFoldDirection,
          endFoldType: template.endFoldType,
          endFoldLength: template.endFoldLength || 0,
          endFoldDirection: template.endFoldDirection,
          originalStartFoldLength: template.startFoldLength || 0,
          originalEndFoldLength: template.endFoldLength || 0,
          segmentAbsoluteAngles: template.segmentAbsoluteAngles || [],
          hideLabels: true, // Flag to hide labels in the generated image
          useFixedScaleFromFar: true, // Use FAR lengths for consistent scale across all split pieces
          startFoldGap: template.startFoldGap || 0, // SSF gap value
          endFoldGap: template.endFoldGap || 0 // SSF gap value
        });

        // Extract image and use the EXACT scale/offset/flippedPts from image generation
        setImageData(result?.image || result);

        // CRITICAL FIX: Use scale/offset/flippedPts from image generation
        // This eliminates the scale mismatch that was causing labels to be misaligned
        const scale = result?.scale || 1;
        const offsetX = result?.offsetX || 0;
        const offsetY = result?.offsetY || 0;
        const flippedPts = result?.flippedPts || [];

        // Calculate interpolated lengths for label values only (not for positioning)
        const interpolatedLengths = farLengths.map((farLen, i) => {
          const nearLen = nearLengths[i] !== undefined ? nearLengths[i] : farLen;
          return Number(farLen) + interpolationRatio * (Number(nearLen) - Number(farLen));
        });

        // Convert fold types from template format for label type detection
        const convertedStartFoldType = convertFoldType(template.startFoldType, template.startFoldDirection, false);
        const convertedEndFoldType = convertFoldType(template.endFoldType, template.endFoldDirection, true);
        const startFoldLength = template.startFoldLength || 0;
        const endFoldLength = template.endFoldLength || 0;
        const flipH = template.flipH || false;
        const flipV = template.flipV || false;

        // Use flippedPts from image generation for label positioning
        // First, filter out fold points to get main segment points only (for correct indexing)
        const mainSegmentPts = flippedPts.filter(p => !p.isFold);
        const segmentPositions = [];

        // Pre-compute fold label positions for smart overlap detection
        // Must match the ACTUAL fold label rendering logic below (perpendicular for SF, getFoldLabelPosition for SSF)
        let startFoldLabelPos = null;
        let endFoldLabelPos = null;
        if (convertedStartFoldType && startFoldLength > 0 && flippedPts.length >= 4) {
          const prev = flippedPts[1];
          const corner = flippedPts[2];
          const next = flippedPts[3];
          if (prev && corner && next) {
            const isSF = convertedStartFoldType === 'Up' || convertedStartFoldType === 'Down';
            if (isSF) {
              const segDir = { x: next.x - corner.x, y: next.y - corner.y };
              const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
              const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };
              const perpDir = convertedStartFoldType === 'Up'
                ? { x: segUnit.y, y: -segUnit.x }
                : { x: -segUnit.y, y: segUnit.x };
              const labelOffset = 35 / scale;
              const alongOffset = 5 / scale;
              startFoldLabelPos = {
                x: (corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset) * scale + offsetX,
                y: (corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset) * scale + offsetY
              };
            } else {
              const pos = getFoldLabelPosition(prev, corner, next, scale, offsetX, offsetY, flipH, flipV, convertedStartFoldType, startFoldLength, false);
              startFoldLabelPos = { x: pos.x, y: pos.y };
            }
          }
        }
        if (convertedEndFoldType && endFoldLength > 0 && flippedPts.length >= 4) {
          const cornerIdx = flippedPts.length - 3;
          const prev = flippedPts[cornerIdx - 1];
          const corner = flippedPts[cornerIdx];
          const next = flippedPts[cornerIdx + 1];
          if (prev && corner && next) {
            const isSF = convertedEndFoldType === 'Up' || convertedEndFoldType === 'Down';
            if (isSF) {
              const segDir = { x: prev.x - corner.x, y: prev.y - corner.y };
              const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
              const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };
              const perpDir = convertedEndFoldType === 'Up'
                ? { x: segUnit.y, y: -segUnit.x }
                : { x: -segUnit.y, y: segUnit.x };
              const labelOffset = 35 / scale;
              const alongOffset = 5 / scale;
              endFoldLabelPos = {
                x: (corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset) * scale + offsetX,
                y: (corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset) * scale + offsetY
              };
            } else {
              const pos = getFoldLabelPosition(prev, corner, next, scale, offsetX, offsetY, flipH, flipV, convertedEndFoldType, endFoldLength, true);
              endFoldLabelPos = { x: pos.x, y: pos.y };
            }
          }
        }

        for (let i = 0; i < mainSegmentPts.length - 1; i++) {
          const start = mainSegmentPts[i];
          const end = mainSegmentPts[i + 1];

          // Determine if a fold label might overlap this segment's length label
          const totalMainSegs = mainSegmentPts.length - 1;
          const foldLabelPixelPos = (i === 0 && startFoldLabelPos) ? startFoldLabelPos
            : (i === totalMainSegs - 1 && endFoldLabelPos) ? endFoldLabelPos
            : null;

          const labelPos = getSegmentLabelPosition(
            start, end, scale, offsetX, offsetY,
            reverseColor, flipH, flipV,
            mainSegmentPts, i, false, true, foldLabelPixelPos // Pass main segment index and filtered points
          );
          // Calculate segment midpoint for reference line anchor (using flipped coordinates)
          const midpointX = (start.x + end.x) / 2 * scale + offsetX;
          const midpointY = (start.y + end.y) / 2 * scale + offsetY;

          // Extra offset for first segment in split drawings to prevent overlap with line
          // Only apply if label is close to the segment line (within threshold)
          let finalLabelX = labelPos.x;
          let finalLabelY = labelPos.y;
          if (i === 0) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.hypot(dx, dy);
            const isHorizontal = Math.abs(dy) < 0.01;

            // Apply extra offset to non-horizontal first segments (vertical or diagonal)
            if (!isHorizontal && len > 0) {
              // Calculate perpendicular direction
              const perpX = -dy / len;
              const perpY = dx / len;

              // Calculate perpendicular distance from label to segment line
              const labelDirX = finalLabelX - midpointX;
              const labelDirY = finalLabelY - midpointY;
              const perpDistance = Math.abs(labelDirX * perpX + labelDirY * perpY);

              // Only apply extra offset if label is close to the line (within 20px)
              const minDistanceThreshold = 20;
              if (perpDistance < minDistanceThreshold) {
                const dotProduct = labelDirX * perpX + labelDirY * perpY;
                const extraOffset = 30;

                // Push label further in the same direction it's already positioned
                if (dotProduct > 0) {
                  finalLabelX += perpX * extraOffset;
                  finalLabelY += perpY * extraOffset;
                } else {
                  finalLabelX -= perpX * extraOffset;
                  finalLabelY -= perpY * extraOffset;
                }
              }
            }
          }

          // Store UNCLAMPED position for correct offset calculation
          // Clamping is applied at render time to keep labels visible
          // This ensures offsets from DrawingCanvas are applied correctly
          segmentPositions.push({
            x: finalLabelX,
            y: finalLabelY,
            anchorX: midpointX,
            anchorY: midpointY,
            value: Math.round(interpolatedLengths[i])
          });
        }

        // Calculate angle label positions
        const anglePositions = [];

        for (let i = 1; i < mainSegmentPts.length - 1; i++) {
          const prevPoint = mainSegmentPts[i - 1];
          const currPoint = mainSegmentPts[i];
          const nextPoint = mainSegmentPts[i + 1];

          const angle = angles[i - 1]; // angles array is indexed from 0, corresponds to vertex at index 1
          if (angle === undefined || Math.abs(angle) === 90 || Math.abs(angle) === 180) {
            continue;
          }

          const labelPos = getAngleLabelPosition(
            prevPoint, currPoint, nextPoint,
            scale, offsetX, offsetY, mainSegmentPts, i - 1
          );

          // Calculate vertex position for reference line anchor
          const vertexX = currPoint.x * scale + offsetX;
          const vertexY = currPoint.y * scale + offsetY;

          // If label would be outside bounds, move it closer to vertex while keeping same direction
          const anglePadding = 30;
          let finalX = labelPos.x;
          let finalY = labelPos.y;

          // Check if outside bounds
          const isOutside = labelPos.x < anglePadding || labelPos.x > width - anglePadding ||
                           labelPos.y < anglePadding || labelPos.y > height - anglePadding;

          if (isOutside) {
            // Calculate direction from vertex to label
            const dx = labelPos.x - vertexX;
            const dy = labelPos.y - vertexY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const dirX = dx / dist;
            const dirY = dy / dist;

            // Place label at a fixed short distance from vertex in same direction
            const shortDist = 25;
            finalX = vertexX + dirX * shortDist;
            finalY = vertexY + dirY * shortDist;

            // Final clamp to ensure it's within bounds
            finalX = Math.max(anglePadding, Math.min(width - anglePadding, finalX));
            finalY = Math.max(anglePadding, Math.min(height - anglePadding, finalY));
          }

          anglePositions.push({
            x: finalX,
            y: finalY,
            anchorX: vertexX,
            anchorY: vertexY,
            value: Math.round(angle) // Use original angle value from template
          });
        }

        // Calculate fold label positions
        // SF labels use perpendicular direction matching arc drawing
        // SSF labels use getFoldLabelPosition (original logic)
        const foldPositions = [];

        // Start fold label
        if (convertedStartFoldType && flippedPts.length >= 3) {
          const prev = flippedPts[1];
          const corner = flippedPts[2];
          const next = flippedPts[3];
          if (prev && corner && next) {
            const isSF = convertedStartFoldType === 'Up' || convertedStartFoldType === 'Down';
            let foldLabelX, foldLabelY;

            if (isSF) {
              // SF folds: Calculate position using SAME perpendicular direction as fold arc drawing
              const segDir = { x: next.x - corner.x, y: next.y - corner.y };
              const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
              const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

              let perpDir;
              if (convertedStartFoldType === 'Up') {
                perpDir = { x: segUnit.y, y: -segUnit.x };
              } else { // Down
                perpDir = { x: -segUnit.y, y: segUnit.x };
              }

              const labelOffset = 35 / scale;
              const alongOffset = 5 / scale;

              const labelX = corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset;
              const labelY = corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset;

              foldLabelX = labelX * scale + offsetX;
              foldLabelY = labelY * scale + offsetY;
            } else {
              // SSF folds: Use original getFoldLabelPosition logic
              const foldLabelPos = getFoldLabelPosition(
                prev, corner, next,
                scale, offsetX, offsetY,
                flipH, flipV,
                convertedStartFoldType,
                startFoldLength,
                false
              );
              foldLabelX = foldLabelPos.x;
              foldLabelY = foldLabelPos.y;
            }

            const foldTypeLabel = isSF ? 'SF' : 'SSF';

            // BOUNDARY CLAMPING: Keep fold labels within visible area
            const foldPadding = 40;
            const clampedFoldX = Math.max(foldPadding, Math.min(width - foldPadding, foldLabelX));
            const clampedFoldY = Math.max(foldPadding, Math.min(height - foldPadding, foldLabelY));

            // Include gap in SSF label on new line (e.g., "SSF 10\n4mm Gap")
            const startGap = Number(template.startFoldGap) || 0;
            const startFoldValue = (foldTypeLabel === 'SSF' && startGap > 0)
              ? `${foldTypeLabel} ${template.startFoldLength || startFoldLength}\n${startGap}mm Gap`
              : `${foldTypeLabel} ${template.startFoldLength || startFoldLength}`;

            foldPositions.push({
              x: clampedFoldX,
              y: clampedFoldY,
              value: startFoldValue,
              type: 'start'
            });
          }
        }

        // End fold label
        if (convertedEndFoldType && flippedPts.length >= 3) {
          const cornerIdx = flippedPts.length - 3;
          const prev = flippedPts[cornerIdx - 1];
          const corner = flippedPts[cornerIdx];
          const next = flippedPts[cornerIdx + 1];
          if (prev && corner && next) {
            const isSF = convertedEndFoldType === 'Up' || convertedEndFoldType === 'Down';
            let foldLabelX, foldLabelY;

            if (isSF) {
              // SF folds: Calculate position using SAME perpendicular direction as fold arc drawing
              // For END fold, segment direction is from corner toward prev (reversed)
              const segDir = { x: prev.x - corner.x, y: prev.y - corner.y };
              const segLen = Math.sqrt(segDir.x ** 2 + segDir.y ** 2);
              const segUnit = { x: segDir.x / segLen, y: segDir.y / segLen };

              let perpDir;
              if (convertedEndFoldType === 'Up') {
                perpDir = { x: segUnit.y, y: -segUnit.x };
              } else { // Down
                perpDir = { x: -segUnit.y, y: segUnit.x };
              }

              const labelOffset = 35 / scale;
              const alongOffset = 5 / scale;

              const labelX = corner.x + perpDir.x * labelOffset + segUnit.x * alongOffset;
              const labelY = corner.y + perpDir.y * labelOffset + segUnit.y * alongOffset;

              foldLabelX = labelX * scale + offsetX;
              foldLabelY = labelY * scale + offsetY;
            } else {
              // SSF folds: Use original getFoldLabelPosition logic
              const foldLabelPos = getFoldLabelPosition(
                prev, corner, next,
                scale, offsetX, offsetY,
                flipH, flipV,
                convertedEndFoldType,
                endFoldLength,
                true
              );
              foldLabelX = foldLabelPos.x;
              foldLabelY = foldLabelPos.y;
            }

            const foldTypeLabel = isSF ? 'SF' : 'SSF';

            // BOUNDARY CLAMPING: Keep fold labels within visible area
            const endFoldPadding = 40;
            const clampedEndFoldX = Math.max(endFoldPadding, Math.min(width - endFoldPadding, foldLabelX));
            const clampedEndFoldY = Math.max(endFoldPadding, Math.min(height - endFoldPadding, foldLabelY));

            // Include gap in SSF label on new line (e.g., "SSF 10\n4mm Gap")
            const endGap = Number(template.endFoldGap) || 0;
            const endFoldValue = (foldTypeLabel === 'SSF' && endGap > 0)
              ? `${foldTypeLabel} ${template.endFoldLength || endFoldLength}\n${endGap}mm Gap`
              : `${foldTypeLabel} ${template.endFoldLength || endFoldLength}`;

            foldPositions.push({
              x: clampedEndFoldX,
              y: clampedEndFoldY,
              value: endFoldValue,
              type: 'end'
            });
          }
        }

        // Gap labels are now included in the SSF fold label (e.g., "SSF 10\n4mm Gap")
        // No separate gap positions needed
        const gapPositions = [];

        setLabelPositions({ segments: segmentPositions, angles: anglePositions, folds: foldPositions, gaps: gapPositions });
        // Store scale for offset normalization
        setCurrentScale(scale);

      } catch (error) {
        logger.error('Error generating split drawing:', error);
      } finally {
        setIsGenerating(false);
      }
    };

    generateImage();
  }, [template, interpolationRatio, width, height]);

  // Handle label drag - store SCALE-NORMALIZED offset (delta from original position / scale)
  // FIXED: Use referenceScale (FAR-based) for consistent offset normalization across all split pieces
  const handleLabelDrag = (e, key, originalPos) => {
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
    // Calculate delta from original calculated position in pixels
    const deltaX = x - originalPos.x;
    const deltaY = y - originalPos.y;

    // Store ABSOLUTE position in coordOffsets for Konva display
    setCoordOffsets(prev => ({ ...prev, [key]: { x, y } }));

    // FIXED: Use referenceScale for normalization if available, otherwise fall back to currentScale
    // This ensures offsets work consistently across all split pieces
    const effectiveScale = normalizedRefScale > 0 ? normalizedRefScale : currentScale;
    const normalizedOffsets = {
      x: effectiveScale > 0 ? deltaX / effectiveScale : deltaX,
      y: effectiveScale > 0 ? deltaY / effectiveScale : deltaY
    };
    const newRelativeOffsets = { ...relativeOffsets, [key]: normalizedOffsets };
    setRelativeOffsets(newRelativeOffsets);

    // Notify parent with SCALE-NORMALIZED offsets
    if (onLabelOffsetsChange) {
      onLabelOffsetsChange(splitIndex, newRelativeOffsets);
    }
  };

  if (isGenerating) {
    return (
      <div style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f0f0'
      }}>
        <FiLoader className="spin" size={24} />
      </div>
    );
  }

  if (!imageData) {
    return (
      <div style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f0f0',
        color: '#666'
      }}>
        Failed to generate
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: `${width}px`, height: `${height}px` }}>
      {/* Background image (shape without labels) */}
      <img
        src={imageData}
        alt="Split drawing"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          pointerEvents: 'none'
        }}
      />

      {/* Draggable labels overlay */}
      <Stage width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Layer>
          {/* Segment labels (blue) with reference lines */}
          {labelPositions.segments.map((pos, idx) => {
            const key = `len-${idx}`;
            const savedOffset = coordOffsets[key];
            // coordOffsets stores absolute positions for display
            // But if loading from saved splitLabelOffsets (relative), apply to pos
            const labelPadding = 25; // Minimum distance from edge
            const rawX = savedOffset ? savedOffset.x : pos.x;
            const rawY = savedOffset ? savedOffset.y : pos.y;
            // Clamp label position to stay within Stage bounds
            const finalX = Math.max(labelPadding, Math.min(width - labelPadding, rawX));
            const finalY = Math.max(labelPadding, Math.min(height - labelPadding, rawY));

            // Calculate reference line from anchor (segment midpoint) to label edge
            const lineDx = finalX - pos.anchorX;
            const lineDy = finalY - pos.anchorY;
            const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

            // Use directional offset - larger for horizontal approach (label is wider than tall)
            const isHorizontalApproach = Math.abs(lineDx) > Math.abs(lineDy);
            const labelEdgeOffset = isHorizontalApproach ? 22 : 15;
            let lineEndX = finalX;
            let lineEndY = finalY;
            if (lineLen > labelEdgeOffset) {
              const shortenRatio = (lineLen - labelEdgeOffset) / lineLen;
              lineEndX = pos.anchorX + lineDx * shortenRatio;
              lineEndY = pos.anchorY + lineDy * shortenRatio;
            }

            return (
              <React.Fragment key={key}>
                {/* Reference line from segment midpoint to label */}
                {lineLen > 5 && (
                  <Arrow
                    points={[pos.anchorX, pos.anchorY, lineEndX, lineEndY]}
                    stroke="#0033CC"
                    strokeWidth={1}
                    listening={false}
                    pointerWidth={8}
                    pointerAtBeginning={true}
                    pointerAtEnding={false}
                  />
                )}
                <Group
                  x={finalX}
                  y={finalY}
                  draggable
                  onDragMove={(e) => handleLabelDrag(e, key, pos)}
                  onDragEnd={(e) => handleLabelDrag(e, key, pos)}
                >
                  <Text
                    text={`${pos.value}`}
                    fontSize={18}
                    fontStyle="bold"
                    fontFamily="Verdana, Geneva, sans-serif"
                    fill="#0033CC"
                    align="center"
                    offsetX={15}
                    offsetY={9}
                  />
                </Group>
              </React.Fragment>
            );
          })}

          {/* Angle labels (green) with reference lines */}
          {labelPositions.angles.map((pos, idx) => {
            const key = `ang-${idx}`;
            const savedOffset = coordOffsets[key];
            // coordOffsets stores absolute positions for display
            const finalX = savedOffset ? savedOffset.x : pos.x;
            const finalY = savedOffset ? savedOffset.y : pos.y;

            // Calculate reference line from anchor (vertex) to label edge
            const angleLineDx = finalX - pos.anchorX;
            const angleLineDy = finalY - pos.anchorY;
            const angleLineLen = Math.sqrt(angleLineDx * angleLineDx + angleLineDy * angleLineDy);

            // Use directional offset - larger for horizontal approach (label is wider than tall)
            const isAngleHorizontalApproach = Math.abs(angleLineDx) > Math.abs(angleLineDy);
            const angleLabelEdgeOffset = isAngleHorizontalApproach ? 22 : 15;
            let angleLineEndX = finalX;
            let angleLineEndY = finalY;
            if (angleLineLen > angleLabelEdgeOffset) {
              const angleShortenRatio = (angleLineLen - angleLabelEdgeOffset) / angleLineLen;
              angleLineEndX = pos.anchorX + angleLineDx * angleShortenRatio;
              angleLineEndY = pos.anchorY + angleLineDy * angleShortenRatio;
            }

            return (
              <React.Fragment key={key}>
                {/* Reference line from vertex to label */}
                {angleLineLen > 5 && (
                  <Arrow
                    points={[pos.anchorX, pos.anchorY, angleLineEndX, angleLineEndY]}
                    stroke="#008000"
                    strokeWidth={1}
                    listening={false}
                    pointerWidth={8}
                    pointerAtBeginning={true}
                    pointerAtEnding={false}
                  />
                )}
                <Group
                  x={finalX}
                  y={finalY}
                  draggable
                  onDragMove={(e) => handleLabelDrag(e, key, pos)}
                  onDragEnd={(e) => handleLabelDrag(e, key, pos)}
                >
                  <Text
                    text={`${pos.value}°`}
                    fontSize={18}
                    fontStyle="bold"
                    fontFamily="Verdana, Geneva, sans-serif"
                    fill="#008000"
                    align="center"
                    offsetX={20}
                    offsetY={9}
                  />
                </Group>
              </React.Fragment>
            );
          })}

          {/* Fold labels (SF = blue, SSF = brown) */}
          {labelPositions.folds.map((pos) => {
            const key = `fold-${pos.type}`; // 'fold-start' or 'fold-end'
            const savedOffset = coordOffsets[key];
            // coordOffsets stores absolute positions for display
            const foldLabelPadding = 30; // Minimum distance from edge
            const rawFoldX = savedOffset ? savedOffset.x : pos.x;
            const rawFoldY = savedOffset ? savedOffset.y : pos.y;
            // Clamp label position to stay within Stage bounds
            const finalX = Math.max(foldLabelPadding, Math.min(width - foldLabelPadding, rawFoldX));
            const finalY = Math.max(foldLabelPadding, Math.min(height - foldLabelPadding, rawFoldY));
            // SF labels are blue, SSF labels are brown
            const isSF = pos.value.startsWith('SF ');
            const fillColor = isSF ? '#1E3A8A' : 'brown';

            // Calculate proper offsets for multi-line labels (SSF with gap)
            const isMultiLine = pos.value.includes('\n');
            const lineCount = isMultiLine ? pos.value.split('\n').length : 1;
            const foldFontSize = 16;
            // Estimate height based on line count
            const estimatedHeight = foldFontSize * lineCount * 1.2;
            // Estimate width based on max line length
            const maxLineLength = Math.max(...pos.value.split('\n').map(line => line.length));
            const estimatedWidth = maxLineLength * foldFontSize * 0.6;

            return (
              <Group
                key={key}
                x={finalX}
                y={finalY}
                draggable
                onDragMove={(e) => handleLabelDrag(e, key, pos)}
                onDragEnd={(e) => handleLabelDrag(e, key, pos)}
              >
                <Text
                  text={pos.value}
                  fontSize={foldFontSize}
                  fontStyle="bold"
                  fontFamily="Verdana, Geneva, sans-serif"
                  fill={fillColor}
                  align="center"
                  offsetX={estimatedWidth / 2}
                  offsetY={estimatedHeight / 2}
                />
              </Group>
            );
          })}

          {/* Gap labels now included in SSF fold label - no separate rendering needed */}
        </Layer>
      </Stage>
    </div>
  );
});

const SelectMaterialsSimplified = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // ═══════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  // Template data from previous page (DrawingCanvas or DrawingDetailsTab edit)
  // When editing from DrawingDetailsTab, data is passed directly in location.state
  // When coming from DrawingCanvas, data is nested in location.state.template
  const [template, setTemplate] = useState(() => {
    if (location.state?.template) {
      // Coming from DrawingCanvas - data is nested
      return location.state.template;
    } else if (location.state?.isEdit) {
      // Coming from DrawingDetailsTab edit - data is in location.state directly
      return location.state;
    }
    return null;
  });

  // Mode detection
  const isNewFromCanvas = location.state?.isNewFromCanvas === true;
  const isEditMode = location.state?.isEdit === true;
  const shouldLoadExistingRows = isEditMode && !isNewFromCanvas;

  // Get initial order number for defaults lookup
  const initialOrderNumber = location.state?.orderNumber || localStorage.getItem('orderNumber') || '';

  // Load order defaults from localStorage (material, color, price for this specific order)
  // This runs synchronously during state initialization to ensure values are set immediately
  const getOrderDefaults = () => {
    if (initialOrderNumber && !isEditMode) { // Only load defaults for new drawings, not edit mode
      const orderDefaultsKey = `orderDefaults_${initialOrderNumber}`;
      const storedDefaults = localStorage.getItem(orderDefaultsKey);
      if (storedDefaults) {
        try {
          const defaults = JSON.parse(storedDefaults);
          logger.debug('📦 Loading order defaults at init:', defaults);
          return defaults;
        } catch (e) {
          logger.error('Failed to parse order defaults:', e);
        }
      }
    }
    return { material: '', color: '', unitPrice: '' };
  };

  const orderDefaults = getOrderDefaults();

  // Track screen width for responsive canvas sizing
  const [screenWidth, setScreenWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1600
  );

  // Update screen width on resize
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check if this is a taper drawing
  const isTaper = template?.isTaper === true;

  // Helper function to calculate girth from lengths array
  const getGirth = (lengths) => {
    if (!Array.isArray(lengths) || lengths.length === 0) return null;
    return lengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0);
  };

  // Calculate far and near girths for taper drawings (including fold lengths)
  const foldLengthTotal = (parseFloat(template?.startFoldLength) || 0) + (parseFloat(template?.endFoldLength) || 0);
  const farGirth = isTaper && template?.farLengths ? getGirth(template.farLengths) + foldLengthTotal : null;
  const nearGirth = isTaper && template?.nearLengths ? getGirth(template.nearLengths) + foldLengthTotal : null;

  // Helper to parse float values
  const asFloat = (v) => Number.parseFloat(String(v));

  // Detailed 18-level girth bracket system
  const computeBracketedGirth = useCallback((lens) => {
    const raw = (lens || []).reduce((sum, n) => sum + (parseFloat(n) || 0), 0);
    const brackets = [100, 150, 200, 240, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 900, 1000, 1100, 1200];
    return brackets.find((b) => raw <= b) ?? brackets[brackets.length - 1];
  }, []);

  // Calculate the actual girth value for special pricing logic
  // Girth includes segment lengths + fold lengths (SF/SSF)
  const girth = useMemo(() => {
    // For taper drawings, use the maximum of far and near girths (already includes folds)
    if (isTaper && nearGirth !== null && farGirth !== null) {
      const maxGirth = Math.max(farGirth, nearGirth);
      logger.debug('🔍 Taper Girth calculation (using MAX, folds already included):', { farGirth, nearGirth, maxGirth });
      return maxGirth;
    }
    // For non-taper, calculate from template lengths + fold lengths
    const segmentGirth = getGirth(template?.lengths) || template?.width || template?.girth || 0;
    const totalGirth = segmentGirth + foldLengthTotal;
    logger.debug('🔍 Girth calculation:', { segmentGirth, foldLengthTotal, totalGirth });
    return totalGirth;
  }, [template, isTaper, farGirth, nearGirth, foldLengthTotal]);

  // Order details - Initialize from location.state if available (edit mode), otherwise from localStorage
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [customerName, setCustomerName] = useState(
    location.state?.customerName || localStorage.getItem('customerName') || ''
  );
  const [customerId, setCustomerId] = useState(
    location.state?.customerId || localStorage.getItem('customerId') || ''
  );
  const [orderId, setOrderId] = useState(
    location.state?.orderId || localStorage.getItem('orderId') || ''
  );
  const [orderDetails, setOrderDetails] = useState(null);

  // Form state for current row being added
  // Initialize material/color/unitPrice from order defaults if available (for add-new/copy/flip flows)
  const [material, setMaterial] = useState(orderDefaults.material || '');
  const [color, setColor] = useState(orderDefaults.color || '');
  const [quantity, setQuantity] = useState('');
  const [length, setLength] = useState('');
  const [tag, setTag] = useState('');
  const [unitPrice, setUnitPrice] = useState(orderDefaults.unitPrice || '');

  // UI state - hide form in edit mode by default
  const [showEntryForm, setShowEntryForm] = useState(!shouldLoadExistingRows);
  const [showFinish, setShowFinish] = useState(true);
  const [cancelVisible, setCancelVisible] = useState(false);

  // Dropdown auto-open state for keyboard navigation
  const [materialSelectOpen, setMaterialSelectOpen] = useState(false);
  const [colorSelectOpen, setColorSelectOpen] = useState(false);
  const materialJustClosed = useRef(false);
  const colorJustClosed = useRef(false);
  const focusFromTab = useRef(false); // Track if focus came from Tab key navigation

  // Track Tab key presses to determine if focus came from keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        focusFromTab.current = true;
        // Reset after a short delay to handle focus event
        setTimeout(() => { focusFromTab.current = false; }, 100);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Split option state
  const [useSplit, setUseSplit] = useState(false);
  const [splitInto, setSplitInto] = useState('');

  // Split drawing label offsets - stores dragged label positions per split piece
  // Structure: { 0: { 'len-0': {x, y}, 'ang-0': {x, y}, ... }, 1: { ... }, ... }
  // Initialize from template if available (edit mode)
  // Also converts from DrawingCanvas labelOffsets format if splitLabelOffsets not available
  const [splitLabelOffsets, setSplitLabelOffsets] = useState(() => {
    if (template?.splitLabelOffsets && Object.keys(template.splitLabelOffsets).length > 0) {
      return template.splitLabelOffsets;
    }
    // Convert from DrawingCanvas labelOffsets format to splitLabelOffsets format
    // This ensures label adjustments made in DrawingCanvas are reflected in split drawings
    if (template?.labelOffsets) {
      const converted = {};
      // Use farSegmentLabels for taper mode, fall back to segmentLabels for normal mode
      const segmentSource = template.labelOffsets.farSegmentLabels || template.labelOffsets.segmentLabels || {};
      const angleSource = template.labelOffsets.farAngleLabels || template.labelOffsets.angleLabels || {};
      const foldSource = template.labelOffsets.farFoldLabels || template.labelOffsets.foldLabels || {};
      const gapSource = template.labelOffsets.farGapLabels || template.labelOffsets.gapLabels || {};

      // Create a single offset object that will be applied to all split pieces
      const baseOffsets = {};

      // Convert segment labels: { 0: {x, y} } -> { 'len-0': {x, y} }
      Object.entries(segmentSource).forEach(([index, offset]) => {
        baseOffsets[`len-${index}`] = offset;
      });

      // Convert angle labels: { 0: {x, y} } -> { 'ang-0': {x, y} }
      Object.entries(angleSource).forEach(([index, offset]) => {
        baseOffsets[`ang-${index}`] = offset;
      });

      // Convert fold labels: { start: {x, y}, end: {x, y} } -> { 'fold-start': {x, y}, 'fold-end': {x, y} }
      Object.entries(foldSource).forEach(([key, offset]) => {
        baseOffsets[`fold-${key}`] = offset;
      });

      // Convert gap labels: { start: {x, y}, end: {x, y} } -> { 'gap-start': {x, y}, 'gap-end': {x, y} }
      Object.entries(gapSource).forEach(([key, offset]) => {
        baseOffsets[`gap-${key}`] = offset;
      });

      // Apply same offsets to all split pieces (0 = FAR, 1+ = split pieces)
      if (Object.keys(baseOffsets).length > 0) {
        // Initialize for up to 10 split pieces (more than enough)
        for (let i = 0; i < 10; i++) {
          converted[i] = { ...baseOffsets };
        }
        return converted;
      }
    }
    return {};
  });

  // Material rows (stored in React state, not saved to backend yet)
  const [materialRows, setMaterialRows] = useState([]);

  // Saved material rows (fetched from backend when editing existing template)
  const [savedRows, setSavedRows] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]); // Selected row indices for bulk delete
  const [editingRowId, setEditingRowId] = useState(null); // Track _id of main form row being edited
  const [editingSwiJobId, setEditingSwiJobId] = useState(null); // Track swiJobId of main form row being edited
  const [rowsToDelete, setRowsToDelete] = useState([]); // Track row IDs pending deletion (deleted on Finish)

  // Additional rows for bulk entry
  const [additionalRows, setAdditionalRows] = useState([]);

  // Available materials and colors from backend
  const [availableMaterials, setAvailableMaterials] = useState([]);
  const [availableColors, setAvailableColors] = useState([]);
  const [isSingleColorMaterial, setIsSingleColorMaterial] = useState(false); // Track if material has only one color

  // Dynamic material mapping - will be populated from API (for proper pricing/DB values)
  const [materialMap, setMaterialMap] = useState({});

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingFinish, setIsProcessingFinish] = useState(false);

  // Tag auto-populate states
  const [loadingSuggestedTag, setLoadingSuggestedTag] = useState(false);
  const [hasAutoPopulatedTag, setHasAutoPopulatedTag] = useState(false);

  // Ref to track if initial load is complete (to avoid bulk updates on mount)
  const initialLoadComplete = React.useRef(false);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // Ref for price fetch debouncing
  const priceTimeoutRef = React.useRef(null);
  // Ref to skip price fetch when loading data from saved row edit
  const loadingFromSavedRowRef = React.useRef(false);
  // Refs to track previous material/color/length for detecting changes
  const prevMaterialRef = React.useRef(null);
  const prevColorRef = React.useRef(null);
  const prevLengthRef = React.useRef(null);
  const prevGirthRef = React.useRef(null);
  // Flag to indicate girth changed when returning from DrawingCanvas
  const girthChangedOnReturnRef = React.useRef(false);

  // ═══════════════════════════════════════════════════════════════
  // REFS FOR KEYBOARD NAVIGATION
  // ═══════════════════════════════════════════════════════════════
  const materialSelectRef = useRef(null);
  const colorSelectRef = useRef(null);
  const piecesRef = useRef(null);
  const lengthRef = useRef(null);
  const tagRef = useRef(null);
  const backBtnRef = useRef(null);
  const editDrawingBtnRef = useRef(null);
  const finishBtnRef = useRef(null);
  const finishAddNewBtnRef = useRef(null);
  const finishCopyBtnRef = useRef(null);
  const finishFlipBtnRef = useRef(null);
  const addQuantityBtnRef = useRef(null);


  // ═══════════════════════════════════════════════════════════════
  // LOAD INITIAL DATA
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    // Get template ID from URL or template state
    const templateIdFromUrl = searchParams.get('templateId');
    const templateIdFromState = template?._id || template?.templateId;
    const finalTemplateId = templateIdFromUrl || templateIdFromState;

    // OPTIMIZED: Run all API calls in parallel for faster loading
    const loadInitialData = async () => {
      // Build array of promises to run in parallel
      const promises = [
        loadMaterials(),
        loadOrderDetails()
      ];

      // Add edit mode specific calls if needed
      if (shouldLoadExistingRows && finalTemplateId) {
        logger.debug('🔄 Will load existing rows for templateId:', finalTemplateId);

        // Add material rows fetch
        promises.push(loadExistingMaterialRows(finalTemplateId));

        // Only fetch template from API when coming from DrawingDetailsTab (not from DrawingCanvas)
        // When coming from DrawingCanvas, location.state.template has fresh data - don't overwrite it
        const comingFromCanvas = !!location.state?.template;
        if (!comingFromCanvas) {
          logger.debug('🔄 Fetching fresh template data from API (coming from DrawingDetailsTab)');
          // Add template fetch (full API to get fresh data after clear & redraw)
          promises.push(
            axios.get(`${API_BASE_URL}/api/templates/${finalTemplateId}`)
            .then(response => {
              if (response.data?.data) {
                const fetchedTemplate = response.data.data;
                setTemplate(prev => ({
                  ...prev,
                  // Preview URLs
                  previewUrl: fetchedTemplate.previewUrl,
                  previewFarUrl: fetchedTemplate.previewFarUrl,
                  previewNearUrl: fetchedTemplate.previewNearUrl,
                  preview: fetchedTemplate.preview,
                  previewFar: fetchedTemplate.previewFar,
                  previewNear: fetchedTemplate.previewNear,
                  // Geometry - CRITICAL for split drawing display after clear & redraw
                  lengths: fetchedTemplate.lengths,
                  farLengths: fetchedTemplate.lengths, // SplitDrawingCanvas prefers farLengths
                  angles: fetchedTemplate.angles,
                  farAngles: fetchedTemplate.angles,
                  nearLengths: fetchedTemplate.nearLengths,
                  nearAngles: fetchedTemplate.nearAngles,
                  // Orientation
                  firstSegmentAngle: fetchedTemplate.firstSegmentAngle,
                  segmentAbsoluteAngles: fetchedTemplate.segmentAbsoluteAngles || [],
                  direction: fetchedTemplate.direction,
                  reverseColor: fetchedTemplate.reverseColor,
                  flipH: fetchedTemplate.flipH,
                  flipV: fetchedTemplate.flipV,
                  // Fold properties - preserve existing values if API doesn't return them
                  startFoldType: fetchedTemplate.startFoldType ?? prev.startFoldType,
                  startFoldLength: fetchedTemplate.startFoldLength ?? prev.startFoldLength,
                  startFoldDirection: fetchedTemplate.startFoldDirection ?? prev.startFoldDirection,
                  startFoldGap: fetchedTemplate.startFoldGap ?? prev.startFoldGap ?? 0,
                  endFoldType: fetchedTemplate.endFoldType ?? prev.endFoldType,
                  endFoldLength: fetchedTemplate.endFoldLength ?? prev.endFoldLength,
                  endFoldDirection: fetchedTemplate.endFoldDirection ?? prev.endFoldDirection,
                  endFoldGap: fetchedTemplate.endFoldGap ?? prev.endFoldGap ?? 0,
                  // Other properties
                  isTaper: fetchedTemplate.isTaper,
                  girth: fetchedTemplate.girth,
                  labelOffsets: fetchedTemplate.labelOffsets,
                  splitLabelOffsets: fetchedTemplate.splitLabelOffsets
                }));
              }
            })
            .catch(error => {
              logger.error('Failed to fetch template:', error);
            })
          );
        }
      }

      // Run all API calls in parallel
      await Promise.all(promises);
    };

    loadInitialData();
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // SCROLL TO TOP ON NAVIGATION (OPTIMIZED - reduced timeouts)
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const mainContainer = document.querySelector('.RightMainContainer');
      if (mainContainer) {
        mainContainer.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    };

    // Execute immediately and once after a short delay
    scrollToTop();
    const timeout = setTimeout(scrollToTop, 50);

    return () => clearTimeout(timeout);
  }, [location.key]);

  // ═══════════════════════════════════════════════════════════════
  // SET INITIAL FOCUS ON MATERIAL DROPDOWN (or Pieces if already selected)
  // ═══════════════════════════════════════════════════════════════
  const initialFocusSet = useRef(false);
  useEffect(() => {
    // Only set focus once
    if (initialFocusSet.current) return;

    // Small delay to ensure DOM is ready
    const focusTimeout = setTimeout(() => {
      // If material and color are already selected (edit mode), focus on pieces
      if (material && color) {
        initialFocusSet.current = true;
        if (piecesRef.current) {
          piecesRef.current.focus();
        }
      } else if (!material) {
        // New drawing - focus on material select
        initialFocusSet.current = true;
        materialSelectRef.current?.focus();
      }
      // If material is set but color is not, wait for next render
    }, 150);

    return () => clearTimeout(focusTimeout);
  }, [material, color]);

  // Focus on pieces field when entry form is shown
  useEffect(() => {
    if (showEntryForm && piecesRef.current) {
      setTimeout(() => {
        // Use optional chaining in case ref became null during timeout (e.g., split drawings navigation)
        piecesRef.current?.focus();
      }, 100);
    }
  }, [showEntryForm]);

  // ═══════════════════════════════════════════════════════════════
  // RESTORE STATE WHEN RETURNING FROM EDIT DRAWING
  // Handles back and forth without SWI push
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Check if we're returning from Edit Drawing with preserved material/color/savedRows or template changes
    // IMPORTANT: Also check for template to handle clear-and-redraw case where only template changes
    if (location.state?.material || location.state?.color || location.state?.unitPrice || location.state?.savedRows || location.state?.pendingFormData || location.state?.template) {
      logger.debug('🔄 Returning from Edit Drawing - restoring state:', {
        preservedTemplateId: location.state?.preservedTemplateId,
        hasMaterial: !!location.state?.material,
        hasColor: !!location.state?.color,
        hasUnitPrice: !!location.state?.unitPrice,
        savedRowsCount: location.state?.savedRows?.length || 0,
        hasPendingFormData: !!location.state?.pendingFormData
      });

      // Restore material, color
      if (location.state?.material) {
        setMaterial(location.state.material);
      }
      if (location.state?.color) {
        setColor(location.state.color);
      }

      // Check if girth or bends changed - if so, don't restore unitPrice (let it re-fetch)
      const savedGirth = location.state?.savedGirth;
      const newTemplate = location.state?.template;
      const newIsTaper = newTemplate?.isTaper === true;
      const newTemplateLengths = newTemplate?.lengths || [];
      const newTemplateAngles = newTemplate?.angles || [];
      const newStartFold = parseFloat(newTemplate?.startFoldLength) || 0;
      const newEndFold = parseFloat(newTemplate?.endFoldLength) || 0;

      // Calculate girth correctly based on taper vs normal mode
      let newGirth;
      if (newIsTaper && newTemplate?.farLengths && newTemplate?.nearLengths) {
        // For taper drawings, girth = max(farGirth, nearGirth) + folds
        const farSegmentGirth = (newTemplate.farLengths || []).reduce((sum, n) => sum + (parseFloat(n) || 0), 0);
        const nearSegmentGirth = (newTemplate.nearLengths || []).reduce((sum, n) => sum + (parseFloat(n) || 0), 0);
        newGirth = Math.max(farSegmentGirth, nearSegmentGirth) + newStartFold + newEndFold;
      } else {
        const newSegmentGirth = newTemplateLengths.reduce((sum, n) => sum + (parseFloat(n) || 0), 0);
        newGirth = newSegmentGirth + newStartFold + newEndFold;
      }

      // Check if girth changed OR if savedGirth was never set (means we need to re-fetch)
      const girthChanged = savedGirth !== null && savedGirth !== undefined && newGirth !== savedGirth;
      // Also check if savedGirth is missing but we have a new template (cleared and redrawn)
      const hasNewLengths = newIsTaper ? (newTemplate?.farLengths?.length > 0 || newTemplate?.nearLengths?.length > 0) : newTemplateLengths.length > 0;
      const noSavedGirthButHasTemplate = (savedGirth === null || savedGirth === undefined) && hasNewLengths;
      // Detect if taper mode changed (normal→taper or taper→normal) - always re-fetch price
      const savedIsTaper = location.state?.savedIsTaper;
      const taperModeChanged = savedIsTaper !== undefined && savedIsTaper !== newIsTaper;
      // IMPORTANT: Also check if bends/angles changed - price depends on bends too
      const savedBends = location.state?.savedBends;
      const newBends = newTemplateAngles.length;
      const bendsChanged = savedBends !== null && savedBends !== undefined && newBends !== savedBends;
      // If savedBends not set but we have new angles, treat as changed
      const noSavedBendsButHasAngles = (savedBends === null || savedBends === undefined) && newTemplateAngles.length > 0;

      const needsPriceRefetch = girthChanged || noSavedGirthButHasTemplate || bendsChanged || noSavedBendsButHasAngles || taperModeChanged;

      if (location.state?.unitPrice && !needsPriceRefetch) {
        // Girth and bends didn't change, safe to restore old price
        setUnitPrice(location.state.unitPrice);
      } else if (needsPriceRefetch) {
        logger.debug('🔄 Drawing changed - girth:', savedGirth, '->', newGirth, ', bends:', savedBends, '->', newBends, '- will re-fetch price');
        // CLEAR unitPrice so price fetch will trigger
        setUnitPrice('');
        // Set flag to trigger bulk update for saved rows
        girthChangedOnReturnRef.current = true;
      }

      // NOTE: Don't restore savedRows from navigation state - always fetch fresh from MongoDB
      // This ensures we get the latest data after tag/material updates
      // The loadMaterialRows() function will fetch fresh data below
      // if (location.state?.savedRows && Array.isArray(location.state.savedRows)) {
      //   logger.debug('🔄 Restoring savedRows from Edit Drawing:', location.state.savedRows.length);
      //   setSavedRows(location.state.savedRows);
      // }

      // Restore pending form data (quantity, length, tag, split)
      if (location.state?.pendingFormData) {
        const formData = location.state.pendingFormData;
        logger.debug('🔄 Restoring pendingFormData from Edit Drawing:', formData);

        if (formData.quantity) setQuantity(formData.quantity);
        if (formData.length) setLength(formData.length);
        if (formData.tag) setTag(formData.tag);
        if (formData.useSplit) setUseSplit(formData.useSplit);
        if (formData.splitInto) setSplitInto(formData.splitInto);

        // Restore editing row ID if user was editing a saved row
        if (formData.editingRowId) {
          logger.debug('🔄 Restoring editingRowId from Edit Drawing:', formData.editingRowId);
          setEditingRowId(formData.editingRowId);
        }

        // Restore form visibility states exactly as they were
        if (formData.showEntryForm !== undefined) {
          logger.debug('🔄 Restoring showEntryForm from Edit Drawing:', formData.showEntryForm);
          setShowEntryForm(formData.showEntryForm);
        }
        if (formData.cancelVisible !== undefined) {
          logger.debug('🔄 Restoring cancelVisible from Edit Drawing:', formData.cancelVisible);
          setCancelVisible(formData.cancelVisible);
        }
      }

      // When returning from Canvas, update template with full geometry (lengths, angles, folds)
      // This ensures girth recalculates with new values even if useState initialization had a timing issue
      // Only do this when location.state.template exists (coming from Canvas, not DrawingDetailsTab)
      if (location.state?.template) {
        logger.debug('🔄 Restoring full template from Canvas return');
        setTemplate(prev => ({
          ...prev,
          ...location.state.template
        }));
      } else if (location.state?.preservedTemplateId) {
        // Coming from DrawingDetailsTab - only update IDs, let API fetch provide fresh geometry
        logger.debug('🔄 Restoring preservedTemplateId:', location.state.preservedTemplateId);
        setTemplate(prev => ({
          ...prev,
          _id: location.state.preservedTemplateId,
          templateId: location.state.preservedTemplateId
        }));
      }
    }
  }, [location.state?.material, location.state?.color, location.state?.unitPrice, location.state?.savedRows, location.state?.preservedTemplateId, location.state?.pendingFormData, location.state?.savedGirth, location.state?.savedBends, location.state?.savedIsTaper, location.state?.template]);

  // Function to load existing material rows from backend
  const loadExistingMaterialRows = async (templateId) => {
    try {
      logger.debug('📦 Loading existing material rows for templateId:', templateId);
      const token = tokenManager.getToken();
      const url = `${API_BASE_URL}/api/templates/${templateId}/rows`;

      const response = await axios.get(url, {
        headers: {
          'x-access-token': token,
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data && Array.isArray(response.data)) {
        setSavedRows(response.data);
        logger.debug('✅ Loaded material rows:', response.data.length, 'rows');

        // In edit mode with existing rows: hide entry form, show only material/color/add quantity
        if (response.data.length > 0) {
          logger.debug('First row:', response.data[0]);

          // Set material, color, and unitPrice from first row for display
          const firstRow = response.data[0];
          setMaterial(firstRow.material || '');
          setColor(firstRow.color || '');
          // Set unitPrice from saved row to prevent "no price found" issue in edit mode
          // BUT skip if girth changed on return from DrawingCanvas - price will be re-fetched
          if (girthChangedOnReturnRef.current) {
            logger.debug('Edit mode: Skipping unitPrice restore from saved row - girth changed, will re-fetch');
          } else if (firstRow.unitPrice !== undefined && firstRow.unitPrice !== null && firstRow.unitPrice !== '') {
            setUnitPrice(String(firstRow.unitPrice));
            logger.debug('Edit mode: Set unitPrice from first row:', firstRow.unitPrice);
          }

          // Check if any row has split - if so, set split state for preview display
          const splitRow = response.data.find(row => row.splitInto && Number(row.splitInto) > 1);
          if (splitRow) {
            setUseSplit(true);
            setSplitInto(String(splitRow.splitInto));
            // NOTE: Don't set length here - it causes validation issues when finishing without changes
            // The split preview will use data from saved rows directly
            logger.debug('Edit mode: Set split state from saved row:', {
              splitInto: splitRow.splitInto,
              length: splitRow.length
            });
          }

          // Hide the form fields (show only Material, Color, Add Quantity button)
          // BUT don't hide if we're returning from Edit Drawing with preserved form state
          const pendingFormData = location.state?.pendingFormData;
          const shouldPreserveFormState = pendingFormData?.showEntryForm !== undefined;
          if (!shouldPreserveFormState) {
            setShowEntryForm(false);
          } else {
            logger.debug('Edit mode: Preserving form state from Edit Drawing return, showEntryForm:', pendingFormData.showEntryForm);
          }

          logger.debug('Edit mode: Set material/color from first row');
        }
      }
    } catch (error) {
      logger.error('❌ Failed to load material rows:', error);
      setSavedRows([]);
    }
  };

  useEffect(() => {
    // FIX: Add availableMaterials to dependencies to handle race condition
    // When materials load after material is already set (e.g., edit mode),
    // this ensures colors are fetched once materials are available
    if (material && availableMaterials.length > 0) {
      loadColors(material);
    }
  }, [material, availableMaterials]);

  // Mark initial load as complete after savedRows are loaded
  useEffect(() => {
    if (savedRows.length > 0 && !initialLoadComplete.current) {
      // Delay to ensure all initial state is set
      setTimeout(() => {
        initialLoadComplete.current = true;
        logger.debug('[useEffect] Initial load complete, bulk updates now enabled');
      }, 500);
    }
  }, [savedRows]);

  // FIX: Handle race condition where savedRows loads AFTER the auto-fetch effect already ran.
  // When returning from DrawingCanvas with a girth change, the auto-fetch effect may run before
  // savedRows are loaded (materialMap loads first). In that case, handleBulkMaterialColorUpdate
  // never fires because savedRows.length was 0. This effect catches that case.
  // Also explicitly calls fetchUnitPrice to ensure form price updates regardless of auto-fetch timing.
  useEffect(() => {
    if (savedRows.length > 0 && girthChangedOnReturnRef.current && material && color) {
      const hasMaterialMap = Object.keys(materialMap).length > 0;
      if (hasMaterialMap) {
        logger.info('[useEffect] savedRows loaded with pending girth change - triggering bulk price update');
        handleBulkMaterialColorUpdate(material, color);
        // Also trigger form price fetch directly - ensures price updates even if
        // auto-fetch effect doesn't fire (e.g., both effects run in same render cycle
        // and auto-fetch reads girthChangedOnReturnRef after it's been reset)
        fetchUnitPrice();
        girthChangedOnReturnRef.current = false;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRows, material, color, materialMap]);

  // ═══════════════════════════════════════════════════════════════
  // AUTO-POPULATE TAG
  // ═══════════════════════════════════════════════════════════════
  // OPTIMIZED: In edit mode, use savedRows data instead of making duplicate API call
  useEffect(() => {
    const autoPopulateTag = async () => {
      // Only auto-populate once when component first loads
      if (hasAutoPopulatedTag || tag !== '' || !orderNumber) {
        return;
      }

      try {
        setLoadingSuggestedTag(true);
        const token = tokenManager.getToken();

        if (isEditMode) {
          // Edit mode: Use savedRows data (already fetched by loadExistingMaterialRows)
          // No need for duplicate API call
          if (savedRows.length > 0) {
            const lastRow = savedRows[savedRows.length - 1];
            if (lastRow.tag) {
              setTag(lastRow.tag);
              setHasAutoPopulatedTag(true);
              logger.debug('✅ Auto-populated tag from savedRows (no extra API call):', lastRow.tag);
              return;
            }
          }
          // If savedRows not loaded yet, wait for next render when it's populated
          if (savedRows.length === 0) {
            setLoadingSuggestedTag(false);
            return;
          }
        }

        // New mode or fallback: Get next sequential tag from API
        const response = await axios.get(`${API_BASE_URL}/api/tags/next-for-order`, {
          params: { orderNumber },
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success && response.data.nextTag) {
          setTag(response.data.nextTag);
          setHasAutoPopulatedTag(true);
          logger.debug('✅ Auto-populated tag from API:', response.data.nextTag);
        }
      } catch (error) {
        logger.error('Failed to auto-populate tag:', error);
        // Keep empty if fetch fails - user can enter manually
      } finally {
        setLoadingSuggestedTag(false);
      }
    };

    autoPopulateTag();
  }, [orderNumber, isEditMode, hasAutoPopulatedTag, tag, savedRows]);

  // ═══════════════════════════════════════════════════════════════
  // FETCH UNIT PRICE (with useCallback + debounce)
  // ═══════════════════════════════════════════════════════════════
  const fetchUnitPrice = useCallback(() => {
    if (!(material && color && customerId && template?.lengths && template?.angles)) {
      logger.debug('Skipping price fetch - missing required data');
      return;
    }

    // Clear any existing timeout
    if (priceTimeoutRef.current) clearTimeout(priceTimeoutRef.current);

    // Debounce the price fetch (400ms like old flow)
    priceTimeoutRef.current = setTimeout(async () => {
      try {
        setLoadingPrice(true);

        // Special pricing logic: When girth > 1200, use the entered length as girth for price calculation
        // But only if length has actually been entered by the user
        let girthBracket;

        logger.debug(`Price calculation - Girth: ${girth}mm, Length entered: "${length}"`);

        if (girth > 1200 && length && String(length).trim() !== '') {
          // Convert entered length (in meters) to mm for bracket calculation
          const lengthInMm = asFloat(length) * 1000;
          if (!isNaN(lengthInMm) && lengthInMm > 0) {
            girthBracket = computeBracketedGirth([lengthInMm]);
            logger.debug(`🔄 Special pricing: Girth > 1200mm (${girth}mm), using length ${length}m as girth for pricing: ${lengthInMm}mm -> bracket: ${girthBracket}`);
          } else {
            // Invalid length value, use normal girth
            girthBracket = computeBracketedGirth([girth]);
            logger.debug(`⚠️ Invalid length value, using normal girth: ${girth}mm -> bracket: ${girthBracket}`);
          }
        } else {
          // Normal case: use actual calculated girth (which includes fold lengths)
          girthBracket = computeBracketedGirth([girth]);
          logger.debug(`📏 Normal pricing: Using actual girth ${girth}mm -> bracket: ${girthBracket}`);
        }

        // Calculate folds - angles in 170-180 range count as 2 bends (same as DrawingCanvas)
        let folds = 0;
        const templateAngles = template.angles || [];
        if (templateAngles.length > 0) {
          for (let i = 0; i < templateAngles.length; i++) {
            const absAngle = Math.abs(templateAngles[i]);
            // Angles between 170-180 degrees are fold-backs, count as 2 bends
            if (absAngle >= 170 && absAngle <= 180) {
              folds += 2;
            } else {
              folds += 1;
            }
          }
        }
        if (template.startFoldType === 'Up' || template.startFoldType === 'Down' ||
            template.startFoldType === 'OpenUp' || template.startFoldType === 'OpenDn' ||
            template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
          folds += 2;
        }
        if (template.endFoldType === 'Up' || template.endFoldType === 'Down' ||
            template.endFoldType === 'OpenUp' || template.endFoldType === 'OpenDn' ||
            template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
          folds += 2;
        }
        folds = Math.max(1, folds);
        if (folds > 10) {
          folds = 10;
          logger.debug('⚠️ Folds capped at 10 for pricing calculation');
        }

        // Use pricing material value from materialMap for proper API call
        const pricingMaterial = materialMap[material]?.pricing || material;

        logger.debug('Fetching price with params:', { material: pricingMaterial, color, customerId, girth: girthBracket, folds });

        const response = await axios.get(`${API_BASE_URL}/api/custom-prices/custom-unit-price`, {
          params: { material: pricingMaterial, color, customerId, girth: girthBracket, folds },
          headers: {
            'x-access-token': tokenManager.getToken()
          }
        });

        if (response.data && response.data.unitPrice !== undefined) {
          setUnitPrice(response.data.unitPrice.toString());
          logger.debug('✅ Price fetched:', response.data.unitPrice);
        }
      } catch (error) {
        logger.error('❌ Failed to fetch unit price:', error);
        setUnitPrice('');
      } finally {
        setLoadingPrice(false);
      }
    }, 400);
  }, [material, color, customerId, template, materialMap, computeBracketedGirth, girth, length]);

  // Auto-fetch unit price when material and color are selected
  // Also trigger bulk update of saved rows if material/color changes (after initial load)
  useEffect(() => {
    const hasValidMaterial = material && material !== '';
    const hasValidColor = color && color !== '';
    // Ensure materialMap is loaded before fetching price (needed for proper pricing API call)
    const hasMaterialMap = Object.keys(materialMap).length > 0;

    if (hasValidMaterial && hasValidColor && customerId && template && hasMaterialMap) {
      // EDIT MODE: Skip fetching price if we already have a valid unitPrice from saved rows
      // This prevents manually entered prices from being overwritten with 0
      const hasExistingPrice = unitPrice && unitPrice !== '' && unitPrice !== '0';
      const isInitialEditModeLoad = isEditMode && savedRows.length > 0 && !initialLoadComplete.current;
      const isLoadingFromSavedRow = loadingFromSavedRowRef.current;

      // Check if material/color actually changed (vs just length changing)
      const materialChanged = prevMaterialRef.current !== null && prevMaterialRef.current !== material;
      const colorChanged = prevColorRef.current !== null && prevColorRef.current !== color;
      const materialColorChanged = materialChanged || colorChanged;

      // Check if length changed - important for girth > 1200 special pricing
      const lengthChanged = prevLengthRef.current !== null && prevLengthRef.current !== length;
      // Special case: When girth > 1200, length affects pricing so we need to refetch
      const needsPriceUpdateForLargeGirth = girth > 1200 && lengthChanged;

      // Check if girth actually changed (covers all cases: return from DrawingCanvas, template reload, etc.)
      const girthChanged = prevGirthRef.current !== null && prevGirthRef.current !== girth;

      // Check if girth changed on return from DrawingCanvas - this overrides skip conditions
      const girthChangedOnReturn = girthChangedOnReturnRef.current;

      if (isLoadingFromSavedRow) {
        logger.debug('Skipping price fetch - loading from saved row edit');
      } else if (girthChangedOnReturn || girthChanged) {
        // Girth changed - MUST fetch new price regardless of other conditions
        fetchUnitPrice();
      } else if (needsPriceUpdateForLargeGirth) {
        // Girth > 1200 and length changed - MUST fetch new price (special pricing logic)
        logger.debug('Edit mode: Girth > 1200mm and length changed, fetching new price');
        fetchUnitPrice();
      } else if (isInitialEditModeLoad && hasExistingPrice && !materialColorChanged) {
        logger.debug('Edit mode: Skipping price fetch - using saved unitPrice:', unitPrice);
      } else if (isEditMode && hasExistingPrice && !materialColorChanged) {
        // In edit mode with existing price, don't overwrite unless material/color changed
        logger.debug('Edit mode: Preserving existing unitPrice (length changed, not material/color):', unitPrice);
      } else {
        // Call fetchUnitPrice (it has its own debounce)
        fetchUnitPrice();
      }

      // Update refs to track current material/color/length/girth
      prevMaterialRef.current = material;
      prevColorRef.current = color;
      prevLengthRef.current = length;
      prevGirthRef.current = girth;

      // EDIT MODE FIX: If we have saved rows AND initial load is complete,
      // update them with new material/color/price
      // This handles the case where user changes material/color in the dropdowns
      // Also handles girth changes when returning from DrawingCanvas
      // Skip on initial load to avoid overwriting existing data
      // For girth changes on return, update saved rows even if initialLoadComplete is false
      if (savedRows.length > 0 && (initialLoadComplete.current || girthChangedOnReturn)) {
        // Check if material/color actually changed from saved rows
        const firstRow = savedRows[0];
        const savedMaterialColorChanged = firstRow.material !== material || firstRow.color !== color;

        if (savedMaterialColorChanged || girthChangedOnReturn) {
          logger.info('[useEffect] Material/color/girth changed, triggering bulk update', {
            savedMaterialColorChanged,
            girthChangedOnReturn,
            firstRowMaterial: firstRow.material,
            newMaterial: material,
            firstRowColor: firstRow.color,
            newColor: color
          });
          handleBulkMaterialColorUpdate(material, color);
          // Reset the girth changed flag
          girthChangedOnReturnRef.current = false;
        }
      }
    }
    // fetchUnitPrice is a useCallback with girth/length in deps, so when they change it gets recreated and this effect runs
    // Added length and girth to deps to detect length changes for girth > 1200 special pricing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, color, customerId, template, materialMap, fetchUnitPrice, length, girth]);


  const initialFocusDone = useRef(false);
  useEffect(() => {
    const handleFirstTab = (e) => {
      if (e.key === 'Tab' && !initialFocusDone.current) {
        if (document.activeElement === document.body) {
          finishBtnRef.current?.focus();
          initialFocusDone.current = true;
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleFirstTab, true);
    return () => window.removeEventListener('keydown', handleFirstTab, true);
  }, []);
  

  // ═══════════════════════════════════════════════════════════════
  // BULK UPDATE SAVED ROWS WHEN MATERIAL/COLOR CHANGES
  // Updates LOCAL STATE ONLY - database update happens on Finish
  // ═══════════════════════════════════════════════════════════════
  const handleBulkMaterialColorUpdate = async (newMaterial, newColor) => {
    // Only update if we have saved rows and material/color are selected
    if (savedRows.length === 0 || !newMaterial || !newColor) {
      return;
    }

    try {
      logger.info(`[handleBulkMaterialColorUpdate] Updating ${savedRows.length} rows LOCAL STATE with Material: ${newMaterial}, Color: ${newColor}`);

      // Use the detailed 18-level girth bracket system
      const girthBracket = computeBracketedGirth([girth]);

      // Calculate folds - angles in 170-180 range count as 2 bends (same as DrawingCanvas)
      let folds = 0;
      const templateAngles = template?.angles || [];
      if (templateAngles.length > 0) {
        for (let i = 0; i < templateAngles.length; i++) {
          const absAngle = Math.abs(templateAngles[i]);
          // Angles between 170-180 degrees are fold-backs, count as 2 bends
          if (absAngle >= 170 && absAngle <= 180) {
            folds += 2;
          } else {
            folds += 1;
          }
        }
      }
      if (template?.startFoldType === 'Up' || template?.startFoldType === 'Down' ||
          template?.startFoldType === 'OpenUp' || template?.startFoldType === 'OpenDn' ||
          template?.startFoldType === 'SF' || template?.startFoldType === 'SSF') {
        folds += 2;
      }
      if (template?.endFoldType === 'Up' || template?.endFoldType === 'Down' ||
          template?.endFoldType === 'OpenUp' || template?.endFoldType === 'OpenDn' ||
          template?.endFoldType === 'SF' || template?.endFoldType === 'SSF') {
        folds += 2;
      }
      folds = Math.max(1, folds);
      if (folds > 10) folds = 10;

      // Use pricing material value from materialMap for proper API call
      const pricingMaterial = materialMap[newMaterial]?.pricing || newMaterial;
      // Use database material value from materialMap for storing in DB
      const dbMaterial = materialMap[newMaterial]?.db || newMaterial;

      // Fetch new unit price for this material/color combination
      setIsProcessingFinish(true)
      let newUnitPrice = '';
      try {
        const res = await axios.get(`${API_BASE_URL}/api/custom-prices/custom-unit-price`, {
          params: { material: pricingMaterial, color: newColor, customerId, girth: girthBracket, folds },
          headers: { 'x-access-token': tokenManager.getToken() }
        });
        newUnitPrice = res.data.unitPrice ?? '';
        logger.debug(`✅ New unit price fetched: $${newUnitPrice}`);
        setIsProcessingFinish(false)
      } catch (error) {
        logger.error('❌ Failed to fetch new unit price:', error);
        // Continue without price update if fetch fails
        setIsProcessingFinish(false)
      }

      // Check if no price found for the new material/color
      const priceValue = Number(newUnitPrice) || 0;
      if (priceValue <= 0) {
        swal.fire({
          title: 'Price Not Available',
          text: 'Price cannot be zero. Please contact the accounts team.',
          icon: 'error'
        });
        // Keep unitPrice as 0 - manual entry not allowed
        setUnitPrice('0');
        setIsProcessingFinish(false);
      }

      // Update LOCAL STATE ONLY - NO database calls here
      // Database update will happen when user clicks "Finish"
      logger.info('[handleBulkMaterialColorUpdate] Creating updated rows with:', {
        newUnitPrice,
        dbMaterial,
        newColor,
        savedRowsCount: savedRows.length
      });

      const updatedRows = savedRows.map((row, idx) => {
        // Calculate new extended price
        const pieces = row.quantity;
        const lengthMeters = Number(row.length) / 1000;
        // For overgirth (girth > 1200): qty = pieces × girth (in meters)
        // For normal: qty = pieces × length (in meters)
        const qtyMultiplier = girth > 1200 ? (girth / 1000) : lengthMeters;
        const totalMeters = pieces * qtyMultiplier;
        // Use new price, or 0 if no price found (will be blocked on Finish)
        const price = priceValue;
        const newExtPrice = Number((price * totalMeters).toFixed(2));

        logger.debug(`[handleBulkMaterialColorUpdate] Row ${idx}: oldPrice=${row.unitPrice}, newPrice=${price}, extPrice=${newExtPrice}`);

        // Return updated row for local state (NOT saving to database yet)
        return {
          ...row,
          material: dbMaterial,
          color: newColor,
          girth: girth || 0, // Update girth to current calculated value
          unitPrice: price,
          extPrice: newExtPrice,
          _pendingUpdate: true // Mark as pending update for handleFinish
        };
      });

      logger.info('[handleBulkMaterialColorUpdate] Calling setSavedRows with', updatedRows.length, 'rows');
      // Update local state only
      setSavedRows(updatedRows);

      // Update the unit price in the form
      if (priceValue > 0) {
        setUnitPrice(newUnitPrice.toString());
      }

      logger.info(`✅ Bulk update LOCAL STATE complete: ${updatedRows.length} rows updated (pending save on Finish)`);

    } catch (error) {
      logger.error('❌ Bulk update failed:', error);
      swal.fire({
        text: `Failed to update rows: ${error.message || 'Unknown error'}. Please try again.`,
        icon: 'error'
      });
    }
  };

  // Load order details to get delivery date
  const loadOrderDetails = async () => {
    try {
      // Get orderNumber from state or localStorage
      const orderNumberToUse = orderNumber || localStorage.getItem('orderNumber');

      if (!orderNumberToUse) {
        logger.warn('No order number available');
        return;
      }

      const token = tokenManager.getToken();
      // Fetch order details endpoint
      const url = `${API_BASE_URL}/fetch-order-details-by-ordernumber/${orderNumberToUse}`;

      logger.debug('Loading order details for orderNumber:', orderNumberToUse);

      const response = await axios.get(url, {
        headers: {
          'x-access-token': token,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.data) {
        setOrderDetails(response.data);
        logger.debug('Order details fetched successfully:', response.data);
      } else {
        logger.warn('No order details data in response');
      }
    } catch (error) {
      logger.error('Failed to load order details:', error);
    }
  };

  // NOTE: Order defaults (material/color/price) are now loaded at state initialization
  // via getOrderDefaults() - see lines ~173-190

  // Load available materials from backend
  const loadMaterials = async () => {
    try {
      const token = tokenManager.getToken();
      const response = await axios.get(`${API_BASE_URL}/fetch-core-product-data`, {
        headers: {
          'x-access-token': token,
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.fetchedItems && Array.isArray(response.data.fetchedItems)) {
        // Transform API data to match the format we need
        // Backend returns: core_Product_Name, core_Product_Ref_Id, _id
        const materialsData = response.data.fetchedItems.map(item => ({
          name: item.core_Product_Name,
          id: item._id, // MongoDB ID for color fetching
          value: item.core_Product_Name || item._id
        }));

        setAvailableMaterials(materialsData);

        // Build material map for database/pricing values
        const map = {};
        response.data.fetchedItems.forEach(item => {
          const key = item.core_Product_Name || item._id;
          map[key] = {
            pricing: item.core_Product_Name, // Use for pricing API
            db: item.core_Product_Name, // Store in DB
            thickness: item.core_Product_Thickness || null // Thickness from Material Master
          };
        });
        setMaterialMap(map);

        logger.debug('✅ Materials loaded:', materialsData.length);
      }
    } catch (error) {
      logger.error('❌ Failed to load materials:', error);
      setAvailableMaterials([]);
      swal.fire({
        text: 'Failed to load materials',
        icon: 'error'
      });
    }
  };

  // Load available colors for selected material
  const loadColors = async (materialValue) => {
    try {
      // Find the material ID from the materials array
      const selectedMaterial = availableMaterials.find(m => m.value === materialValue);
      if (!selectedMaterial) {
        logger.warn('Material not found in materials list');
        return;
      }

      const token = tokenManager.getToken();
      // Backend expects: /fetch-product-color-data/:id
      const response = await axios.get(
        `${API_BASE_URL}/fetch-product-color-data/${selectedMaterial.id}`,
        {
          headers: {
            'x-access-token': token,
            'Accept': 'application/json'
          }
        }
      );

      if (response.data && Array.isArray(response.data)) {
        // Transform color data to match dropdown format
        // Backend returns: product_Color, product_Color_Code
        const colorsData = response.data.map(item => ({
          name: item.product_Color || '',
          value: item.product_Color || '',
          code: item.product_Color_Code || ''
        }));

        setAvailableColors(colorsData);
        logger.debug('✅ Colors loaded for material:', materialValue, colorsData.length);

        // AUTO-SELECT: If only one color is available, select it automatically
        if (colorsData.length === 1) {
          const singleColor = colorsData[0].value;
          logger.debug('🎨 Auto-selecting single available color:', singleColor);
          setColor(singleColor);
          setIsSingleColorMaterial(true);
          // Don't auto-focus - let user navigate manually with Tab
        } else {
          // Multiple colors available
          setIsSingleColorMaterial(false);
          // Don't reset color - preserve existing selection
          // Color will be empty for new drawings, or preserved for edit mode
        }
      }
    } catch (error) {
      logger.error('❌ Failed to load colors:', error);
      setAvailableColors([]);
      setIsSingleColorMaterial(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // DERIVED VALUES
  // ═══════════════════════════════════════════════════════════════

  // Get the database-ready material value from materialMap (for pricing API and DB storage)
  const dbMaterialValue = useMemo(() => (materialMap[material]?.db || material || '').trim(), [material, materialMap]);

  // ═══════════════════════════════════════════════════════════════
  // SPLIT PREVIEW DATA CALCULATION
  // ═══════════════════════════════════════════════════════════════

  const splitPreviewData = useMemo(() => {
    // Only show split preview for taper drawings when split is enabled
    const shouldShowSplit = isTaper && useSplit && splitInto && Number(splitInto) > 1;

    if (!shouldShowSplit) {
      return null;
    }

    // Check if farGirth and nearGirth are valid
    if (!farGirth || !nearGirth || farGirth === nearGirth) {
      return null;
    }

    const splitCount = Number(splitInto);
    const farTotal = farGirth;
    const nearTotal = nearGirth;
    const actualLength = Number(length) * 1000 || 1000; // Convert to mm
    const totalLength = actualLength;
    const unitLength = Math.round(totalLength / splitCount);

    const segments = [];

    // First add the original FAR drawing
    segments.push({
      segment: 'FAR',
      length: Math.round(totalLength),
      far: farTotal,
      near: farTotal,
      isOriginal: true,
      type: 'far'
    });

    // Add split pieces
    const differentiator = (nearTotal - farTotal) / splitCount;

    for (let i = 1; i <= splitCount; i++) {
      const pieceGirth = Math.round(farTotal + i * differentiator);

      segments.push({
        segment: i,
        length: unitLength,
        far: pieceGirth,
        near: pieceGirth,
        isOriginal: false,
        type: 'split',
        isSingleGirth: true,
        interpolationRatio: i / splitCount
      });
    }

    logger.debug('splitPreviewData segments:', segments);
    return segments;
  }, [isTaper, useSplit, splitInto, farGirth, nearGirth, length]);

  // Calculate dynamic split canvas dimensions based on drawing's aspect ratio AND screen size
  // This must be calculated FIRST so splitReferenceScale can use these dimensions
  const splitCanvasDimensions = useMemo(() => {
    // Responsive base dimensions based on screen width
    // Smaller laptops (~1366px): use smaller canvas
    // Medium screens (~1400-1600px): use standard canvas
    // Larger desktops (1600px+): use larger canvas
    // Uses screenWidth state which updates on resize
    let baseWidth, baseHeight;

    if (screenWidth < 1400) {
      // Smaller laptops - scale down
      baseWidth = 450;
      baseHeight = 400;
    } else if (screenWidth >= 1600) {
      // Larger desktops - scale up slightly
      baseWidth = 600;
      baseHeight = 500;
    } else {
      // Standard screens
      baseWidth = 550;
      baseHeight = 470;
    }

    if (!isTaper || !template) return { width: baseWidth, height: baseHeight, points: null };

    const farLengths = template.farLengths || template.lengths || [];
    const angles = template.angles || [];
    const direction = template.direction || 'Right';
    const firstSegmentAngle = template.firstSegmentAngle;
    const startFoldLength = template.startFoldLength || 0;
    const endFoldLength = template.endFoldLength || 0;

    if (!farLengths.length) return { width: baseWidth, height: baseHeight, points: null };

    // For tall drawings with many segments (like Monument), increase base height
    const segmentCount = farLengths.length;
    if (segmentCount > 10) {
      baseHeight = Math.max(baseHeight, 800); // Increase base height for complex drawings
    }

    // Convert fold types
    const convertedStartFoldType = convertFoldType(template.startFoldType, template.startFoldDirection, false);
    const convertedEndFoldType = convertFoldType(template.endFoldType, template.endFoldDirection, true);

    // Calculate points to get bounding box
    const points = calculatePoints(
      farLengths.map(Number),
      angles,
      direction,
      template.segmentAbsoluteAngles || [],
      [],
      false,
      { x: 0, y: 0 },
      firstSegmentAngle,
      convertedStartFoldType,
      startFoldLength,
      convertedEndFoldType,
      endFoldLength
    );

    // Calculate bounding box
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const drawingWidth = maxX - minX;
    const drawingHeight = maxY - minY;

    // Calculate how much canvas space the drawing actually needs
    // Use a consistent padding factor for calculations
    const paddingFactor = 0.9;
    const effectiveBaseWidth = baseWidth * paddingFactor;
    const effectiveBaseHeight = baseHeight * paddingFactor;

    // Calculate needed multipliers based on actual drawing extent
    const neededWidthMultiplier = drawingWidth > 0 ? Math.max(1, drawingWidth / effectiveBaseWidth) : 1;
    const neededHeightMultiplier = drawingHeight > 0 ? Math.max(1, drawingHeight / effectiveBaseHeight) : 1;

    // Apply multipliers with caps to prevent excessively large canvases
    // Allow up to 4x width and 8x height for step-down drawings
    const widthMultiplier = Math.min(neededWidthMultiplier, 4.0);
    const heightMultiplier = Math.min(neededHeightMultiplier, 8.0);

    // Only adjust if needed (multiplier > 1.1 to avoid tiny adjustments)
    if (widthMultiplier > 1.1 || heightMultiplier > 1.1) {
      const newWidth = Math.round(baseWidth * Math.max(1, widthMultiplier));
      const newHeight = Math.round(baseHeight * Math.max(1, heightMultiplier));
      logger.debug('🎯 Split canvas dimensions (adjusted):', {
        width: newWidth,
        height: newHeight,
        drawingWidth,
        drawingHeight,
        widthMultiplier,
        heightMultiplier,
        screenWidth
      });
      return { width: newWidth, height: newHeight, points, farLengths: farLengths.map(Number) };
    }

    return { width: baseWidth, height: baseHeight, points, farLengths: farLengths.map(Number) };
  }, [isTaper, template, screenWidth]);

  // FIXED: Calculate reference scale based on FAR lengths (the largest dimensions)
  // This ensures consistent label positioning across all split pieces
  // Uses the dynamic dimensions from splitCanvasDimensions
  const splitReferenceScale = useMemo(() => {
    if (!isTaper || !template || !splitCanvasDimensions.points) return null;

    // Calculate scale using dynamic dimensions
    // MUST match parameters used in splitPreviewGenerator.js getScale call
    const { scale } = getScale(
      splitCanvasDimensions.points,
      splitCanvasDimensions.width,
      splitCanvasDimensions.height,
      50,  // Must match splitPreviewGenerator.js padding
      1,
      { x: 0, y: 0 },
      0.7, // Must match splitPreviewGenerator.js shrinkFactor
      splitCanvasDimensions.farLengths,
      false,
      null
    );

    logger.debug('🎯 Split reference scale calculated with dynamic dimensions:', { scale, width: splitCanvasDimensions.width, height: splitCanvasDimensions.height });
    return scale;
  }, [isTaper, template, splitCanvasDimensions]);

  // Calculate dynamic dimensions for non-split FAR/NEAR preview (when split is not enabled)
  // Uses GIRTH-BASED height calculation with aspect ratio check
  const previewDimensions = useMemo(() => {
    // Base width for all screen sizes
    const baseWidth = 1200;

    if (!template) return { width: baseWidth, height: 700 };

    try {
      const farLengths = template.farLengths || template.lengths || [];
      const angles = template.angles || [];
      const direction = template.direction || 'Right';
      const firstSegmentAngle = template.firstSegmentAngle;

      if (farLengths.length === 0) return { width: baseWidth, height: 700 };

      // Calculate actual drawing dimensions to check aspect ratio
      const convertedStartFoldType = convertFoldType(template.startFoldType, template.startFoldDirection, false);
      const convertedEndFoldType = convertFoldType(template.endFoldType, template.endFoldDirection, true);

      const points = calculatePoints(
        farLengths.map(Number),
        angles,
        direction,
        [],
        [],
        false,
        { x: 0, y: 0 },
        firstSegmentAngle,
        convertedStartFoldType,
        template.startFoldLength || 0,
        convertedEndFoldType,
        template.endFoldLength || 0
      );

      let isWideDrawing = false;
      if (points && points.length > 0) {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const drawingWidth = Math.max(...xs) - Math.min(...xs);
        const drawingHeight = Math.max(...ys) - Math.min(...ys);
        // Only consider "wide" if width is significantly greater than height (ratio > 2)
        // This prevents diagonal step drawings from being classified as wide
        const aspectRatio = drawingHeight > 0 ? drawingWidth / drawingHeight : 1;
        isWideDrawing = aspectRatio > 2;
      }

      const girthValue = farLengths.reduce((sum, len) => sum + (Number(len) || 0), 0);
      const segmentCount = farLengths.length;

      let finalHeight;
      if (isWideDrawing) {
        // WIDE drawings - use smaller heights
        if (girthValue <= 500) {
          finalHeight = 500; // Small/medium wide
        } else if (girthValue <= 1000) {
          finalHeight = 550; // Large wide
        } else {
          finalHeight = 600; // Very large wide
        }
      } else {
        // TALL drawings - use girth + segment count
        if (girthValue <= 250) {
          finalHeight = 750; // Small parts
        } else if (girthValue <= 500) {
          finalHeight = 850; // Medium parts
        } else if (girthValue <= 1000) {
          // For drawings with many bends (like Monument), increase height
          if (segmentCount > 10) {
            finalHeight = 1250; // Complex large parts (16+ bends)
          } else {
            finalHeight = 950; // Simple large parts
          }
        } else {
          if (segmentCount > 10) {
            finalHeight = 1600; // Complex large drawings
          } else if (segmentCount > 5) {
            finalHeight = 1200; // Medium complex large drawings
          } else {
            finalHeight = 950; // Simple large drawings
          }
        }
      }

      logger.debug('🎯 Preview dimensions:', {
        girth: girthValue,
        segmentCount,
        isWideDrawing,
        finalWidth: baseWidth,
        finalHeight
      });

      return { width: baseWidth, height: finalHeight };
    } catch (error) {
      logger.warn('Error calculating preview dimensions:', error);
      return { width: baseWidth, height: 700 };
    }
  }, [template, template?.farLengths, template?.lengths, template?.angles, template?.direction, screenWidth]);

  // Handle split label offset changes from draggable labels
  const handleSplitLabelOffsetsChange = useCallback((splitIndex, offsets) => {
    setSplitLabelOffsets(prev => ({
      ...prev,
      [splitIndex]: offsets
    }));
    logger.debug('Split label offsets updated:', { splitIndex, offsets });
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // ROW MANAGEMENT (NO API CALLS - JUST STATE)
  // ═══════════════════════════════════════════════════════════════

  // Cancel - hide form and reset
  const handleCancel = () => {
    setShowEntryForm(false);
    setCancelVisible(false);

    // Clear form fields
    setQuantity('');
    setLength('');
    setTag('');
    // setUseSplit(false);  \\ commented to fix preview drawing in split mode
    // setSplitInto('');
    setAdditionalRows([]);
    setEditingRowId(null); // Clear editing state
    setEditingSwiJobId(null); // Clear editing swiJobId
    setHasAutoPopulatedTag(false); // Reset so tag can be auto-populated again


    logger.debug('Cancelled - form hidden, fields cleared');
  };

  // Edit saved row - populate form with row data
  const handleEditSavedRow = (index) => {
    if (savedRows.length === 0) return;

    const editRow = savedRows[index];
    logger.debug('Editing saved row:', editRow);

    // Skip price fetch when loading data from saved row (prevents price being overwritten)
    loadingFromSavedRowRef.current = true;
    // Reset the ref after state updates have been processed
    setTimeout(() => { loadingFromSavedRowRef.current = false; }, 500);

    // EDIT MODE FIX: Track the _id and swiJobId of the row being edited in main form
    setEditingRowId(editRow._id);
    setEditingSwiJobId(editRow.swiJobId || null);

    // Set material, color, and unitPrice from saved row
    setMaterial(editRow.material);
    setColor(editRow.color);
    setUnitPrice(editRow.unitPrice || '');

    // Check if row has split
    const hasSplit = editRow.splitInto && Number(editRow.splitInto) > 1;

    // If split exists, show ORIGINAL values (before split), not split values
    let displayLength, displayQuantity;

    if (hasSplit) {
      // Row was split - restore original values
      const splitCount = Number(editRow.splitInto);
      const perPieceLengthMm = Number(editRow.length);
      const storedSplitLengthMm = Number(editRow.splitLength) || 0;

      // Handle both old data (splitLength = per-piece) and new data (splitLength = total)
      // Old bug: splitLength was saved as per-piece length (same as length)
      // New fix: splitLength is saved as total length (length * splitInto)
      // Detection: if splitLength <= length, it's old data
      if (storedSplitLengthMm > 0 && storedSplitLengthMm > perPieceLengthMm) {
        // New data: splitLength is the total original length
        displayLength = storedSplitLengthMm / 1000;
      } else {
        // Old data or no splitLength: calculate original from per-piece * splitInto
        displayLength = (perPieceLengthMm * splitCount) / 1000;
      }
      displayQuantity = Math.round(editRow.quantity / splitCount);  // Original pieces
    } else {
      // Not split - use values as is
      displayLength = Number(editRow.length) / 1000;
      displayQuantity = editRow.quantity;
    }

    setQuantity(displayQuantity);
    setLength(displayLength);
    setTag(editRow.tag);
    setUseSplit(hasSplit);
    setSplitInto(hasSplit ? editRow.splitInto : '');

    // Convert remaining savedRows to additionalRows format
    const rowsToEdit = savedRows.filter((_, i) => i !== index).map((row, idx) => {
      const rowHasSplit = row.splitInto && Number(row.splitInto) > 1;
      let displayLength, displayPieces;

      if (rowHasSplit) {
        const splitCount = Number(row.splitInto);
        const perPieceLengthMm = Number(row.length);
        const storedSplitLengthMm = Number(row.splitLength) || 0;

        // Handle both old data and new data (same logic as main row)
        if (storedSplitLengthMm > 0 && storedSplitLengthMm > perPieceLengthMm) {
          displayLength = storedSplitLengthMm / 1000;
        } else {
          displayLength = (perPieceLengthMm * splitCount) / 1000;
        }
        displayPieces = Math.round(row.quantity / splitCount);
      } else {
        displayLength = Number(row.length) / 1000;
        displayPieces = row.quantity;
      }

      return {
        slNo: idx + 2,
        length: displayLength,
        pieces: displayPieces,
        tag: row.tag,
        _id: row._id,
        splitInto: row.splitInto || null,
        splitLength: row.splitLength || null,
        swiJobId: row.swiJobId || null // Preserve swiJobId for backend matching
      };
    });

    setAdditionalRows(rowsToEdit);

    // IMPORTANT: Show the form when editing
    setShowEntryForm(true);
    setCancelVisible(true);

    logger.debug('Loaded row to form for editing, showing form');
  };

  // Delete saved row - LOCAL STATE ONLY, actual deletion happens on Finish
  const handleDeleteSavedRow = async (index) => {
    const row = savedRows[index];
    if (!row._id) {
      logger.error('Cannot delete row without ID');
      return;
    }

    try {
      const confirmed = await swal.fire({
        text: 'Delete this material row?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel'
      });

      if (!confirmed.isConfirmed) return;

      // Track row ID for deletion on Finish (NO immediate axios.delete)
      setRowsToDelete(prev => [...prev, row._id]);
      logger.info(`[handleDeleteSavedRow] Marked row ${row._id} for deletion (pending Finish)`);

      // Calculate filtered rows BEFORE setting state (setState is async)
      const updatedRows = savedRows.filter((_, i) => i !== index);
      // Update state for UI
      setSavedRows(updatedRows);

      // Also remove from additionalRows if the deleted row exists there (by _id)
      const deletedRowId = row._id;
      const remainingAdditionalRows = additionalRows.filter(r => r._id !== deletedRowId);

      // If the deleted row is the one in main form, handle form update
      if (deletedRowId === editingRowId) {
        // Check if there's exactly one row left in additionalRows - auto-populate main form
        if (remainingAdditionalRows.length === 1) {
          const lastRow = remainingAdditionalRows[0];
          setEditingRowId(lastRow._id);
          setEditingSwiJobId(lastRow.swiJobId || null);
          setQuantity(lastRow.pieces);
          setLength(lastRow.length);
          setTag(lastRow.tag);
          setUseSplit(lastRow.splitInto && Number(lastRow.splitInto) > 1);
          setSplitInto(lastRow.splitInto || '');
          setAdditionalRows([]); // Clear additionalRows since we moved it to main form
          logger.info('[handleDeleteSavedRow] Auto-populated main form with last remaining row');
        } else {
          // Multiple rows or no rows left - just clear main form
          setEditingRowId(null);
          setEditingSwiJobId(null);
          setQuantity('');
          setLength('');
          setTag('');
          setUseSplit(false);
          setSplitInto('');
          setAdditionalRows(remainingAdditionalRows);
          logger.info('[handleDeleteSavedRow] Cleared main form - deleted row was being edited');
        }
      } else {
        // Deleted row was not in main form, just update additionalRows
        setAdditionalRows(remainingAdditionalRows);
      }

      logger.debug('Row marked for deletion (will be deleted on Finish)');

      swal.fire({
        text: 'Row will be deleted when you click Finish.',
        icon: 'info',
        confirmButtonText: 'OK'
      });
    } catch (error) {
      logger.error('Failed to mark row for deletion:', error);
      swal.fire({
        text: 'Failed to delete the row.',
        icon: 'error'
      });
    }
  };

  // Bulk delete selected rows - LOCAL STATE ONLY, actual deletion happens on Finish
  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) {
      swal.fire({
        text: 'No rows selected',
        icon: 'info'
      });
      return;
    }

    try {
      const confirmed = await swal.fire({
        text: `Delete ${selectedRows.length} selected row(s)?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel'
      });

      if (!confirmed.isConfirmed) return;

      // Collect _ids of deleted rows for tracking (NO immediate axios.delete)
      const deletedRowIds = selectedRows.map(i => savedRows[i]._id);

      // Track row IDs for deletion on Finish
      setRowsToDelete(prev => [...prev, ...deletedRowIds]);
      logger.info(`[handleBulkDelete] Marked ${deletedRowIds.length} rows for deletion (pending Finish)`);

      // Calculate filtered rows BEFORE setting state (setState is async)
      const updatedRows = savedRows.filter((_, i) => !selectedRows.includes(i));
      // Update state for UI
      setSavedRows(updatedRows);

      // Calculate remaining additionalRows before setting state
      const remainingAdditionalRows = additionalRows.filter(r => !deletedRowIds.includes(r._id));

      // If the main form row is being deleted, handle form update
      if (editingRowId && deletedRowIds.includes(editingRowId)) {
        // Check if there's exactly one row left in additionalRows - auto-populate main form
        if (remainingAdditionalRows.length === 1) {
          const lastRow = remainingAdditionalRows[0];
          setEditingRowId(lastRow._id);
          setEditingSwiJobId(lastRow.swiJobId || null);
          setQuantity(lastRow.pieces);
          setLength(lastRow.length);
          setTag(lastRow.tag);
          setUseSplit(lastRow.splitInto && Number(lastRow.splitInto) > 1);
          setSplitInto(lastRow.splitInto || '');
          setAdditionalRows([]); // Clear additionalRows since we moved it to main form
          logger.info('[handleBulkDelete] Auto-populated main form with last remaining row');
        } else {
          // Multiple rows or no rows left - just clear main form
          setEditingRowId(null);
          setEditingSwiJobId(null);
          setQuantity('');
          setLength('');
          setTag('');
          setUseSplit(false);
          setSplitInto('');
          setAdditionalRows(remainingAdditionalRows);
          logger.info('[handleBulkDelete] Cleared main form - deleted row was being edited');
        }
      } else {
        // Deleted rows were not in main form, just update additionalRows
        setAdditionalRows(remainingAdditionalRows);
      }

      // Clear selection
      setSelectedRows([]);

      logger.debug('Rows marked for deletion (will be deleted on Finish)');

      swal.fire({
        text: `${deletedRowIds.length} row(s) will be deleted when you click Finish.`,
        icon: 'info',
        confirmButtonText: 'OK'
      });
    } catch (error) {
      logger.error('Bulk delete error:', error);
      swal.fire({
        text: 'Failed to mark rows for deletion',
        icon: 'error'
      });
    }
  };

  // Add 5 empty rows for bulk entry
  const handleAddRows = () => {
    const currentMaxSlNo = additionalRows.length > 0
      ? Math.max(...additionalRows.map(r => r.slNo))
      : 0;

    // Use the main form's tag for all new rows
    const mainFormTag = tag || '';

    const newRows = [];
    for (let i = 1; i <= 5; i++) {
      newRows.push({
        slNo: currentMaxSlNo + i,
        length: '',
        pieces: '',
        tag: mainFormTag
      });
    }

    setAdditionalRows([...additionalRows, ...newRows]);
    logger.info('Added 5 new rows for bulk entry');
  };

  // Update additional row field
  const updateAdditionalRow = (slNo, field, value) => {
    setAdditionalRows(prev =>
      prev.map(row =>
        row.slNo === slNo ? { ...row, [field]: value } : row
      )
    );
  };

  // Remove additional row
  const removeAdditionalRow = (slNo) => {
    setAdditionalRows(prev => prev.filter(row => row.slNo !== slNo));
  };

  // Delete row from list (NO API call)
  const handleDeleteRow = (index) => {
    const updatedRows = materialRows.filter((_, i) => i !== index);
    setMaterialRows(updatedRows);
    logger.info(`Row ${index} deleted from list`);
  };

  // ═══════════════════════════════════════════════════════════════
  // FINISH - UNIFIED API CALL
  // ═══════════════════════════════════════════════════════════════

  const handleFinish = async (type = 'normal', from = 'finish', rowsOverride = null) => {
    logger.info('[handleFinish] Starting unified template creation, type:', type);

    // Use rowsOverride if provided (for delete operations where state hasn't updated yet)
    const effectiveSavedRows = rowsOverride !== null ? rowsOverride : savedRows;


    // Prevent duplicate submissions
    if (isProcessingFinish) {
      logger.debug('Already processing finish, ignoring duplicate call');
      return;
    }

    setIsProcessingFinish(true);

    try {
      // Validation
      if (!orderId) {
        swal.fire({
          text: 'Order ID not loaded yet.',
          icon: 'error'
        });
        setIsProcessingFinish(false);
        return;
      }

      if (!template) {
        swal.fire({
          text: 'Template data not loaded. Please go back and create the drawing first.',
          icon: 'error'
        });
        setIsProcessingFinish(false);
        return;
      }

      // Validate material and color are selected (mandatory fields)
      if (!material) {
        swal.fire({
          text: 'Please select a Material.',
          icon: 'error'
        });
        setIsProcessingFinish(false);
        return;
      }

      if (!color) {
        swal.fire({
          text: 'Please select a Color.',
          icon: 'error'
        });
        setIsProcessingFinish(false);
        return;
      }

      // Check for partial data in main form - if one field is filled but not the other
      // Skip this validation if there are already saved rows and user is not actively adding new row
      // (length may be set for split preview display in edit mode without quantity)
      const hasQuantity = quantity && String(quantity).trim() !== '';
      const hasLength = length && String(length).trim() !== '';
      const hasTag = tag && String(tag).trim() !== '';
      const isActivelyAddingRow = hasTag || (hasQuantity && hasLength); // User is filling the form

      if (isActivelyAddingRow || savedRows.length === 0) {
        if (hasQuantity && !hasLength) {
          swal.fire({
            text: 'Length is required when Pieces is entered.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }
        if (hasLength && !hasQuantity) {
          swal.fire({
            text: 'Pieces is required when Length is entered.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }
      }

      // Check if any saved rows have 0 price (material has no pricing configured)
      if (effectiveSavedRows.length > 0) {
        const rowsWithNoPrice = effectiveSavedRows.filter(row => !row.unitPrice || Number(row.unitPrice) <= 0);
        if (rowsWithNoPrice.length > 0) {
          swal.fire({
            title: 'Price Not Available',
            text: 'Price cannot be zero. Please contact the accounts team.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }
      }

      // Process additional rows into material rows format
      const allMaterialRows = [];

      // Check if main form has data but unit price is missing (material has no pricing)
      if (quantity && length && tag) {
        const price = parseFloat(unitPrice) || 0;
        if (price <= 0) {
          swal.fire({
            title: 'Price Not Available',
            text: 'Price cannot be zero. Please contact the accounts team.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }
      }

      // Add main form row if all fields are filled
      if (quantity && length && tag && unitPrice) {
        const qty = parseFloat(quantity);
        const len = parseFloat(length);
        const price = parseFloat(unitPrice);
        const splits = useSplit && splitInto ? parseInt(splitInto) : 0;

        // Validate split value
        if (useSplit && (!Number.isInteger(splits) || splits <= 0)) {
          swal.fire({
            text: 'Split Into must be a positive integer.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }

        // Validate pieces is a valid number
        if (isNaN(qty)) {
          swal.fire({
            text: 'Please enter a valid pieces value.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }

        // Validate pieces must be at least 1
        if (qty < 1) {
          swal.fire({
            text: 'Pieces must be at least 1.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }

        // Validate pieces must be a whole number (integer)
        if (!Number.isInteger(qty)) {
          swal.fire({
            text: 'Pieces must be a whole number (no decimals allowed).',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }

        // Validate length is a valid number
        if (isNaN(len)) {
          swal.fire({
            text: 'Please enter a valid length.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }

        // Validate length must be greater than 0
        if (len <= 0) {
          swal.fire({
            text: 'Length must be greater than 0.',
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }

        // Calculate per-piece length if split is enabled
        const perPieceLength = splits > 0 ? len / splits : len;
        // Note: Using 'girth' from component scope (useMemo) which handles both taper and normal drawings

        // Check if girth > 1200mm, then max length depends on material
        // GALVANISED: max 1.22m (1220mm), Others: max 1.203m (1203mm)
        if (girth > 1200) {
          const isGalvanised = material?.toUpperCase()?.includes('GALVANISED');
          const maxLength = isGalvanised ? 1.22 : 1.203;
          if (perPieceLength > maxLength && girth > (isGalvanised ? 1220 : 1203)) {
            swal.fire({
              text: `When girth exceeds 1200mm, maximum length per piece is ${maxLength} meters${isGalvanised ? ' for GALVANISED' : ''}. ${splits > 1 ? `(${len}m ÷ ${splits} = ${perPieceLength.toFixed(2)}m per piece)` : ''}`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
        }

        // Check if per-piece length exceeds 8.2 meters (8200mm)
        if (perPieceLength > 8.2) {
          swal.fire({
            text: `Length per piece cannot exceed 8.2 meters. ${splits > 1 ? `(${len}m ÷ ${splits} = ${perPieceLength.toFixed(2)}m per piece)` : ''}`,
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }

        if (qty > 0 && len > 0 && price > 0) {
          const colorObj = availableColors.find(c => c.value === color);

          // Calculate final values based on split
          // If split: finalPieces = quantity × splits, finalLength = length ÷ splits
          const finalPieces = splits > 0 ? qty * splits : qty;
          const finalLenPerPieceM = splits > 0 ? len / splits : len;
          const finalLenPerPieceMm = Math.round(finalLenPerPieceM * 1000); // Convert meters to millimeters

          // For overgirth (girth > 1200): qty = pieces × girth (in meters)
          // For normal: qty = pieces × length (in meters)
          
          const qtyMultiplierRaw = girth > 1200 ? (girth / 1000) : finalLenPerPieceM;
          const qtyMultiplier = Math.max(1, qtyMultiplierRaw);

          // EDIT MODE FIX: Use editingRowId and editingSwiJobId for correct matching
          // These are set in handleEditSavedRow when user clicks Edit
          const mainRowId = editingRowId || null;
          const mainRowSwiJobId = editingSwiJobId || null;

          allMaterialRows.push({
            _id: mainRowId, // Preserve ID for edit mode
            material: dbMaterialValue, // Use materialMap db value for consistency
            color: colorObj?.name || color,
            quantity: finalPieces,
            length: finalLenPerPieceMm, // Store in millimeters (backend expects mm)
            girth: girth || 0, // Store calculated girth value (from useMemo)
            tag: tag.trim(),
            unitPrice: price,
            extPrice: parseFloat((finalPieces * qtyMultiplier * price).toFixed(2)),
            splitInto: splits > 0 ? splits : null,
            splitLength: splits > 0 ? Math.round(len * 1000) : null, // Store TOTAL original length in mm (not divided)
            swiJobId: mainRowSwiJobId, // Preserve swiJobId for backend matching
            thickness: materialMap[material]?.thickness || null // Thickness from Material Master
          });
        }
      }

      // Process additional rows
      const colorObjForAdditional = availableColors.find(c => c.value === color);
      const basePrice = parseFloat(unitPrice) || 0;

      // Check if additional rows have data but unit price is missing
      const hasAdditionalRowsWithData = additionalRows.some(row =>
        row.pieces && row.length && row.tag
      );
      if (hasAdditionalRowsWithData && basePrice <= 0) {
        swal.fire({
          title: 'Price Not Available',
          text: 'Price cannot be zero. Please contact the accounts team.',
          icon: 'warning'
        });
        setIsProcessingFinish(false);
        return;
      }

      // Validate additional rows - check for incomplete rows (partial data)
      for (const row of additionalRows) {
        const hasPieces = row.pieces !== undefined && row.pieces !== null && String(row.pieces).trim() !== '';
        const hasLength = row.length !== undefined && row.length !== null && String(row.length).trim() !== '';

        // If pieces is filled but length is not, show error
        if (hasPieces && !hasLength) {
          swal.fire({
            text: `Row #${row.slNo}: Length is required when Pieces is entered.`,
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }

        // If length is filled but pieces is not, show error
        if (hasLength && !hasPieces) {
          swal.fire({
            text: `Row #${row.slNo}: Pieces is required when Length is entered.`,
            icon: 'error'
          });
          setIsProcessingFinish(false);
          return;
        }
      }

      // Validate additional rows for length and pieces constraints
      for (const row of additionalRows) {
        const piecesVal = parseFloat(row.pieces);
        const lengthM = parseFloat(row.length);
        // Only validate rows that have valid data (will be processed below)
        if (row.pieces && row.length && row.tag) {
          // Validate pieces is a valid number
          if (isNaN(piecesVal)) {
            swal.fire({
              text: `Row #${row.slNo}: Please enter a valid pieces value.`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
          // Validate pieces must be at least 1
          if (piecesVal < 1) {
            swal.fire({
              text: `Row #${row.slNo}: Pieces must be at least 1.`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
          // Validate pieces must be a whole number (integer)
          if (!Number.isInteger(piecesVal)) {
            swal.fire({
              text: `Row #${row.slNo}: Pieces must be a whole number (no decimals allowed).`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
          // Validate length is a valid number
          if (isNaN(lengthM)) {
            swal.fire({
              text: `Row #${row.slNo}: Please enter a valid length.`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
          // Validate length must be greater than 0
          if (lengthM <= 0) {
            swal.fire({
              text: `Row #${row.slNo}: Length must be greater than 0.`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
          // Check girth > 1200mm constraint
          // GALVANISED: max 1.22m (1220mm), Others: max 1.203m (1203mm)
          if (girth > 1200) {
            const isGalvanised = row.material?.toUpperCase()?.includes('GALVANISED');
            const maxLength = isGalvanised ? 1.22 : 1.203;
            if (lengthM > maxLength && girth > (isGalvanised ? 1220 : 1203)) {
              swal.fire({
                text: `Row #${row.slNo}: When girth exceeds 1200mm, maximum length per piece is ${maxLength} meters${isGalvanised ? ' for GALVANISED' : ''}. Current: ${lengthM}m.`,
                icon: 'error'
              });
              setIsProcessingFinish(false);
              return;
            }
          }
          // Check max 8.2m length
          if (lengthM > 8.2) {
            swal.fire({
              text: `Row #${row.slNo}: Length per piece cannot exceed 8.2 meters. Current: ${lengthM}m.`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
        }
      }

      additionalRows.forEach(row => {
        const pieces = parseFloat(row.pieces);
        const lengthM = parseFloat(row.length); // Length in meters
        const lengthMm = Math.round(lengthM * 1000); // Convert to millimeters

        // For overgirth (girth > 1200): qty = pieces × girth (in meters)
        // For normal: qty = pieces × length (in meters)
        const qtyMultiplier = girth > 1200 ? (girth / 1000) : lengthM;
        const finalQtyMultiplier = Math.max(1, qtyMultiplier);

        if (pieces > 0 && lengthM > 0 && basePrice > 0 && row.tag) {
          allMaterialRows.push({
            _id: row._id, // EDIT MODE FIX: Preserve _id from additionalRow (set in handleEditSavedRow)
            material: dbMaterialValue, // Use materialMap db value for consistency
            color: colorObjForAdditional?.name || color,
            quantity: pieces,
            length: lengthMm, // Store in millimeters (backend expects mm)
            girth: girth || 0, // Store calculated girth value (from useMemo)
            tag: row.tag.trim(),
            unitPrice: basePrice,
            extPrice: parseFloat((pieces * finalQtyMultiplier * basePrice).toFixed(2)), // For overgirth: use girth, else use length
            splitInto: row.splitInto || null,
            splitLength: row.splitLength || null,
            swiJobId: row.swiJobId || null, // Preserve swiJobId for backend matching
            thickness: materialMap[material]?.thickness || null // Thickness from Material Master
          });
        }
      });

      // EDIT MODE FIX: Always include saved rows that are NOT being edited
      // This prevents existing jobs from being deleted as "unused" when adding new rows
      // Filter out the row being edited (it's already in allMaterialRows from the main form)
      if (isEditMode && effectiveSavedRows.length > 0) {
        const rowsNotBeingEdited = effectiveSavedRows.filter(row => row._id !== editingRowId);
        logger.info('[handleFinish] Including saved rows not being edited:', rowsNotBeingEdited.length);

        rowsNotBeingEdited.forEach((row) => {
          // Check if this row is already in allMaterialRows (to avoid duplicates)
          const alreadyInRows = allMaterialRows.some(r => r._id === row._id);
          if (!alreadyInRows) {
            allMaterialRows.push({
              _id: row._id,
              material: row.material,
              color: row.color,
              quantity: row.quantity,
              length: row.length,
              girth: girth || row.girth || 0, // Use current calculated girth, fallback to stored value
              tag: row.tag,
              unitPrice: row.unitPrice,
              extPrice: row.extPrice,
              splitInto: row.splitInto || null,
              splitLength: row.splitLength || null,
              swiJobId: row.swiJobId || null,
              thickness: row.thickness || materialMap[row.material]?.thickness || null
            });
          }
        });
      }

      // EDIT MODE: Handle case where only saved rows exist (no new form data)
      if (allMaterialRows.length === 0 && effectiveSavedRows.length > 0) {
        logger.info('[handleFinish] Using existing saved rows:', effectiveSavedRows.length);

        // Validate saved rows for pieces and length constraints
        for (const row of effectiveSavedRows) {
          const piecesVal = row.quantity;
          const lengthM = row.length / 1000; // Convert mm to meters

          // Validate pieces must be at least 1
          if (piecesVal < 1) {
            swal.fire({
              text: `Row "${row.tag}": Pieces must be at least 1.`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
          // Validate pieces must be a whole number (integer)
          if (!Number.isInteger(piecesVal)) {
            swal.fire({
              text: `Row "${row.tag}": Pieces must be a whole number (no decimals allowed).`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
          // Validate length must be greater than 0
          if (lengthM <= 0) {
            swal.fire({
              text: `Row "${row.tag}": Length must be greater than 0.`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
          // Check girth > 1200mm constraint
          // GALVANISED: max 1.22m (1220mm), Others: max 1.203m (1203mm)
          if (girth > 1200) {
            const isGalvanised = row.material?.toUpperCase()?.includes('GALVANISED');
            const maxLength = isGalvanised ? 1.22 : 1.203;
            if (lengthM > maxLength && girth > (isGalvanised ? 1220 : 1203)) {
              swal.fire({
                text: `Row "${row.tag}": When girth exceeds ${isGalvanised ? 1220 : 1203}mm, maximum length per piece is ${maxLength} meters${isGalvanised ? ' for GALVANISED' : ''}. Current: ${lengthM.toFixed(2)}m.`,
                icon: 'error'
              });
              setIsProcessingFinish(false);
              return;
            }
          }
          // Check max 8.2m length
          if (lengthM > 8.2) {
            swal.fire({
              text: `Row "${row.tag}": Length per piece cannot exceed 8.2 meters. Current: ${lengthM.toFixed(2)}m.`,
              icon: 'error'
            });
            setIsProcessingFinish(false);
            return;
          }
        }

        // Use saved rows - apply form's split values if split is enabled (for converting taper to split)
        const formSplits = useSplit && splitInto ? parseInt(splitInto) : 0;

        // Split can only be applied when there's exactly 1 row (user may have deleted other rows)
        const canApplySplit = formSplits > 0 && isTaper && effectiveSavedRows.length === 1;

        logger.info('[handleFinish] Saved rows block - Split check:', {
          useSplit,
          splitInto,
          formSplits,
          isTaper,
          effectiveSavedRowsLength: effectiveSavedRows.length,
          canApplySplit
        });

        effectiveSavedRows.forEach((row) => {
          if (canApplySplit) {
            // Apply split to the single remaining row
            // Recalculate values with split applied
            const originalLengthMm = row.splitLength || row.length; // Use splitLength if exists, else use length
            const originalLengthM = originalLengthMm / 1000;
            const originalQty = row.splitInto ? Math.round(row.quantity / Number(row.splitInto)) : row.quantity;

            const finalPieces = originalQty * formSplits;
            const finalLenPerPieceMm = Math.round((originalLengthM / formSplits) * 1000);
            const finalLenPerPieceM = finalLenPerPieceMm / 1000;
            const qtyMultiplier = girth > 1200 ? (girth / 1000) : finalLenPerPieceM;
            const finalQtyMultiplier = Math.max(1, qtyMultiplier);

            const rowData = {
              _id: row._id,
              material: row.material,
              color: row.color,
              quantity: finalPieces,
              length: finalLenPerPieceMm,
              girth: girth || 0, // Store calculated girth value (from useMemo)
              tag: row.tag,
              unitPrice: row.unitPrice,
              extPrice: parseFloat((finalPieces * finalQtyMultiplier * row.unitPrice).toFixed(2)),
              splitInto: formSplits,
              splitLength: Math.round(originalLengthM * 1000), // Store TOTAL original length in mm
              thickness: row.thickness || materialMap[row.material]?.thickness || null
            };
            logger.info('[handleFinish] Adding row with SPLIT applied:', {
              tag: rowData.tag,
              splitInto: rowData.splitInto,
              splitLength: rowData.splitLength,
              quantity: rowData.quantity,
              length: rowData.length
            });
            allMaterialRows.push(rowData);
          } else {
            allMaterialRows.push({
              _id: row._id,
              material: row.material,
              color: row.color,
              quantity: row.quantity,
              length: row.length,
              girth: girth || row.girth || 0, // Use current calculated girth, fallback to stored value
              tag: row.tag,
              unitPrice: row.unitPrice,
              extPrice: row.extPrice,
              splitInto: row.splitInto || null,
              splitLength: row.splitLength || null,
              thickness: row.thickness || materialMap[row.material]?.thickness || null
            });
          }
        });
      }

      // Check if we have any valid material rows
      if (allMaterialRows.length === 0) {
        swal.fire({
          text: 'Please fill in at least one material row (either main form or additional rows)',
          icon: 'error',
          title: 'Missing Information'
        });
        setIsProcessingFinish(false);
        return;
      }

      // Prepare template data
      const templateData = {
        // Basic info
        // Backend expects 'name' field. If no name provided, use orderNumber-timestamp as default
        // Handle empty string by providing fallback
        name: (template.geometryName && template.geometryName.trim()) ||
              (template.name && template.name.trim()) ||
              `${orderNumber}-${Date.now()}`,
        orderNumber: orderNumber,
        quotationNumber: template.quotationNumber || null,
        customerName: customerName,
        customerId: customerId,
        orderId: orderId,

        // Dimensions (length is stored per MaterialRow, not in template)
        width: template.width || 0,
        thickness: template.thickness || 0,

        // Material (from first row of allMaterialRows)
        material: allMaterialRows[0]?.material || '',
        colour: allMaterialRows[0]?.color || '',

        // Geometry
        fold1: template.fold1 || 0,
        fold2: template.fold2 || 0,
        fold3: template.fold3 || 0,
        fold4: template.fold4 || 0,
        angle1: template.angle1 || 0,
        angle2: template.angle2 || 0,
        angle3: template.angle3 || 0,
        angle4: template.angle4 || 0,

        // Advanced geometry
        lengths: template.lengths || [],
        angles: template.angles || [],
        farLengths: template.farLengths || [],
        farAngles: template.farAngles || [],
        nearLengths: template.nearLengths || [],
        nearAngles: template.nearAngles || [],

        // Flags
        flipH: template.flipH || false,
        flipV: template.flipV || false,
        isTaper: template.isTaper || false,
        squashFolds: template.squashFolds || 0,
        direction: template.direction || 'Right',
        firstSegmentAngle: template.firstSegmentAngle || 0,
        // CRITICAL: Include segmentAbsoluteAngles for correct SSF fold orientation in split drawings
        segmentAbsoluteAngles: template.segmentAbsoluteAngles || [],
        reverseColor: template.reverseColor || false,

        // Fold details
        startFoldType: template.startFoldType || '',
        startFoldDirection: template.startFoldDirection || '',
        startFoldLength: template.startFoldLength || 0,
        startFoldGap: template.startFoldGap || 0,
        endFoldType: template.endFoldType || '',
        endFoldDirection: template.endFoldDirection || '',
        endFoldLength: template.endFoldLength || 0,
        endFoldGap: template.endFoldGap || 0,
        girthStartFoldType: template.girthStartFoldType || '',
        girthEndFoldType: template.girthEndFoldType || '',

        // NOTE: Preview images are no longer stored in DB - drawings are generated dynamically from geometry data
        // preview, previewFar, previewNear fields removed to reduce payload size

        // User tracking
        createdBy: userManager.getUserId() || 'anonymous',
        modifiedBy: userManager.getUserId() || 'anonymous',

        // Label offsets
        labelOffsets: template.labelOffsets || {},

        // Split drawing label offsets (draggable labels on split pieces)
        splitLabelOffsets: splitLabelOffsets || {}
      };

      // Prepare SWI data
      const swiData = {
        orderNumber: orderNumber,
        customerName: customerName,
        deliveryDate: orderDetails?.order_delivery_date || orderDetails?.quote_delivery_date_str || new Date().toISOString().split('T')[0],
        enteredBy: userManager.getUserId() || 'anonymous',
        customerPoNumber: orderDetails?.order_customer_PO_number || orderDetails?.quote_customer_PO_number || localStorage.getItem('customerPoNumber') || '',
        area: '',
        suburb: ''
      };

      logger.info('[handleFinish] Calling API with:', {
        templateName: templateData.name,
        materialRowsCount: allMaterialRows.length,
        enableSWI: true,
        isEditMode,
        note: 'Preview images no longer sent - drawings generated dynamically'
      });

      // Debug: Log swiData including customerPoNumber
      logger.info('[handleFinish] SWI Data (PO Number):', {
        customerPoNumber: swiData.customerPoNumber,
        orderCustomerPO: orderDetails?.order_customer_PO_number,
        quoteCustomerPO: orderDetails?.quote_customer_PO_number,
        orderDetailsKeys: orderDetails ? Object.keys(orderDetails) : []
      });

      // ═══════════════════════════════════════════════════════════
      // EDIT MODE vs CREATE MODE
      // ═══════════════════════════════════════════════════════════

      let result;
      const templateId = template?._id || location.state?.templateId;

      if (isEditMode && templateId) {
        // ═══════════════════════════════════════════════════════════
        // EDIT MODE: First save material rows to MongoDB, then update SWI
        // ═══════════════════════════════════════════════════════════
        logger.info('[handleFinish] EDIT MODE - Updating template:', templateId);

        const token = tokenManager.getToken();

        // Step 0: Delete any rows marked for deletion (from handleDeleteSavedRow/handleBulkDelete)
        if (rowsToDelete.length > 0) {
          logger.info('[handleFinish] EDIT MODE - Deleting pending rows:', rowsToDelete.length);

          const deletePromises = rowsToDelete.map(rowId =>
            axios.delete(`${API_BASE_URL}/api/templates/material-rows/${rowId}`, {
              headers: {
                'x-access-token': token,
                'Authorization': `Bearer ${token}`
              }
            }).catch(err => {
              logger.warn(`[handleFinish] Failed to delete row ${rowId}:`, err.message);
              return null; // Don't fail the whole operation
            })
          );

          try {
            await Promise.all(deletePromises);
            logger.info('[handleFinish] Successfully deleted pending rows');
            // Clear the pending deletions
            setRowsToDelete([]);
          } catch (error) {
            logger.error('[handleFinish] Error deleting rows:', error);
            // Continue with save even if some deletes failed
          }
        }

        // Step 1: Save/update material rows to MongoDB if there's form data (PARALLEL for performance)
        if (allMaterialRows.length > 0) {
          logger.info('[handleFinish] EDIT MODE - Saving material rows to MongoDB (parallel):', allMaterialRows.length);

          // Create array of promises for parallel execution
          const savePromises = allMaterialRows.map(row => {
            if (row._id) {
              // Update existing row
              // Use row's split values directly (already set correctly in allMaterialRows)
              const updateData = {
                material: row.material,
                color: row.color,
                quantity: row.quantity,
                length: row.length,
                girth: row.girth || girth || 0, // Store calculated girth value
                tag: row.tag,
                unitPrice: row.unitPrice,
                extPrice: row.extPrice,
                splitInto: row.splitInto || null,
                splitLength: row.splitLength || null,
                thickness: row.thickness || null
              };
              logger.info('[handleFinish] PUT material-row:', {
                rowId: row._id,
                tag: updateData.tag,
                splitInto: updateData.splitInto,
                splitLength: updateData.splitLength
              });
              return axios.put(`${API_BASE_URL}/api/templates/material-rows/${row._id}`, updateData, {
                headers: { 'x-access-token': token }
              });
            } else {
              // Create new row in edit mode (when user adds additional rows)
              // Use row's split values directly (already set correctly in allMaterialRows)
              return axios.post(`${API_BASE_URL}/api/templates/${templateId}/material-rows`, {
                material: row.material,
                color: row.color,
                quantity: row.quantity,
                length: row.length,
                girth: row.girth || girth || 0, // Store calculated girth value
                tag: row.tag,
                unitPrice: row.unitPrice,
                extPrice: row.extPrice,
                splitInto: row.splitInto || null,
                splitLength: row.splitLength || null,
                thickness: row.thickness || null
              }, {
                headers: { 'x-access-token': token }
              });
            }
          });

          try {
            // Execute all requests in parallel
            await Promise.all(savePromises);
            logger.info('[handleFinish] Successfully saved all material rows in parallel');
          } catch (error) {
            logger.error('[handleFinish] Failed to save material rows:', error);
            throw new Error(`Failed to save material rows: ${error.message}`);
          }
        }

        // Step 2: Update template data AND SWI records
        logger.info('[handleFinish] EDIT MODE - Updating template and SWI records');

        result = await updateTemplateComplete({
          templateId,
          templateData: {
            // Update flip and orientation states
            flipH: template.flipH || false,
            flipV: template.flipV || false,
            reverseColor: template.reverseColor || false,
            firstSegmentAngle: template.firstSegmentAngle,
            // CRITICAL: Include segmentAbsoluteAngles for correct SSF fold orientation in split drawings
            segmentAbsoluteAngles: template.segmentAbsoluteAngles || [],
            labelOffsets: template.labelOffsets,
            // Split drawing label offsets (draggable labels on split pieces)
            splitLabelOffsets: splitLabelOffsets,
            
            // NOTE: Preview images are no longer stored in DB - drawings are generated dynamically from geometry data
            // Update preview images (regenerated in DrawingCanvas with current flip state)

            // Geometry data (for modifying lengths/angles during edit)
            lengths: template.lengths,
            angles: template.angles,
            farLengths: template.farLengths,
            farAngles: template.farAngles,
            nearLengths: template.nearLengths,
            nearAngles: template.nearAngles,
            direction: template.direction,
            isTaper: template.isTaper,
            girth: template.girth,
            // Fold details (for adding/modifying folds during edit)
            startFoldType: template.startFoldType || '',
            startFoldDirection: template.startFoldDirection || '',
            startFoldLength: template.startFoldLength || 0,
            startFoldGap: template.startFoldGap || 0,
            endFoldType: template.endFoldType || '',
            endFoldDirection: template.endFoldDirection || '',
            endFoldLength: template.endFoldLength || 0,
            endFoldGap: template.endFoldGap || 0,
            girthStartFoldType: template.girthStartFoldType || '',
            girthEndFoldType: template.girthEndFoldType || ''
          },
          swiData: {
            orderNumber: orderNumber,
            customerName: customerName,
            customerId: customerId,
            deliveryDate: swiData.deliveryDate,
            enteredBy: userManager.getUserId(),
            customerPoNumber: swiData.customerPoNumber
          }
        });

        // Signal DrawingDetailsTab to refresh
        if (orderId) {
          localStorage.setItem(`refreshDrawings_${orderId}`, 'true');
        }
      } else {
        // ═══════════════════════════════════════════════════════════
        // CREATE MODE: Create new template + SWI records
        // ═══════════════════════════════════════════════════════════

        // Always bypass duplicate check - same order can have same drawings multiple times
        const shouldBypassDuplicateCheck = true;

        logger.info('[handleFinish] CREATE MODE - Creating template with bypassDuplicateCheck:', shouldBypassDuplicateCheck, 'type:', type);

        result = await createTemplateComplete({
          templateData,
          materialRows: allMaterialRows,
          enableS3: false,
          enableSWI: true,
          swiData,
          bypassDuplicateCheck: shouldBypassDuplicateCheck
        });
      }

      // Handle result
      if (result.success) {
        logger.info('[handleFinish] SUCCESS!', {
          templateId: result.data.template?._id,
          materialRowsCount: result.data.materialRows?.length,
          swiJobsCount: result.data.swiJobIds?.length || 0
        });

        // Navigation logic based on button type (immediate navigation, no delay)
        const page = location.state?.previousPage || 'designers';
        const createdTemplate = result.data.template;
        const createdMaterialRows = result.data.materialRows;

        // Clear or keep order data based on type
        const shouldClearOrderData = type === undefined || type === 'normal';
        if (shouldClearOrderData) {
          localStorage.removeItem('orderNumber');
          localStorage.removeItem('customerId');
          localStorage.removeItem('customerName');
        }

        // Save order defaults for next drawing (always save when we have material/color, regardless of finish type)
        if (orderNumber && material && color) {
          const orderDefaultsKey = `orderDefaults_${orderNumber}`;
          const orderDefaults = {
            material,
            color,
            unitPrice: unitPrice || ''
          };
          localStorage.setItem(orderDefaultsKey, JSON.stringify(orderDefaults));
          logger.debug('Saved order defaults for next drawing:', orderDefaults);
        }


        switch (type) {
          case 'add-new':
            // Navigate to Template Library for next drawing
            localStorage.setItem('showTagSuggestionsOnLoad', 'true');
            // Always go back to My Library when adding new
            navigate('/template-library', {
              state: {
                orderNumber: orderNumber,
                customerName: customerName,
                customerId: customerId,
                orderId: orderId,
                deliveryDate: orderDetails?.order_delivery_date || orderDetails?.quote_delivery_date_str,
                enteredDate: orderDetails?.created_str || orderDetails?.created,
                partGroup: template?.partGroup,
                partClass: 'My Library',
                currentPage: page
              }
            });
            break;

          case 'copy':
            // Navigate to Drawing Canvas with copy of current geometry
            localStorage.setItem('showTagSuggestionsOnLoad', 'true');
            const copyState = {
              // Order info
              orderId,
              orderNumber,
              customerName,
              customerId,
              deliveryDate: orderDetails?.order_delivery_date || orderDetails?.quote_delivery_date_str,
              enteredDate: orderDetails?.created_str || orderDetails?.created,
              previousPage: page,

              // Template data (no templateId to force new creation)
              name: template?.geometryName || template?.name || '',
              direction: template?.direction,
              reverseColor: template?.reverseColor ?? false,
              isTaper: !!template?.isTaper,

              // Geometry data
              ...(template?.isTaper ? {
                farLengths: template.farLengths || [],
                farAngles: template.farAngles || [],
                nearLengths: template.nearLengths || [],
                nearAngles: template.nearAngles || []
              } : {
                lengths: template.lengths || [],
                angles: template.angles || []
              }),

              // NOTE: Preview images not passed - drawings generated dynamically from geometry

              // Fold data
              startFoldType: template?.startFoldType,
              startFoldDirection: template?.startFoldDirection,
              startFoldLength: template?.startFoldLength,
              startFoldGap: template?.startFoldGap,
              endFoldType: template?.endFoldType,
              endFoldDirection: template?.endFoldDirection,
              endFoldLength: template?.endFoldLength,
              endFoldGap: template?.endFoldGap,

              // Orientation
              firstSegmentAngle: template?.firstSegmentAngle,
              flipH: template?.flipH || false,
              flipV: template?.flipV || false,

              // Label offsets
              labelOffsets: template?.labelOffsets,

              // Flags
              isCopy: true,
              isNewDrawing: true
            };

            navigate(`/draw?copy=true`, { state: copyState });
            break;

          case 'flip':
            // Validate flip is only for taper drawings
            if (!template?.isTaper) {
              swal.fire({
                text: 'Flip operation is only available for tapered drawings',
                icon: 'error'
              });
              return;
            }

            // Navigate to Drawing Canvas with flipped geometry
            localStorage.setItem('showTagSuggestionsOnLoad', 'true');
            const flipState = {
              // Order info
              orderId,
              orderNumber,
              customerName,
              customerId,
              deliveryDate: orderDetails?.order_delivery_date || orderDetails?.quote_delivery_date_str,
              enteredDate: orderDetails?.created_str || orderDetails?.created,
              previousPage: page,

              // Template data (no templateId to force new creation)
              name: template?.geometryName || template?.name || '',
              direction: template?.direction,
              reverseColor: template?.reverseColor ?? false,
              isTaper: true,

              // Flipped geometry data
              farLengths: template.farLengths || [],
              farAngles: template.farAngles || [],
              nearLengths: template.nearLengths || [],
              nearAngles: template.nearAngles || [],

              // NOTE: Preview images not passed - drawings generated dynamically from geometry

              // Fold data
              startFoldType: template?.startFoldType,
              startFoldDirection: template?.startFoldDirection,
              startFoldLength: template?.startFoldLength,
              startFoldGap: template?.startFoldGap,
              endFoldType: template?.endFoldType,
              endFoldDirection: template?.endFoldDirection,
              endFoldLength: template?.endFoldLength,
              endFoldGap: template?.endFoldGap,

              // Orientation
              firstSegmentAngle: template?.firstSegmentAngle,
              flipH: template?.flipH || false,
              flipV: template?.flipV || false,

              // Label offsets
              labelOffsets: template?.labelOffsets,

              // Flags
              isFlip: true,
              isNewDrawing: true
            };

            navigate(`/draw?flip=true`, { state: flipState });
            break;

          default:
            // Normal finish - navigate to Order Details page
            if (from === 'finish') {
              navigate(`/${page}/${orderId}`, {
                state: {
                  activeTab: 'Flashing', // Opens Drawing Details tab
                  orderNumber: orderNumber,
                  customerName: customerName,
                  customerId: customerId,
                  orderId: orderId,
                  template: {
                    ...createdTemplate,
                    // NOTE: Preview images not passed - drawings generated dynamically from geometry
                    // Include geometry data
                    lengths: createdTemplate.lengths || template?.lengths || [],
                    angles: createdTemplate.angles || template?.angles || [],
                    farLengths: createdTemplate.farLengths || template?.farLengths,
                    nearLengths: createdTemplate.nearLengths || template?.nearLengths,
                    isTaper: createdTemplate.isTaper !== undefined ? createdTemplate.isTaper : template?.isTaper,
                    // Include material rows for Qty/Len/Tag rendering
                    materialRows: createdMaterialRows,
                    // Material info from first row
                    material: createdMaterialRows[0]?.material || '',
                    color: createdMaterialRows[0]?.color || '',
                    tag: createdMaterialRows[0]?.tag || '',
                    thickness: createdTemplate.thickness || '',
                    // Girth
                    girth: createdTemplate.width || template?.width || 0,
                    // Template IDs
                    _id: createdTemplate._id,
                    templateId: createdTemplate._id
                  }
                }
              });
            }
        }

      } else {
        // Handle errors
        logger.error('[handleFinish] Failed:', result);

        if (result.code === 'DUPLICATE_TEMPLATE') {
          swal.fire({
            text: 'A duplicate template was found. Do you want to use the existing template?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Use Existing',
            cancelButtonText: 'Create Anyway'
          }).then((response) => {
            if (response.isConfirmed && result.duplicates && result.duplicates.length > 0) {
              // Navigate to existing template with Drawing Details tab active
              const page = location.state?.previousPage || 'designers';
              navigate(`/${page}/${orderId}`, {
                state: {
                  activeTab: 'Flashing' // Opens Drawing Details tab
                }
              });
            }
            // If canceled, user can try again
          });
        } else if (result.code === 'VALIDATION_FAILED') {
          swal.fire({
            text: `Validation failed: ${result.errors?.join(', ') || result.message}`,
            icon: 'error'
          });
        } else if (result.code === 'NETWORK_ERROR') {
          swal.fire({
            title: 'No Internet Connection',
            html: `
              <p>Could not reach the server. Please check your internet connection and click Finish again.</p>
              <hr style="margin: 10px 0;">
              <small style="color: #666;"><b>Error Details:</b> ${result.message || 'No response from server'}</small>
            `,
            icon: 'error'
          });
        } else if (result.code === 'TRANSACTION_FAILED') {
          logger.error('[handleFinish] Transaction failed - Technical details:', result.message);
          swal.fire({
            title: 'Could Not Save to SWI',
            html: `
              <p>The data could not be sent to SWI system. Please click Finish again to retry.</p>
              <hr style="margin: 10px 0;">
              <small style="color: #666;"><b>Error Details:</b> ${result.message || 'Transaction failed'}</small>
            `,
            icon: 'error'
          });
        } else if (result.code === 'SWI_UPDATE_FAILED') {
          logger.error('[handleFinish] SWI update failed - Technical details:', result.message);
          swal.fire({
            title: 'SWI Sync Failed',
            html: `
              <p>Template was saved but SWI jobs could not be updated. Please click Finish again to retry.</p>
              <hr style="margin: 10px 0;">
              <small style="color: #666;"><b>Error Details:</b> ${result.message || 'SWI update failed'}</small>
            `,
            icon: 'error'
          });
        } else {
          logger.error('[handleFinish] Unknown error - Technical details:', result.message);
          swal.fire({
            title: 'Could Not Complete',
            html: `
              <p>Failed to save your changes. Please click Finish again to retry.</p>
              <hr style="margin: 10px 0;">
              <small style="color: #666;"><b>Error Details:</b> ${result.message || result.error || 'Unknown error'}</small>
            `,
            icon: 'error'
          });
        }
        // Reset processing state on error
        setIsProcessingFinish(false);
      }
      setIsProcessingFinish(false);

    } catch (error) {
      logger.error('[handleFinish] Unexpected error:', error);
      swal.fire({
        title: 'Could Not Complete',
        html: `
          <p>Failed to save your changes. Please click Finish again to retry.</p>
          <hr style="margin: 10px 0;">
          <small style="color: #666;"><b>Error Details:</b> ${error.message || 'Unexpected error occurred'}</small>
        `,
        icon: 'error'
      });
      setIsProcessingFinish(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="select-materials-page">
      {/* Loading Overlay */}
      {isProcessingFinish && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <CircularProgress size={60} style={{ color: '#fff' }} />
          <p style={{ color: '#fff', marginTop: '20px', fontSize: '18px' }}>Processing...</p>
        </div>
      )}

      {/* Header */}
      <DesignHeader customerName={customerName} orderNumber={orderNumber} orderDetails={orderDetails}/>

      {/* Split Layout - Canvas Left, Form Right */}
      <div className="split-layout">
        {/* Left Panel - Drawing Canvas */}
        <div className="left-panel">
          <Card className="canvas-card">
            {/* Show Far and Near previews for taper drawings OR split previews if split enabled */}
            {isTaper ? (
              <div className="taper-previews-container">
                {splitPreviewData && splitPreviewData.length > 0 ? (
                  /* SPLIT MODE: Show FAR + Split Pieces with old layout */
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '20px',
                    position: 'relative',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    overflowX: 'auto',
                    maxWidth: '100%',
                    width: '100%'
                  }}>
                    <div style={{ position: 'relative', paddingLeft: '50px', paddingRight: '50px', margin: '0 auto', minWidth: 'fit-content' }}>
                      {(() => {
                        const allDrawings = [];
                        const splitPieces = splitPreviewData.filter(s => !s.isOriginal);

                        // Add original FAR drawing first
                        allDrawings.push(
                          <div key="original-far" style={{
                            position: 'relative',
                            marginBottom: 15
                          }}>
                            <div className="single-drawing" style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              padding: '15px',
                              border: '1px solid #ccc',
                              borderRadius: '8px',
                              backgroundColor: '#f8f8f8',
                              minWidth: `${splitCanvasDimensions.width}px`,
                              maxWidth: `${splitCanvasDimensions.width}px`
                            }}>
                              <div style={{ fontWeight: 'normal', fontSize: 15, marginBottom: 10, color: '#333' }}>
                                Girth: {splitPreviewData.find(s => s.type === 'far')?.far || farGirth}mm
                              </div>
                              <div style={{ width: `${splitCanvasDimensions.width}px`, height: `${splitCanvasDimensions.height}px`, overflow: 'visible', position: 'relative' }}>
                                <SplitDrawingCanvas
                                  template={template}
                                  interpolationRatio={0}
                                  width={splitCanvasDimensions.width}
                                  height={splitCanvasDimensions.height}
                                  splitIndex={0}
                                  onLabelOffsetsChange={handleSplitLabelOffsetsChange}
                                  splitLabelOffsets={splitLabelOffsets[0] || {}}
                                  referenceScale={splitReferenceScale}
                                />
                              </div>
                            </div>

                            {/* Number circle 1 between FAR and first split */}
                            <div style={{
                              position: 'absolute',
                              left: '-22px',
                              bottom: '-22px',
                              zIndex: 10
                            }}>
                              <div style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                border: '2px solid #333',
                                backgroundColor: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '14px',
                                fontWeight: 'bold'
                              }}>
                                1
                              </div>
                            </div>
                          </div>
                        );

                        // Add split pieces with numbered circles
                        splitPieces.forEach((segment, index) => {
                          allDrawings.push(
                            <div key={segment.segment} style={{
                              position: 'relative',
                              marginBottom: index < splitPieces.length - 1 ? 15 : 0
                            }}>
                              <div className="single-drawing" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: '15px',
                                border: '1px solid #ccc',
                                borderRadius: '8px',
                                backgroundColor: '#f8f8f8',
                                minWidth: `${splitCanvasDimensions.width}px`,
                                maxWidth: `${splitCanvasDimensions.width}px`
                              }}>
                                <div style={{ fontWeight: 'normal', fontSize: 15, marginBottom: 10, color: '#333' }}>
                                  Girth: {segment.far || segment.near || 0}mm
                                </div>
                                <div style={{ width: `${splitCanvasDimensions.width}px`, height: `${splitCanvasDimensions.height}px`, overflow: 'visible', position: 'relative' }}>
                                  <SplitDrawingCanvas
                                    template={template}
                                    interpolationRatio={segment.interpolationRatio || 0.5}
                                    width={splitCanvasDimensions.width}
                                    height={splitCanvasDimensions.height}
                                    splitIndex={index + 1}
                                    onLabelOffsetsChange={handleSplitLabelOffsetsChange}
                                    splitLabelOffsets={splitLabelOffsets[index + 1] || {}}
                                    referenceScale={splitReferenceScale}
                                  />
                                </div>
                              </div>

                              {/* Number circle between splits */}
                              {index < splitPieces.length - 1 && (
                                <div style={{
                                  position: 'absolute',
                                  left: '-22px',
                                  bottom: '-22px',
                                  zIndex: 10
                                }}>
                                  <div style={{
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '50%',
                                    border: '2px solid #333',
                                    backgroundColor: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                  }}>
                                    {index + 2}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        });

                        return allDrawings;
                      })()}

                      {/* Bracket system on the right - connecting brackets between drawings */}
                      {(() => {
                        const splitPieces = splitPreviewData.filter(s => !s.isOriginal);
                        const brackets = [];

                        // Card measurements - use dynamic height from splitCanvasDimensions
                        const cardTop = 0;
                        const cardHeight = splitCanvasDimensions.height + 50; // Dynamic container height + padding (30px) + girth label (20px)
                        const spaceBetween = 65; // Space includes number circle area
                        const bracketGap = 20; // Gap between consecutive brackets

                        // First bracket: FAR center to first split top
                        const firstCardCenter = cardTop + cardHeight / 2;
                        const firstSplitTop = cardTop + cardHeight + spaceBetween;

                        brackets.push(
                          <div key="bracket-0" style={{
                            position: 'absolute',
                            right: '30px',
                            top: `${firstCardCenter}px`,
                            width: '20px',
                            height: `${firstSplitTop - firstCardCenter - bracketGap / 2}px`,
                            borderTop: '2px solid #333',
                            borderRight: '2px solid #333',
                            borderRadius: '0 5px 0 0'
                          }} />
                        );

                        brackets.push(
                          <div key="bracket-0-bottom" style={{
                            position: 'absolute',
                            right: '30px',
                            top: `${firstSplitTop - bracketGap / 2}px`,
                            width: '20px',
                            height: `${bracketGap / 2}px`,
                            borderRight: '2px solid #333',
                            borderBottom: '2px solid #333',
                            borderRadius: '0 0 5px 0'
                          }} />
                        );

                        // Brackets for remaining split pieces
                        for (let i = 0; i < splitPieces.length - 1; i++) {
                          const currentCardPos = cardTop + (cardHeight + spaceBetween) * (i + 1);
                          const currentCardCenter = currentCardPos + cardHeight / 2;
                          const nextCardTop = currentCardPos + cardHeight + spaceBetween;

                          // Top part from center
                          brackets.push(
                            <div key={`bracket-${i + 1}-top`} style={{
                              position: 'absolute',
                              right: '30px',
                              top: `${currentCardCenter}px`,
                              width: '20px',
                              height: `${nextCardTop - currentCardCenter - bracketGap / 2}px`,
                              borderTop: '2px solid #333',
                              borderRight: '2px solid #333',
                              borderRadius: '0 5px 0 0'
                            }} />
                          );

                          // Bottom part to next card top
                          brackets.push(
                            <div key={`bracket-${i + 1}-bottom`} style={{
                              position: 'absolute',
                              right: '30px',
                              top: `${nextCardTop - bracketGap / 2}px`,
                              width: '20px',
                              height: `${bracketGap / 2}px`,
                              borderRight: '2px solid #333',
                              borderBottom: '2px solid #333',
                              borderRadius: '0 0 5px 0'
                            }} />
                          );
                        }

                        return brackets;
                      })()}
                    </div>
                  </div>
                ) : (
                  /* NORMAL TAPER MODE: Show FAR and NEAR previews using dynamic canvas */
                  <>
                    {/* Far Preview - Generated dynamically */}
                    <div className="taper-preview-section">
                      <div className="canvas-header">
                        <h4>Far - Girth: {farGirth ?? ':'} mm</h4>
                      </div>
                      <div className="canvas-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <DrawingPreview
                          key={`far-${template?._id || template?.id}-${previewDimensions.width}-${previewDimensions.height}`}
                          template={template}
                          type="far"
                          width={previewDimensions.width}
                          height={previewDimensions.height}
                          fontSize={26}
                          className="template-preview-image taper-preview"
                          style={{ maxWidth: '100%', height: 'auto' }}
                        />
                      </div>
                    </div>

                    {/* Near Preview - Generated dynamically */}
                    <div className="taper-preview-section">
                      <div className="canvas-header">
                        <h4>Near - Girth: {nearGirth ?? ':'} mm</h4>
                      </div>
                      <div className="canvas-container">
                        <DrawingPreview
                          key={`near-${template?._id || template?.id}-${previewDimensions.width}-${previewDimensions.height}`}
                          template={template}
                          type="near"
                          width={previewDimensions.width}
                          height={previewDimensions.height}
                          fontSize={26}
                          className="template-preview-image taper-preview"
                          style={{ maxWidth: '100%', height: 'auto' }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Normal (non-taper) preview - Generated dynamically */
              <>
                <div className="canvas-header">
                  <h4>Girth: {girth || 240} mm</h4>
                </div>
                <div className="canvas-container">
                  <DrawingPreview
                    key={`normal-${template?._id || template?.id}-${previewDimensions.width}-${previewDimensions.height}`}
                    template={template}
                    type="normal"
                    width={previewDimensions.width}
                    height={previewDimensions.height}
                    fontSize={26}
                    className="template-preview-image"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
              </>
            )}
            <div className="canvas-actions">
              <Button
                variant="outlined"
                startIcon={<FaArrowLeft />}
                ref={backBtnRef}
                onClick={() => navigate('/template-library', { state: { currentPage: location.state?.previousPage, orderId, partClass: 'My Library', customerName, customerId, orderNumber: initialOrderNumber } })}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    editDrawingBtnRef.current?.focus();
                  } else if (e.key === 'Tab' && e.shiftKey) {
                    // Loop back to last finish button
                    e.preventDefault();
                    if (isTaper && finishFlipBtnRef.current) {
                      finishFlipBtnRef.current?.focus();
                    } else if (finishCopyBtnRef.current) {
                      finishCopyBtnRef.current?.focus();
                    } else if (finishBtnRef.current) {
                      finishBtnRef.current?.focus();
                    }
                  }
                }}
              >
                Back
              </Button>
              <Button
                variant="outlined"
                color="warning"
                ref={editDrawingBtnRef}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    materialSelectRef.current?.focus();
                  } else if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    backBtnRef.current?.focus();
                  }
                }}
                onClick={() => {
                  // Calculate effective first segment angle
                  const effectiveFirstSegmentAngle = template?.segmentAbsoluteAngles?.length > 0
                    ? template.segmentAbsoluteAngles[0]
                    : template?.firstSegmentAngle;

                  // Build edit state with template data
                  const editState = {
                    // Order info
                    orderId,
                    orderNumber,
                    customerName,
                    customerId,
                    deliveryDate: orderDetails?.order_delivery_date || orderDetails?.quote_delivery_date_str,
                    enteredDate: orderDetails?.created_str || orderDetails?.created,
                    previousPage: location.state?.previousPage || 'designers',

                    // Template data
                    name: template?.geometryName || template?.name || '',
                    direction: template?.direction,
                    reverseColor: template?.reverseColor ?? false,
                    isTaper: !!template?.isTaper,
                    partGroup: template?.partGroup || 'Flashing',
                    partClass: template?.partClass || 'Aprons',

                    // Geometry data
                    ...(template?.isTaper ? {
                      farLengths: template.farLengths || [],
                      farAngles: template.farAngles || [],
                      nearLengths: template.nearLengths || [],
                      nearAngles: template.nearAngles || []
                    } : {
                      lengths: template.lengths || [],
                      angles: template.angles || []
                    }),

                    // Preview images
                    preview: template?.preview,
                    previewFar: template?.previewFar,
                    previewNear: template?.previewNear,

                    // Template IDs
                    templateId: template?._id || template?.templateId,
                    _id: template?._id || template?.templateId,

                    // Fold data
                    startFoldType: template?.startFoldType,
                    startFoldDirection: template?.startFoldDirection,
                    startFoldLength: template?.startFoldLength,
                    startFoldGap: template?.startFoldGap,
                    endFoldType: template?.endFoldType,
                    endFoldDirection: template?.endFoldDirection,
                    endFoldLength: template?.endFoldLength,
                    endFoldGap: template?.endFoldGap,

                    // Orientation
                    // Use firstSegmentAngle directly - it's the source of truth for drawing orientation
                    // segmentAbsoluteAngles is derived from firstSegmentAngle and can have timing issues
                    // For SSF folds, firstSegmentAngle is already set correctly from segmentAbsoluteAngles[0] in handleFinish
                    firstSegmentAngle: template?.firstSegmentAngle,
                    // CRITICAL: Pass segmentAbsoluteAngles for correct SSF fold orientation
                    segmentAbsoluteAngles: template?.segmentAbsoluteAngles || [],
                    flipH: template?.flipH || false,
                    flipV: template?.flipV || false,

                    // Label offsets
                    labelOffsets: template?.labelOffsets,

                    // Material selections (preserve current form state)
                    material,
                    color,
                    unitPrice,
                    savedGirth: girth, // Save current girth to detect changes when returning
                    savedBends: template?.angles?.length || 0, // Save current bends to detect changes when returning
                    savedIsTaper: !!template?.isTaper, // Save taper mode to detect normal↔taper changes

                    // Preserve saved rows (for back and forth navigation without SWI push)
                    savedRows: savedRows,

                    // Preserve current form fields (quantity, length, tag) if user hasn't clicked Add yet
                    pendingFormData: {
                      quantity,
                      length,
                      tag,
                      useSplit,
                      splitInto,
                      editingRowId,  // Preserve editing row ID to maintain edit state
                      showEntryForm,  // Preserve form visibility state
                      cancelVisible   // Preserve cancel button visibility
                    },

                    // Preserve template ID for Edit Drawing flow
                    preservedTemplateId: template?._id || template?.templateId,

                    // Flag to indicate this is from Edit Drawing with no saved template yet
                    isFromEditDrawingNoTemplate: !(template?._id || template?.templateId),

                    // Flag for edit mode
                    isEdit: true
                  };

                  // Navigate to drawing canvas with template data
                  const urlParams = editState.templateId ? `?templateId=${editState.templateId}` : '';
                  navigate(`/draw${urlParams}`, { state: editState });
                }}
              >
                Edit Drawing
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Panel - Material Form */}
        <div className="right-panel">
          <Card className="material-form-card">
            {/* /* Material & Color Selection */}
              <div className="form-row">
                <FormControl fullWidth>
                <InputLabel required>Material</InputLabel>
                <Select
                  native
                  required
                  value={material}
                  onChange={(e) => {
                    const newMaterial = e.target.value;
                    if (newMaterial !== material) {
                      setColor('')  
                      setAvailableColors([]);
                    };
                    setMaterial(newMaterial);
                  }}
                  label="Material"
                  inputRef={materialSelectRef}
                  prop
                >
                  <option value="" disabled hidden></option>
                  {availableMaterials.map((mat) => (
                    <option key={mat.id} value={mat.value}>
                      {mat.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel required>Color</InputLabel>
                <Select
                  key={material}
                  native
                  required
                  value={color}
                  disabled={!material}
                  inputRef={colorSelectRef}
                  label="Color"
                  onChange={(e) => {
                    setColor(e.target.value);
                  }}
                >
                  <option value="" disabled hidden></option>
                  {availableColors.map((col, index) => (
                    <option key={index} value={col.value}>
                      {col.name}{col.code ? ` (${col.code})` : ''}
                    </option>
                  ))}
                </Select>

              </FormControl>
              </div>
            {/* Add Quantity Button */}
            <div className="add-quantity-section" style={{ display: 'flex', gap: '10px', marginTop: '15px', marginBottom: '15px' }}>
              <Button
                variant="text"
                color="success"
                startIcon={<FaPlus />}
                ref={addQuantityBtnRef}
                onClick={() => {
                  // Show the form fields when clicked
                  setShowEntryForm(true);
                  setCancelVisible(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setShowEntryForm(true);
                    setCancelVisible(true);
                  } else if (e.key === 'Tab' && !e.shiftKey) {
                    // Tab to Finish button when form not shown
                    if (!showEntryForm) {
                      e.preventDefault();
                      finishBtnRef.current?.focus();
                    }
                  } else if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    // Go to Color if enabled, otherwise Material
                    if (material) {
                      colorSelectRef.current?.focus();
                    } else {
                      materialSelectRef.current?.focus();
                    }
                  }
                }}
                disabled={!material || !color || showEntryForm || useSplit}
                style={{ textTransform: 'none' }}
              >
                Add Quantity
              </Button>

              {/* Cancel Button */}
              {cancelVisible && (
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={handleCancel}
                  style={{ textTransform: 'none' }}
                >
                  Cancel
                </Button>
              )}
            </div>

            {/* Form fields - shown only when showEntryForm is true */}
            {showEntryForm && (
              <>
            {/* Number of Pieces & Length */}
            <div className="form-row">
              <TextField
                label="Number of Pieces"
                required
                type="text"
                value={quantity}
                onChange={(e) => {
                  // Only allow integers - remove decimal points and non-numeric characters
                  const value = e.target.value.replace(/[^\d]/g, '');
                  setQuantity(value);
                }}
                inputRef={piecesRef}
                inputProps={{ maxLength: 2 }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    lengthRef.current?.focus();
                  } else if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    // Go to Color if enabled, otherwise Material
                    if (material) {
                      colorSelectRef.current?.focus();
                    } else {
                      materialSelectRef.current?.focus();
                    }
                  }
                }}
                fullWidth
              />

              <TextField
                label="Length (m)"
                type="text"
                value={length}
                required
                onChange={(e) => {
                  // Only allow numbers and decimal point
                  const value = e.target.value.replace(/[^\d.]/g, '');
                  // Prevent multiple decimal points
                  const parts = value.split('.');
                  const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                  setLength(sanitized);
                }}
                inputRef={lengthRef}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    tagRef.current?.focus();
                  } else if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    piecesRef.current?.focus();
                  }
                }}
                fullWidth
              />
            </div>

            {/* Use Split Option */}
            <div className="split-option">
              <label style={{ cursor: additionalRows.length > 0 ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useSplit}
                  disabled={additionalRows.length > 0}
                  onChange={(e) => setUseSplit(e.target.checked)}
                  style={{ cursor: additionalRows.length > 0 ? 'not-allowed' : 'pointer' }}
                />
                <span>Use Split Option</span>
              </label>
              {additionalRows.length > 0 && (
                <span style={{ color: '#d32f2f', fontSize: '11px', marginLeft: '8px' }}>
                  (Delete additional rows to use split)
                </span>
              )}
              {useSplit && (
                <div className="split-input-wrapper">
                  <TextField
                    label="Split Into"
                    type="text"
                    value={splitInto}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Only allow single digit 1-9
                      if (val === '' || (/^[1-9]$/.test(val))) {
                        setSplitInto(val);
                      }
                    }}
                    size="small"
                    placeholder="e.g., 2, 3, 4"
                    helperText="Number of pieces to split into"
                    inputProps={{ maxLength: 1 }}
                    fullWidth
                  />
                </div>
              )}
            </div>

            {/* Tag */}
            <div className="form-row single">
              <TextField
                label={loadingSuggestedTag ? "Tag (loading...)" : "Tag"}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                inputRef={tagRef}
                inputProps={{ maxLength: 10 }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    finishBtnRef.current?.focus();
                  } else if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    lengthRef.current?.focus();
                  }
                }}
                fullWidth
                onFocus={(e) => e.target.select()}
                disabled={loadingSuggestedTag}
              />
            </div>

            {/* Add Rows Link */}
            <div className="add-rows-section">
              <button
                className="add-rows-link"
                onClick={handleAddRows}
                disabled={!material || !color || useSplit}
                type="button"
              >
                Add Rows
              </button>
            </div>

            {/* Additional Rows Table for Bulk Entry */}
            {additionalRows.length > 0 && (
              <div className="additional-rows-section">
                <h4>Additional Quantities</h4>
                <table className="additional-rows-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Pieces</th>
                      <th>Length (m)</th>
                      <th>Tag</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {additionalRows.map((row) => (
                      <tr key={row.slNo}>
                        <td>{row.slNo}</td>
                        <td>
                          <input
                            type="text"
                            value={row.pieces}
                            maxLength={2}
                            onChange={(e) => {
                              // Only allow integers - remove decimal points and non-numeric characters
                              const value = e.target.value.replace(/[^\d]/g, '');
                              updateAdditionalRow(row.slNo, 'pieces', value);
                            }}
                            placeholder="Pieces"
                            className="row-input"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.length}
                            onChange={(e) => {
                              // Only allow numbers and decimal point
                              const value = e.target.value.replace(/[^\d.]/g, '');
                              // Prevent multiple decimal points
                              const parts = value.split('.');
                              const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                              updateAdditionalRow(row.slNo, 'length', sanitized);
                            }}
                            placeholder="Length"
                            className="row-input"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.tag}
                            onChange={(e) => updateAdditionalRow(row.slNo, 'tag', e.target.value)}
                            placeholder="Tag"
                            className="row-input"
                            maxLength={10}
                          />
                        </td>
                        <td>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => removeAdditionalRow(row.slNo)}
                            tabIndex={-1}
                            disabled={!!row._id}
                            title={row._id ? "Cannot delete saved rows here" : "Delete row"}
                          >
                            <FaTrash />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Unit Price - Read only, fetched from backend */}
            <div className="form-row single">
              <TextField
                label="Unit Price"
                required
                type="text"
                value={unitPrice}
                fullWidth
                placeholder={loadingPrice ? "Loading price..." : "Price"}
                disabled={true}
                InputProps={{
                  readOnly: true,
                }}
              />
            </div>

            {/* Finish Buttons - inside form when form is visible */}
            {showFinish && showEntryForm && (
              <div className="button-block" style={{ width: '100%', marginTop: '20px', paddingBottom: '10px' }}>
                <div className="form-buttons" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="error"
                    ref={finishBtnRef}
                    onClick={() => handleFinish('normal')}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault();
                        finishAddNewBtnRef.current?.focus();
                      } else if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault();
                        tagRef.current?.focus();
                      }
                    }}
                    disabled={!material || !color || isProcessingFinish}
                    style={{ minWidth: '150px' }}
                  >
                    <FaCheck style={{ marginRight: '6px' }} /> Finish
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    ref={finishAddNewBtnRef}
                    onClick={() => handleFinish('add-new')}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault();
                        finishCopyBtnRef.current?.focus();
                      } else if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault();
                        finishBtnRef.current?.focus();
                      }
                    }}
                    disabled={!material || !color || isProcessingFinish}
                    style={{ minWidth: '150px' }}
                  >
                    <FaPlus style={{ marginRight: '6px' }} /> Finish & Add New
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    ref={finishCopyBtnRef}
                    onClick={() => handleFinish('copy')}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault();
                        if (isTaper && finishFlipBtnRef.current) {
                          finishFlipBtnRef.current?.focus();
                        } else {
                          // Loop back to Back button
                          backBtnRef.current?.focus();
                        }
                      } else if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault();
                        finishAddNewBtnRef.current?.focus();
                      }
                    }}
                    disabled={!material || !color || isProcessingFinish}
                    style={{ minWidth: '150px' }}
                  >
                    <FaCopy style={{ marginRight: '6px' }} /> Finish & Copy
                  </Button>
                  {isTaper && (
                    <Button
                      variant="contained"
                      color="error"
                      ref={finishFlipBtnRef}
                      onClick={() => handleFinish('flip')}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab' && !e.shiftKey) {
                          // Loop back to Back button
                          e.preventDefault();
                          backBtnRef.current?.focus();
                        } else if (e.key === 'Tab' && e.shiftKey) {
                          e.preventDefault();
                          finishCopyBtnRef.current?.focus();
                        }
                      }}
                      disabled={!material || !color || isProcessingFinish}
                      style={{ minWidth: '150px' }}
                    >
                      <FaCopy style={{ marginRight: '6px', transform: 'scaleY(-1)' }} /> Finish & Flip
                    </Button>
                  )}
                </div>
              </div>
            )}

            </>
            )}
          </Card>

          {/* Finish Buttons - outside form when form is hidden (edit mode) */}
          {showFinish && !showEntryForm && (
            <div className="form-section" style={{ marginTop: '20px', background: '#fff', borderRadius: '10px', padding: '20px' }}>
              <div className="finish-buttons" style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  color="error"
                  ref={finishBtnRef}
                  onClick={() => handleFinish('normal')}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey) {
                      e.preventDefault();
                      finishAddNewBtnRef.current?.focus();
                    } else if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      addQuantityBtnRef.current?.focus();
                    }
                  }}
                  disabled={!material || !color || isProcessingFinish}
                  style={{ minWidth: '150px' }}
                >
                  <FaCheck style={{ marginRight: '6px' }} /> Finish
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  ref={finishAddNewBtnRef}
                  onClick={() => handleFinish('add-new')}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey) {
                      e.preventDefault();
                      finishCopyBtnRef.current?.focus();
                    } else if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      finishBtnRef.current?.focus();
                    }
                  }}
                  disabled={!material || !color || isProcessingFinish}
                  style={{ minWidth: '150px' }}
                >
                  <FaPlus style={{ marginRight: '6px' }} /> Finish & Add New
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  ref={finishCopyBtnRef}
                  onClick={() => handleFinish('copy')}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey) {
                      e.preventDefault();
                      if (isTaper && finishFlipBtnRef.current) {
                        finishFlipBtnRef.current?.focus();
                      } else {
                        // Loop back to Back button
                        backBtnRef.current?.focus();
                      }
                    } else if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      finishAddNewBtnRef.current?.focus();
                    }
                  }}
                  disabled={!material || !color || isProcessingFinish}
                  style={{ minWidth: '150px' }}
                >
                  <FaCopy style={{ marginRight: '6px' }} /> Finish & Copy
                </Button>
                {isTaper && (
                  <Button
                    variant="contained"
                    color="error"
                    ref={finishFlipBtnRef}
                    onClick={() => handleFinish('flip')}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.shiftKey) {
                        // Loop back to Back button
                        e.preventDefault();
                        backBtnRef.current?.focus();
                      } else if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault();
                        finishCopyBtnRef.current?.focus();
                      }
                    }}
                    disabled={!material || !color || isProcessingFinish}
                    style={{ minWidth: '150px' }}
                  >
                    <FaCopy style={{ marginRight: '6px', transform: 'scaleY(-1)' }} /> Finish & Flip
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Bulk Delete Button - shown when rows are selected (disabled for split drawings) */}
          {selectedRows.length > 0 && (
            <div className="form-section" style={{ marginTop: '15px', background: '#fff', borderRadius: '10px', padding: '15px' }}>
              <Button
                variant="contained"
                color="error"
                onClick={handleBulkDelete}
                startIcon={<FaTrash />}
                disabled={useSplit}
                title={useSplit ? "Cannot delete split drawing rows" : ""}
              >
                Delete Selected ({selectedRows.length})
              </Button>
            </div>
          )}

          {/* Saved Material Rows (from backend when editing) */}
          {savedRows.length > 0 && (
            <Card className="material-rows-card">
              <h4>Saved Materials ({savedRows.length})</h4>
              <table className="material-rows-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRows.length === savedRows.length && savedRows.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows(savedRows.map((_, idx) => idx));
                          } else {
                            setSelectedRows([]);
                          }
                        }}
                        title="Select All"
                      />
                    </th>
                    <th>#</th>
                    <th>Pieces</th>
                    <th>Length (m)</th>
                    <th>Qty (m)</th>
                    <th>Split</th>
                    <th>Tag</th>
                    <th>Unit Price</th>
                    <th>Ext Price</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savedRows.map((row, index) => {
                    const pieces = row.quantity || 0;
                    const lengthMeters = Number(row.length) / 1000; // Convert mm to meters
                    // For overgirth (girth > 1200): qty = pieces × girth (in meters)
                    // For normal: qty = pieces × length (in meters)
                    const qtyMultiplierRaw = girth > 1200 ? (girth / 1000) : lengthMeters;
                    const qtyMultiplier = Math.max(1, qtyMultiplierRaw);
                    const totalMeters = pieces * qtyMultiplier;
                    const unitPrice = Number(row.unitPrice) || 0;
                    const extPrice = unitPrice * totalMeters;
                    const hasSplit = row.splitInto && Number(row.splitInto) > 1;

                    return (
                      <tr key={row._id || `${index}-${row.tag || 'row'}`}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(index)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRows([...selectedRows, index]);
                              } else {
                                setSelectedRows(selectedRows.filter(i => i !== index));
                              }
                            }}
                          />
                        </td>
                        <td>{row.rowNumber ?? index + 1}</td>
                        <td>{pieces}</td>
                        <td>{lengthMeters.toFixed(2)}</td>
                        <td>{totalMeters.toFixed(2)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {hasSplit ? (
                            <FaCheck title={`Split into ${row.splitInto}`} color="green" style={{ fontSize: 18 }} />
                          ) : (
                            <span style={{ color: '#aaa' }}>-</span>
                          )}
                        </td>
                        <td>{row.tag}</td>
                        <td>${unitPrice.toFixed(2)}</td>
                        <td>${extPrice.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleEditSavedRow(index)}
                              title="Edit"
                            >
                              <FaPencilAlt />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteSavedRow(index)}
                              title={useSplit ? "Cannot delete split drawing rows" : "Delete"}
                              disabled={showEntryForm || useSplit}
                            >
                              <FaTrash />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* Material Rows List (if any added) */}
          {materialRows.length > 0 && (
            <Card className="material-rows-card">
              <h4>Added Materials ({materialRows.length})</h4>
              <table className="material-rows-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Material</th>
                    <th>Color</th>
                    <th>Qty</th>
                    <th>Length (m)</th>
                    <th>Tag</th>
                    <th>Price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {materialRows.map((row, index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>{row.material}</td>
                      <td>{row.color}</td>
                      <td>{row.quantity}</td>
                      <td>{row.length}</td>
                      <td>{row.tag}</td>
                      <td>${row.extPrice}</td>
                      <td>
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteRow(index)}
                          size="small"
                        >
                          <FaTrash />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default SelectMaterialsSimplified;
