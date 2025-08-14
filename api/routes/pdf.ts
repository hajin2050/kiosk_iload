import express from 'express';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

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

    const { PdfEngine } = await import('../services/pdf/engine');
    const pdfEngine = new PdfEngine();
    
    // 임시 파일로 PDF 생성
    const tempFileName = `preview_${Date.now()}.pdf`;
    const tempPath = `api/generated-pdfs/${tempFileName}`;
    
    await pdfEngine.generatePdf(templateId, summary, tempPath);
    
    // PDF를 Base64로 인코딩하여 반환 (첫 페이지만)
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
function generateDownloadFilename(pdfFile: any): string {
  const plateNumber = pdfFile.case?.plateNumber || 'unknown';
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  
  const kindMap = {
    'DEREG_FORM': 'deregistration',
    'INVOICE': 'invoice',
  };
  
  const kindName = kindMap[pdfFile.kind as keyof typeof kindMap] || pdfFile.kind.toLowerCase();
  
  return `${kindName}_${plateNumber}_${timestamp}.pdf`;
}

export default router;