/**
 * Template Model
 *
 * Represents a profile template (drawing design) for sheet metal manufacturing.
 * Each template defines the geometric profile (lengths and angles) and can support
 * both regular and taper modes for variable-width profiles.
 *
 * Material specifications (material type, color, thickness, quantity, tag) have been moved
 * to the MaterialRow model to support multiple material variations per template design.
 * See MaterialRow model for material-specific data.
 *
 * Schema Changes (Day 3):
 * - Removed: material, color, thickness, qty, tag (moved to MaterialRow)
 * - Added: status, processingStartedAt, processingCompletedAt, errorMessage
 *
 * Schema Changes (Day 11):
 * - Removed: ownerUserId (unused)
 * - Removed: isDraft (only used in old flow, not in unified API)
 * - Removed: length (moved to MaterialRow - each row has its own length)
 *
 * Migration: Day 3 - migrate-material-data.js handles the schema migration
 */

const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  // Basic identification
  name: String,        // Template name/identifier
  partGroup: String,   // Part grouping (e.g., "Aprons", "Gutters")
  partClass: String,   // Part classification

  // Primary (far) profile geometry - defines the profile shape
  lengths:    { type: [Number], default: [] },  // Segment lengths in mm
  angles:     { type: [Number], default: [] },  // Bend angles in degrees

  // optional near profile for taper:
  nearLengths:{ type: [Number], default: [] },
  nearAngles: { type: [Number], default: [] },

  direction: String,
  reverseColor: Boolean,

  preview:     String,
  previewFar:  { type: String, default: null },
  previewNear: { type: String, default: null },

  isTaper:     { type: Boolean, default: false },

  orderNumber:  { type: String, default: null },
  customerName: { type: String, default: null },
  customerId:   { type: String, default: null },
  library:      { type: String, enum: ['my', 'customer'] },
  createdBy:    { type: String, default: null },
  lastModifiedBy: { type: String, default: null },

  // Material details have been moved to MaterialRow model for better data normalization
  // Previously: material, color, thickness, qty, tag were stored here
  // Now: These fields exist only in MaterialRow to maintain single source of truth
  // Migration: Day 3 - migrate-material-data.js removes these duplicate fields

  // Split configuration for taper drawings
  splitInto: { type: Number, default: null },  // Number of pieces to split taper into

  // Template workflow status tracking
  // This tracks the overall template creation and processing lifecycle
  status: {
    type: String,
    enum: ['draft', 'processing', 'completed', 'failed'],
    default: 'draft'  // New templates start as drafts
  },
  processingStartedAt: { type: Date, default: null },    // When template creation transaction started
  processingCompletedAt: { type: Date, default: null },  // When template was fully created with materials
  errorMessage: { type: String, default: null },         // Error details if status is 'failed'

  // Fold type information for SWI export
  startFoldType: { type: String, default: null },  // 'SF', 'SSF', etc.
  startFoldDirection: { type: String, default: null },  // 'Up', 'Down', 'OpenUp', 'OpenDown'
  startFoldLength: { type: Number, default: null },
  startFoldGap: { type: Number, default: null },  // Gap value for SSF
  endFoldType: { type: String, default: null },    // 'SF', 'SSF', etc.
  endFoldDirection: { type: String, default: null },   // 'Up', 'Down', 'OpenUp', 'OpenDown'
  endFoldLength: { type: Number, default: null },
  endFoldGap: { type: Number, default: null },  // Gap value for SSF

  // Fold type information for girth calculation (getGirth function)
  girthStartFoldType: { type: String, default: null },  // 'Up', 'Down', 'OpenUp', 'OpenDn'
  girthEndFoldType: { type: String, default: null },  // 'Up', 'Down', 'OpenUp', 'OpenDn'

  // Drawing orientation - actual angle of first segment
  firstSegmentAngle: { type: Number, default: null },

  // Absolute angles for each segment (for precise rendering, especially with SSF folds)
  // These store the compass direction (0-360) of each segment to prevent orientation changes
  segmentAbsoluteAngles: { type: [Number], default: [] },

  // Flip transformations - preserve horizontal and vertical flips
  flipH: { type: Boolean, default: false },  // Horizontal flip (mirror left-right)
  flipV: { type: Boolean, default: false },  // Vertical flip (mirror top-bottom)

  // Label position offsets (for preserving manual adjustments)
  labelOffsets: {
    type: Object,
    default: {},
    // Structure: {
    //   segmentLabels: { 0: {x: 10, y: 5}, 1: {x: -8, y: 3} },
    //   angleLabels: { 0: {x: 5, y: 10} },
    //   foldLabels: { start: {x: 12, y: 8}, end: {x: 15, y: -5} }
    // }
  },

  // Split drawing label offsets (for draggable labels on split pieces)
  splitLabelOffsets: {
    type: Object,
    default: {},
    // Structure: { 0: { 'len-0': {x, y}, 'ang-0': {x, y} }, 1: { ... } }
  },

  // SWI integration tracking
  swiJobIds: { type: [String], default: [] }  // Store JobIDs when pushed to SWI
}, { timestamps: true });

// Cascade delete: When a template is deleted, delete all related library entries
templateSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    try {
      const TemplateLibrary = require('./templateLibraryModel');
      const result = await TemplateLibrary.deleteMany({ template_id: doc._id });
      console.log(`Cascade delete: Removed ${result.deletedCount} library entries for template ${doc._id}`);
    } catch (error) {
      console.error('Error during cascade delete of library entries:', error);
    }
  }
});

// Handle bulk deletes (when Template.deleteMany is used)
templateSchema.pre('deleteMany', async function(next) {
  try {
    const TemplateLibrary = require('./templateLibraryModel');
    // Get all templates that will be deleted
    const templatesToDelete = await this.model.find(this.getFilter());
    const templateIds = templatesToDelete.map(t => t._id);

    if (templateIds.length > 0) {
      // Delete all library entries for these templates
      const result = await TemplateLibrary.deleteMany({ template_id: { $in: templateIds } });
      console.log(`Cascade delete: Removed ${result.deletedCount} library entries for ${templateIds.length} templates`);
    }
    next();
  } catch (error) {
    console.error('Error during bulk cascade delete of library entries:', error);
    next(); // Continue with deletion even if library cleanup fails
  }
});

module.exports = mongoose.models.template || mongoose.model('template', templateSchema);
