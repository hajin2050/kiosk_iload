const express = require('express')
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const odooSync = require('./lib/odoo-sync')

const app = express()
const prisma = new PrismaClient()

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

app.use(express.json())

// 파일 업로드 라우터 (multer)
app.use('/api/documents', require('./routes/document'))

// ✅ POST /api/vehicle-case — 케이스 생성 (중복 방지)
app.post('/api/vehicle-case', async (req, res) => {
  try {
    const { plateNumber, ownerName, ownerType, companyName, language } = req.body
    
    // 중복 케이스 확인: 같은 차량번호+소유자명으로 최근 24시간 이내 케이스가 있는지 체크
    const recentCase = await prisma.vehicleCase.findFirst({
      where: {
        plateNumber,
        ownerName,
        submittedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24시간 이전
        }
      },
      orderBy: { submittedAt: 'desc' }
    })
    
    if (recentCase) {
      console.log(`🔄 Returning existing case ${recentCase.id} for ${plateNumber}/${ownerName}`)
      return res.json({ ok: true, id: recentCase.id, qrToken: recentCase.qrToken, existing: true })
    }
    
    const newCase = await prisma.vehicleCase.create({
      data: {
        plateNumber,
        ownerName,
        ownerType,
        companyName,
        language,
        status: 'RECEIVED',
        qrToken: 'token_' + Math.random().toString(36).substr(2, 9),
        submittedAt: new Date()
      },
      include: { documents: true }
    })
    
    console.log(`✨ Created new case ${newCase.id} for ${plateNumber}/${ownerName}`)

    // Sync to Odoo after case creation (non-blocking)
    odooSync.syncCase(newCase).then(result => {
      if (result) {
        console.log('✅ Case synced to Odoo successfully:', newCase.id)
      }
    }).catch(error => {
      console.error('❌ Failed to sync new case to Odoo:', error.message)
    })
    
    res.json({ ok: true, id: newCase.id, qrToken: newCase.qrToken })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false })
  }
})

// ✅ GET /api/vehicle-case — 전체 케이스 조회
app.get('/api/vehicle-case', async (req, res) => {
  try {
    const cases = await prisma.vehicleCase.findMany({
      include: { documents: true },
      orderBy: { submittedAt: 'desc' }
    })
    res.json({ ok: true, data: cases })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false })
  }
})

// ✅ GET /api/vehicle-case/:id — 상세 조회
app.get('/api/vehicle-case/:id', async (req, res) => {
  try {
    const row = await prisma.vehicleCase.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    })
    if (!row) return res.status(404).json({ ok: false, message: 'Not found' })
    res.json({ ok: true, data: row })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false })
  }
})

// ✅ GET /api/cases/:id/status — Step 3에서 케이스 상태 및 OCR 데이터 조회
app.get('/api/cases/:id/status', async (req, res) => {
  try {
    const caseData = await prisma.vehicleCase.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    })
    
    if (!caseData) {
      return res.status(404).json({ ok: false, message: 'Case not found' })
    }

    // 차량등록증 문서에서 OCR 데이터 추출
    const vehicleRegistrationDoc = caseData.documents.find(doc => doc.type === 'VEHICLE_REGISTRATION')
    let vehicleData = {}
    
    if (vehicleRegistrationDoc && vehicleRegistrationDoc.mappedFields) {
      try {
        const mappedFields = typeof vehicleRegistrationDoc.mappedFields === 'string' 
          ? JSON.parse(vehicleRegistrationDoc.mappedFields) 
          : vehicleRegistrationDoc.mappedFields
        
        vehicleData = {
          license_plate: mappedFields.license_plate || '',
          vehicle_model: mappedFields.vehicle_model || '',
          manufacturing_date: mappedFields.manufacturing_date || '',
          chassis_number: mappedFields.chassis_number || '',
          registered_address: mappedFields.registered_address || '',
          owner_name: mappedFields.owner_name || '',
          birth_date: mappedFields.birth_date || '',
          mileage: mappedFields.mileage || 0,
          gross_weight: mappedFields.gross_weight || 0,
          engine_displacement: mappedFields.engine_displacement || 0,
          fuel_type: mappedFields.fuel_type || ''
        }
      } catch (parseError) {
        console.warn('Failed to parse mappedFields:', parseError)
      }
    }

    res.json({
      ok: true,
      case_id: caseData.id,
      status: caseData.status,
      vehicle_data: vehicleData,
      documents: caseData.documents.map(doc => ({
        id: doc.id,
        type: doc.type,
        ocr_processed: !!doc.ocrResult
      }))
    })
    
  } catch (e) {
    console.error('Error fetching case status:', e)
    res.status(500).json({ ok: false, message: 'Internal server error' })
  }
})

// ✅ PATCH /api/vehicle-case/:id/status — 상태 변경
app.patch('/api/vehicle-case/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const allowed = ['RECEIVED', 'NEED_MORE_DOCS', 'COMPLETED']
    if (!allowed.includes(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid status' })
    }

    const row = await prisma.vehicleCase.update({
      where: { id: req.params.id },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null
      },
      include: { documents: true }
    })

    // Sync to Odoo after status change (non-blocking)
    odooSync.syncCase(row).catch(error => {
      console.error('Failed to sync case to Odoo:', error.message)
    })

    res.json({ ok: true, data: row })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false })
  }
})

// ✅ 실제 OCR + LLM 검증: 문서ID로 OCR 처리
app.post('/api/documents/:id/ocr', async (req, res) => {
  const { performOCR, mapFieldsByDocumentType } = require('./lib/ocr')
  const { validateAndEnhanceOCRResult } = require('./lib/llm-validator')

  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc) return res.status(404).json({ ok:false, message:'doc not found' })

    const absPath = path.join(process.cwd(), doc.filePath)
    if (!fs.existsSync(absPath)) return res.status(404).json({ ok:false, message:'file missing' })

    console.log(`Starting OCR processing for document ${doc.id}, type: ${doc.type}`)
    
    // 1. Tesseract OCR 실행
    const ocrText = await performOCR(absPath)
    console.log('OCR Text extracted:', ocrText.slice(0, 100) + '...')
    
    // 2. 필드 매핑
    const mappedFields = mapFieldsByDocumentType(doc.type, ocrText)
    console.log('Mapped fields:', mappedFields)
    
    // 3. Ollama LLM 검증 및 보완
    let validationResult = {
      validated: true,
      confidence: 'medium',
      fields: mappedFields,
      errors: [],
      enhanced_fields: {}
    }
    
    try {
      validationResult = await validateAndEnhanceOCRResult(doc.type, ocrText, mappedFields, absPath)
      console.log('LLM validation completed:', validationResult.confidence)
    } catch (llmError) {
      console.warn('LLM validation failed, using OCR-only results:', llmError.message)
      validationResult.errors.push('LLM validation unavailable')
    }

    // 4. 결과 저장
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { 
        ocrResult: ocrText,
        mappedFields: validationResult.fields,
        validatedFields: validationResult.enhanced_fields,
        ocrConfidence: validationResult.confidence,
        ocrErrors: validationResult.errors
      }
    })

    // 5. Sync document to Odoo after OCR processing (non-blocking)
    odooSync.syncDocument(doc.caseId, updated, absPath).catch(error => {
      console.error('Failed to sync document to Odoo:', error.message)
    })

    return res.json({ 
      ok: true, 
      data: updated,
      validation: {
        confidence: validationResult.confidence,
        validated: validationResult.validated,
        errors: validationResult.errors
      }
    })
  } catch (e) {
    console.error('OCR processing error:', e)
    res.status(500).json({ ok:false, message: 'OCR processing failed', error: e.message })
  }
})

// ✅ Odoo에서 키오스크로 역동기화를 위한 엔드포인트
app.patch('/api/vehicle-case/:id', async (req, res) => {
  try {
    const { validatedFields, status, ocrValidated, ocrIssues } = req.body
    
    // 인증 확인 (Optional: Bearer token 검증)
    const authHeader = req.headers.authorization
    const expectedToken = process.env.ODOO_SHARED_SECRET
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' })
    }
    
    const updateData = {}
    
    if (validatedFields !== undefined) {
      updateData.validatedFields = validatedFields
    }
    if (status !== undefined) {
      updateData.status = status
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date()
      }
    }
    if (ocrValidated !== undefined) {
      updateData.llmValidated = ocrValidated
    }
    if (ocrIssues !== undefined) {
      updateData.llmIssues = ocrIssues
    }
    
    const updated = await prisma.vehicleCase.update({
      where: { id: req.params.id },
      data: updateData,
      include: { documents: true }
    })
    
    console.log(`Case ${req.params.id} updated from Odoo:`, updateData)
    res.json({ ok: true, data: updated })
    
  } catch (e) {
    console.error('Error updating case from Odoo:', e)
    if (e.code === 'P2025') {
      res.status(404).json({ ok: false, message: 'Case not found' })
    } else {
      res.status(500).json({ ok: false, message: 'Internal server error' })
    }
  }
})

// ✅ PDF 생성 및 다운로드 상태 확인
app.get('/api/vehicle-case/:id/pdf-status', async (req, res) => {
  try {
    const caseData = await prisma.vehicleCase.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    })

    if (!caseData) {
      return res.status(404).json({ ok: false, message: 'Case not found' })
    }

    // Odoo에서 PDF 생성 상태 확인
    try {
      const odooStatus = await odooSync.getCaseStatus(caseData.id)
      return res.json({
        ok: true,
        case: caseData,
        odoo_status: odooStatus,
        pdf_available: odooStatus?.status === 'COMPLETED' && odooStatus?.ocr_validated
      })
    } catch (error) {
      console.error('Failed to get Odoo status:', error)
      return res.json({
        ok: true,
        case: caseData,
        odoo_status: null,
        pdf_available: false
      })
    }

  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false })
  }
})

// ✅ PDF 생성 및 다운로드
app.post('/api/vehicle-case/:id/pdf', async (req, res) => {
  try {
    const caseData = await prisma.vehicleCase.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    })

    if (!caseData) {
      return res.status(404).json({ ok: false, message: 'Case not found' })
    }

    // Odoo에서 PDF 생성
    try {
      const pdfBuffer = await odooSync.generatePDF(caseData.id)
      
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="vehicle-deregistration-${caseData.id}.pdf"`)
      res.send(pdfBuffer)
      
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      res.status(500).json({ ok: false, message: 'PDF generation failed' })
    }

  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false })
  }
})

// ✅ PDF 미리보기
app.get('/api/vehicle-case/:id/pdf', async (req, res) => {
  try {
    const caseData = await prisma.vehicleCase.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    })

    if (!caseData) {
      return res.status(404).json({ ok: false, message: 'Case not found' })
    }

    // Odoo에서 PDF 생성
    try {
      const pdfBuffer = await odooSync.generatePDF(caseData.id)
      
      res.setHeader('Content-Type', 'application/pdf')
      if (req.query.preview === 'true') {
        res.setHeader('Content-Disposition', 'inline')
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="vehicle-deregistration-${caseData.id}.pdf"`)
      }
      res.send(pdfBuffer)
      
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      res.status(500).json({ ok: false, message: 'PDF generation failed' })
    }

  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false })
  }
})

// ✅ Health Check
app.get('/api/health', (_, res) => res.send('ok'))

const PORT = process.env.PORT || 3002
app.listen(PORT, () => console.log(`API ready on :${PORT}`))
