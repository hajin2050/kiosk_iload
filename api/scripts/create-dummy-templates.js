const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createDummyTemplate(templateName, title, fields) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;

  // 제목
  page.drawText(title, {
    x: 50,
    y: 780,
    size: 18,
    font: font,
    color: rgb(0, 0, 0),
  });

  // 필드 레이블 그리기
  let currentY = 720;
  for (const field of fields) {
    page.drawText(field.label, {
      x: 50,
      y: currentY,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });

    // 입력 필드 영역 표시 (테두리)
    page.drawRectangle({
      x: field.x - 5,
      y: field.y - 5,
      width: field.w + 10,
      height: field.h + 10,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });

    currentY -= 40;
  }

  const pdfBytes = await pdfDoc.save();
  const templatePath = path.join(__dirname, `../templates/${templateName}/template.pdf`);
  fs.writeFileSync(templatePath, pdfBytes);
  console.log(`Created dummy template: ${templatePath}`);
}

async function main() {
  // 말소신청서 더미 템플릿
  await createDummyTemplate('dereg_form', 'Vehicle Deregistration Form', [
    { label: 'Owner Name:', x: 120, y: 650, w: 200, h: 20 },
    { label: 'ID/Corp Number:', x: 120, y: 620, w: 200, h: 20 },
    { label: 'Address:', x: 120, y: 590, w: 320, h: 25 },
    { label: 'Phone:', x: 120, y: 560, w: 200, h: 20 },
    { label: 'Plate Number:', x: 120, y: 530, w: 150, h: 20 },
    { label: 'VIN:', x: 300, y: 530, w: 200, h: 20 },
    { label: 'Model:', x: 120, y: 500, w: 200, h: 20 },
    { label: 'Mileage:', x: 350, y: 500, w: 100, h: 20 },
    { label: 'Reason:', x: 50, y: 450, w: 400, h: 20 },
    { label: 'Need Certificate:', x: 50, y: 420, w: 200, h: 20 },
    { label: 'Application Date:', x: 350, y: 380, w: 120, h: 20 },
    { label: 'Birth Date:', x: 120, y: 350, w: 120, h: 20 },
    { label: 'Applicant Sign:', x: 400, y: 300, w: 90, h: 36 },
  ]);

  // 인보이스 더미 템플릿
  await createDummyTemplate('invoice', 'Invoice', [
    { label: 'Shipper:', x: 120, y: 750, w: 200, h: 60 },
    { label: 'Buyer:', x: 120, y: 680, w: 200, h: 60 },
    { label: 'Notify Party:', x: 350, y: 680, w: 200, h: 60 },
    { label: 'Port of Loading:', x: 120, y: 600, w: 150, h: 20 },
    { label: 'Port of Discharge:', x: 300, y: 600, w: 150, h: 20 },
    { label: 'Final Destination:', x: 120, y: 570, w: 200, h: 20 },
    { label: 'Plate Number:', x: 120, y: 540, w: 150, h: 20 },
    { label: 'Description:', x: 120, y: 510, w: 200, h: 20 },
    { label: 'Quantity:', x: 350, y: 510, w: 50, h: 20 },
    { label: 'Unit Price:', x: 420, y: 510, w: 80, h: 20 },
    { label: 'Total Amount:', x: 420, y: 480, w: 100, h: 20 },
    { label: 'Weight (kg):', x: 350, y: 450, w: 80, h: 20 },
    { label: 'Invoice No. & Date:', x: 120, y: 420, w: 200, h: 20 },
  ]);

  console.log('Dummy templates created successfully!');
}

main().catch(console.error);