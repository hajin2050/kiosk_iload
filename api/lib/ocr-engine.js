const Tesseract = require('tesseract.js');
const Jimp = require('jimp');
const path = require('path');

// OCR Engine Configuration
const OCR_CONFIG = {
  MIN_CONFIDENCE: parseInt(process.env.OCR_MIN_CONF) || 60,
  RETRY_MAX: parseInt(process.env.OCR_RETRY_MAX) || 3,
  DEFAULT_COUNTRY: process.env.OCR_COUNTRY_DEFAULT || 'KR',
  QUALITY_THRESHOLD: {
    MIN_WIDTH: 100,
    MIN_HEIGHT: 30,
    BLUR_THRESHOLD: 100,
    MAX_TILT: 15
  }
};

// Country-specific license plate patterns
const PLATE_PATTERNS = {
  KR: {
    regex: /^\d{2,3}[가-힣]\d{4}$/,
    format: '12가1234',
    charset: '0123456789가나다라마바사아자차카타파하허호',
    minLength: 7,
    maxLength: 8
  },
  KSA: {
    regex: /^[A-Z]{3}\s?\d{4}$/i,
    format: 'ABC 1234',
    charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    minLength: 7,
    maxLength: 8
  },
  US: {
    regex: /^[A-Z0-9]{2,8}$/i,
    format: 'ABC123',
    charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    minLength: 2,
    maxLength: 8
  },
  AE: {
    regex: /^[A-Z]\s?\d{1,5}$/i,
    format: 'A 12345',
    charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    minLength: 2,
    maxLength: 6
  }
};

// Character similarity mapping for common OCR errors
const CHAR_CORRECTIONS = {
  '0': ['O', 'Q', 'D'],
  'O': ['0', 'Q', 'D'],
  '1': ['I', 'l', '|'],
  'I': ['1', 'l', '|'],
  '5': ['S'],
  'S': ['5'],
  '8': ['B'],
  'B': ['8'],
  '6': ['G'],
  'G': ['6']
};

/**
 * Image Quality Analysis
 */
class ImageQualityAnalyzer {
  static async analyzeQuality(imagePath) {
    try {
      const image = await Jimp.read(imagePath);
      const analysis = {
        width: image.getWidth(),
        height: image.getHeight(),
        isBlurred: false,
        isTilted: false,
        quality: 'good'
      };

      // Size check
      if (analysis.width < OCR_CONFIG.QUALITY_THRESHOLD.MIN_WIDTH || 
          analysis.height < OCR_CONFIG.QUALITY_THRESHOLD.MIN_HEIGHT) {
        analysis.quality = 'poor';
      }

      // Blur detection using Laplacian variance
      const blurScore = await this.calculateBlurScore(image);
      if (blurScore < OCR_CONFIG.QUALITY_THRESHOLD.BLUR_THRESHOLD) {
        analysis.isBlurred = true;
        analysis.quality = 'poor';
      }

      analysis.blurScore = blurScore;
      return analysis;
    } catch (error) {
      console.error('Quality analysis failed:', error);
      return { quality: 'unknown', error: error.message };
    }
  }

  static async calculateBlurScore(image) {
    // Simple Laplacian-like edge detection for blur estimation
    const gray = image.clone().greyscale();
    const bitmap = gray.bitmap;
    let variance = 0;
    let count = 0;

    for (let y = 1; y < bitmap.height - 1; y++) {
      for (let x = 1; x < bitmap.width - 1; x++) {
        const idx = (bitmap.width * y + x) << 2;
        const center = bitmap.data[idx];
        
        // Simple edge detection
        const laplacian = Math.abs(
          4 * center - 
          bitmap.data[((bitmap.width * (y-1)) + x) << 2] -
          bitmap.data[((bitmap.width * (y+1)) + x) << 2] -
          bitmap.data[((bitmap.width * y) + (x-1)) << 2] -
          bitmap.data[((bitmap.width * y) + (x+1)) << 2]
        );
        
        variance += laplacian;
        count++;
      }
    }

    return count > 0 ? variance / count : 0;
  }

  static async preprocessImage(imagePath) {
    try {
      console.log(`[OCR] Preprocessing image: ${imagePath}`);
      
      const image = await Jimp.read(imagePath);
      
      // Image enhancement pipeline
      const processed = image
        .greyscale()                    // Convert to grayscale
        .contrast(0.3)                  // Increase contrast
        .normalize()                    // Normalize histogram
        .threshold({ max: 128 });       // Binary threshold
      
      // Save processed image
      const processedPath = imagePath.replace('.jpg', '_processed.jpg');
      await processed.writeAsync(processedPath);
      
      console.log(`[OCR] Preprocessed image saved: ${processedPath}`);
      return processedPath;
    } catch (error) {
      console.error('Image preprocessing failed:', error);
      throw error;
    }
  }
}

/**
 * License Plate OCR Engine
 */
class LicensePlateOCR {
  constructor() {
    this.worker = null;
  }

  async initialize() {
    if (!this.worker) {
      console.log('[OCR] Initializing Tesseract worker...');
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789가나다라마바사아자차카타파하허호',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        preserve_interword_spaces: '0'
      });
      
      console.log('[OCR] Tesseract worker initialized');
    }
  }

  async recognize(imagePath, country = 'KR', attempts = 1) {
    try {
      await this.initialize();
      
      console.log(`[OCR] Starting recognition attempt ${attempts} for ${country} plate`);
      
      // Quality analysis
      const quality = await ImageQualityAnalyzer.analyzeQuality(imagePath);
      console.log(`[OCR] Image quality analysis:`, quality);
      
      if (quality.quality === 'poor' && attempts === 1) {
        return {
          success: false,
          error: 'Poor image quality detected',
          quality,
          needsRetry: true
        };
      }

      // Preprocess image
      const processedPath = await ImageQualityAnalyzer.preprocessImage(imagePath);
      
      // OCR Recognition
      const startTime = Date.now();
      const { data } = await this.worker.recognize(processedPath);
      const processingTime = Date.now() - startTime;
      
      console.log(`[OCR] Raw OCR result: "${data.text}" (confidence: ${data.confidence}%)`);
      
      // Text cleaning and validation
      const cleanedText = this.cleanOCRText(data.text);
      const validationResult = this.validatePlateText(cleanedText, country);
      
      const result = {
        success: validationResult.valid,
        text: validationResult.correctedText || cleanedText,
        originalText: data.text,
        confidence: data.confidence,
        country,
        attempts,
        processingTime,
        quality,
        validation: validationResult,
        needsRetry: !validationResult.valid && attempts < OCR_CONFIG.RETRY_MAX
      };
      
      console.log(`[OCR] Final result:`, result);
      return result;
      
    } catch (error) {
      console.error(`[OCR] Recognition failed (attempt ${attempts}):`, error);
      return {
        success: false,
        error: error.message,
        attempts,
        needsRetry: attempts < OCR_CONFIG.RETRY_MAX
      };
    }
  }

  cleanOCRText(text) {
    return text
      .replace(/\s+/g, '')           // Remove all spaces
      .replace(/[^A-Za-z0-9가-힣]/g, '') // Keep only alphanumeric and Korean
      .toUpperCase()                 // Convert to uppercase
      .trim();
  }

  validatePlateText(text, country) {
    const pattern = PLATE_PATTERNS[country];
    if (!pattern) {
      return { valid: false, error: `Unsupported country: ${country}` };
    }

    console.log(`[OCR] Validating "${text}" against ${country} pattern`);
    
    // Length check
    if (text.length < pattern.minLength || text.length > pattern.maxLength) {
      return { 
        valid: false, 
        error: `Invalid length: ${text.length} (expected ${pattern.minLength}-${pattern.maxLength})` 
      };
    }

    // Pattern matching
    if (pattern.regex.test(text)) {
      return { valid: true, correctedText: text };
    }

    // Try character corrections
    const correctedText = this.attemptCharacterCorrection(text, pattern);
    if (correctedText && pattern.regex.test(correctedText)) {
      console.log(`[OCR] Character correction successful: "${text}" → "${correctedText}"`);
      return { valid: true, correctedText };
    }

    return { 
      valid: false, 
      error: `Pattern mismatch for ${country} format (expected: ${pattern.format})`,
      suggestion: this.generateSuggestion(text, pattern)
    };
  }

  attemptCharacterCorrection(text, pattern) {
    let corrected = text;
    
    // Try common OCR error corrections
    for (const [correct, similars] of Object.entries(CHAR_CORRECTIONS)) {
      for (const similar of similars) {
        const regex = new RegExp(similar, 'g');
        const testCorrection = corrected.replace(regex, correct);
        if (pattern.regex.test(testCorrection)) {
          return testCorrection;
        }
      }
    }
    
    return null;
  }

  generateSuggestion(text, pattern) {
    // Generate a suggestion based on the pattern
    if (pattern.regex.source.includes('\\d{2,3}[가-힣]\\d{4}')) {
      // Korean format suggestion
      return `Korean format: digits + Korean char + digits (e.g., ${pattern.format})`;
    }
    return `Expected format: ${pattern.format}`;
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      console.log('[OCR] Tesseract worker terminated');
    }
  }
}

// Singleton instance
const ocrEngine = new LicensePlateOCR();

// Graceful shutdown
process.on('SIGINT', async () => {
  await ocrEngine.terminate();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await ocrEngine.terminate();
  process.exit(0);
});

module.exports = {
  LicensePlateOCR,
  ImageQualityAnalyzer,
  OCR_CONFIG,
  PLATE_PATTERNS,
  ocrEngine
};