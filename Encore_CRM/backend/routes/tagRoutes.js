const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tagCtrl');
const jwt = require('jsonwebtoken');

// Simple auth middleware for tag routes
const authMiddleware = (req, res, next) => {
  // Check for token in multiple places
  const token = req.headers['authorization']?.replace('Bearer ', '') ||
                req.headers['x-access-token'] ||
                req.body.token ||
                req.query.token;

  if (!token) {
    return res.status(403).json({
      success: false,
      message: 'A token is required for authentication'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.TOKEN_KEY || process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid Token'
    });
  }
};

// Get next tag suggestion for an order
router.get('/next-for-order', authMiddleware, tagController.getNextTagForOrder);

module.exports = router;
