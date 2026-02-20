/**
 * S3 Service
 *
 * Handles preview image uploads to AWS S3 for template visualization.
 *
 * This service:
 * - Uploads base64 preview images to S3 bucket
 * - Converts base64 to binary buffers
 * - Generates public S3 URLs for image access
 * - Supports rollback (deletes S3 files on transaction failure)
 *
 * Created: Day 5 - November 22, 2025
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { logger } = require('../utils/logger');
const sharp = require('sharp');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET_NAME = 'encore-sheet';

/**
 * Process and compress image data using Sharp
 * @param {String} imageData - Base64 image data URI
 * @param {String} filename - S3 key/filename to use
 * @returns {Promise<String|null>} S3 key if successful, null otherwise
 */
const processImageData = async (imageData, filename) => {
  try {
    if (!imageData) return null;

    // If it's a file path (legacy data), return null
    if (imageData.startsWith('/uploads/') || imageData.startsWith('uploads/')) {
      logger.info('[processImageData] Legacy file path detected:', imageData);
      return null;
    }

    // Process base64 data
    let base64Data = imageData;
    if (imageData.startsWith('data:image')) {
      // Remove the data URI prefix
      base64Data = imageData.split(';base64,')[1];
    }

    // Validate base64
    if (!base64Data || !base64Data.match(/^[A-Za-z0-9+/]+=*$/)) {
      logger.error('[processImageData] Invalid base64 data');
      return null;
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Compress using Sharp with optimized settings (effort 4 for faster processing)
    const optimizedBuffer = await sharp(buffer)
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .toColorspace("srgb")
      .webp({
        quality: 100,           // near-lossless
        lossless: false,        // smaller file size than true lossless
        nearLossless: true,     // preserves line details for technical drawings
        smartSubsample: true,   // better color handling for sharp edges
        effort: 4               // Reduced from 6 for faster processing (6 is slowest, 0 is fastest)
      })
      .toBuffer();

    // Upload to S3 (same as templateCtrl.js - using image/png content type)
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: optimizedBuffer,
      ContentType: 'image/png'
    });

    await s3Client.send(uploadCommand);
    logger.info(`[processImageData] Uploaded compressed image to S3: ${filename}`);

    // Return the S3 key
    return filename;

  } catch (err) {
    logger.error('[processImageData] Failed to process and upload image:', err.message);
    logger.error('[processImageData] Full error:', err);
    return null;
  }
};

/**
 * Upload preview images to S3
 * @param {Object} previews - { preview: base64String, splitPreviews: Array<base64String> }
 * @param {String} templateId - Template ID for naming
 * @returns {Object} { preview: S3_KEY, splitPreviews: Array<S3_KEY>, keys: Array<S3_KEY> }
 */
exports.uploadPreviewsToS3 = async (previews, templateId) => {
  logger.info('[uploadPreviewsToS3] Starting upload for template:', templateId);

  const uploadedKeys = [];
  const result = {
    preview: null,
    splitPreviews: [],
    keys: [] // For rollback
  };

  try {
    // Upload main preview
    if (previews.preview) {
      logger.info('[uploadPreviewsToS3] Processing and uploading main preview');

      // Generate unique filename (same pattern as templateCtrl.js)
      const filename = `${Date.now()}-drawings.png`;

      // Process, compress and upload using Sharp (same as templateCtrl.js)
      const s3Key = await processImageData(previews.preview, filename);

      if (s3Key) {
        uploadedKeys.push(s3Key);
        result.preview = s3Key; // Return S3 key (same as templateCtrl.js)
        logger.info('[uploadPreviewsToS3] Main preview uploaded:', s3Key);
      }
    }

    // Upload split previews
    if (previews.splitPreviews && Array.isArray(previews.splitPreviews) && previews.splitPreviews.length > 0) {
      logger.info('[uploadPreviewsToS3] Uploading', previews.splitPreviews.length, 'split previews');

      for (let i = 0; i < previews.splitPreviews.length; i++) {
        const splitPreview = previews.splitPreviews[i];

        logger.info(`[uploadPreviewsToS3] Processing split preview ${i + 1}...`);

        // Generate unique filename (same pattern as templateCtrl.js)
        const filename = `${Date.now()}-drawings.png`;

        // Process, compress and upload using Sharp (same as templateCtrl.js)
        const s3Key = await processImageData(splitPreview, filename);

        if (s3Key) {
          uploadedKeys.push(s3Key);
          result.splitPreviews.push(s3Key); // Return S3 key (same as templateCtrl.js)
          logger.info(`[uploadPreviewsToS3] Split preview ${i + 1} uploaded:`, s3Key);
        }
      }
    }

    result.keys = uploadedKeys;
    logger.info('[uploadPreviewsToS3] Upload complete. Total files:', uploadedKeys.length);
    return result;

  } catch (error) {
    logger.error('[uploadPreviewsToS3] Error:', error);
    // Rollback any uploaded files
    if (uploadedKeys.length > 0) {
      await this.rollbackS3Uploads(uploadedKeys);
    }
    throw error;
  }
};

/**
 * Rollback (delete) S3 uploads
 * @param {Array<String>} s3Keys - Array of S3 object keys to delete
 * @returns {Promise<void>}
 */
exports.rollbackS3Uploads = async (s3Keys) => {
  logger.info('[rollbackS3Uploads] Rolling back S3 uploads:', s3Keys);

  if (!s3Keys || s3Keys.length === 0) {
    logger.info('[rollbackS3Uploads] No keys to delete');
    return;
  }

  try {
    for (const key of s3Keys) {
      logger.info('[rollbackS3Uploads] Deleting:', key);

      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
      });

      await s3Client.send(command);
      logger.info('[rollbackS3Uploads] Deleted:', key);
    }

    logger.info('[rollbackS3Uploads] Successfully deleted', s3Keys.length, 'files');
  } catch (error) {
    logger.error('[rollbackS3Uploads] Error:', error);
    // Don't throw - rollback should be best-effort
    // Log as CRITICAL since this could leave orphaned files in S3
    logger.error('[rollbackS3Uploads] CRITICAL: Some S3 files may not have been deleted');
  }
};
