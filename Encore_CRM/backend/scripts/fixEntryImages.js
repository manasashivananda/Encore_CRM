const mongoose = require('mongoose');
const AWFEntry = require('../models/awfOrderEntryModel');

mongoose.connect('mongodb://127.0.0.1:27017/EncoreDB');

async function fixImages() {
  const entries = await AWFEntry.find({});
  console.log(`Found ${entries.length} entries`);

  for (const e of entries) {
    let newImage = null;
    const name = (e.productName || '').toLowerCase();
    const isRound = !name.includes('x');

    if (e.partClass === 'Downpipe') {
      if (e.subCategory === 'Manual D/P') {
        newImage = isRound ? '/awf-products/square-dp-cross-section.jpeg' : '/awf-products/manual-square-dp.png';
      } else {
        newImage = isRound ? '/awf-products/square-dp-cross-section.jpeg' : '/awf-products/standard-square-dp.png';
      }
    } else if (e.partClass === 'Clips & Pops') {
      newImage = name.includes('stand') ? '/awf-products/standoff-clip.png' : '/awf-products/saddle-clip.jpeg';
    } else if (e.subCategory === 'Standard Offset') {
      newImage = '/awf-products/standard-offset-square.jpeg';
    } else if (e.subCategory === 'Custom Offset') {
      newImage = name.includes('round') ? '/awf-products/custom-offset-round.png' : '/awf-products/custom-offset-square.png';
    } else if (e.subCategory === 'Bends (Elbow/Shoes)') {
      if (name.includes('shoe')) newImage = '/awf-products/square-shoe.jpeg';
      else if (isRound) newImage = '/awf-products/square-elbow-3d.jpeg';
      else newImage = '/awf-products/square-elbow.png';
    }

    if (newImage) {
      await AWFEntry.updateOne({ _id: e._id }, { productImage: newImage });
      console.log(`Updated: ${e.productName} -> ${newImage}`);
    }
  }

  console.log('\nDone!');
  process.exit(0);
}

fixImages().catch(err => { console.error(err); process.exit(1); });
