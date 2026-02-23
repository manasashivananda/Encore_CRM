/**
 * AWF Product Library Controller — CRUD for AWF product catalog
 *
 * Handles fetching AWF products (downpipes, clips, offsets, rollforming)
 * from the awf_product_libraries collection. These are permanent catalog
 * entries displayed in the Template Library when AWF part group is selected.
 *
 * Created: 20-Feb-2026
 */
const AWFProductLibrary = require('../models/awfProductLibraryModel');
const { logger } = require('../utils/logger');

/**
 * Get AWF products with optional filtering and pagination
 * Used by Template Library frontend when AWF part group is selected
 *
 * Query params:
 *   part_class   — filter by part class (Downpipe, Clips & Pops, Offsets, Rollforming)
 *   sub_category — filter by sub-category (Standard D/P, Manual D/P, etc.)
 *   page         — page number (default 1)
 *   limit        — items per page (default 12)
 */
exports.getAWFProducts = async (req, res) => {
  try {
    const {
      part_class,
      sub_category,
      page = 1,
      limit = 12
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Build query — only return active products
    const query = { status: 'active' };

    if (part_class) {
      query.part_class = part_class;
    }

    if (sub_category) {
      query.sub_category = sub_category;
    }

    logger.debug('Fetching AWF products with query:', query, 'page:', pageNum, 'limit:', limitNum);

    const totalCount = await AWFProductLibrary.countDocuments(query);

    const products = await AWFProductLibrary.find(query)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    logger.debug(`Found ${products.length} AWF products (page ${pageNum}, total: ${totalCount})`);

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasMore: skip + products.length < totalCount
      }
    });

  } catch (error) {
    logger.error('Error fetching AWF products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AWF products',
      error: error.message
    });
  }
};
