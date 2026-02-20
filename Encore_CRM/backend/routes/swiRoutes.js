// routes/swiRoutes.js

const express = require('express');
const router = express.Router();

const swiDrawingController = require('../controllers/swiDrawingCtrl');
const swiService = require('../services/swiService');

const auth = require("../middleware/auth");

// ============================================================================
// UTILITY FUNCTIONS
// Note: Main SWI operations (insert/update/repush) are handled by
//       templateUnifiedCtrl via swiService
// ============================================================================

// POST: Bulk check if SWI Job IDs exist in the database
router.post('/check-job-status', auth.checkRole('Common', 'view') ,swiDrawingController.checkSWIJobStatus);

// GET: Health check for SWI database connection
router.get('/health', async (req, res) => {
  try {
    const health = await swiService.healthCheck();
    const statusCode = health.connected ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
