const express = require('express');
const { PrismaClient } = require('@prisma/client');

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

    const updateData = {};
    
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

    const summary = vehicleCase.summaryJson;
    
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
async function generatePdfsForCase(vehicleCase, summary) {
  // 간단한 더미 PDF 생성 (실제로는 PDF 엔진 사용)
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
  const fs = require('fs');
  const path = require('path');
  
  const generatedFiles = [];

  try {
    // 말소신청서 PDF 생성
    const deregFileName = `dereg_${vehicleCase.plateNumber || 'unknown'}_${Date.now()}.pdf`;
    const deregOutputPath = path.join(__dirname, '../generated-pdfs', deregFileName);
    
    await generateSimplePdf(deregOutputPath, 'Vehicle Deregistration Form', summary);
    
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
      const invoiceOutputPath = path.join(__dirname, '../generated-pdfs', invoiceFileName);
      
      await generateSimplePdf(invoiceOutputPath, 'Invoice', summary);
      
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

// 간단한 PDF 생성 함수 (더미)
async function generateSimplePdf(outputPath, title, summary) {
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
  const fs = require('fs');
  
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 제목
  page.drawText(title, {
    x: 50,
    y: 750,
    size: 18,
    font: font,
    color: rgb(0, 0, 0),
  });

  // 내용
  let yPos = 700;
  const lineHeight = 20;
  
  if (summary.owner) {
    page.drawText(`Owner: ${summary.owner.name || 'N/A'}`, {
      x: 50, y: yPos, size: 12, font: font, color: rgb(0, 0, 0),
    });
    yPos -= lineHeight;
    
    if (summary.owner.address) {
      page.drawText(`Address: ${summary.owner.address}`, {
        x: 50, y: yPos, size: 10, font: font, color: rgb(0, 0, 0),
      });
      yPos -= lineHeight;
    }
  }
  
  if (summary.vehicle) {
    page.drawText(`Plate: ${summary.vehicle.plate || 'N/A'}`, {
      x: 50, y: yPos, size: 12, font: font, color: rgb(0, 0, 0),
    });
    yPos -= lineHeight;
    
    if (summary.vehicle.vin) {
      page.drawText(`VIN: ${summary.vehicle.vin}`, {
        x: 50, y: yPos, size: 10, font: font, color: rgb(0, 0, 0),
      });
      yPos -= lineHeight;
    }
  }

  if (summary.dereg) {
    page.drawText(`Reason: ${summary.dereg.reason || 'N/A'}`, {
      x: 50, y: yPos, size: 12, font: font, color: rgb(0, 0, 0),
    });
    yPos -= lineHeight;
  }

  // 생성일시
  page.drawText(`Generated: ${new Date().toISOString()}`, {
    x: 50, y: 50, size: 8, font: font, color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
}

module.exports = router;