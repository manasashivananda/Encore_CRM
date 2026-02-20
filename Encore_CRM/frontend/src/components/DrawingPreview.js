/**
 * =============================================================================
 * DrawingPreview Component
 * =============================================================================
 * Renders drawings on-the-fly from geometry data without needing S3 stored images.
 * Uses generateSingleDrawing() from splitPreviewGenerator.js to create canvas images.
 *
 * =============================================================================
 * SUPPORTED DRAWING TYPES (via 'type' prop):
 * =============================================================================
 * TYPE 1: 'normal' (default)
 *         - Renders standard non-taper drawing
 *         - Uses template.lengths and template.angles
 *         - interpolationRatio = 0
 *
 * TYPE 2: 'far'
 *         - Renders the FAR end of a taper drawing
 *         - Uses template.farLengths (or falls back to template.lengths)
 *         - interpolationRatio = 0
 *
 * TYPE 3: 'near'
 *         - Renders the NEAR end of a taper drawing
 *         - Uses template.nearLengths
 *         - interpolationRatio = 1
 *
 * TYPE 4: 'split'
 *         - Renders an interpolated split piece of a taper drawing
 *         - Uses custom interpolationRatio (0=far, 0.5=middle, 1=near)
 *         - Interpolates between farLengths and nearLengths
 *
 * =============================================================================
 * COMPONENT STATES:
 * =============================================================================
 * STATE 1: Loading - Shows spinner while generating image
 * STATE 2: Error - Shows error message if generation fails
 * STATE 3: Success - Shows the generated drawing image
 *
 * =============================================================================
 * USAGE EXAMPLES:
 * =============================================================================
 * // Normal drawing
 * <DrawingPreview template={template} type="normal" width={400} height={300} />
 *
 * // Taper FAR end
 * <DrawingPreview template={template} type="far" width={1200} height={700} />
 *
 * // Taper NEAR end
 * <DrawingPreview template={template} type="near" width={1200} height={700} />
 *
 * // Split piece at 50% interpolation
 * <DrawingPreview template={template} type="split" interpolationRatio={0.5} />
 *
 * =============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { FiLoader } from 'react-icons/fi';
import { generateSingleDrawing } from '../utils/splitPreviewGenerator';

/**
 * DrawingPreview - Renders a drawing from geometry data
 *
 * @param {Object} template - Template object containing geometry data:
 *        - lengths/farLengths: Array of segment lengths (mm)
 *        - nearLengths: Array of near-end lengths for taper (mm)
 *        - angles: Array of bend angles (degrees)
 *        - direction: 'Left' or 'Right'
 *        - firstSegmentAngle: Initial segment angle
 *        - reverseColor: Boolean for color side
 *        - flipH/flipV: Horizontal/vertical flip flags
 *        - startFoldType/endFoldType: Fold types ('hem', 'ssf', etc.)
 *        - startFoldLength/endFoldLength: Fold lengths (mm)
 *        - labelOffsets: Custom label position offsets
 *
 * @param {string} type - Drawing type to render:
 *        - 'normal': Standard drawing (default)
 *        - 'far': FAR end of taper
 *        - 'near': NEAR end of taper
 *        - 'split': Interpolated split piece
 *
 * @param {number} interpolationRatio - For 'split' type only:
 *        - 0 = FAR end
 *        - 1 = NEAR end
 *        - 0.5 = Middle piece
 *
 * @param {number} width - Canvas width in pixels (default: 400)
 * @param {number} height - Canvas height in pixels (default: 300)
 * @param {number} fontSize - Label font size (default: 24)
 * @param {boolean} transparentBackground - Use transparent bg (default: false)
 * @param {string} className - Optional CSS class
 * @param {Object} style - Optional inline styles
 */
const DrawingPreview = React.memo(function DrawingPreview({
  template,
  type = 'normal', // 'normal', 'far', 'near', 'split'
  interpolationRatio = 0,
  width = 400,
  height = 300,
  className = '',
  style = {},
  fontSize = 24,
  transparentBackground = false,
  gradientStrokeWidth = 8,
  outlineStrokeWidth = 8
}) {
  // ===========================================================================
  // COMPONENT STATE
  // ===========================================================================
  const [imageData, setImageData] = useState(null);    // Generated image data URL
  const [isGenerating, setIsGenerating] = useState(true); // Loading state
  const [error, setError] = useState(null);            // Error message if any

  // ===========================================================================
  // INTERPOLATION RATIO CALCULATION
  // ===========================================================================
  // Converts 'type' prop to actual interpolation ratio for generateSingleDrawing()
  // - 'far' → 0 (FAR end of taper)
  // - 'near' → 1 (NEAR end of taper)
  // - 'split' → custom ratio (for split pieces)
  // - 'normal' → 0 (standard drawing)
  // ===========================================================================
  const actualInterpolationRatio = useMemo(() => {
    switch (type) {
      case 'far':
        return 0;   // TYPE 2: FAR end - use farLengths
      case 'near':
        return 1;   // TYPE 3: NEAR end - use nearLengths
      case 'split':
        return interpolationRatio; // TYPE 4: Custom interpolation for split pieces
      case 'normal':
      default:
        return 0;   // TYPE 1: Normal drawing
    }
  }, [type, interpolationRatio]);

  // ===========================================================================
  // TAPER DETECTION
  // ===========================================================================
  // Determines if this is a taper drawing based on:
  // - template.isTaper flag being true, OR
  // - template.nearLengths array having data
  // ===========================================================================
  const isTaper = useMemo(() => {
    return template?.isTaper === true ||
           (template?.nearLengths && template.nearLengths.length > 0);
  }, [template?.isTaper, template?.nearLengths]);

  // ===========================================================================
  // TEMPLATE KEY FOR MEMOIZATION
  // ===========================================================================
  // Creates a stable JSON key from template data to prevent unnecessary
  // re-renders when template object reference changes but data is the same.
  // Only regenerates image when actual geometry/style data changes.
  // ===========================================================================
  const templateKey = useMemo(() => {
    if (!template) return null;
    return JSON.stringify({
      // Geometry data
      lengths: template.lengths,
      farLengths: template.farLengths,
      nearLengths: template.nearLengths,
      angles: template.angles,
      direction: template.direction,
      firstSegmentAngle: template.firstSegmentAngle,
      // Display options
      reverseColor: template.reverseColor,
      flipH: template.flipH,
      flipV: template.flipV,
      // Fold configuration
      startFoldType: template.startFoldType,
      startFoldLength: template.startFoldLength,
      startFoldDirection: template.startFoldDirection,
      endFoldType: template.endFoldType,
      endFoldLength: template.endFoldLength,
      endFoldDirection: template.endFoldDirection,
      segmentAbsoluteAngles: template.segmentAbsoluteAngles,
      // SSF gap values (for label generation)
      startFoldGap: template.startFoldGap,
      endFoldGap: template.endFoldGap,
      // Label positioning
      labelOffsets: template.labelOffsets
    });
  }, [template]);

  // ===========================================================================
  // IMAGE GENERATION EFFECT
  // ===========================================================================
  // Generates the drawing image when template data or display options change.
  // Uses generateSingleDrawing() from splitPreviewGenerator.js
  // ===========================================================================
  useEffect(() => {
    // VALIDATION: Check for valid template data
    if (!template || !templateKey) {
      setIsGenerating(false);
      setError('No template data');
      return;
    }

    const generateImage = async () => {
      try {
        setIsGenerating(true);
        setError(null);
        setImageData(null);

        // =====================================================================
        // EXTRACT GEOMETRY DATA FROM TEMPLATE
        // =====================================================================
        // farLengths: Primary lengths (used for FAR end or normal drawings)
        // nearLengths: Secondary lengths (used for NEAR end of taper)
        // angles: Bend angles between segments
        // direction: 'Left' or 'Right' initial direction
        // =====================================================================
        const farLengths = template.farLengths || template.lengths || [];
        const nearLengths = template.nearLengths || [];
        const angles = template.angles || [];
        const direction = template.direction || 'Right';
        const firstSegmentAngle = template.firstSegmentAngle;
        const reverseColor = template.reverseColor || false;

        // VALIDATION: Skip if no geometry data
        if (farLengths.length === 0) {
          setError('No geometry data');
          setIsGenerating(false);
          return;
        }

        // =====================================================================
        // CALL generateSingleDrawing() TO CREATE IMAGE
        // =====================================================================
        // This function from splitPreviewGenerator.js:
        // 1. Calculates points from lengths/angles
        // 2. Interpolates between far/near for taper (based on interpolationRatio)
        // 3. Applies flips, folds, and styling
        // 4. Renders to canvas and returns base64 image
        // =====================================================================
        const image = await generateSingleDrawing({
          // Geometry
          farLengths,
          nearLengths: isTaper ? nearLengths : [], // Only pass nearLengths for taper
          angles,
          direction,
          firstSegmentAngle,
          // Display options
          reverseColor,
          flipH: template.flipH || false,
          flipV: template.flipV || false,
          interpolationRatio: actualInterpolationRatio,
          // Canvas dimensions
          width,
          height,
          // Label styling
          labelOffsets: template.labelOffsets,
          fontSize,
          // Background
          transparentBackground,
          // Stroke styling
          gradientStrokeWidth,
          outlineStrokeWidth,
          // Start fold configuration
          startFoldType: template.startFoldType,
          startFoldLength: template.startFoldLength || 0,
          startFoldDirection: template.startFoldDirection,
          // End fold configuration
          endFoldType: template.endFoldType,
          endFoldLength: template.endFoldLength || 0,
          endFoldDirection: template.endFoldDirection,
          // Original fold lengths (for scaling)
          originalStartFoldLength: template.startFoldLength || 0,
          originalEndFoldLength: template.endFoldLength || 0,
          // Segment angles (for SSF fold orientation)
          segmentAbsoluteAngles: template.segmentAbsoluteAngles || [],
          // SSF gap values
          startFoldGap: template.startFoldGap || 0,
          endFoldGap: template.endFoldGap || 0
        });

        setImageData(image?.image);
      } catch (err) {
        console.error('Error generating drawing preview:', err);
        setError('Failed to generate');
      } finally {
        setIsGenerating(false);
      }
    };

    generateImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    templateKey, // Use stable key instead of template object reference
    actualInterpolationRatio,
    width,
    height,
    isTaper,
    fontSize,
    transparentBackground,
    gradientStrokeWidth,
    outlineStrokeWidth
  ]);

  // ===========================================================================
  // RENDER STATE 1: LOADING
  // ===========================================================================
  // Shows a spinning loader while the image is being generated.
  // This happens on initial mount and when template data changes.
  // ===========================================================================
  if (isGenerating) {
    return (
      <div
        className={className}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: transparentBackground ? 'transparent' : '#f5f5f5',
          ...style
        }}
      >
        <FiLoader className="spin" size={24} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  // ===========================================================================
  // RENDER STATE 2: ERROR
  // ===========================================================================
  // Shows error message when:
  // - Template has no geometry data
  // - Image generation failed
  // - imageData is null/undefined
  // ===========================================================================
  if (error || !imageData) {
    return (
      <div
        className={className}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: transparentBackground ? 'transparent' : '#f5f5f5',
          color: '#999',
          fontSize: '14px',
          ...style
        }}
      >
        {error || 'No preview'}
      </div>
    );
  }

  // ===========================================================================
  // RENDER STATE 3: SUCCESS
  // ===========================================================================
  // Renders the generated drawing image.
  // Image is a base64 data URL from generateSingleDrawing().
  // Uses objectFit: 'contain' to maintain aspect ratio.
  // ===========================================================================
  return (
    <img
      src={imageData}
      alt={`${type} drawing preview`}
      className={className}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        objectFit: 'contain',
        ...style
      }}
    />
  );
});

export default DrawingPreview;