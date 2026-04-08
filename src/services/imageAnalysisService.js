const axios = require('axios');
const sharp = require('sharp');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Free-tier image characteristics analysis
 * Detects if image is likely of a real vehicle vs parts/toy
 */
async function analyzeImageBuffer(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata) {
      return { isVehicle: null, confidence: 0, reason: 'unable to read image' };
    }

    // Get color information
    const stats = await sharp(buffer)
      .resize(100, 100, { fit: 'cover' })
      .stats();

    if (!stats) {
      return { isVehicle: null, confidence: 0, reason: 'unable to analyze colors' };
    }

    // Heuristics for real vehicle detection
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;
    const aspectRatio = imageWidth / imageHeight;

    // Real marketplace car photos typically:
    // - Are decent resolution (not tiny thumbnails)
    // - Have reasonable aspect ratio (not extremely wide or tall)
    // - Show a full vehicle view or at least significant portion
    const isDimensionReasonable =
      imageWidth >= 300 && imageHeight >= 300 && aspectRatio >= 0.6 && aspectRatio <= 1.8;

    // Analyze color diversity (real cars have varied colors: body, wheels, windows, etc)
    // Toys and parts often have uniform colors or very few distinct colors
    const channels = stats.channels || [];
    let colorDeviation = 0;
    let colorVariety = 0;

    if (channels.length >= 3) {
      // Calculate standard deviation across RGB channels for color diversity
      const colorValues = channels.slice(0, 3).map((c) => c.mean);
      const mean = colorValues.reduce((a, b) => a + b, 0) / 3;
      colorDeviation = Math.sqrt(
        colorValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / 3
      );

      // Greater deviation = more color variety = more likely a real car
      colorVariety = colorDeviation > 40 ? 1 : colorDeviation > 25 ? 0.7 : 0.4;
    }

    // Toyish images often have very saturated, uniform colors
    // Real cars have controlled lighting with varied tones
    const hasGoodColorDiversity = colorVariety >= 0.6;

    // Calculate confidence score
    let confidence = 0.5; // Start at neutral
    let reasons = [];

    if (isDimensionReasonable) {
      confidence += 0.2;
      reasons.push('reasonable_dimensions');
    } else {
      reasons.push('unusual_dimensions');
    }

    if (hasGoodColorDiversity) {
      confidence += 0.2;
      reasons.push('color_diversity');
    } else {
      reasons.push('limited_colors');
    }

    // Penalize if appears to be a toy/part based on very small size
    if (imageWidth < 200 || imageHeight < 200) {
      confidence -= 0.3;
      reasons.push('small_dimensions');
    }

    // Boost confidence if image is landscape (typical car photo orientation)
    if (aspectRatio > 1.2 && aspectRatio < 1.8) {
      confidence += 0.15;
      reasons.push('landscape_ratio');
    }

    confidence = Math.max(0, Math.min(1, confidence)); // Clamp 0-1

    // Decision threshold: require at least 0.35 confidence to be considered a vehicle
    // (More permissive since text filters already catch most junk)
    const isVehicle = confidence >= 0.35;

    return {
      isVehicle,
      confidence: parseFloat(confidence.toFixed(2)),
      dimensions: { width: imageWidth, height: imageHeight },
      colorDiversity: parseFloat(colorVariety.toFixed(2)),
      reasons,
    };
  } catch (error) {
    logger.warn('Image analysis error', {
      error: error.message,
      bufferSize: buffer ? buffer.length : 0,
    });
    return { isVehicle: null, confidence: 0, reason: error.message };
  }
}

/**
 * Download and analyze image from URL
 */
async function downloadAndAnalyzeImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return { isVehicle: null, confidence: 0, reason: 'invalid_url' };
  }

  try {
    // Download image with timeout
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: env.imageAnalysis.timeoutMs,
      maxContentLength: 5 * 1024 * 1024, // Max 5MB
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.data) {
      return { isVehicle: null, confidence: 0, reason: 'empty_response' };
    }

    const buffer = Buffer.from(response.data);
    return analyzeImageBuffer(buffer);
  } catch (error) {
    logger.warn('Image download failed', {
      url: imageUrl.substring(0, 50),
      error: error.message,
      code: error.code,
    });
    return { isVehicle: null, confidence: 0, reason: `download_failed: ${error.message}` };
  }
}

/**
 * Analyze listing image for vehicle content
 * Returns true if image appears to contain a real vehicle
 * Returns null if unable to analyze (assume safe pass through)
 */
async function isListingImageVehicle(listing) {
  // Check if feature is enabled
  if (!env.imageAnalysis.enabled) {
    return null; // Skip analysis if disabled
  }

  if (!listing || !listing.image) {
    // No image = assume it's okay (other filters will catch non-vehicles)
    return null;
  }

  try {
    const result = await downloadAndAnalyzeImage(listing.image);

    logger.info('Listing image analyzed', {
      url: listing.url ? listing.url.substring(0, 50) : 'unknown',
      imageUrl: listing.image.substring(0, 50),
      isVehicle: result.isVehicle,
      confidence: result.confidence,
      reasons: result.reasons,
    });

    return result.isVehicle;
  } catch (error) {
    logger.error('Listing image analysis failed', {
      url: listing.url ? listing.url.substring(0, 50) : 'unknown',
      error: error.message,
    });
    // On error, return null to be permissive (other filters protect)
    return null;
  }
}

module.exports = {
  analyzeImageBuffer,
  downloadAndAnalyzeImage,
  isListingImageVehicle,
};
