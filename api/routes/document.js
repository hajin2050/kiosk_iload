// api/routes/document.js
const express = require('express')
const multer  = require('multer')
const path = require('path')
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const router = express.Router()

// 업로드 루트 준비
const uploadRoot = path.join(process.cwd(), 'storage')
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true })

//  caseId를 폴더명에 안전하게 쓰기 위한 필터
const safeCaseId = (s = '') => s.replace(/[^a-zA-Z0-9-_]/g, '')

//  multer 설정: 폴더/파일명 + 타입/사이즈 제한
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 임시 디렉토리로 먼저 저장
    cb(null, uploadRoot)
  },
  filename: (_, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)
    cb(ok ? null : new Error('unsupported file type'), ok)
  }
})

// POST /api/documents  (form-data: caseId, type, file)
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { caseId: rawCaseId, type } = req.body
    if (!req.file) return res.status(400).json({ ok:false, message:'file required' })
    if (!rawCaseId) return res.status(400).json({ ok:false, message:'caseId required' })

    const caseId = safeCaseId(rawCaseId)

    // caseId 존재 여부 확인
    const found = await prisma.vehicleCase.findUnique({ where: { id: caseId } })
    if (!found) return res.status(404).json({ ok:false, message:'case not found' })

    // enum 검증
    const allowed = ['VEHICLE_REGISTRATION','DELEGATION_FORM','INVOICE','ID_CARD','ETC']
    if (!allowed.includes(type)) {
      return res.status(400).json({ ok:false, message:'invalid type' })
    }

    // 파일을 올바른 디렉토리로 이동
    const targetDir = path.join(uploadRoot, caseId)
    fs.mkdirSync(targetDir, { recursive: true })
    
    const fileName = path.basename(req.file.path)
    const targetPath = path.join(targetDir, fileName)
    fs.renameSync(req.file.path, targetPath)

    // DB 저장 (상대경로로 저장)
    const doc = await prisma.document.create({
      data: {
        caseId,
        type,
        filePath: targetPath.replace(process.cwd() + '/', '')
      }
    })

    // (훅 자리) OCR 큐에 등록하거나 워커로 전달하고 싶다면 여기서 처리
    // await queue.add('ocr', { documentId: doc.id, path: targetPath, type })

    res.json({ ok:true, data: doc })
  } catch (e) {
    console.error(e)
    // multer의 fileFilter 에러 메시지 노출
    if (e.message === 'unsupported file type') {
      return res.status(415).json({ ok:false, message: e.message })
    }
    if (e.message === 'caseId required') {
      return res.status(400).json({ ok:false, message: e.message })
    }
    res.status(500).json({ ok:false })
  }
})

// POST /api/documents/:id/ocr - OCR 처리
router.post('/:id/ocr', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 문서 조회
    const document = await prisma.document.findUnique({
      where: { id }
    });
    
    if (!document) {
      return res.status(404).json({ ok: false, message: 'document not found' });
    }
    
    if (document.ocrResult) {
      // 이미 OCR 처리가 완료된 경우
      return res.json({ ok: true, data: document });
    }
    
    // 파일 경로 확인
    const filePath = path.join(process.cwd(), document.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, message: 'file not found' });
    }
    
    // OCR 라이브러리 로드
    const { performOCR, mapFieldsByDocumentType } = require('../lib/ocr');
    const { validateAndEnhanceOCRResult } = require('../lib/llm-validator');
    const odooSync = require('../lib/odoo-sync');
    
    // OCR 수행
    const ocrResult = await performOCR(filePath);
    console.log("[DEBUG] ocrResult:",ocrResult)
    // OCR 결과에서 텍스트 추출 (Surya OCR 객체 또는 Tesseract 문자열 처리)
    const ocrText = typeof ocrResult === 'object' ? ocrResult.text : ocrResult;
    
    // 문서 타입별 필드 매핑 (전체 OCR 결과 전달)
    const mappedFields = mapFieldsByDocumentType(document.type, ocrResult);
    
    // LLM을 통한 OCR 검증 및 개선 (차량등록증인 경우에만)
    let validatedFields = mappedFields;
    let llmResult = null;
    
    if (document.type === 'VEHICLE_REGISTRATION') {
      try {
        llmResult = await validateAndEnhanceOCRResult(
          'VEHICLE_REGISTRATION',
          ocrText,
          mappedFields,
          filePath
        );
        
        if (llmResult && llmResult.enhanced_fields) {
          validatedFields = { ...mappedFields, ...llmResult.enhanced_fields };
        }
      } catch (error) {
        console.error('LLM validation failed:', error);
        // LLM 실패시에도 기본 OCR 결과는 저장
      }
    }
    
    // OCR 메타데이터 추출
    const ocrMethod = typeof ocrResult === 'object' ? ocrResult.method || 'unknown' : 'tesseract';
    const ocrConfidence = typeof ocrResult === 'object' ? ocrResult.confidence || 'medium' : 'medium';
    console.log('[DEBUG] ocrResult type of:', typeof ocrResult, ocrResult)
    // DB 업데이트
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        ocrResult: ocrText,
        mappedFields: mappedFields,
        validatedFields: validatedFields,
        ocrConfidence: llmResult?.confidence || ocrConfidence,
        ocrErrors: llmResult?.errors || []
      }
    });


    
    // 차량 정보가 있으면 Odoo에 전송 (차량등록증인 경우)
    if (document.type === 'VEHICLE_REGISTRATION' && validatedFields) {
      try {
        await odooSync.updateCaseVehicleData(document.caseId, validatedFields);
        console.log('✅ Vehicle data synced to Odoo:', document.caseId);
      } catch (error) {
        console.error('❌ Failed to sync vehicle data to Odoo:', error);
        // 에러가 있어도 응답은 성공으로 처리 (OCR 자체는 성공했으므로)
      }
    }
    
    res.json({ ok: true, data: updatedDocument });
  } catch (error) {
    console.error('OCR processing failed:', error);
    res.status(500).json({ ok: false, message: 'OCR processing failed', error: error.message });
  }
});

module.exports = router
