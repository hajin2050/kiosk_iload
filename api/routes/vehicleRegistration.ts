import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaClient } from '@prisma/client';
import { parseVehicleRegistration, validateStructuredFields } from '../services/ocr/vehicleRegistration';
import { toCaseSummary, validateCaseSummary, mergeCaseSummaries } from '../services/ocr/normalize';
import { OCRResult, CaseSummary } from '../types/caseSummary';

// Extend Express Request type for multer
interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

const router = express.Router();
const prisma = new PrismaClient();
const execAsync = promisify(exec);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'storage', 'vehicle-registration');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `registration_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});

/**
 * POST /api/ocr/vehicle-registration
 * Process vehicle registration document with OCR
 */
router.post('/vehicle-registration', upload.single('file'), async (req: MulterRequest, res: Response) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: 'Image file required'
      });
    }

    console.log(`[OCR] Processing vehicle registration: ${req.file.filename}`);
    
    // Call Surya OCR Python script
    const pythonScript = path.join(__dirname, '..', 'lib', 'surya-ocr.py');
    const command = `python3 "${pythonScript}" "${req.file.path}"`;
    
    console.log(`[OCR] Executing Surya OCR...`);
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000, // 60 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    if (stderr && !stderr.includes('JSON output')) {
      console.warn('[OCR] Surya stderr:', stderr);
    }
    
    // Parse OCR output
    let ocrOutput;
    try {
      ocrOutput = JSON.parse(stdout);
    } catch (parseError) {
      console.error('[OCR] Failed to parse Surya output:', stdout);
      throw new Error('Invalid OCR output format');
    }
    
    if (!ocrOutput.success) {
      throw new Error(ocrOutput.error || 'OCR processing failed');
    }
    
    // Parse structured fields from raw text
    const textLines = ocrOutput.raw_text.split('\n').filter(line => line.trim());
    const structuredFields = {
      ...ocrOutput.structured_fields,
      ...parseVehicleRegistration(textLines)
    };
    
    // Validate structured fields
    const validation = validateStructuredFields(structuredFields);
    
    // Convert to CaseSummary format
    const summary = toCaseSummary(structuredFields);
    
    // Validate summary
    const summaryValidation = validateCaseSummary(summary);
    
    const processingTime = Date.now() - startTime;
    
    // Prepare response
    const response: OCRResult = {
      ok: true,
      raw_text: ocrOutput.raw_text,
      structured_fields: structuredFields,
      summary,
      confidence: ocrOutput.confidence === 'high' ? 0.9 : 0.7,
      processingTime
    };
    
    // Add warnings if validation failed
    if (!validation.isValid || !summaryValidation.isValid) {
      console.warn('[OCR] Validation warnings:', {
        fieldErrors: validation.errors,
        summaryErrors: summaryValidation.errors,
        summaryWarnings: summaryValidation.warnings
      });
    }
    
    console.log(`[OCR] Vehicle registration processed successfully in ${processingTime}ms`);
    console.log('[OCR] Extracted fields:', Object.keys(structuredFields));
    
    res.json(response);
    
  } catch (error) {
    console.error('[OCR] Vehicle registration processing error:', error);
    
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.warn('Failed to clean up error file:', err);
      }
    }
    
    res.status(500).json({
      ok: false,
      error: 'OCR processing failed',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * POST /api/vehicle-cases/:id/autofill
 * Auto-fill case with OCR results
 */
router.post('/vehicle-cases/:id/autofill', async (req, res) => {
  try {
    const { id } = req.params;
    const { summary, raw_text, structured_fields }: { 
      summary: CaseSummary; 
      raw_text?: string; 
      structured_fields?: any;
    } = req.body;
    
    if (!summary) {
      return res.status(400).json({
        ok: false,
        error: 'Summary data required'
      });
    }
    
    console.log(`[API] Auto-filling case ${id} with OCR data`);
    
    // Verify case exists
    const vehicleCase = await prisma.vehicleCase.findUnique({
      where: { id }
    });
    
    if (!vehicleCase) {
      return res.status(404).json({
        ok: false,
        error: 'Case not found'
      });
    }
    
    // Merge with existing summary if present
    let finalSummary = summary;
    if (vehicleCase.summaryJson) {
      const existingSummary = JSON.parse(vehicleCase.summaryJson as string);
      finalSummary = mergeCaseSummaries(existingSummary, summary);
    }
    
    // Update case with summary data
    const updatedCase = await prisma.vehicleCase.update({
      where: { id },
      data: {
        plateNumber: summary.vehicle.plate || vehicleCase.plateNumber,
        ownerName: summary.owner.name || vehicleCase.ownerName,
        companyName: summary.owner.companyName || vehicleCase.companyName,
        summaryJson: JSON.stringify(finalSummary)
      }
    });
    
    // Create OCR document record
    if (raw_text && structured_fields) {
      await prisma.document.create({
        data: {
          caseId: id,
          type: 'VEHICLE_REGISTRATION',
          filePath: 'ocr_import',
          ocrResult: raw_text,
          mappedFields: JSON.stringify(structured_fields),
          ocrConfidence: 'high'
        }
      });
    }
    
    // Sync to Odoo (non-blocking)
    try {
      const odooSync = require('../lib/odoo-sync');
      await odooSync.upsertCase({
        ...updatedCase,
        summaryJson: finalSummary
      });
    } catch (odooError) {
      console.error('[API] Odoo sync failed:', odooError);
      // Continue despite Odoo error
    }
    
    console.log(`[API] Case ${id} auto-filled successfully`);
    
    res.json({
      ok: true,
      data: {
        id: updatedCase.id,
        plateNumber: updatedCase.plateNumber,
        ownerName: updatedCase.ownerName,
        summary: finalSummary
      }
    });
    
  } catch (error) {
    console.error('[API] Auto-fill error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to auto-fill case',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * POST /api/vehicle-cases/:id/complete
 * Complete case and generate PDFs
 */
router.post('/vehicle-cases/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`[API] Completing case ${id}`);
    
    // Get case with documents
    const vehicleCase = await prisma.vehicleCase.findUnique({
      where: { id },
      include: { documents: true }
    });
    
    if (!vehicleCase) {
      return res.status(404).json({
        ok: false,
        error: 'Case not found'
      });
    }
    
    if (!vehicleCase.summaryJson) {
      return res.status(400).json({
        ok: false,
        error: 'Case summary required for completion'
      });
    }
    
    const summary = JSON.parse(vehicleCase.summaryJson as string) as CaseSummary;
    
    // Validate summary before completion
    const validation = validateCaseSummary(summary);
    if (!validation.isValid) {
      return res.status(400).json({
        ok: false,
        error: 'Case data validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }
    
    // Update case status
    const completedCase = await prisma.vehicleCase.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });
    
    // Generate PDFs
    const pdfGenerator = require('../lib/pdf-generator');
    const pdfPaths = await pdfGenerator.generateDocuments(completedCase, summary);
    
    // Upload PDFs to Odoo
    const odooSync = require('../lib/odoo-sync');
    for (const pdfPath of pdfPaths) {
      await odooSync.uploadAttachment(id, pdfPath);
    }
    
    console.log(`[API] Case ${id} completed with ${pdfPaths.length} PDFs generated`);
    
    res.json({
      ok: true,
      data: {
        id: completedCase.id,
        status: completedCase.status,
        completedAt: completedCase.completedAt,
        pdfs: pdfPaths.map(p => path.basename(p))
      }
    });
    
  } catch (error) {
    console.error('[API] Case completion error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to complete case',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * GET /api/ocr/vehicle-registration/sample
 * Get sample structured fields for testing
 */
router.get('/vehicle-registration/sample', (req, res) => {
  const sampleFields = {
    license_plate: '12가3456',
    vehicle_model: '소나타 DN8',
    chassis_number: 'KMHL341CBLA123456',
    owner_name: '홍길동',
    registered_address: '서울특별시 강남구 테헤란로 123',
    birth_date: '1980-01-15',
    initial_registration_date: '2020-03-20',
    manufacturing_date: '2020-01-10',
    engine_displacement: 1999,
    gross_weight: 1985,
    fuel_type: '휘발유',
    mileage_km: 45000,
    engine_number: 'G4NN123456',
    vehicle_color: '흰색'
  };
  
  const summary = toCaseSummary(sampleFields);
  
  res.json({
    ok: true,
    structured_fields: sampleFields,
    summary
  });
});

export default router;