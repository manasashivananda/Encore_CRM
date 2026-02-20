const TemplateLibrary = require('../models/templateLibraryModel');
const { logger } = require('../utils/logger');

/**
 * Create a new library entry
 * Called when user clicks "Save to Library", "Save to My Library", or "Save to Customer Library"
 *
 * NEW BEHAVIOR: Saves drawing data directly to TemplateLibrary (no Template record created)
 * Template table is ONLY used when user clicks "Finish" in SelectMaterialPage
 */
exports.createLibraryEntry = async (req, res) => {
  try {
    const {
      library_type,
      part_group,
      part_class,
      owner_user_id,
      customer_id,
      saved_by,
      // Drawing data fields (when saving directly from save icons) - ONLY drawing geometry
      name,
      lengths,
      angles,
      nearLengths,
      nearAngles,
      farLengths,
      farAngles,
      direction,
      reverseColor,
      isTaper,
      startFoldType,
      startFoldDirection,
      startFoldLength,
      startFoldGap,
      endFoldType,
      endFoldDirection,
      endFoldLength,
      endFoldGap,
      firstSegmentAngle,
      flipH,
      flipV,
      labelOffsets
    } = req.body;

    // Validate required fields
    if (!library_type || !saved_by) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: library_type and saved_by are required'
      });
    }

    // Validate library_type specific fields
    if (library_type === 'part_class' && (!part_group || !part_class)) {
      return res.status(400).json({
        success: false,
        message: 'part_group and part_class are required for part_class library type'
      });
    }

    if (library_type === 'my_library' && !owner_user_id) {
      return res.status(400).json({
        success: false,
        message: 'owner_user_id is required for my_library type'
      });
    }

    if (library_type === 'customer_library' && !customer_id) {
      return res.status(400).json({
        success: false,
        message: 'customer_id is required for customer_library type'
      });
    }

    // Check if library entry already exists (prevent duplicates)
    // Check based on drawing data similarity (lengths/angles match)
    const duplicateQuery = {
      library_type,
      ...(library_type === 'part_class' && { part_group, part_class }),
      ...(library_type === 'my_library' && { owner_user_id }),
      ...(library_type === 'customer_library' && { customer_id })
    };

    // Check for duplicate by drawing data (lengths/angles match)
    if (lengths && angles) {
      duplicateQuery.lengths = lengths;
      duplicateQuery.angles = angles;
    }

    const existingEntry = await TemplateLibrary.findOne(duplicateQuery);

    if (existingEntry) {
      logger.debug('Library entry already exists:', existingEntry._id);
      return res.status(200).json({
        success: true,
        message: 'Library entry already exists',
        data: existingEntry,
        isDuplicate: true
      });
    }

    // Create new library entry with all drawing data
    const libraryEntry = new TemplateLibrary({
      library_type,
      part_group,
      part_class,
      owner_user_id,
      customer_id,
      saved_by,
      // Drawing data - Only drawing geometry and visual properties
      name,
      lengths,
      angles,
      nearLengths,
      nearAngles,
      farLengths,
      farAngles,
      direction,
      reverseColor,
      isTaper,
      startFoldType,
      startFoldDirection,
      startFoldLength,
      startFoldGap,
      endFoldType,
      endFoldDirection,
      endFoldLength,
      endFoldGap,
      firstSegmentAngle,
      flipH,
      flipV,
      labelOffsets
    });

    await libraryEntry.save();

    logger.info(`Library entry created: ${libraryEntry._id}`);

    res.status(201).json({
      success: true,
      message: 'Library entry created successfully',
      data: libraryEntry
    });

  } catch (error) {
    logger.error('Error creating library entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create library entry',
      error: error.message
    });
  }
};

/**
 * Get library entries with drawing data
 * Supports filtering by library type, part group/class, owner
 * Supports pagination with page and limit query parameters
 */
exports.getLibraryEntries = async (req, res) => {
  try {
    const {
      library_type,
      part_group,
      part_class,
      owner_user_id,
      customer_id,
      page = 1,
      limit = 12
    } = req.query;

    // Parse pagination params
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {};

    if (library_type) {
      query.library_type = library_type;
    }

    if (part_group) {
      query.part_group = part_group;
    }

    if (part_class) {
      query.part_class = part_class;
    }

    if (owner_user_id) {
      query.owner_user_id = owner_user_id;
    }

    if (customer_id) {
      query.customer_id = customer_id;
    }

    logger.debug('Fetching library entries with query:', query, 'page:', pageNum, 'limit:', limitNum);

    // Get total count for pagination
    const totalCount = await TemplateLibrary.countDocuments(query);

    // Fetch library entries with pagination (no template_id population needed)
    const libraryEntries = await TemplateLibrary.find(query)
      .sort({ createdAt: 1 })  // Sort by oldest first (ascending)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Use lean() for faster queries (returns plain JS objects)

    // Create virtual template_id object for frontend compatibility
    const validEntries = libraryEntries.map(entry => {
      return {
        ...entry,
        template_id: {
          _id: entry._id,  // Use library entry ID as template ID
          name: entry.name,
          lengths: entry.lengths,
          angles: entry.angles,
          direction: entry.direction,
          reverseColor: entry.reverseColor,
          isTaper: entry.isTaper,
          farLengths: entry.farLengths,
          farAngles: entry.farAngles,
          nearLengths: entry.nearLengths,
          nearAngles: entry.nearAngles,
          partGroup: entry.part_group,  // Map part_group to partGroup
          partClass: entry.part_class,   // Map part_class to partClass
          // Drawing orientation and transformations
          firstSegmentAngle: entry.firstSegmentAngle,
          flipH: entry.flipH,
          flipV: entry.flipV,
          labelOffsets: entry.labelOffsets,
          // Fold information
          startFoldType: entry.startFoldType,
          startFoldDirection: entry.startFoldDirection,
          startFoldLength: entry.startFoldLength,
          startFoldGap: entry.startFoldGap,
          endFoldType: entry.endFoldType,
          endFoldDirection: entry.endFoldDirection,
          endFoldLength: entry.endFoldLength,
          endFoldGap: entry.endFoldGap
        }
      };
    });

    logger.debug(`Found ${validEntries.length} library entries (page ${pageNum}, total: ${totalCount})`);

    res.status(200).json({
      success: true,
      data: validEntries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasMore: skip + validEntries.length < totalCount
      }
    });

  } catch (error) {
    logger.error('Error fetching library entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch library entries',
      error: error.message
    });
  }
};

/**
 * Update a library entry by ID
 * Allows updating the name field
 */
exports.updateLibraryEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const libraryEntry = await TemplateLibrary.findById(id);

    if (!libraryEntry) {
      return res.status(404).json({
        success: false,
        message: 'Library entry not found'
      });
    }

    // Update only the name field
    libraryEntry.name = name;
    await libraryEntry.save();

    logger.info(`Library entry updated: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Library entry updated successfully',
      data: libraryEntry
    });

  } catch (error) {
    logger.error('Error updating library entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update library entry',
      error: error.message
    });
  }
};

/**
 * Delete a library entry by ID
 */
exports.deleteLibraryEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const libraryEntry = await TemplateLibrary.findById(id);

    if (!libraryEntry) {
      return res.status(404).json({
        success: false,
        message: 'Library entry not found'
      });
    }

    // Delete the library entry
    await TemplateLibrary.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Drawing removed from library successfully',
      data: {
        deleted_library_entry_id: id
      }
    });

  } catch (error) {
    logger.error('Error deleting library entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete library entry',
      error: error.message
    });
  }
};

/**
 * Check for duplicate library entries
 * Used before saving to show user a warning if duplicate exists
 */
exports.checkDuplicate = async (req, res) => {
  try {
    const { lengths, angles, library, partClass, partGroup, owner_user_id, customer_id } = req.query;

    if (!lengths || !angles) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: lengths and angles'
      });
    }

    const parsedLengths = JSON.parse(lengths);
    const parsedAngles = JSON.parse(angles);

    // Build query to find matching geometry
    const query = {
      lengths: parsedLengths,
      angles: parsedAngles
    };

    // Add library type filter
    if (library === 'my') {
      query.library_type = 'my_library';
      if (owner_user_id) {
        query.owner_user_id = owner_user_id;
      }
    } else if (library === 'customer') {
      query.library_type = 'customer_library';
      if (customer_id) {
        query.customer_id = customer_id;
      }
    } else if (partClass && partGroup) {
      query.library_type = 'part_class';
      query.part_class = partClass;
      query.part_group = partGroup;
    }

    logger.debug('Checking for duplicate library entry with query:', query);

    // Find matching library entry
    const duplicate = await TemplateLibrary.findOne(query).select('_id name');

    if (duplicate) {
      logger.debug('Found duplicate library entry:', duplicate._id);
      return res.json({
        success: true,
        duplicate
      });
    }

    return res.json({
      success: true,
      duplicate: null
    });
  } catch (error) {
    logger.error('Error checking for duplicate library entry:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check for duplicate',
      error: error.message
    });
  }
};
