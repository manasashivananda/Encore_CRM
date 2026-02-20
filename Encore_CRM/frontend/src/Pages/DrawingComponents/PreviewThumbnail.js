import React from 'react';
import { Stage, Layer, Line, Text, Circle, Group } from 'react-konva';

const PreviewCanvas = ({
    lines = [],
    angles = [],
    direction = 'Right',
    firstSegmentAngle = null,  // Add firstSegmentAngle prop
    flipH = false,  // Add horizontal flip prop
    flipV = false,  // Add vertical flip prop
    reverseColor = false,  // Add reverseColor prop for color side indication
    width = 150,
    height = 120,
    darkMode = false,
    showDots = false,
    hideLabels = false
}) => {
    const points = [{ x: 0, y: 0 }];
    let x = 0,
        y = 0;

    const directionMap = {
        Up: 90,
        Down: -90,
        Right: 0,
        Left: 180
    };

    // Use firstSegmentAngle if provided, otherwise use direction
    let currentAngle;
    if (firstSegmentAngle !== null && firstSegmentAngle !== undefined) {
        currentAngle = firstSegmentAngle;
    } else {
        currentAngle = directionMap[direction] ?? 0;
    }

    lines.forEach((length, idx) => {
        const angleRad = (currentAngle * Math.PI) / 180;
        x += length * Math.cos(angleRad);
        y += length * Math.sin(angleRad);  // Match DrawingCanvas Y-axis direction
        points.push({ x, y });
        if (idx < angles.length) {
            currentAngle += angles[idx];   // Match DrawingCanvas angle calculation
        }
    });

    // Apply flip transformations if needed
    let transformedPoints = points;
    if (flipH || flipV) {
        // Calculate centroid for flip center
        const centroidX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
        const centroidY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

        transformedPoints = points.map(p => ({
            x: flipH ? centroidX - (p.x - centroidX) : p.x,
            y: flipV ? centroidY - (p.y - centroidY) : p.y
        }));
    }

    const minX = Math.min(...transformedPoints.map((p) => p.x));
    const minY = Math.min(...transformedPoints.map((p) => p.y));
    const maxX = Math.max(...transformedPoints.map((p) => p.x));
    const maxY = Math.max(...transformedPoints.map((p) => p.y));

    // Different padding for different sizes to balance visibility and label space
    const padding = width <= 120 ? 45 : width <= 150 ? 35 : 40; // More padding for very small sizes
    const scale = Math.min(
        (width - padding) / (maxX - minX || 1),
        (height - padding) / (maxY - minY || 1)
    ) * (width <= 120 ? 0.7 : width <= 150 ? 0.8 : 0.75); // Smaller scale for tiny previews
    const offsetX = (width - (maxX + minX) * scale) / 2;
    const offsetY = (height - (maxY + minY) * scale) / 2;

    const backgroundColor = darkMode ? '#1e1e1e' : '#ffffff';
    const strokeColor = darkMode ? '#ffffff' : '#000000';
    const textColor = darkMode ? '#00ccff' : 'blue';

    // Calculate color side offset lines (for reverseColor indicator)
    const colorSideOffset = 4; // pixels offset for color side line
    const colorSideLines = [];
    
    if (reverseColor) {
        // Calculate centroid to determine which side is "inside" vs "outside"
        const centroidX = transformedPoints.reduce((sum, p) => sum + p.x, 0) / transformedPoints.length;
        const centroidY = transformedPoints.reduce((sum, p) => sum + p.y, 0) / transformedPoints.length;

        for (let i = 0; i < transformedPoints.length - 1; i++) {
            const p1 = transformedPoints[i];
            const p2 = transformedPoints[i + 1];
            
            // Calculate segment direction
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Perpendicular direction (rotated 90 degrees)
            let normalX = -dy / len;
            let normalY = dx / len;
            
            // Midpoint of segment
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            // Determine if normal points toward or away from centroid
            const toCentroidX = centroidX - midX;
            const toCentroidY = centroidY - midY;
            const dotProduct = normalX * toCentroidX + normalY * toCentroidY;
            
            // Color side should be on the INSIDE (toward centroid) for reverseColor
            // So if normal points away from centroid, flip it
            if (dotProduct < 0) {
                normalX = -normalX;
                normalY = -normalY;
            }
            
            // Create offset points for color side line
            const offset = colorSideOffset / scale; // Convert to unscaled units
            colorSideLines.push({
                x1: (p1.x + normalX * offset) * scale + offsetX,
                y1: (p1.y + normalY * offset) * scale + offsetY,
                x2: (p2.x + normalX * offset) * scale + offsetX,
                y2: (p2.y + normalY * offset) * scale + offsetY
            });
        }
    }

    return (
        <div style={{ overflow: 'hidden', position: 'relative' }}>
        <Stage width={width} height={height} style={{ background: backgroundColor }} pixelRatio={2}>
            <Layer>
                {/* Color side indicator lines (red) - rendered first so main line is on top */}
                {reverseColor && colorSideLines.map((line, idx) => (
                    <Line
                        key={`color-${idx}`}
                        points={[line.x1, line.y1, line.x2, line.y2]}
                        stroke="#FF0000"
                        strokeWidth={2}
                        lineCap="round"
                    />
                ))}
                {/* Main drawing line */}
                <Line
                    points={transformedPoints.flatMap((p) => [p.x * scale + offsetX, p.y * scale + offsetY])}
                    stroke="#000000"
                    strokeWidth={2}
                    lineCap="round"
                />
                {/* Show length labels */}
                {!hideLabels && transformedPoints.slice(1).map((p, i) => {
                    // Calculate segment direction
                    const dx = p.x - transformedPoints[i].x;
                    const dy = p.y - transformedPoints[i].y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;

                    // Determine if segment is vertical or horizontal
                    const isVertical = Math.abs(dx) < 0.1;
                    const isHorizontal = Math.abs(dy) < 0.1;

                    // Calculate perpendicular direction for offset
                    let normalX, normalY;

                    if (isVertical) {
                        // For vertical segments, perpendicular is purely horizontal
                        normalX = 1;
                        normalY = 0;
                    } else if (isHorizontal) {
                        // For horizontal segments, perpendicular is purely vertical
                        normalX = 0;
                        normalY = -1;
                    } else {
                        // For diagonal segments, use calculated perpendicular
                        normalX = -dy / len;
                        normalY = dx / len;
                    }

                    // Midpoint of current segment
                    const midX_unscaled = (p.x + transformedPoints[i].x) / 2;
                    const midY_unscaled = (p.y + transformedPoints[i].y) / 2;

                    // Calculate centroid for all positioning decisions
                    const centroidX = transformedPoints.reduce((sum, pt) => sum + pt.x, 0) / transformedPoints.length;
                    const centroidY = transformedPoints.reduce((sum, pt) => sum + pt.y, 0) / transformedPoints.length;

                    // Determine which side is "outside" based on centroid
                    if (isVertical) {
                        // For vertical segments, check if centroid is left or right
                        if (centroidX > midX_unscaled) {
                            // Centroid is to the right, place label on the left
                            normalX = -1;
                        } else {
                            // Centroid is to the left, place label on the right
                            normalX = 1;
                        }
                    } else if (isHorizontal) {
                        // For horizontal segments, check if centroid is above or below
                        if (centroidY > midY_unscaled) {
                            // Centroid is below, place label above
                            normalY = -1;
                        } else {
                            // Centroid is above, place label below
                            normalY = 1;
                        }
                    } else {
                        // For diagonal segments, use dot product
                        const toCentroidX = centroidX - midX_unscaled;
                        const toCentroidY = centroidY - midY_unscaled;
                        const dotProduct = normalX * toCentroidX + normalY * toCentroidY;
                        if (dotProduct > 0) {
                            normalX = -normalX;
                            normalY = -normalY;
                        }
                    }

                    // Much larger font sizes for better visibility
                    const fontSize = width <= 120 ? 8 : width <= 150 ? 10 : 12;

                    // Position at midpoint (scaled)
                    const midX = midX_unscaled * scale + offsetX;
                    const midY = midY_unscaled * scale + offsetY;

                    // Balanced offset to keep labels close but not overlapping
                    const labelOffset = width <= 120 ? 14 : width <= 150 ? 16 : 18;

                    // Apply perpendicular offset (now pointing outside)
                    const labelX = midX + normalX * labelOffset;
                    const labelY = midY + normalY * labelOffset;

                    return (
                        <Text
                            key={`len-${i}`}
                            text={`${lines[i]}`}
                            x={labelX}
                            y={labelY}
                            fontSize={fontSize}
                            fill={textColor}
                            offsetX={fontSize * 1.5}  // Center the text horizontally
                            offsetY={fontSize / 2}     // Center the text vertically
                            fontStyle="bold"
                        />
                    );
                })}
                {/* Show angle labels - bisector-based positioning */}
                {/* Hide all angles in library preview - only show lengths */}
                {!hideLabels && angles.map((angle, i) => {
                    // Skip displaying ALL angles in library preview
                    return null;

                    // Much larger font size for angles
                    const angleFontSize = width <= 120 ? 7 : width <= 150 ? 9 : 11;

                    // Get the three points: previous vertex, current vertex, next vertex
                    const prevPoint = transformedPoints[i];
                    const currPoint = transformedPoints[i + 1];
                    const nextPoint = transformedPoints[i + 2];

                    if (!prevPoint || !currPoint) return null;

                    // Direction from current to previous (incoming segment)
                    const dx1 = prevPoint.x - currPoint.x;
                    const dy1 = prevPoint.y - currPoint.y;
                    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
                    const dir1X = dx1 / len1;
                    const dir1Y = dy1 / len1;

                    // Direction from current to next (outgoing segment)
                    let dir2X, dir2Y;
                    if (nextPoint) {
                        const dx2 = nextPoint.x - currPoint.x;
                        const dy2 = nextPoint.y - currPoint.y;
                        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
                        dir2X = dx2 / len2;
                        dir2Y = dy2 / len2;
                    } else {
                        // Last point - use opposite of incoming direction
                        dir2X = -dir1X;
                        dir2Y = -dir1Y;
                    }

                    // Bisector direction (average of the two segment directions)
                    let bisectorX = dir1X + dir2X;
                    let bisectorY = dir1Y + dir2Y;
                    const bisectorLen = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY) || 1;
                    bisectorX /= bisectorLen;
                    bisectorY /= bisectorLen;

                    // Calculate centroid to determine if bisector points inside or outside
                    const centroidX = transformedPoints.reduce((sum, pt) => sum + pt.x, 0) / transformedPoints.length;
                    const centroidY = transformedPoints.reduce((sum, pt) => sum + pt.y, 0) / transformedPoints.length;

                    // Vector from vertex to centroid
                    const toCentroidX = centroidX - currPoint.x;
                    const toCentroidY = centroidY - currPoint.y;

                    // Check if bisector points toward centroid (inside)
                    const dotProduct = bisectorX * toCentroidX + bisectorY * toCentroidY;

                    // If bisector points inside, flip it to point outside
                    if (dotProduct > 0) {
                        bisectorX = -bisectorX;
                        bisectorY = -bisectorY;
                    }

                    // Place label along bisector direction (outside)
                    const offset = width <= 120 ? 12 : width <= 150 ? 14 : 16;

                    // Position at vertex (scaled)
                    const vertexX = currPoint.x * scale + offsetX;
                    const vertexY = currPoint.y * scale + offsetY;

                    const labelX = vertexX + bisectorX * offset;
                    const labelY = vertexY + bisectorY * offset;

                    return (
                        <Text
                            key={`ang-${i}`}
                            text={`${angle}°`}
                            x={labelX}
                            y={labelY}
                            fontSize={angleFontSize}
                            fill="green"
                            offsetX={angleFontSize * 1.5}  // Center the text
                            offsetY={angleFontSize / 2}
                            fontStyle="bold"
                        />
                    );
                })}
                {/* Conditionally add orange dots with black borders at each point */}
                {showDots && transformedPoints.map((p, i) => (
                    <Circle
                        key={`dot-${i}`}
                        x={p.x * scale + offsetX}
                        y={p.y * scale + offsetY}
                        radius={3}
                        fill="#FF8C00"
                        stroke="#000000"
                        strokeWidth={0.5}
                    />
                ))}
            </Layer>
        </Stage>
        </div>
    );
};

export default PreviewCanvas;
