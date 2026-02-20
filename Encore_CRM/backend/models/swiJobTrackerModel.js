const mongoose = require('mongoose');

const swiJobTrackerSchema = new mongoose.Schema({
  templateId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'template',
    required: true,
    unique: true
  },
  swiJobIds: [{ 
    type: String, 
    required: true 
  }],
  orderNumber: String,
  customerName: String,
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

module.exports = mongoose.model('SWIJobTracker', swiJobTrackerSchema);