const express = require('express');
const router = express.Router();
const {
  createLibraryEntry,
  getLibraryEntries,
  updateLibraryEntry,
  deleteLibraryEntry,
  checkDuplicate
} = require('../controllers/templateLibraryCtrl');

const { verifyToken } = require('../middleware/auth');

// All routes require authentication
// Role-based permissions are checked on frontend (same as "Save to Library" buttons)

// GET - Check for duplicate library entry (must come before '/' to avoid route conflict)
// Supports query parameters: lengths, angles, library, partClass, partGroup, owner_user_id
router.get('/check-duplicate', verifyToken, checkDuplicate);

// POST - Create a new library entry
// Called when user clicks "Save to Library", "Save to My Library", or "Save to Customer Library"
router.post('/', verifyToken, createLibraryEntry);

// GET - Fetch library entries
// Supports query parameters: library_type, part_group, part_class, owner_user_id
router.get('/', verifyToken, getLibraryEntries);

// PUT - Update a library entry (e.g., change name)
router.put('/:id', verifyToken, updateLibraryEntry);

// DELETE - Remove a drawing from library
router.delete('/:id', verifyToken, deleteLibraryEntry);

module.exports = router;
