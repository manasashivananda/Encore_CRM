/**
 * Seed Script — Insert AWF products into awf_product_libraries collection
 *
 * Inserts 2 sample products per sub-category/category for development.
 * Full product list will be added later when all product images are ready.
 *
 * This collection is the product CATALOG only (for Template Library display).
 * It stores: part_class, sub_category, name, description, image.
 * Product specifications (shape, dimensions, thickness, pricing) belong in
 * the separate order-specific collection (to be created).
 *
 * Usage:
 *   node scripts/seedAWFTemplates.js
 *
 * Requires MongoDB running at mongodb://127.0.0.1:27017/EncoreDB
 */

const mongoose = require('mongoose');
const AWFProductLibrary = require('../models/awfProductLibraryModel');

const MONGO_URI = 'mongodb://127.0.0.1:27017/EncoreDB';

const AWF_PRODUCTS = [

  // ---- Downpipe > Standard D/P (2 products) ----
  { part_class: 'Downpipe', sub_category: 'Standard D/P', name: '100x50mm Square D/P', description: 'Standard square downpipe 100x50mm', image: 'https://placehold.co/300x300/e8e8e8/333?text=100x50+Sq+D%2FP' },
  { part_class: 'Downpipe', sub_category: 'Standard D/P', name: '75mm Round D/P', description: 'Standard round downpipe 75mm', image: 'https://placehold.co/300x300/e8e8e8/333?text=75mm+Rnd+D%2FP' },

  // ---- Downpipe > Manual D/P (2 products) ----
  { part_class: 'Downpipe', sub_category: 'Manual D/P', name: '100x50mm Manual Square', description: 'Manual square downpipe 100x50mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=Manual+Sq+D%2FP' },
  { part_class: 'Downpipe', sub_category: 'Manual D/P', name: '75mm Manual Round', description: 'Manual round downpipe 75mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=Manual+Rnd+D%2FP' },

  // ---- Clips & Pops (no sub-category, 2 products) ----
  { part_class: 'Clips & Pops', sub_category: null, name: 'Saddle Clip 100x50mm', description: 'Square saddle clip 100x50mm', image: 'https://placehold.co/300x300/ffeaa7/333?text=Saddle+Clip' },
  { part_class: 'Clips & Pops', sub_category: null, name: 'Stand-off Clip 75mm', description: 'Round stand-off clip 75mm', image: 'https://placehold.co/300x300/ffeaa7/333?text=Stand-off+Clip' },

  // ---- Offsets > Standard Offset (2 products) ----
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: 'Standard 100x50mm Offset', description: 'Standard square offset 100x50mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=Std+Offset+Sq' },
  { part_class: 'Offsets', sub_category: 'Standard Offset', name: 'Federation 75mm Offset', description: 'Federation round offset 75mm', image: 'https://placehold.co/300x300/dfe6e9/333?text=Fed+Offset+Rnd' },

  // ---- Offsets > Custom Offset (2 products) ----
  { part_class: 'Offsets', sub_category: 'Custom Offset', name: 'Custom Round Offset', description: 'Custom round offset with user-entered dimensions', image: 'https://placehold.co/300x300/fab1a0/333?text=Custom+Rnd' },
  { part_class: 'Offsets', sub_category: 'Custom Offset', name: 'Custom Square Offset', description: 'Custom square offset with user-entered dimensions', image: 'https://placehold.co/300x300/fab1a0/333?text=Custom+Sq' },

  // ---- Offsets > Bends (Elbow/Shoes) (2 products) ----
  { part_class: 'Offsets', sub_category: 'Bends (Elbow/Shoes)', name: 'Elbow 100x50mm', description: 'Square elbow 100x50mm', image: 'https://placehold.co/300x300/c7ecee/333?text=Elbow+100x50' },
  { part_class: 'Offsets', sub_category: 'Bends (Elbow/Shoes)', name: 'Shoe 75mm', description: 'Round shoe 75mm', image: 'https://placehold.co/300x300/c7ecee/333?text=Shoe+75mm' },

  // ---- Rollforming (no sub-category, 2 products) ----
  { part_class: 'Rollforming', sub_category: null, name: 'Corrugated Profile', description: 'Corrugated rollforming profile', image: 'https://placehold.co/300x300/b2bec3/333?text=Corrugated' },
  { part_class: 'Rollforming', sub_category: null, name: 'Standing Seam Profile', description: 'Standing seam rollforming profile', image: 'https://placehold.co/300x300/b2bec3/333?text=Standing+Seam' },
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB (EncoreDB)');

    // Check if AWF products already exist
    const existing = await AWFProductLibrary.countDocuments();
    if (existing > 0) {
      console.log(`Found ${existing} existing AWF products. Skipping seed to avoid duplicates.`);
      console.log('To re-seed, first delete: db.awf_product_libraries.deleteMany({})');
      await mongoose.disconnect();
      return;
    }

    const docs = AWF_PRODUCTS.map(p => ({
      ...p,
      image: p.image || null,   // Placeholder URLs for now, replace with S3 keys later
      status: 'active',
    }));

    const result = await AWFProductLibrary.insertMany(docs);
    console.log(`Inserted ${result.length} AWF products:\n`);

    // Summary by part_class + sub_category
    const summary = {};
    result.forEach(doc => {
      const key = doc.sub_category ? `${doc.part_class} > ${doc.sub_category}` : doc.part_class;
      summary[key] = (summary[key] || 0) + 1;
    });
    Object.entries(summary).forEach(([key, count]) => {
      console.log(`  ${key}: ${count} products`);
    });

    await mongoose.disconnect();
    console.log('\nDone.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
