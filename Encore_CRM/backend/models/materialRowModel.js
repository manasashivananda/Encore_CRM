/**
 * MaterialRow Model
 *
 * Represents a single material row for a template. Each template can have multiple material rows,
 * allowing for different materials, colors, quantities, and pricing for the same profile design.
 *
 * This model is the single source of truth for material specifications (material, color, thickness, qty, tag).
 * These fields were previously duplicated in the Template model but have been moved here for better
 * data normalization and to support multiple material variations per template.
 *
 * Migration: Day 3 - migrate-material-data.js creates MaterialRows from Template data
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const materialRowSchema = new Schema({
  // Template reference
  templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true },  // Links to parent template
  rowNumber: { type: Number, required: true },  // Display order (1, 2, 3, etc.)

  // Material specifications - SINGLE SOURCE OF TRUTH for material data
  material: { type: String, required: true },    // Material type (e.g., "Steel", "Aluminum")
  color: { type: String, required: true },       // Material color/finish (e.g., "Black", "White")
  thickness: { type: String, default: null },    // Material thickness (e.g., "2mm", "0.5in") - Added Day 3
  tag: { type: String, required: true },         // Material identifier tag (e.g., "A1", "B2")

  // Quantity and dimensions
  quantity: { type: Number, required: true },    // Total number of pieces to manufacture
  length: { type: Number, required: true },      // Length per piece (in mm)
  girth: { type: Number, default: null },        // Calculated total girth value (in mm) - Added Day 3

  // Pricing
  unitPrice: { type: Number, required: true },   // Price per unit
  extPrice: { type: Number, required: true },    // Extended price (quantity × unit price)

  // Taper-specific fields (for splitting long tapered profiles into smaller pieces)
  splitInto: { type: Number, default: null },    // Number of pieces to split into
  splitLength: { type: Number, default: null },  // Length of each split piece (in mm)

  // SWI Integration Tracking - Added Day 3
  // Tracks the status of pushing this material row to SWI (MS-SQL manufacturing system)
  swiJobId: { type: String, default: null },     // Individual SWI JobID created for this material row
  status: {
    type: String,
    enum: ['pending', 'pushed_to_swi', 'failed'],
    default: 'pending'  // New material rows start as pending
  },
  swiPushedAt: { type: Date, default: null },    // Timestamp when successfully pushed to SWI
  swiError: { type: String, default: null }      // Error message if SWI push failed
}, { timestamps: true });  // Adds createdAt and updatedAt automatically

module.exports = mongoose.models.MaterialRow || mongoose.model('MaterialRow', materialRowSchema);
