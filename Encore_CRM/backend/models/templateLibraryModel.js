const mongoose = require('mongoose');

const templateLibrarySchema = new mongoose.Schema({
  // Type of library entry
  library_type: {
    type: String,
    enum: ['part_class', 'my_library', 'customer_library'],
    required: true
  },

  // For part_class library (Save to Library)
  part_group: {
    type: String,
    default: null
  },
  part_class: {
    type: String,
    default: null
  },

  // For my_library (Save to My Library)
  owner_user_id: {
    type: String,
    default: null
  },

  // For customer_library (Save to Customer Library)
  customer_id: {
    type: String,
    default: null
  },

  // Metadata
  saved_by: {
    type: String,
    required: true
  },

  // ===================================================================
  // DRAWING DATA FIELDS - Only geometry and visual properties
  // These fields store the actual drawing when saved via save icons
  // ===================================================================

  name: { type: String, default: null },

  // Primary (far) profile
  lengths: { type: [Number], default: [] },
  angles: { type: [Number], default: [] },

  // Optional near profile for taper
  nearLengths: { type: [Number], default: [] },
  nearAngles: { type: [Number], default: [] },
  farLengths: { type: [Number], default: [] },  // Taper far side
  farAngles: { type: [Number], default: [] },   // Taper far side

  direction: { type: String, default: null },
  reverseColor: { type: Boolean, default: false },

  isTaper: { type: Boolean, default: false },

  // Fold type information
  startFoldType: { type: String, default: null },
  startFoldDirection: { type: String, default: null },
  startFoldLength: { type: Number, default: null },
  startFoldGap: { type: Number, default: null },
  endFoldType: { type: String, default: null },
  endFoldDirection: { type: String, default: null },
  endFoldLength: { type: Number, default: null },
  endFoldGap: { type: Number, default: null },

  // Drawing orientation
  firstSegmentAngle: { type: Number, default: null },

  // Flip transformations
  flipH: { type: Boolean, default: false },
  flipV: { type: Boolean, default: false },

  // Label position offsets
  labelOffsets: { type: Object, default: {} }

}, { timestamps: true });

// Indexes for faster queries
templateLibrarySchema.index({ createdAt: -1 }); // For sorting by newest first

// Compound indexes for common query patterns (more efficient than single field indexes)
templateLibrarySchema.index({ library_type: 1, part_group: 1, part_class: 1, createdAt: -1 }); // Part class queries
templateLibrarySchema.index({ library_type: 1, owner_user_id: 1, createdAt: -1 }); // My library queries
templateLibrarySchema.index({ library_type: 1, customer_id: 1, createdAt: -1 }); // Customer library queries

module.exports = mongoose.model('template_library', templateLibrarySchema);
