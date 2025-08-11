const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function createCorrectedCoordinateMap() {
  try {
    const templatePath = '[별지 제17호서식] 자동차 말소등록 신청서(자동차등록규칙).pdf';
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    console.log(`📐 PDF 크기: ${width} x ${height}`);
    
    const font = await pdfDoc.embedFont('Helvetica');
    
    // 실제 PDF를 보고 정확히 맞춘 좌표들
    const correctedCoordinates = {
      // 상단 소유자 정보 섹션 - 표 형태로 되어있음
      owner_name: { x: 180, y: height - 260, size: 10 },        // 성명 입력란 (표 안)
      birth_date: { x: 400, y: height - 260, size: 10 },        // 주민등록번호 입력란 (표 안)
      address_line1: { x: 120, y: height - 300, size: 9 },      // 주소 입력란 (표 안)
      phone: { x: 400, y: height - 340, size: 9 },              // 전화번호 입력란 (표 안)
      
      // 차량 정보 섹션 - 중간 표
      license_plate: { x: 140, y: height - 415, size: 10 },     // 자동차등록번호 (표 안)
      chassis_number: { x: 280, y: height - 415, size: 9 },     // 차대번호 (표 안)
      mileage: { x: 450, y: height - 415, size: 10 },           // 주행거리 (km 앞)
      
      // 말소등록 원인 체크박스들 - 첫 번째 줄
      scrap_checkbox: { x: 132, y: height - 470, size: 12 },    // 폐차 체크박스
      
      // 말소사실증명서 체크박스
      certificate_checkbox: { x: 132, y: height - 515, size: 12 }, // 발급 필요 체크박스
      
      // 신청일 - 하단 서명 섹션 앞
      application_year: { x: 410, y: height - 580, size: 10 },  // 년
      application_month: { x: 450, y: height - 580, size: 10 }, // 월
      application_day: { x: 480, y: height - 580, size: 10 },   // 일
      
      // 신청인 정보 - 최하단
      applicant_name: { x: 150, y: height - 620, size: 10 },    // 신청인 성명
      applicant_birth: { x: 150, y: height - 650, size: 10 },   // 생년월일
    };
    
    // 테스트용 샘플 데이터
    const testData = {
      owner_name: 'HONG GILDONG',
      birth_date: '800101-1234567',
      address: 'SEOUL GANGNAM-GU',
      phone: '010-1234-5678',
      license_plate: '12A1234',
      chassis_number: 'TEST123456789',
      mileage: '50000',
    };
    
    console.log('🎯 수정된 좌표로 테스트 시작...');
    
    // 소유자 성명
    firstPage.drawText(testData.owner_name, {
      x: correctedCoordinates.owner_name.x,
      y: correctedCoordinates.owner_name.y,
      size: correctedCoordinates.owner_name.size,
      font: font,
    });
    
    // 주민등록번호
    firstPage.drawText(testData.birth_date, {
      x: correctedCoordinates.birth_date.x,
      y: correctedCoordinates.birth_date.y,
      size: correctedCoordinates.birth_date.size,
      font: font,
    });
    
    // 주소
    firstPage.drawText(testData.address, {
      x: correctedCoordinates.address_line1.x,
      y: correctedCoordinates.address_line1.y,
      size: correctedCoordinates.address_line1.size,
      font: font,
    });
    
    // 전화번호
    firstPage.drawText(testData.phone, {
      x: correctedCoordinates.phone.x,
      y: correctedCoordinates.phone.y,
      size: correctedCoordinates.phone.size,
      font: font,
    });
    
    // 자동차등록번호
    firstPage.drawText(testData.license_plate, {
      x: correctedCoordinates.license_plate.x,
      y: correctedCoordinates.license_plate.y,
      size: correctedCoordinates.license_plate.size,
      font: font,
    });
    
    // 차대번호
    firstPage.drawText(testData.chassis_number, {
      x: correctedCoordinates.chassis_number.x,
      y: correctedCoordinates.chassis_number.y,
      size: correctedCoordinates.chassis_number.size,
      font: font,
    });
    
    // 주행거리
    firstPage.drawText(testData.mileage, {
      x: correctedCoordinates.mileage.x,
      y: correctedCoordinates.mileage.y,
      size: correctedCoordinates.mileage.size,
      font: font,
    });
    
    // 체크박스들
    firstPage.drawText('V', {
      x: correctedCoordinates.scrap_checkbox.x,
      y: correctedCoordinates.scrap_checkbox.y,
      size: correctedCoordinates.scrap_checkbox.size,
      font: font,
    });
    
    firstPage.drawText('V', {
      x: correctedCoordinates.certificate_checkbox.x,
      y: correctedCoordinates.certificate_checkbox.y,
      size: correctedCoordinates.certificate_checkbox.size,
      font: font,
    });
    
    // 신청일
    const today = new Date();
    firstPage.drawText(today.getFullYear().toString(), {
      x: correctedCoordinates.application_year.x,
      y: correctedCoordinates.application_year.y,
      size: correctedCoordinates.application_year.size,
      font: font,
    });
    
    firstPage.drawText((today.getMonth() + 1).toString(), {
      x: correctedCoordinates.application_month.x,
      y: correctedCoordinates.application_month.y,
      size: correctedCoordinates.application_month.size,
      font: font,
    });
    
    firstPage.drawText(today.getDate().toString(), {
      x: correctedCoordinates.application_day.x,
      y: correctedCoordinates.application_day.y,
      size: correctedCoordinates.application_day.size,
      font: font,
    });
    
    // 신청인 정보
    firstPage.drawText(testData.owner_name, {
      x: correctedCoordinates.applicant_name.x,
      y: correctedCoordinates.applicant_name.y,
      size: correctedCoordinates.applicant_name.size,
      font: font,
    });
    
    firstPage.drawText('1980-01-01', {
      x: correctedCoordinates.applicant_birth.x,
      y: correctedCoordinates.applicant_birth.y,
      size: correctedCoordinates.applicant_birth.size,
      font: font,
    });
    
    // PDF 저장
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('corrected-coordinate-test.pdf', pdfBytes);
    
    console.log('✅ 수정된 좌표 테스트 PDF 생성 완료: corrected-coordinate-test.pdf');
    console.log('📋 수정된 좌표 맵핑:', JSON.stringify(correctedCoordinates, null, 2));
    
    return correctedCoordinates;
    
  } catch (error) {
    console.error('❌ 수정된 좌표 매핑 실패:', error);
  }
}

createCorrectedCoordinateMap();