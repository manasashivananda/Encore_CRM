/**
 * AWF Product Library Model — Product catalog for AWF module (Template Library display)
 *
 * Stores the master catalog of AWF products (downpipes, clips, offsets, bends, rollforming).
 * These entries are permanent and shown in the Template Library when AWF is selected.
 * Only contains fields needed for browsing/display — product specifications
 * (shape, dimensions, thickness, lengths, pricing) belong in the order-specific
 * collection (to be created separately).
 *
 * Collection: awf_product_libraries
 * Created: 20-Feb-2026
 */
const mongoose = require('mongoose');

const awfProductLibrarySchema = new mongoose.Schema({
  // --- Classification ---
  // Part class = sidebar item (4 values: Downpipe, Clips & Pops, Offsets, Rollforming)
  part_class: {
    type: String,
    required: true,
    enum: ['Downpipe', 'Clips & Pops', 'Offsets', 'Rollforming'],
  },

  // Sub-category = toggle button within a part class
  // Downpipe → 'Standard D/P', 'Manual D/P'
  // Offsets  → 'Standard Offset', 'Custom Offset', 'Bends (Elbow/Shoes)'
  // Clips & Pops and Rollforming have no sub-categories → null
  sub_category: {
    type: String,
    default: null,
  },

  // Product display name (e.g., "100x50mm Square D/P", "90mm Round Offset")
  name: {
    type: String,
    required: true,
  },

  // Short description for the product (shown in preview pane)
  description: {
    type: String,
    default: '',
  },

  // Product image — S3 key for the product drawing/diagram (null until uploaded)
  image: {
    type: String,
    default: null,
  },

  // Status for soft-disable without deleting
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },

  // Who created this catalog entry
  created_by: {
    type: String,
    default: null,
  },

}, { timestamps: true });

// Index for common query pattern: filter by part_class + sub_category + status
awfProductLibrarySchema.index({ part_class: 1, sub_category: 1, status: 1 });

module.exports = mongoose.model('awf_product_library', awfProductLibrarySchema);
