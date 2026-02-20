/**
 * Template LRU Cache
 * Caches frequently accessed templates in memory for faster retrieval
 */

const { LRUCache } = require('lru-cache');
const { logger } = require('./logger');

/**
 * LRU Cache Configuration:
 * - max: 200 templates (most recently accessed)
 * - ttl: 30 minutes (auto-expire)
 * - maxSize: 200MB total memory limit
 */
const templateCache = new LRUCache({
  max: 200,                        // Maximum 200 templates
  ttl: 1000 * 60 * 30,            // 30 minutes TTL
  maxSize: 200 * 1024 * 1024,     // 200MB max memory
  sizeCalculation: (value) => {
    // Calculate size of cached template (rough estimate)
    return JSON.stringify(value).length;
  },
  dispose: (value, key) => {
    // Called when item is removed from cache (expired or evicted)
    //console.log(`🗑️ CACHE EVICTED: ${key} (TTL expired or cache full)`);
    //logger.info(`🗑️ Template removed from cache: ${key}`);
  }
});

/**
 * Get template from cache
 * @param {String} id - Template ID
 * @returns {Object|null} Cached template or null
 */
const getFromCache = (id) => {
  const cached = templateCache.get(id);
  if (cached) {
    //console.log(`✅ CACHE HIT for template ${id}`);
    //logger.info(`✅ Cache HIT for template ${id}`);
    return cached;
  }
  //console.log(`❌ CACHE MISS for template ${id} - fetching from DB`);
  //logger.info(`❌ Cache MISS for template ${id}`);
  return null;
};

/**
 * Save template to cache
 * @param {String} id - Template ID
 * @param {Object} template - Template object
 */
const saveToCache = (id, template) => {
  try {
    templateCache.set(id, template);
    const stats = getCacheStats();
    // console.log(`💾 SAVED to cache: ${id} (Cache size: ${stats.size}/${stats.maxSize})`);
    // logger.info(`💾 Saved template ${id} to cache`);
  } catch (error) {
    // console.log(`❌ CACHE SAVE FAILED: ${id} - ${error.message}`);
    // logger.error(`Failed to save template ${id} to cache:`, error.message);
  }
};

/**
 * Invalidate (remove) template from cache
 * Called when template is updated/deleted
 * @param {String} id - Template ID
 */
const invalidateCache = (id) => {
  if (templateCache.has(id)) {
    templateCache.delete(id);
    // console.log(`🔄 CACHE INVALIDATED: ${id}`);
    // logger.info(`🔄 Invalidated cache for template ${id}`);
  }
};

/**
 * Clear entire cache (use with caution!)
 */
const clearCache = () => {
  templateCache.clear();
  //logger.info('🗑️ Entire template cache cleared');
};

/**
 * Get cache statistics
 */
const getCacheStats = () => {
  return {
    size: templateCache.size,              // Current number of items
    maxSize: 200,                          // Max items allowed
    calculatedSize: templateCache.calculatedSize,  // Current memory usage (bytes)
    maxMemory: 200 * 1024 * 1024          // Max memory allowed (200MB)
  };
};

module.exports = {
  getFromCache,
  saveToCache,
  invalidateCache,
  clearCache,
  getCacheStats
};
