import express from 'express';
import { PrismaClient } from '@prisma/client';
import { CaseSummary } from '../types/pdf';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/vehicle-cases/:id - 케이스 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const vehicleCase = await prisma.vehicleCase.findUnique({
      where: { id },
      include: {
        documents: true,
        pdfFiles: true,
      },
    });

    if (!vehicleCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(vehicleCase);
  } catch (error) {
    console.error('Failed to fetch case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/vehicle-cases/:id - 케이스 수정
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { summaryJson, plateNumber, ownerName, ownerType, companyName, status } = req.body;

    const updateData: any = {};
    
    if (summaryJson) updateData.summaryJson = summaryJson;
    if (plateNumber !== undefined) updateData.plateNumber = plateNumber;
    if (ownerName !== undefined) updateData.ownerName = ownerName;
    if (ownerType !== undefined) updateData.ownerType = ownerType;
    if (companyName !== undefined) updateData.companyName = companyName;
    if (status !== undefined) updateData.status = status;

    const updatedCase = await prisma.vehicleCase.update({
      where: { id },
      data: updateData,
      include: {
        documents: true,
        pdfFiles: true,
      },
    });

    res.json(updatedCase);
  } catch (error) {
    console.error('Failed to update case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/vehicle-cases/:id/complete - 완료 처리 및 PDF 생성
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    
    const vehicleCase = await prisma.vehicleCase.findUnique({
      where: { id },
      include: { documents: true },
    });

    if (!vehicleCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (!vehicleCase.summaryJson) {
      return res.status(400).json({ error: 'Case summary is required for completion' });
    }

    const summary = vehicleCase.summaryJson as CaseSummary;
    
    // PDF 생성 (비동기 처리)
    const generatedFiles = await generatePdfsForCase(vehicleCase, summary);
    
    // 케이스 상태 완료로 업데이트
    const completedCase = await prisma.vehicleCase.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      include: {
        pdfFiles: true,
      },
    });

    res.json({
      case: completedCase,
      generatedFiles: generatedFiles.map(file => ({
        kind: file.kind,
        fileId: file.id,
      })),
    });
  } catch (error) {
    console.error('Failed to complete case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PDF 생성 헬퍼 함수
async function generatePdfsForCase(vehicleCase: any, summary: CaseSummary) {
  const { PdfEngine } = await import('../services/pdf/engine');
  const pdfEngine = new PdfEngine();
  const generatedFiles = [];

  try {
    // 말소신청서 PDF 생성
    const deregFileName = `dereg_${vehicleCase.plateNumber || 'unknown'}_${Date.now()}.pdf`;
    const deregOutputPath = `api/generated-pdfs/${deregFileName}`;
    
    await pdfEngine.generatePdf('dereg_form', summary, deregOutputPath);
    
    const deregFile = await prisma.pdfFile.create({
      data: {
        caseId: vehicleCase.id,
        kind: 'DEREG_FORM',
        storageKey: deregOutputPath,
      },
    });
    
    generatedFiles.push(deregFile);

    // 인보이스 PDF 생성 (인보이스 정보가 있는 경우)
    if (summary.invoice) {
      const invoiceFileName = `invoice_${vehicleCase.plateNumber || 'unknown'}_${Date.now()}.pdf`;
      const invoiceOutputPath = `api/generated-pdfs/${invoiceFileName}`;
      
      await pdfEngine.generatePdf('invoice', summary, invoiceOutputPath);
      
      const invoiceFile = await prisma.pdfFile.create({
        data: {
          caseId: vehicleCase.id,
          kind: 'INVOICE',
          storageKey: invoiceOutputPath,
        },
      });
      
      generatedFiles.push(invoiceFile);
    }
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }

  return generatedFiles;
}

export default router;