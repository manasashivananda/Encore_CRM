// src/utils/splitTaperLogic.js

export function splitTaperSegment(farStart, nearStart, splitInto, totalLength, pieces = 1) {
  const taperDiff = farStart - nearStart;
  const step = taperDiff / splitInto;
  
  const segments = [];
  const unitLength = (totalLength / splitInto).toFixed(2);
  const totalPieces = pieces * splitInto; // Multiply pieces by split count

  // Create segments from bottom to top
  // Each segment's top becomes the next segment's bottom
  for (let i = 0; i < splitInto; i++) {
    // Calculate the bottom and top values for this segment
    const segmentBottom = nearStart + (i * step);
    const segmentTop = nearStart + ((i + 1) * step);
    
    segments.push({
      segment: i + 1,
      pieces: pieces, // Each split segment has the original pieces count
      length: unitLength,
      far: segmentTop.toFixed(2),  // Top of segment
      near: segmentBottom.toFixed(2) // Bottom of segment
    });
  }

  // Return both segments and total pieces info
  return {
    segments: segments,
    totalPieces: totalPieces,
    unitLength: unitLength
  };
}

export function persistTaperSegments(segments) {
  localStorage.setItem('taperSegments', JSON.stringify(segments));
  localStorage.setItem('taperFlip', 'true');
}
