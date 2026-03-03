const mongoose = require('mongoose');
const AWFProductLibrary = require('../models/awfProductLibraryModel');

mongoose.connect('mongodb://127.0.0.1:27017/EncoreDB');

const imageMap = {
  // Downpipe > Standard D/P — Square products
  'standard_dp_square': '/awf-products/standard-square-dp.png',
  // Downpipe > Standard D/P — Round products (using cross-section for now)
  'standard_dp_round': '/awf-products/square-dp-cross-section.jpeg',
  // Downpipe > Manual D/P — Square products
  'manual_dp_square': '/awf-products/manual-square-dp.png',
  // Downpipe > Manual D/P — Round products (using cross-section for now)
  'manual_dp_round': '/awf-products/square-dp-cross-section.jpeg',
  // Clips & Pops — Saddle clips
  'saddle_clip': '/awf-products/saddle-clip.jpeg',
  // Clips & Pops — Stand-off clips
  'standoff_clip': '/awf-products/standoff-clip.png',
  // Offsets > Standard Offset — Square (non-federation)
  'standard_offset_square': '/awf-products/standard-square-offset.png',
  // Offsets > Standard Offset — Square (federation)
  'federation_offset_square': '/awf-products/federation-offset.jpeg',
  // Offsets > Standard Offset — Round (non-federation)
  'standard_offset_round': '/awf-products/standard-square-offset.png',
  // Offsets > Standard Offset — Round (federation)
  'federation_offset_round': '/awf-products/federation-offset.jpeg',
  // Offsets > Custom Offset — Square
  'custom_offset_square': '/awf-products/custom-offset-square.png',
  // Offsets > Custom Offset — Round
  'custom_offset_round': '/awf-products/custom-offset-round.png',
  // Offsets > Bends — Square elbow
  'bend_square_elbow': '/awf-products/square-elbow.png',
  // Offsets > Bends — Square shoe (custom)
  'bend_square_shoe': '/awf-products/square-shoe.jpeg',
  // Offsets > Bends — Round
  'bend_round': '/awf-products/square-elbow-3d.jpeg',
};

async function updateImages() {
  try {
    const products = await AWFProductLibrary.find({});
    console.log(`Found ${products.length} AWF products`);

    for (const product of products) {
      let newImage = null;
      const name = product.name?.toLowerCase() || '';
      const partClass = product.part_class;
      const subCat = product.sub_category;

      if (partClass === 'Downpipe') {
        if (subCat === 'Standard D/P') {
          const isRound = !name.includes('x');
          newImage = isRound ? imageMap.standard_dp_round : imageMap.standard_dp_square;
        } else if (subCat === 'Manual D/P') {
          const isRound = !name.includes('x');
          newImage = isRound ? imageMap.manual_dp_round : imageMap.manual_dp_square;
        }
      } else if (partClass === 'Clips & Pops') {
        if (name.includes('stand') || name.includes('standoff')) {
          newImage = imageMap.standoff_clip;
        } else {
          newImage = imageMap.saddle_clip;
        }
      } else if (partClass === 'Offsets') {
        if (subCat === 'Standard Offset') {
          const isFederation = name.includes('federation');
          const isRound = !name.includes('x');
          if (isFederation) {
            newImage = isRound ? imageMap.federation_offset_round : imageMap.federation_offset_square;
          } else {
            newImage = isRound ? imageMap.standard_offset_round : imageMap.standard_offset_square;
          }
        } else if (subCat === 'Custom Offset') {
          const isRound = name.includes('round');
          newImage = isRound ? imageMap.custom_offset_round : imageMap.custom_offset_square;
        } else if (subCat === 'Bends (Elbow/Shoes)') {
          const isRound = !name.includes('x');
          if (name.includes('shoe')) {
            newImage = imageMap.bend_square_shoe;
          } else {
            newImage = isRound ? imageMap.bend_round : imageMap.bend_square_elbow;
          }
        }
      }

      if (newImage) {
        await AWFProductLibrary.updateOne({ _id: product._id }, { image: newImage });
        console.log(`Updated: ${product.name} (${partClass} > ${subCat}) → ${newImage}`);
      } else {
        console.log(`SKIPPED: ${product.name} (${partClass} > ${subCat}) — no image mapping`);
      }
    }

    console.log('\nDone!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

updateImages();
