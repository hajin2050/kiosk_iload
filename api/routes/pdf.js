const express = require('express');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { PDFMapper } = require('../lib/pdf-mapper');
const OdooClient = require('../lib/odooClient.js');

const router = express.Router();
const prisma = new PrismaClient();
const pdfMapper = new PDFMapper();
const odooClient = new OdooClient();

// POST /api/pdf/generate/:caseId - 케이스 기반 PDF 생성 및 Odoo 첨부
router.post('/generate/:caseId', async (req, res) => {
  try {
    const { caseId } = req.params;
    const { kind = 'DEREG_FORM' } = req.body;
    
    // 케이스 조회
    const vehicleCase = await prisma.vehicleCase.findUnique({
      where: { id: caseId },
      include: { documents: true }
    });
    
    if (!vehicleCase) {
      return res.status(404).json({ ok: false, message: 'Vehicle case not found' });
    }
    
    // CaseSummary 추출
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
    
    // PDF 생성
    console.log(`Generating PDF for case ${caseId}, kind: ${kind}`);
    const pdfBase64 = await pdfMapper.generatePDFAsBase64(summary, caseId);
    
    // 파일명 생성
    const filename = `vehicle_${kind.toLowerCase()}_${vehicleCase.plateNumber}_${Date.now()}.pdf`;
    
    // Odoo에 PDF 첨부 (비차단)
    odooClient.attachPdfToOdoo(caseId, kind, filename, pdfBase64).catch(error => {
      console.error('Failed to attach PDF to Odoo:', error.message);
    });
    
    // 케이스 상태를 COMPLETED로 업데이트
    await prisma.vehicleCase.update({
      where: { id: caseId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });
    
    // Odoo 동기화
    odooClient.upsertVehicleCaseToOdoo({
      id: vehicleCase.id,
      plateNumber: vehicleCase.plateNumber,
      summary: summary,
      status: 'COMPLETED',
      submittedAt: vehicleCase.submittedAt,
      completedAt: new Date()
    }).catch(error => {
      console.error('Failed to sync completed case to Odoo:', error.message);
    });
    
    res.json({
      ok: true,
      filename: filename,
      pdfData: `data:application/pdf;base64,${pdfBase64}`,
      message: 'PDF generated and attached to Odoo successfully'
    });
    
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({
      ok: false,
      message: 'PDF generation failed',
      error: error.message
    });
  }
});

// GET /api/pdf/:fileId/download - PDF 다운로드
router.get('/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const pdfFile = await prisma.pdfFile.findUnique({
      where: { id: fileId },
      include: {
        case: true,
      },
    });

    if (!pdfFile) {
      return res.status(404).json({ error: 'PDF file not found' });
    }

    // 권한 검증 (TODO: 실제 사용자 권한 체크)
    
    const filePath = path.resolve(pdfFile.storageKey);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Physical file not found' });
    }

    // 파일명 생성
    const filename = generateDownloadFilename(pdfFile);
    
    // 다운로드 헤더 설정
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // 파일 스트림으로 전송
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    // 감사 로그 (TODO: 실제 로깅 시스템 연동)
    console.log(`PDF downloaded: ${filename} by user (TODO: get user from auth)`);
    
  } catch (error) {
    console.error('Failed to download PDF:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pdf/preview - PDF 미리보기 (선택사항)
router.post('/preview', async (req, res) => {
  try {
    const { templateId, summary } = req.body;
    
    if (!templateId || !summary) {
      return res.status(400).json({ error: 'Template ID and summary are required' });
    }

    // 임시 PDF 생성
    const tempFileName = `preview_${Date.now()}.pdf`;
    const tempPath = path.join(__dirname, '../generated-pdfs', tempFileName);
    
    // 간단한 더미 PDF 생성
    const { generateSimplePdf } = require('./vehicleCases');
    await generateSimplePdf(tempPath, `Preview: ${templateId}`, summary);
    
    // PDF를 Base64로 인코딩하여 반환
    const pdfBytes = fs.readFileSync(tempPath);
    const base64Pdf = Buffer.from(pdfBytes).toString('base64');
    
    // 임시 파일 삭제
    fs.unlinkSync(tempPath);
    
    res.json({
      previewData: `data:application/pdf;base64,${base64Pdf}`,
    });
    
  } catch (error) {
    console.error('Failed to generate preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// 다운로드 파일명 생성
function generateDownloadFilename(pdfFile) {
  const plateNumber = pdfFile.case?.plateNumber || 'unknown';
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  
  const kindMap = {
    'DEREG_FORM': 'deregistration',
    'INVOICE': 'invoice',
  };
  
  const kindName = kindMap[pdfFile.kind] || pdfFile.kind.toLowerCase();
  
  return `${kindName}_${plateNumber}_${timestamp}.pdf`;
}

module.exports = router;