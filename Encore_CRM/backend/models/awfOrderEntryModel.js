/**
 * AWF Order Entry Model — Stores material selections for AWF products on orders
 *
 * One document per FINISH click on AWFSelectMaterials page.
 * Each entry = one product + material + color + qty configuration.
 *
 * Collection: awf_order_entries
 * Created: 23-Feb-2026
 */
const mongoose = require('mongoose');

const awfOrderEntrySchema = new mongoose.Schema({
  // Order context
  orderNumber: { type: String, required: true },
  customerId: { type: String },
  customerName: { type: String },

  // Product reference (from awf_product_libraries catalog)
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'awf_product_library' },
  productName: { type: String, required: true },
  partClass: { type: String, required: true },
  subCategory: { type: String, default: null },

  // Material selection
  material: { type: String, required: true },
  color: { type: String, default: '' },
  thickness: { type: Number, default: 0.45 },

  // Quantity & dimensions
  numberOfPieces: { type: Number, required: true },
  length: { type: Number, default: null },          // meters (Manual D/P, Standard D/P, Standard Offset)
  dimensions: {
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    diameter: { type: Number, default: null },
  },
  tapered: { type: Boolean, default: false },          // Manual D/P only

  // Custom Offset fields
  size: { type: String, default: null },                // manually entered size
  measurements: {                                       // W, A, B1, B2, C in mm
    W: { type: Number, default: null },
    A: { type: Number, default: null },
    B1: { type: Number, default: null },
    B2: { type: Number, default: null },
    C: { type: Number, default: null },
  },
  angleDegree: {                                        // D, E in degrees
    D: { type: Number, default: null },
    E: { type: Number, default: null },
  },
  offsetType: { type: String, enum: ['fixed', 'adjustable', null], default: null },
  adjustableRange: {                                    // only when offsetType = 'adjustable'
    from: { type: Number, default: null },
    to: { type: Number, default: null },
  },
  seamSide: { type: String, enum: ['top', 'left', 'bottom', 'right', null], default: null },

  // Options
  barcode: { type: Boolean, default: false },
  note: { type: String, default: '' },
  unitPrice: { type: Number, default: 0 },
  productImage: { type: String, default: null },

  // Status
  status: { type: String, enum: ['active', 'deleted'], default: 'active' },
  createdBy: { type: String, default: null },
}, { timestamps: true });

awfOrderEntrySchema.index({ orderNumber: 1, status: 1 });

module.exports = mongoose.model('awf_order_entry', awfOrderEntrySchema);
