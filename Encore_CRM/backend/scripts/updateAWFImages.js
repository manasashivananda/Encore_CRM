/**
 * Quick script to update existing AWF products with placeholder images.
 * Run this once — no need to delete and re-seed.
 *
 * Usage:  node scripts/updateAWFImages.js
 */
const mongoose = require('mongoose');
const AWFProductLibrary = require('../models/awfProductLibraryModel');

const MONGO_URI = 'mongodb://127.0.0.1:27017/EncoreDB';

const IMAGE_MAP = {
  '100x50mm Square D/P':      'https://placehold.co/300x300/e8e8e8/333?text=100x50+Sq+D%2FP',
  '75mm Round D/P':           'https://placehold.co/300x300/e8e8e8/333?text=75mm+Rnd+D%2FP',
  '100x50mm Manual Square':   'https://placehold.co/300x300/dfe6e9/333?text=Manual+Sq+D%2FP',
  '75mm Manual Round':        'https://placehold.co/300x300/dfe6e9/333?text=Manual+Rnd+D%2FP',
  'Saddle Clip 100x50mm':     'https://placehold.co/300x300/ffeaa7/333?text=Saddle+Clip',
  'Stand-off Clip 75mm':      'https://placehold.co/300x300/ffeaa7/333?text=Stand-off+Clip',
  'Standard 100x50mm Offset': 'https://placehold.co/300x300/dfe6e9/333?text=Std+Offset+Sq',
  'Federation 75mm Offset':   'https://placehold.co/300x300/dfe6e9/333?text=Fed+Offset+Rnd',
  'Custom Round Offset':      'https://placehold.co/300x300/fab1a0/333?text=Custom+Rnd',
  'Custom Square Offset':     'https://placehold.co/300x300/fab1a0/333?text=Custom+Sq',
  'Elbow 100x50mm':           'https://placehold.co/300x300/c7ecee/333?text=Elbow+100x50',
  'Shoe 75mm':                'https://placehold.co/300x300/c7ecee/333?text=Shoe+75mm',
  'Corrugated Profile':       'https://placehold.co/300x300/b2bec3/333?text=Corrugated',
  'Standing Seam Profile':    'https://placehold.co/300x300/b2bec3/333?text=Standing+Seam',
};

async function update() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB (EncoreDB)');

    let updated = 0;
    for (const [name, image] of Object.entries(IMAGE_MAP)) {
      const result = await AWFProductLibrary.updateOne({ name }, { $set: { image } });
      if (result.modifiedCount > 0) {
        updated++;
        console.log(`  Updated: ${name}`);
      }
    }

    console.log(`\nDone. Updated ${updated} of ${Object.keys(IMAGE_MAP).length} products.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Update failed:', err.message);
    process.exit(1);
  }
}

update();
