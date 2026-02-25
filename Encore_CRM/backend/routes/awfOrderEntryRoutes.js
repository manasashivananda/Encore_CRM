/**
 * AWF Order Entry Routes — API endpoints for AWF material selections on orders
 *
 * POST   /api/awf-entries              — Create new entry
 * GET    /api/awf-entries/:orderNumber  — Get all active entries for an order
 * DELETE /api/awf-entries/:id           — Soft-delete an entry
 *
 * Created: 24-Feb-2026
 */
const express = require('express');
const router = express.Router();
const { createEntry, getEntriesByOrder, updateEntry, deleteEntry } = require('../controllers/awfOrderEntryCtrl');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, createEntry);
router.get('/:orderNumber', verifyToken, getEntriesByOrder);
router.put('/:id', verifyToken, updateEntry);
router.delete('/:id', verifyToken, deleteEntry);

module.exports = router;
