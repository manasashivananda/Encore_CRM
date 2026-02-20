/**
 * DrawingPreviewCanvas - Canvas component for rendering drawings with color side indicator
 * Shows the drawing exactly like the images with:
 * - Main drawing line (black)
 * - Dimension labels for each segment
 * - Angle labels at bends
 * - Color side indicator (red parallel line on the inside)
 */

import React, { useRef, useEffect } from 'react';

const DrawingPreviewCanvas = ({
    lines = [],
    angles = [],
    direction = 'Right',
    firstSegmentAngle = null,
    flipH = false,
    flipV = false,
    reverseColor = false,
    width = 400,
    height = 300,
    showDimensions = true,
    backgroundColor = '#ffffff'
}) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // Set canvas size with device pixel ratio for sharp rendering
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        // Clear canvas
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        if (!lines || lines.length === 0) return;

        // Direction to angle mapping
        const directionMap = {
            Up: -90,
            Down: 90,
            Right: 0,
            Left: 180
        };

        // Calculate points
        const points = [{ x: 0, y: 0 }];
        let x = 0, y = 0;
        let currentAngle = firstSegmentAngle !== null && firstSegmentAngle !== undefined
            ? firstSegmentAngle
            : directionMap[direction] ?? 0;

        lines.forEach((length, idx) => {
            const angleRad = (currentAngle * Math.PI) / 180;
            x += length * Math.cos(angleRad);
            y += length * Math.sin(angleRad);
            points.push({ x, y });
            if (idx < angles.length) {
                currentAngle += angles[idx];
            }
        });

        // Apply flip transformations
        let transformedPoints = [...points];
        if (flipH || flipV) {
            const centroidX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
            const centroidY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

            transformedPoints = points.map(p => ({
                x: flipH ? centroidX - (p.x - centroidX) : p.x,
                y: flipV ? centroidY - (p.y - centroidY) : p.y
            }));
        }

        // Calculate bounds
        const minX = Math.min(...transformedPoints.map(p => p.x));
        const maxX = Math.max(...transformedPoints.map(p => p.x));
        const minY = Math.min(...transformedPoints.map(p => p.y));
        const maxY = Math.max(...transformedPoints.map(p => p.y));

        const drawingWidth = maxX - minX || 1;
        const drawingHeight = maxY - minY || 1;

        // Calculate scale and offset to center the drawing
        const padding = 70; // Increased padding for labels at edges
        const scaleX = (width - padding * 2) / drawingWidth;
        const scaleY = (height - padding * 2) / drawingHeight;
        const scale = Math.min(scaleX, scaleY) * 0.75; // Reduced from 0.85 to give more room for labels

        const offsetX = (width - drawingWidth * scale) / 2 - minX * scale;
        const offsetY = (height - drawingHeight * scale) / 2 - minY * scale;

        // Transform points to canvas coordinates
        const canvasPoints = transformedPoints.map(p => ({
            x: p.x * scale + offsetX,
            y: p.y * scale + offsetY
        }));

        // Calculate centroid for determining inside/outside
        const centroidX = canvasPoints.reduce((sum, p) => sum + p.x, 0) / canvasPoints.length;
        const centroidY = canvasPoints.reduce((sum, p) => sum + p.y, 0) / canvasPoints.length;

        // Draw color side indicator with 3-color gradient (Red, Orange, Blue) like DrawingCanvas
        // Always draw the color side - reverseColor controls which side
        const gradientLayers = 8;
        const maxOffset = 8; // px wide gradients

        // Define 3 colors (same as DrawingCanvas.js)
        const colors = [
            { r: 255, g: 0, b: 0 },     // Red
            { r: 255, g: 165, b: 0 },   // Orange
            { r: 0, g: 128, b: 255 }    // Blue
        ];

        // Calculate centroid correction for offset direction
        let signedArea = 0;
        for (let j = 0; j < canvasPoints.length - 1; j++) {
            const p1 = canvasPoints[j];
            const p2 = canvasPoints[j + 1];
            signedArea += (p2.x - p1.x) * (p2.y + p1.y);
        }
        const centroidCorrection = signedArea > 0 ? 1 : -1;

        // Apply offset direction same as DrawingCanvas.js
        const sideParity = (flipH ? -1 : 1) * (flipV ? -1 : 1);
        const offsetDir = (reverseColor ? -1 : 1) * sideParity * centroidCorrection;

        // Render gradient layers for each segment
        for (let layer = 0; layer < gradientLayers; layer++) {
            const offset = (layer + 1) * (maxOffset / gradientLayers);
            const opacity = 0.6 * (1 - layer / gradientLayers);

            for (let i = 0; i < canvasPoints.length - 1; i++) {
                const p1 = canvasPoints[i];
                const p2 = canvasPoints[i + 1];

                // Calculate segment direction
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                // Perpendicular direction (normalized)
                const perpX = -dy / len;
                const perpY = dx / len;

                // Draw each segment divided into 3 color sections
                for (let colorSection = 0; colorSection < 3; colorSection++) {
                    const color = colors[colorSection];

                    // Calculate start and end points for this color section (1/3 of segment)
                    const sectionStart = colorSection / 3;
                    const sectionEnd = (colorSection + 1) / 3;

                    // Calculate section start and end positions
                    const startX = p1.x + (p2.x - p1.x) * sectionStart;
                    const startY = p1.y + (p2.y - p1.y) * sectionStart;
                    const endX = p1.x + (p2.x - p1.x) * sectionEnd;
                    const endY = p1.y + (p2.y - p1.y) * sectionEnd;

                    // Draw this color section with offset
                    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
                    ctx.lineWidth = 2;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    ctx.beginPath();
                    ctx.moveTo(
                        startX + (perpX * offsetDir) * offset,
                        startY + (perpY * offsetDir) * offset
                    );
                    ctx.lineTo(
                        endX + (perpX * offsetDir) * offset,
                        endY + (perpY * offsetDir) * offset
                    );
                    ctx.stroke();
                }
            }
        }

        // Draw main drawing line (black)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        for (let i = 1; i < canvasPoints.length; i++) {
            ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
        }
        ctx.stroke();

        // Draw dimension labels
        if (showDimensions) {
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let i = 0; i < canvasPoints.length - 1; i++) {
                const p1 = canvasPoints[i];
                const p2 = canvasPoints[i + 1];

                // Calculate segment direction
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                // Perpendicular direction for label offset
                let normalX = -dy / len;
                let normalY = dx / len;

                // Midpoint
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;

                // Determine outside direction (away from centroid)
                const toCentroidX = centroidX - midX;
                const toCentroidY = centroidY - midY;
                const dotProduct = normalX * toCentroidX + normalY * toCentroidY;

                // Place label on the OUTSIDE (away from centroid)
                if (dotProduct > 0) {
                    normalX = -normalX;
                    normalY = -normalY;
                }

                // Label position
                const labelOffset = 18;
                const labelX = midX + normalX * labelOffset;
                const labelY = midY + normalY * labelOffset;

                // Draw dimension text
                ctx.fillStyle = '#0000FF';
                ctx.fillText(`${Math.round(lines[i])}`, labelX, labelY);
            }

            // Draw angle labels
            ctx.font = 'bold 11px Arial';
            ctx.fillStyle = '#008000';

            for (let i = 0; i < angles.length; i++) {
                if (!canvasPoints[i + 1]) continue;

                const prevPoint = canvasPoints[i];
                const currPoint = canvasPoints[i + 1];
                const nextPoint = canvasPoints[i + 2];

                if (!prevPoint || !currPoint) continue;

                // Direction from current to previous
                const dx1 = prevPoint.x - currPoint.x;
                const dy1 = prevPoint.y - currPoint.y;
                const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
                const dir1X = dx1 / len1;
                const dir1Y = dy1 / len1;

                // Direction from current to next
                let dir2X, dir2Y;
                if (nextPoint) {
                    const dx2 = nextPoint.x - currPoint.x;
                    const dy2 = nextPoint.y - currPoint.y;
                    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
                    dir2X = dx2 / len2;
                    dir2Y = dy2 / len2;
                } else {
                    dir2X = -dir1X;
                    dir2Y = -dir1Y;
                }

                // Bisector direction
                let bisectorX = dir1X + dir2X;
                let bisectorY = dir1Y + dir2Y;
                const bisectorLen = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY) || 1;
                bisectorX /= bisectorLen;
                bisectorY /= bisectorLen;

                // Check if bisector points toward centroid
                const toCentroidX = centroidX - currPoint.x;
                const toCentroidY = centroidY - currPoint.y;
                const dotProduct = bisectorX * toCentroidX + bisectorY * toCentroidY;

                // Flip to point outside if needed
                if (dotProduct > 0) {
                    bisectorX = -bisectorX;
                    bisectorY = -bisectorY;
                }

                // Label position
                const angleOffset = 16;
                const labelX = currPoint.x + bisectorX * angleOffset;
                const labelY = currPoint.y + bisectorY * angleOffset;

                ctx.fillText(`${angles[i]}°`, labelX, labelY);
            }
        }

        // Draw dots at vertices
        ctx.fillStyle = '#FF8C00';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;

        for (const point of canvasPoints) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

    }, [lines, angles, direction, firstSegmentAngle, flipH, flipV, reverseColor, width, height, showDimensions, backgroundColor]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                display: 'block',
                backgroundColor: backgroundColor
            }}
        />
    );
};

export default DrawingPreviewCanvas;
