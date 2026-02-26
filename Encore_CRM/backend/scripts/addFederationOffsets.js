/**
 * Add Federation + missing Standard Offset products to awf_product_libraries
 *
 * Per the AWF MODULE spec, Standard Offset should have 8 products:
 *   Standard: 100x50mm, 100x75mm, 75mm, 90mm
 *   Federation: 100x50mm, 100x75mm, 75mm, 90mm
 *
 * Usage: node scripts/addFederationOffsets.js
 */
const mongoose = require('mongoose');
const AWFProductLibrary = require('../models/awfProductLibraryModel');

const MONGO_URI = 'mongodb://127.0.0.1:27017/EncoreDB';

const PRODUCTS = [
  // Standard Offset — square
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: '100x50mm', description: 'Standard square offset 100x50mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=100x50+Offset' },
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: '100x75mm', description: 'Standard square offset 100x75mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=100x75+Offset' },
  // Standard Offset — round
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: '75mm', description: 'Standard round offset 75mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=75mm+Offset' },
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: '90mm', description: 'Standard round offset 90mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=90mm+Offset' },

  // Federation Offset — square
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: 'Federation 100x50mm', description: 'Federation square offset 100x50mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=Fed+100x50' },
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: 'Federation 100x75mm', description: 'Federation square offset 100x75mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=Fed+100x75' },
  // Federation Offset — round
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: 'Federation 75mm', description: 'Federation round offset 75mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=Fed+75mm' },
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: 'Federation 90mm', description: 'Federation round offset 90mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=Fed+90mm' },
];

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB (EncoreDB)');

    // Delete old Standard Offset products (the 2 from seed)
    const deleted = await AWFProductLibrary.deleteMany({
      part_class: 'Offsets',
      sub_category: 'Standard Offset',
      name: { $nin: PRODUCTS.map(p => p.name) }
    });
    console.log(`Removed ${deleted.deletedCount} old Standard Offset products`);

    // Insert new products (skip duplicates by name)
    let added = 0;
    for (const product of PRODUCTS) {
      const exists = await AWFProductLibrary.findOne({
        part_class: product.part_class,
        sub_category: product.sub_category,
        name: product.name,
      });
      if (!exists) {
        await AWFProductLibrary.create({ ...product, status: 'active' });
        console.log(`  Added: ${product.name}`);
        added++;
      } else {
        console.log(`  Exists: ${product.name} — skipped`);
      }
    }

    console.log(`\nDone. Added ${added} products.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
}

run();
