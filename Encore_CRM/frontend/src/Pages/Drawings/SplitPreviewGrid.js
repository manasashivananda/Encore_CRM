import React, { useMemo, useState, useEffect } from "react";
import PreviewCanvas from "../DrawingComponents/PreviewThumbnail";
import DrawingPreviewCanvas from "./DrawingPreviewCanvas";
import { generateSingleDrawing } from '../../utils/splitPreviewGenerator';
import { logger } from '../../utils/logger';

/* ---------- Formatting helpers (whole numbers) ---------- */
const i = (n) => (Number.isFinite(+n) ? Math.round(+n) : 0);           // integer
const mmTxt = (mm) => `${i(mm)} mm`;

/**
 * Convert splitLabelOffsets format (from SelectMaterials) to labelOffsets format (for shapeRenderer)
 * SelectMaterials format: { 'len-0': {x,y}, 'ang-0': {x,y}, 'fold-start': {x,y} }
 * shapeRenderer format: { segmentLabels: {0: {x,y}}, angleLabels: {0: {x,y}}, foldLabels: {start: {x,y}} }
 */
const convertSplitLabelOffset = (splitOffset) => {
  if (!splitOffset || Object.keys(splitOffset).length === 0) return null;

  const result = {
    segmentLabels: {},
    angleLabels: {},
    foldLabels: {},
    gapLabels: {}
  };

  Object.entries(splitOffset).forEach(([key, offset]) => {
    if (key.startsWith('len-')) {
      const index = parseInt(key.replace('len-', ''), 10);
      result.segmentLabels[index] = offset;
    } else if (key.startsWith('ang-')) {
      const index = parseInt(key.replace('ang-', ''), 10);
      result.angleLabels[index] = offset;
    } else if (key.startsWith('fold-')) {
      const position = key.replace('fold-', ''); // 'start' or 'end'
      result.foldLabels[position] = offset;
    } else if (key.startsWith('gap-')) {
      const position = key.replace('gap-', ''); // 'start' or 'end'
      result.gapLabels[position] = offset;
    }
  });

  return result;
};

/* ---------- Helper component for high-quality split rendering ---------- */
const SplitDrawingCanvas = ({ farLengths, nearLengths, angles, direction, firstSegmentAngle, interpolationRatio, width, height, labelOffsets }) => {
  const [imageData, setImageData] = useState(null);

  useEffect(() => {
    const generateImage = async () => {
      try {
        const result = await generateSingleDrawing({
          farLengths,
          nearLengths,
          angles,
          direction,
          firstSegmentAngle,
          reverseColor: false,
          interpolationRatio,
          width,
          height,
          labelOffsets
        });
        // generateSingleDrawing returns { image, scale, offsetX, offsetY, flippedPts }
        setImageData(result?.image || result);
      } catch (error) {
        logger.error('Error generating split drawing:', error);
      }
    };
    generateImage();
  }, [farLengths, nearLengths, angles, direction, firstSegmentAngle, interpolationRatio, width, height, labelOffsets]);

  if (!imageData) {
    return <PreviewCanvas lines={nearLengths} angles={angles} direction={direction} firstSegmentAngle={firstSegmentAngle} width={width} height={height} showDots={true} />;
  }

  return <img src={imageData} alt="Split drawing" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
};

/* ---------- Small UI helpers ---------- */
const Card = ({ title, subtitle, children, cardStyle, isOriginal }) => (
  <div style={{...styles.card, ...cardStyle}}>
    {title && <div style={styles.cardTitle}>{title}</div>}
    <div>{children}</div>
    {subtitle && <div style={styles.cardSub}>{subtitle}</div>}
  </div>
);

const Pill = ({ children, style }) => (
  <span style={{...styles.pill, ...style}}>{children}</span>
);

/* ---------- Dynamic grid column calculator ---------- */
const getGridColumns = (count) => {
  // 2 splits: 2 columns (1 row)
  // 3 splits: 3 columns (1 row)
  // 4 splits: 2 columns (2 rows of 2)
  // 5 splits: 3 columns first row, 2 in second (3+2)
  // 6 splits: 3 columns (2 rows of 3)
  // 7 splits: 3 columns first row, then 2+2 (3+2+2)
  // 8+ splits: 3 columns
  
  if (count <= 3) {
    return `repeat(${count}, 1fr)`;
  } else if (count === 4) {
    return 'repeat(2, 1fr)';
  } else if (count === 5) {
    return 'repeat(3, 1fr)'; // Will wrap as 3+2
  } else if (count === 6) {
    return 'repeat(3, 1fr)'; // Will wrap as 3+3
  } else if (count === 7) {
    // For 7: we want 3+2+2 pattern
    // CSS Grid doesn't directly support this, but we can use 3 columns
    // and adjust individual items if needed
    return 'repeat(3, 1fr)';
  } else {
    return 'repeat(3, 1fr)';
  }
};

/* ---------- Taper splitting: interpolate every differing leg ---------- */
/* Returns an array of { far: number[], near: number[] } pieces           */
function buildTaperPieces({ farLengths = [], nearLengths = [], pieces = 1 }) {
  const fl = Array.isArray(farLengths) ? farLengths.map(Number) : [];
  const nl = Array.isArray(nearLengths) ? nearLengths.map(Number) : [];
  const n = Math.max(1, Number(pieces) || 1);

  const L = Math.min(fl.length, nl.length);
  const diffs = [];
  for (let idx = 0; idx < L; idx++) {
    if (Number.isFinite(fl[idx]) && Number.isFinite(nl[idx]) && fl[idx] !== nl[idx]) {
      diffs.push(idx);
    }
  }

  if (n === 1) {
    return [{ far: fl.map(i), near: nl.map(i) }];
  }
  
  // Even if there are no differences (non-taper), we still want to show n pieces
  if (diffs.length === 0) {
    // Return n identical pieces for non-taper splits
    const result = [];
    for (let k = 1; k <= n; k++) {
      result.push({ far: fl.map(i), near: nl.map(i) });
    }
    return result;
  }

  const out = [];
  for (let k = 1; k <= n; k++) {
    const farPiece = [...fl];
    const nearPiece = [...nl];
    for (const idx of diffs) {
      const farValue = fl[idx];
      const nearValue = nl[idx];
      const delta = (farValue - nearValue) / n;
      
      // Progress from FAR to NEAR
      // Piece 1: farValue → farValue - delta (starts at FAR, moves toward NEAR)
      // Piece 2: farValue - delta → farValue - 2*delta  
      // Piece 3 (last): farValue - 2*delta → nearValue (ends at NEAR)
      // So piece k goes from: farValue - (k-1)*delta → farValue - k*delta
      farPiece[idx] = i(farValue - delta * (k - 1));
      nearPiece[idx] = i(farValue - delta * k);
    }
    // also round unchanged legs
    for (let j = 0; j < farPiece.length; j++) farPiece[j] = i(farPiece[j]);
    for (let j = 0; j < nearPiece.length; j++) nearPiece[j] = i(nearPiece[j]);
    out.push({ far: farPiece, near: nearPiece });
  }
  return out;
}

/* Main component  */
export default function SplitPreviewGrid({
  // shared
  direction = "Right",
  firstSegmentAngle = null,  // Add firstSegmentAngle prop
  splitInto = 1,

  // non‑taper (single)
  lengths = [],
  angles = [],

  // taper (far/near)
  isTaper = false,
  farLengths = [],
  farAngles = [],
  nearLengths = [],
  nearAngles = [],

  // visual properties
  reverseColor = false,  // Add reverseColor prop for color side indication
  flipH = false,
  flipV = false,

  // label positioning
  labelOffsets = null,  // User-adjusted label positions from DrawingCanvas
  splitLabelOffsets = null,  // Per-split-piece label offsets from SelectMaterials

  // optional meta for captions (all optional; integers are fine)
  basePieces = null,          // quantity before split
  totalPieces = null,         //  quantity after split
  baseLengthMM = null,        // total or per-piece mm, as you prefer
  perPieceLengthMM = null,    // per-piece mm after split

  // sizing
  canvasW = 120,
  canvasH = 90,

  // display format
  showMainPageFormat = false,  // Show 6 drawings in main page format
  hideInternalToggle = false,  // Hide the internal toggle button
  showOriginalExternal = false, // Control original display from external toggle
  onlySplit = false,  // Add onlySplit prop to control dot display
}) {
  const n = Math.max(1, Number(splitInto) || 1);
  const sum = (arr) => (Array.isArray(arr) ? arr.reduce((s, v) => s + i(v), 0) : 0);

  const originals = useMemo(() => {
    if (isTaper) {
      return {
        far: { girth: sum(farLengths), lines: farLengths.map(i), angs: farAngles },
        near: { girth: sum(nearLengths), lines: nearLengths.map(i), angs: nearAngles },
      };
    }
    return {
      single: { girth: sum(lengths), lines: lengths.map(i), angs: angles },
    };
  }, [isTaper, farLengths, nearLengths, farAngles, nearAngles, lengths, angles]);

  const taperPieces = useMemo(() => {
    if (!isTaper) return null;
    const pieces = buildTaperPieces({ farLengths, nearLengths, pieces: n });
          logger.debug(' SplitPreviewGrid taperPieces result:', pieces);
    return pieces;
  }, [isTaper, farLengths, nearLengths, n]);

  /* ----- Original Section ----- */
  const OriginalSection = () => (
    <div style={styles.originalSection}>
      <div style={styles.sectionTitle}>
        Original Drawing
        <div style={styles.sectionTitleAfter} />
      </div>
      <div style={styles.originalGrid}>
        {isTaper ? (
          <>
            <Card
              title={<Pill style={styles.originalPill}>Far</Pill>}
              subtitle={[
                `Girth: ${mmTxt(originals.far.girth)}`,
                basePieces != null ? `Pieces: ${i(basePieces)}` : null,
                baseLengthMM != null ? `Length: ${mmTxt(baseLengthMM)}` : null,
              ].filter(Boolean).join(" • ")}
              cardStyle={styles.originalCard}
              isOriginal={true}
            >
              <div style={styles.canvas}>
                <DrawingPreviewCanvas
                  lines={originals.far.lines}
                  angles={originals.far.angs}
                  direction={direction}
                  firstSegmentAngle={firstSegmentAngle}
                  width={canvasW}
                  height={canvasH}
                  reverseColor={reverseColor}
                  flipH={flipH}
                  flipV={flipV}
                />
              </div>
            </Card>

            <Card
              title={<Pill style={styles.originalPill}>Near</Pill>}
              subtitle={[
                `Girth: ${mmTxt(originals.near.girth)}`,
                basePieces != null ? `Pieces: ${i(basePieces)}` : null,
                baseLengthMM != null ? `Length: ${mmTxt(baseLengthMM)}` : null,
              ].filter(Boolean).join(" • ")}
              cardStyle={styles.originalCard}
              isOriginal={true}
            >
              <div style={styles.canvas}>
                <DrawingPreviewCanvas
                  lines={originals.near.lines}
                  angles={originals.near.angs}
                  direction={direction}
                  firstSegmentAngle={firstSegmentAngle}
                  width={canvasW}
                  height={canvasH}
                  reverseColor={reverseColor}
                  flipH={flipH}
                  flipV={flipV}
                />
              </div>
            </Card>
          </>
        ) : (
          <Card
            title={<Pill style={styles.originalPill}>Original</Pill>}
            subtitle={[
              `Girth: ${mmTxt(originals.single.girth)}`,
              basePieces != null ? `Pieces: ${i(basePieces)}` : null,
              baseLengthMM != null ? `Length: ${mmTxt(baseLengthMM)}` : null,
            ].filter(Boolean).join(" • ")}
            cardStyle={styles.originalCard}
            isOriginal={true}
          >
            <div style={styles.canvas}>
              <DrawingPreviewCanvas
                lines={originals.single.lines}
                angles={originals.single.angs}
                direction={direction}
                firstSegmentAngle={firstSegmentAngle}
                width={canvasW}
                height={canvasH}
                reverseColor={reverseColor}
                flipH={flipH}
                flipV={flipV}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );

  /* ----- Splits Section ----- */
  const SplitsSection = () => {
    const [showOriginal, setShowOriginal] = useState(false);
    const shouldShowOriginal = hideInternalToggle ? showOriginalExternal : showOriginal;
    
    if (isTaper) {
      
      // For main page display: show splits in better layout
      if (showMainPageFormat && taperPieces) {
        const mainPageDrawings = [];
        
        // Simply add each split piece once
        taperPieces.forEach((p, idx) => {
          mainPageDrawings.push({
            title: `SPLIT ${idx + 1}`,
            lines: p.near,
            angles: nearAngles || farAngles,
            girth: sum(p.near)
          });
        });
        
          logger.debug('🔍 Main page drawings count:', mainPageDrawings.length);
          logger.debug('🔍 Grid columns:', getGridColumns(mainPageDrawings.length));
        
        return (
          <div style={styles.mainPageContainer}>
            {/* Show Original Drawing section first when toggled */}
            {shouldShowOriginal && (
              <>
                <div style={styles.mainPageTitle}>
                  ORIGINAL DRAWING
                </div>
                <div style={styles.mainPageSubtitle}>
                  Before Split
                </div>
                <div style={styles.originalReferenceTop}>
                  <div style={styles.originalReferenceTopGrid}>
                    <div style={styles.originalReferenceTopCard}>
                      <div style={styles.originalReferenceLabel}>FAR</div>
                      <DrawingPreviewCanvas
                        lines={farLengths}
                        angles={farAngles}
                        direction={direction}
                        firstSegmentAngle={firstSegmentAngle}
                        width={250}
                        height={150}
                        reverseColor={reverseColor}
                        flipH={flipH}
                        flipV={flipV}
                      />
                      <div style={styles.originalReferenceGirth}>Girth: {mmTxt(sum(farLengths))}</div>
                    </div>
                    <div style={styles.originalReferenceArrow}>→</div>
                    <div style={styles.originalReferenceTopCard}>
                      <div style={styles.originalReferenceLabel}>NEAR</div>
                      <DrawingPreviewCanvas
                        lines={nearLengths}
                        angles={nearAngles}
                        direction={direction}
                        firstSegmentAngle={firstSegmentAngle}
                        width={250}
                        height={150}
                        reverseColor={reverseColor}
                        flipH={flipH}
                        flipV={flipV}
                      />
                      <div style={styles.originalReferenceGirth}>Girth: {mmTxt(sum(nearLengths))}</div>
                    </div>
                  </div>
                </div>
                
                {/* Separator between sections */}
                <div style={{ marginTop: '24px', marginBottom: '20px' }}></div>
              </>
            )}
            
            {/* Taper Split Progression section */}
            <div style={styles.mainPageTitle}>
             TAPER SPLIT PROGRESSION
            </div>
            <div style={styles.mainPageSubtitle}>
              {n} Progressive Splits • Intermediate Dimensions
            </div>
            
            {/* Toggle button below title - only show if not controlled externally */}
            {!hideInternalToggle && (
              <div style={styles.toggleContainerBelowTitle}>
                <button 
                  onClick={() => setShowOriginal(!showOriginal)}
                  style={{
                    ...styles.toggleButtonSmall,
                    ...(showOriginal ? styles.toggleButtonActive : {})
                  }}
                >
                  {showOriginal ? '▼' : '▶'} Show Original Reference
                </button>
              </div>
            )}
            
            {/* Dynamic grid based on split count */}
            <div style={{
              display: "grid",
              gridTemplateColumns: getGridColumns(mainPageDrawings.length),
              gap: "10px",
              maxWidth: "800px",
              margin: "0 auto",
              padding: "10px",
              background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
              borderRadius: "16px",
              boxShadow: "0 10px 20px rgba(0, 0, 0, 0.08)"
            }}>
              {mainPageDrawings.map((item, idx) => {
                // Special handling for 7 items to create 3-2-2 layout
                let gridSpanStyle = {};
                if (mainPageDrawings.length === 7) {
                  // Items 3 and 4 should center in their row (indices 3,4)
                  // Items 5 and 6 should center in their row (indices 5,6)
                  if (idx === 3) {
                    gridSpanStyle = { gridColumn: '1 / span 1', marginLeft: '10%' };
                  } else if (idx === 4) {
                    gridSpanStyle = { gridColumn: '2 / span 1', marginRight: '10%' };
                  } else if (idx === 5) {
                    gridSpanStyle = { gridColumn: '1 / span 1', marginLeft: '10%' };
                  } else if (idx === 6) {
                    gridSpanStyle = { gridColumn: '2 / span 1', marginRight: '10%' };
                  }
                }
                
                // Get label offsets for this split piece
                // splitLabelOffsets uses index+1 (1, 2, 3...) for split pieces (0 is FAR)
                const pieceIndex = idx + 1;
                const pieceLabelOffsets = splitLabelOffsets?.[pieceIndex]
                  ? convertSplitLabelOffset(splitLabelOffsets[pieceIndex])
                  : labelOffsets;

                return (
                  <div key={`main-${idx}`} style={{...styles.mainPageCard, ...gridSpanStyle}}>
                    <div style={styles.mainPageCanvasWrapper}>
                      <SplitDrawingCanvas
                        farLengths={farLengths}
                        nearLengths={nearLengths}
                        angles={item.angles}
                        direction={direction}
                        firstSegmentAngle={firstSegmentAngle}
                        interpolationRatio={(idx + 1) / n}  // Ratio for this split piece
                        width={canvasW}
                        height={canvasH}
                        labelOffsets={pieceLabelOffsets}
                      />
                    </div>
                    <div style={styles.mainPageCardFooter}>
                      <span style={styles.girthLabel}>Girth:</span>
                      <span style={styles.girthValue}>{mmTxt(item.girth)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      
      // Original split preview format
      return (
        <div style={styles.splitsColumn}>
          {/* Taper Split Pieces Section */}
          <div style={styles.splitSubSection}>
            <div style={styles.subSectionTitle}>
              Split Pieces ({n} segments)
              <div style={styles.sectionTitleAfter} />
            </div>
            <div style={styles.splitsGrid}>
              {taperPieces && taperPieces.map((p, idx) => {
          logger.debug(`🔍 Rendering Split Piece ${idx + 1}/${n}:`, p);
                // For each split piece, show it as a taper with its interpolated far/near
                const farGirth = sum(p.far);
                const nearGirth = sum(p.near);
                // Get label offsets for this split piece
                const pieceIndex = idx + 1;
                const pieceLabelOffsets = splitLabelOffsets?.[pieceIndex]
                  ? convertSplitLabelOffset(splitLabelOffsets[pieceIndex])
                  : labelOffsets;
                return (
                <Card
                  key={`split-${idx}`}
                  title={<Pill>Piece {idx + 1}/{n}</Pill>}
                  subtitle={[
                    `Far: ${mmTxt(farGirth)}`,
                    `Near: ${mmTxt(nearGirth)}`,
                    perPieceLengthMM != null ? `Length: ${mmTxt(perPieceLengthMM)}` : null,
                  ].filter(Boolean).join(" • ")}
                  cardStyle={{...styles.splitCard, width: '180px'}}
                  isOriginal={false}
                >
                  {/* Show the actual interpolated shape for this piece using new high-quality renderer */}
                  <div style={styles.canvas}>
                    <SplitDrawingCanvas
                      farLengths={farLengths}
                      nearLengths={nearLengths}
                      angles={nearAngles || farAngles}
                      direction={direction}
                      firstSegmentAngle={firstSegmentAngle}
                      interpolationRatio={(idx + 1) / n}  // Ratio for this split piece
                      width={canvasW}
                      height={canvasH}
                      labelOffsets={pieceLabelOffsets}
                    />
                  </div>
                </Card>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // Non‑taper: same shape repeated for N splits
    return (
      <div style={styles.splitsColumn}>
        <div style={styles.splitSubSection}>
          <div style={styles.subSectionTitle}>
            Split Preview ({n} segments)
            <div style={styles.sectionTitleAfter} />
          </div>
        <div style={styles.splitsGrid}>
          {Array.from({ length: n }).map((_, idx) => (
            <Card
              key={`nt-${idx}`}
              title={<Pill>Split {idx + 1}/{n}</Pill>}
              subtitle={[
                `Girth: ${mmTxt(originals.single.girth)}`,
                perPieceLengthMM != null ? `Length/piece: ${mmTxt(perPieceLengthMM)}` : null,
                totalPieces != null ? `Total pieces: ${i(totalPieces)}` : null,
              ].filter(Boolean).join(" • ")}
              cardStyle={styles.splitCard}
              isOriginal={false}
            >
              <div style={styles.canvas}>
                <DrawingPreviewCanvas
                  lines={originals.single.lines}
                  angles={originals.single.angs}
                  direction={direction}
                  firstSegmentAngle={firstSegmentAngle}
                  width={canvasW}
                  height={canvasH}
                  reverseColor={reverseColor}
                  flipH={flipH}
                  flipV={flipV}
                />
              </div>
            </Card>
          ))}
        </div>
        </div>
      </div>
    );
  };

  // When showing main page format, only show the 6-drawing grid
  if (showMainPageFormat && isTaper && n > 1) {
    return <SplitsSection />;
  }
  
  // Original format with side-by-side sections
  return (
    <div style={styles.wrapper}>
      <div style={styles.sectionsWrapper}>
        <OriginalSection />
        <SplitsSection />
      </div>
    </div>
  );
}

/* Inline styles (kept local so we don’t touch global CSS) */
const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    padding: "10px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  sectionsWrapper: {
    display: "flex",
    gap: "15px",
    width: "100%",
  },
  originalSection: {
    flex: "0 0 300px",
    padding: "10px",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: "24px",
    textAlign: "center",
    paddingBottom: "16px",
    borderBottom: "3px solid transparent",
    background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    position: "relative",
  },
  sectionTitleAfter: {
    content: '""',
    position: "absolute",
    bottom: "0",
    left: "50%",
    transform: "translateX(-50%)",
    width: "60px",
    height: "3px",
    background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
    borderRadius: "2px",
  },
  originalGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    alignItems: "center",
  },
  splitsSection: {
    flex: 1,
    padding: "10px",
  },
  splitsColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  splitSubSection: {
    padding: "10px",
  },
  subSectionTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: "20px",
    textAlign: "center",
    paddingBottom: "12px",
    background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    position: "relative",
  },
  splitsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "14px",
    justifyContent: "center",
    maxWidth: "600px",
    margin: "0 auto",
  },
  card: {
    padding: "10px",
    textAlign: "center",
    position: "relative",
  },
  cardHover: {
    transform: "translateY(-4px) scale(1.02)",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  originalCard: {
    border: "2px solid rgba(148, 163, 184, 0.3)",
    position: "relative",
  },
  originalCardGlow: {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    background: "linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(139, 92, 246, 0.05))",
    borderRadius: "inherit",
    pointerEvents: "none",
  },
  splitCard: {
    background: "rgba(255, 255, 255, 0.95)",
    border: "1px solid rgba(226, 232, 240, 0.5)",
    position: "relative",
    width: "140px",
    flex: "0 0 auto",
  },
  splitCardGlow: {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    background: "linear-gradient(135deg, rgba(59, 130, 246, 0.02), rgba(16, 185, 129, 0.02))",
    borderRadius: "inherit",
    pointerEvents: "none",
  },
  cardTitle: {
    fontWeight: "700",
    fontSize: "12px",
    marginBottom: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    position: "relative",
    zIndex: 2,
  },
  cardSub: {
    marginTop: "12px",
    fontSize: "10px",
    color: "#64748b",
    fontWeight: "600",
    lineHeight: "1.3",
    background: "rgba(248, 250, 252, 0.8)",
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid rgba(226, 232, 240, 0.5)",
  },
  pill: {
    display: "inline-block",
    padding: "6px 12px",
    fontSize: "10px",
    fontWeight: "700",
    borderRadius: "20px",
    background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    boxShadow: "0 3px 8px rgba(59, 130, 246, 0.4), 0 1px 3px rgba(59, 130, 246, 0.3)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    position: "relative",
    overflow: "hidden",
  },
  pillShine: {
    position: "absolute",
    top: "0",
    left: "-100%",
    width: "100%",
    height: "100%",
    background: "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)",
    animation: "shine 2s infinite",
  },
  originalPill: {
    background: "linear-gradient(135deg, #64748b 0%, #475569 100%)",
    boxShadow: "0 4px 12px rgba(100, 116, 139, 0.4), 0 2px 4px rgba(100, 116, 139, 0.3)",
    color: "#ffffff",
  },
  canvas: {
    border: "2px solid rgba(241, 245, 249, 0.8)",
    borderRadius: "12px",
    background: "#ffffff",
    boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.02)",
    position: "relative",
    zIndex: 2,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    margin: "0 auto",
  },
  decorativeElement: {
    position: "absolute",
    top: "-50px",
    right: "-50px",
    width: "100px",
    height: "100px",
    background: "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))",
    borderRadius: "50%",
    filter: "blur(20px)",
    pointerEvents: "none",
  },
  mainPageContainer: {
    width: "100%",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  mainPageTitle: {
    fontSize: "28px",
    fontWeight: "800",
    color: "#1e293b",
    textAlign: "center",
    marginBottom: "8px",
    background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    textTransform: "uppercase",
    letterSpacing: "3px",
    textShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  mainPageSubtitle: {
    fontSize: "14px",
    fontWeight: "500",
    color: "#64748b",
    textAlign: "center",
    marginBottom: "30px",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  mainPageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "20px",
    maxWidth: "800px",
    margin: "0 auto",
    padding: "25px",
    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    borderRadius: "16px",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.08)",
  },
  mainPageCard: {
    background: "white",
    border: "1px solid rgba(226, 232, 240, 0.8)",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.05)",
    transition: "all 0.3s ease",
    position: "relative",
  },
  mainPageCanvasWrapper: {
    padding: "20px",
    background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "160px",
  },
  mainPageCardFooter: {
    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    borderTop: "1px solid rgba(226, 232, 240, 0.5)",
    padding: "10px 16px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "8px",
  },
  girthLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  girthValue: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#1e293b",
    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  toggleContainer: {
    display: "flex",
    justifyContent: "center",
    marginTop: "30px",
    marginBottom: "10px",
  },
  toggleButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#64748b",
    background: "white",
    border: "2px solid #e2e8f0",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
    "&:hover": {
      background: "#f8fafc",
      borderColor: "#cbd5e1",
      transform: "translateY(-1px)",
      boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
    },
  },
  toggleButtonActive: {
    color: "#3b82f6",
    background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
    borderColor: "#3b82f6",
  },
  originalReference: {
    marginTop: "10px",
    marginBottom: "20px",
    padding: "20px",
    background: "linear-gradient(135deg, #fafbfc 0%, #f3f4f6 100%)",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
  },
  originalReferenceTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
    marginBottom: "16px",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  originalReferenceGrid: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "20px",
  },
  originalReferenceCard: {
    background: "white",
    padding: "15px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.05)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  },
  originalReferenceLabel: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    padding: "4px 12px",
    background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
    borderRadius: "12px",
  },
  originalReferenceGirth: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#475569",
    marginTop: "4px",
  },
  originalReferenceArrow: {
    fontSize: "24px",
    color: "#94a3b8",
    fontWeight: "bold",
  },
  originalReferenceDivider: {
    height: "1px",
    background: "linear-gradient(90deg, transparent, #cbd5e1, transparent)",
    marginTop: "20px",
  },
  toggleContainerInGrid: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "15px 0",
    gap: "15px",
  },
  originalReferenceInline: {
    width: "100%",
    padding: "15px",
    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
  },
  originalReferenceInlineGrid: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "15px",
  },
  originalReferenceInlineCard: {
    background: "white",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
  },
  originalReferenceArrowSmall: {
    fontSize: "20px",
    color: "#94a3b8",
    fontWeight: "bold",
  },
  mainPageFirstRow: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "25px 25px 10px",
    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    borderRadius: "16px 16px 0 0",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.08)",
  },
  mainPageFirstRowGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "20px",
  },
  toggleContainerBelowRow: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "15px",
    marginTop: "15px",
    paddingTop: "15px",
    borderTop: "1px solid rgba(226, 232, 240, 0.5)",
  },
  toggleButtonSmall: {
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "600",
    color: "#64748b",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  originalReferenceCompact: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  originalReferenceMiniLabel: {
    fontSize: "10px",
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  originalReferenceMiniGirth: {
    fontSize: "10px",
    fontWeight: "600",
    color: "#475569",
  },
  toggleContainerBelowTitle: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "20px",
  },
  originalReferenceTop: {
    marginBottom: "25px",
    padding: "20px",
    background: "linear-gradient(135deg, #fafbfc 0%, #f3f4f6 100%)",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
    maxWidth: "500px",
    margin: "0 auto 25px",
  },
  originalReferenceTopGrid: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "20px",
  },
  originalReferenceTopCard: {
    background: "white",
    padding: "15px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.05)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  },
};
