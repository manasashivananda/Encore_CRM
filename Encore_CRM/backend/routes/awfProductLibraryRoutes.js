/**
 * AWF Product Library Routes — API endpoints for AWF product catalog
 *
 * Serves AWF products (downpipes, clips, offsets, rollforming) to the
 * Template Library frontend. Separate from template-library routes which
 * handle Flashing drawing templates.
 *
 * Created: 20-Feb-2026
 */
const express = require('express');
const router = express.Router();
const { getAWFProducts } = require('../controllers/awfProductLibraryCtrl');
const { verifyToken } = require('../middleware/auth');

// GET /api/awf-products — Fetch AWF products with optional filters
// Query params: part_class, sub_category, page, limit
router.get('/', verifyToken, getAWFProducts);

module.exports = router;
