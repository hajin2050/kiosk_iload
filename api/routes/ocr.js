const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const OdooClient = require('../lib/odooClient.js');

const router = express.Router();
const prisma = new PrismaClient();
const odooClient = new OdooClient();

// Multer 업로드 설정
const upload = multer({
  dest: '../uploads/',
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Surya OCR 실행 함수
async function runSuryaOCR(imagePath, language = 'ko') {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '..', 'lib', 'surya-ocr.py');
    const child = spawn('python3', [pythonScript, imagePath, language]);
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        console.error('Surya OCR stderr:', stderr);
        reject(new Error(`Surya OCR failed with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        console.error('Failed to parse Surya OCR output:', stdout);
        reject(new Error('Failed to parse OCR output'));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`Failed to start Surya OCR: ${err.message}`));
    });
  });
}

// 한국 차량 등록증 필드 매핑 함수
function mapVehicleRegistrationFields(ocrResult) {
  const text = ocrResult.text || '';
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const fields = {};
  
  // 번호판 번호 추출
  const platePatterns = [
    /(\d{2,3}[가-힣]\d{4})/g,
    /([가-힣]\d{2}[가-힣]\d{4})/g,
    /(\d{3}[가-힣]\d{4})/g
  ];
  
  for (const pattern of platePatterns) {
    const match = text.match(pattern);
    if (match) {
      fields.plateNumber = match[0];
      break;
    }
  }
  
  // 소유자명 추출
  const ownerPattern = /소유자.*?([가-힣]{2,10})/;
  const ownerMatch = text.match(ownerPattern);
  if (ownerMatch) {
    fields.ownerName = ownerMatch[1];
  }
  
  // 차명/모델명 추출
  const modelPatterns = [
    /차명.*?([가-힣\w\s]+)/,
    /모델.*?([가-힣\w\s]+)/
  ];
  
  for (const pattern of modelPatterns) {
    const match = text.match(pattern);
    if (match) {
      fields.vehicleModel = match[1].trim();
      break;
    }
  }
  
  // 차대번호 추출
  const vinPattern = /차대번호.*?([A-Z0-9]{17})/;
  const vinMatch = text.match(vinPattern);
  if (vinMatch) {
    fields.vin = vinMatch[1];
  }
  
  // 등록일자 추출
  const datePatterns = [
    /등록일.*?(\d{4}[-\.]\d{2}[-\.]\d{2})/,
    /(\d{4}[-\.]\d{2}[-\.]\d{2})/
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      fields.registrationDate = match[1];
      break;
    }
  }
  
  return fields;
}

router.post('/process', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'No file uploaded' });
    }
    
    const { caseId, documentType = 'VEHICLE_REGISTRATION' } = req.body;
    
    if (!caseId) {
      return res.status(400).json({ ok: false, message: 'caseId is required' });
    }
    
    // 케이스 존재 확인
    const vehicleCase = await prisma.vehicleCase.findUnique({
      where: { id: caseId }
    });
    
    if (!vehicleCase) {
      return res.status(404).json({ ok: false, message: 'Vehicle case not found' });
    }
    
    const filePath = req.file.path;
    const filename = req.file.originalname;
    
    console.log(`Starting OCR processing for case ${caseId}, file: ${filename}`);
    
    // Surya OCR 실행
    const ocrResult = await runSuryaOCR(filePath, 'ko');
    console.log('Surya OCR completed, text length:', ocrResult.text?.length || 0);
    
    // 필드 매핑
    let mappedFields = {};
    if (documentType === 'VEHICLE_REGISTRATION') {
      mappedFields = mapVehicleRegistrationFields(ocrResult);
    }
    
    // Document 레코드 생성
    const document = await prisma.document.create({
      data: {
        caseId: caseId,
        type: documentType,
        filePath: filePath,
        fileName: filename,
        ocrResult: ocrResult.text,
        mappedFields: mappedFields,
        ocrConfidence: ocrResult.confidence || 'medium'
      }
    });
    
    // CaseSummary 생성 (표준 스키마)
    const summary = {
      ownerInfo: {
        name: mappedFields.ownerName || vehicleCase.ownerName,
        type: vehicleCase.ownerType,
        companyName: vehicleCase.companyName || ''
      },
      vehicleInfo: {
        plateNumber: mappedFields.plateNumber || vehicleCase.plateNumber,
        model: mappedFields.vehicleModel || '',
        vin: mappedFields.vin || '',
        registrationDate: mappedFields.registrationDate || ''
      },
      documents: [{
        type: documentType,
        confidence: ocrResult.confidence || 'medium',
        extractedFields: mappedFields
      }]
    };
    
    // 케이스 업데이트 (summary 저장)
    const updatedCase = await prisma.vehicleCase.update({
      where: { id: caseId },
      data: {
        summary: summary
      },
      include: { documents: true }
    });
    
    // Odoo로 동기화 (비차단)
    odooClient.upsertVehicleCaseToOdoo({
      id: updatedCase.id,
      plateNumber: updatedCase.plateNumber,
      summary: summary,
      status: updatedCase.status,
      submittedAt: updatedCase.submittedAt,
      completedAt: updatedCase.completedAt
    }).catch(error => {
      console.error('Failed to sync case to Odoo:', error.message);
    });
    
    res.json({
      ok: true,
      data: {
        document: document,
        case: updatedCase,
        extractedFields: mappedFields,
        ocrText: ocrResult.text,
        confidence: ocrResult.confidence
      }
    });
    
  } catch (error) {
    console.error('OCR processing error:', error);
    res.status(500).json({ 
      ok: false, 
      message: 'OCR processing failed',
      error: error.message 
    });
  }
});

// GET /api/ocr/cases/:caseId/summary - 케이스 요약 정보
router.get('/cases/:caseId/summary', async (req, res) => {
  try {
    const { caseId } = req.params;
    
    const vehicleCase = await prisma.vehicleCase.findUnique({
      where: { id: caseId },
      include: { documents: true }
    });
    
    if (!vehicleCase) {
      return res.status(404).json({ ok: false, message: 'Case not found' });
    }
    
    // 표준 CaseSummary 스키마로 응답
    const summary = vehicleCase.summary || {
      ownerInfo: {
        name: vehicleCase.ownerName,
        type: vehicleCase.ownerType,
        companyName: vehicleCase.companyName || ''
      },
      vehicleInfo: {
        plateNumber: vehicleCase.plateNumber,
        model: '',
        vin: '',
        registrationDate: ''
      },
      documents: []
    };
    
    res.json({
      ok: true,
      data: {
        caseId: vehicleCase.id,
        plateNumber: vehicleCase.plateNumber,
        status: vehicleCase.status,
        submittedAt: vehicleCase.submittedAt,
        completedAt: vehicleCase.completedAt,
        summary: summary,
        documents: vehicleCase.documents.map(doc => ({
          id: doc.id,
          type: doc.type,
          fileName: doc.fileName,
          ocrConfidence: doc.ocrConfidence,
          extractedFields: doc.mappedFields,
          createdAt: doc.createdAt
        }))
      }
    });
    
  } catch (error) {
    console.error('Error fetching case summary:', error);
    res.status(500).json({ 
      ok: false, 
      message: 'Failed to fetch case summary',
      error: error.message 
    });
  }
});

module.exports = router;