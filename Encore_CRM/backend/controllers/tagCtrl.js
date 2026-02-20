// Get next tag suggestion for an order
exports.getNextTagForOrder = async (req, res) => {
  try {
    const { orderNumber } = req.query;

    if (!orderNumber) {
      return res.status(400).json({
        success: false,
        message: 'Order number is required'
      });
    }

    // Import models
    const Template = require('../models/templateModel');
    const MaterialRow = require('../models/materialRowModel');

    // Find all templates for this order
    const templates = await Template.find({ orderNumber }).select('_id');
    const templateIds = templates.map(t => t._id);

    if (templateIds.length === 0) {
      // No templates for this order yet, start with '1'
      return res.json({
        success: true,
        nextTag: '1',
        message: 'No existing tags for this order'
      });
    }

    // Find all material rows for these templates
    const materialRows = await MaterialRow.find({
      templateId: { $in: templateIds }
    })
      .sort({ createdAt: -1 })
      .select('tag')
      .limit(1);

    if (materialRows.length === 0) {
      // No material rows yet, start with '1'
      return res.json({
        success: true,
        nextTag: '1',
        message: 'No existing tags for this order'
      });
    }

    const lastTag = materialRows[0].tag;

    // Calculate next sequential tag (same logic as frontend)
    const nextTag = calculateNextTag(lastTag);

    res.json({
      success: true,
      nextTag,
      lastTag
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get next tag suggestion'
    });
  }
};

// Helper function to calculate next sequential tag
function calculateNextTag(currentTag) {
  if (!currentTag) return '1';

  // Check if it's a single letter
  if (currentTag.length === 1 && /[A-Za-z]/.test(currentTag)) {
    if (currentTag === 'Z') return 'AA';
    if (currentTag === 'z') return 'aa';
    const nextChar = String.fromCharCode(currentTag.charCodeAt(0) + 1);
    if (/[A-Za-z]/.test(nextChar)) return nextChar;
  }

  // Check if it's just a number
  if (/^\d+$/.test(currentTag)) {
    const number = parseInt(currentTag, 10);
    return String(number + 1);
  }

  // Check if it's two same letters (like AA, BB, CC)
  if (/^([A-Z])\1$/.test(currentTag) || /^([a-z])\1$/.test(currentTag)) {
    const char = currentTag.charAt(0);
    if (char === 'Z' || char === 'z') {
      return currentTag === currentTag.toUpperCase() ? 'AAA' : 'aaa';
    }
    const nextChar = String.fromCharCode(char.charCodeAt(0) + 1);
    return nextChar + nextChar;
  }

  // Check if it's two different letters (like AB, AC, etc.)
  if (/^[A-Z]{2}$/.test(currentTag) || /^[a-z]{2}$/.test(currentTag)) {
    const firstChar = currentTag.charAt(0);
    const secondChar = currentTag.charAt(1);

    if (secondChar === 'Z' || secondChar === 'z') {
      if (firstChar === 'Z' || firstChar === 'z') {
        return currentTag === currentTag.toUpperCase() ? 'AAA' : 'aaa';
      }
      const nextFirst = String.fromCharCode(firstChar.charCodeAt(0) + 1);
      return currentTag === currentTag.toUpperCase() ? nextFirst + 'A' : nextFirst + 'a';
    }

    const nextSecond = String.fromCharCode(secondChar.charCodeAt(0) + 1);
    return firstChar + nextSecond;
  }

  // Check if it ends with a number (like TAG1, A1, DOOR-1, etc.)
  const match = currentTag.match(/^(.+?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const number = parseInt(match[2], 10);
    return `${prefix}${number + 1}`;
  }

  // For meaningful words (3+ letters, no numbers), append "-1"
  if (/^[A-Za-z]{3,}$/.test(currentTag)) {
    return `${currentTag}-1`;
  }

  // Default fallback
  return '1';
}
