
function generateShapeDescriptorDetailed({
  jobName,
  tag = '',
  lengths = [],
  angles = [],
  material,
  colour,
  thickness,
  customer,
  sheetLength,
  widthOverride = null, // Add width override for tapers
  enteredDate,
  deliveryDate,
  enteredBy = '',
  rotation = 0.00,
  reverseColours = true,
  taper = true,
  taperWidth = 1600,
  // Add nearLengths and nearAngles for taper display
  nearLengths = [],
  nearAngles = [],
  jobIds = [],
  jobLengths = [],
  jobQuantities = [],
  // Add fold information
  startFoldType = null,
  startFoldDirection = null,
  startFoldLength = null,
  endFoldType = null,
  endFoldDirection = null,
  endFoldLength = null
}) {
  const descriptor = [];

  // header
  descriptor.push(`Name "${jobName}"`);
  
  // Convert fold types to SWI numeric codes
  const getFoldCode = (foldType, foldDirection) => {
    if (!foldType) return 0;
    
    // Convert direction to lowercase for case-insensitive comparison
    const dir = foldDirection ? foldDirection.toLowerCase() : '';
    
    // Map our fold types to SWI codes
    if (foldType === 'SF') { // Square Fold (Squash)
      if (dir === 'up') return 1;
      if (dir === 'down') return 2;
    } else if (foldType === 'SSF') { // Semi-Square Fold (Open Squash)
      if (dir === 'up' || dir === 'openup') return 3;
      if (dir === 'down' || dir === 'opendown' || dir === 'opendn') return 4;
    }
    return 0;
  };
  
  // Format ends with fold information using SWI numeric codes
  const startFoldCode = getFoldCode(startFoldType, startFoldDirection);
  const endFoldCode = getFoldCode(endFoldType, endFoldDirection);
  const startEnd = `${startFoldCode}/${parseFloat(startFoldLength || 0).toFixed(2)}`;
  const endEnd = `${endFoldCode}/${parseFloat(endFoldLength || 0).toFixed(2)}`;
  
  descriptor.push(
    `Sheetlength ${parseFloat(sheetLength).toFixed(2)}, Ends ${startEnd}, ${endEnd}:`
  );

  // offsets & angles
  angles.forEach((angle, i) => {
    const offset = lengths
      .slice(0, i + 1)
      .reduce((sum, l) => sum + (parseFloat(l) || 0), 0);

    // Determine fold type based on angle
    const foldType = 0; // Normal fold for now

    // Negate angles for SWI's coordinate system
    // Our system: positive angle = counterclockwise turn (left)
    // SWI system: positive angle = clockwise turn (right)
    descriptor.push(
      `Offset ${offset.toFixed(2)}, Angle ${(-angle).toFixed(2)}, Type ${foldType}, Radius 0.00, ClampHt 0;`
    );
  });

  // semi-auto list - use widthOverride if provided (for tapers)
  const widthValue = widthOverride !== null ? widthOverride : sheetLength;
  descriptor.push(
    `SemiAutoList4: Width ${parseFloat(widthValue).toFixed(2)},` +
    ` Thickness ${(parseFloat(thickness) || 0).toFixed(2)},` +
    ` Material 0${reverseColours ? ', ReverseColours' : ''},`
  );
  descriptor.push(
    `Rotation ${rotation.toFixed(2)},` +
    ` Customer "${customer}",` +
    ` Materialname "${material}", Colour "${colour}",` +
    ` JobWidth ${parseFloat(widthValue).toFixed(2)},`
  );

  // dates & who
  const fmt = d =>
    d instanceof Date
      ? `${d.getDate().toString().padStart(2, '0')}/` +
        `${(d.getMonth() + 1).toString().padStart(2, '0')}/` +
        `${d.getFullYear()}`
      : '';
  descriptor.push(
    `DateEntered "${fmt(enteredDate)}",` +
    ` DeliveryDate "${fmt(deliveryDate)}",` +
    ` EnteredBy "${enteredBy}",`
  );
  descriptor.push(`StreetAddress "", City "", State "", Postcode "",`);
  descriptor.push(`CustomTxt1 "${jobName}", CustomTxt2 "",`);

  // taper block - always include taper fields for all drawings
  descriptor.push(`Tapering ${taper ? 1 : 0},`);
  if (nearLengths && nearLengths.length > 0) {
    // For segment-specific tapers, SWI expects near segment data
    
    // Calculate near offsets (cumulative near segment lengths)
    const nearOfs = [];
    let nearCumulativeOffset = 0;
    for (let i = 0; i < nearLengths.length - 1; i++) {
      nearCumulativeOffset += parseFloat(nearLengths[i]) || 0;
      nearOfs.push(nearCumulativeOffset);
    }
    
    // Calculate totals
    const farTotal = sheetLength; // Far total
    const nearTotal = nearLengths.reduce((sum, l) => sum + parseFloat(l), 0);
    
    // For TaperOffEnd, use the near total (sum of near segments)
    // This tells SWI where the taper ends in terms of near profile
    descriptor.push(
      `TaperOfs: ${nearOfs.map(o => o.toFixed(2)).join(',')},` +
      ` TaperOffStart 0.00,` +
      ` TaperOffEnd ${nearTotal.toFixed(2)},`  // Use near total, not far total
    );
    
    // TaperSplits should contain the near segment lengths
    const taperSplitsData = nearLengths.map(l => parseFloat(l).toFixed(2)).join(',');
    
    descriptor.push(
      `TaperPrincipalAxis 0,` +
      ` TaperWidth ${parseFloat(taperWidth).toFixed(2)},` +
      ` TaperSplits: ${taperSplitsData}`  // Add near segment lengths here
    );
  } else {
    // Fallback - always output taper fields even for non-tapers
    const ofs = [];
    let cumulativeOffset = 0;
    for (let i = 0; i < lengths.length - 1; i++) {
      cumulativeOffset += parseFloat(lengths[i]) || 0;
      ofs.push(cumulativeOffset);
    }
    
    descriptor.push(
      `TaperOfs: ${ofs.map(o => o.toFixed(2)).join(',')},` +
      ` TaperOffStart 0.00,` +
      ` TaperOffEnd ${sheetLength.toFixed(2)},`
    );
    
    descriptor.push(
      `TaperPrincipalAxis 0,` +
      ` TaperWidth ${parseFloat(taperWidth).toFixed(2)},` +
      ` TaperSplits:`
    );
  }

  // arrays for JobID/Length/Quantity
  const idList = jobIds.map(id => `"${id}"`).join('/');
  const lenList = jobLengths
    .map(l => parseFloat(l).toFixed(2))
    .join('/');
  const qtyList = jobQuantities.map(q => q.toString()).join('/');

  descriptor.push(
    `JobID ${idList},` +
    ` JobLength ${lenList},` +
    ` JobQuantity ${qtyList}`
  );

  return descriptor.join(' ');
}

module.exports = { generateShapeDescriptorDetailed };
