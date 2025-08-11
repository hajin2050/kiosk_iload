const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function createPreciseCoordinateMap() {
  try {
    const templatePath = '[별지 제17호서식] 자동차 말소등록 신청서(자동차등록규칙).pdf';
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    console.log(`📐 PDF 크기: ${width} x ${height}`);
    
    // 폰트 임베드
    const font = await pdfDoc.embedFont('Helvetica');
    
    // PDF 양식을 실제로 보고 분석한 정확한 좌표들
    const preciseCoordinates = {
      // 첫 번째 페이지 상단 소유자 정보 영역
      owner_name: { x: 250, y: height - 250, size: 11 },        // 성명(명칭) 입력란
      birth_date: { x: 430, y: height - 250, size: 11 },        // 주민등록번호 입력란
      address_line1: { x: 150, y: height - 290, size: 10 },     // 주소 첫 번째 줄
      phone: { x: 450, y: height - 330, size: 10 },             // 전화번호 입력란
      
      // 차량 정보 영역 (중간 부분)
      license_plate: { x: 180, y: height - 415, size: 11 },     // 자동차등록번호
      chassis_number: { x: 350, y: height - 415, size: 10 },    // 차대번호
      mileage: { x: 500, y: height - 415, size: 10 },           // 주행거리 (km 앞에)
      
      // 말소등록 원인 체크박스들 (첫 줄)
      scrap_checkbox: { x: 155, y: height - 473, size: 10 },    // 폐차 체크박스
      
      // 말소사실증명서 체크박스
      certificate_checkbox: { x: 270, y: height - 657, size: 10 }, // 발급 필요
      
      // 신청일 필드들 (년 월 일)
      application_year: { x: 455, y: height - 703, size: 10 },  // 년
      application_month: { x: 485, y: height - 703, size: 10 }, // 월  
      application_day: { x: 510, y: height - 703, size: 10 },   // 일
      
      // 하단 신청인 정보
      applicant_name: { x: 180, y: height - 730, size: 10 },    // 신청인 성명
      applicant_birth: { x: 180, y: height - 755, size: 10 },   // 생년월일
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
    
    // 각 필드를 정확한 위치에 배치하여 테스트
    console.log('🎯 정밀 좌표 테스트 시작...');
    
    // 소유자 성명
    firstPage.drawText(testData.owner_name, {
      x: preciseCoordinates.owner_name.x,
      y: preciseCoordinates.owner_name.y,
      size: preciseCoordinates.owner_name.size,
      font: font,
    });
    
    // 주민등록번호
    firstPage.drawText(testData.birth_date, {
      x: preciseCoordinates.birth_date.x,
      y: preciseCoordinates.birth_date.y,
      size: preciseCoordinates.birth_date.size,
      font: font,
    });
    
    // 주소
    firstPage.drawText(testData.address, {
      x: preciseCoordinates.address_line1.x,
      y: preciseCoordinates.address_line1.y,
      size: preciseCoordinates.address_line1.size,
      font: font,
    });
    
    // 전화번호
    firstPage.drawText(testData.phone, {
      x: preciseCoordinates.phone.x,
      y: preciseCoordinates.phone.y,
      size: preciseCoordinates.phone.size,
      font: font,
    });
    
    // 자동차등록번호
    firstPage.drawText(testData.license_plate, {
      x: preciseCoordinates.license_plate.x,
      y: preciseCoordinates.license_plate.y,
      size: preciseCoordinates.license_plate.size,
      font: font,
    });
    
    // 차대번호
    firstPage.drawText(testData.chassis_number, {
      x: preciseCoordinates.chassis_number.x,
      y: preciseCoordinates.chassis_number.y,
      size: preciseCoordinates.chassis_number.size,
      font: font,
    });
    
    // 주행거리
    firstPage.drawText(testData.mileage, {
      x: preciseCoordinates.mileage.x,
      y: preciseCoordinates.mileage.y,
      size: preciseCoordinates.mileage.size,
      font: font,
    });
    
    // 체크박스들
    firstPage.drawText('V', {
      x: preciseCoordinates.scrap_checkbox.x,
      y: preciseCoordinates.scrap_checkbox.y,
      size: preciseCoordinates.scrap_checkbox.size,
      font: font,
    });
    
    firstPage.drawText('V', {
      x: preciseCoordinates.certificate_checkbox.x,
      y: preciseCoordinates.certificate_checkbox.y,
      size: preciseCoordinates.certificate_checkbox.size,
      font: font,
    });
    
    // 신청일
    const today = new Date();
    firstPage.drawText(today.getFullYear().toString(), {
      x: preciseCoordinates.application_year.x,
      y: preciseCoordinates.application_year.y,
      size: preciseCoordinates.application_year.size,
      font: font,
    });
    
    firstPage.drawText((today.getMonth() + 1).toString(), {
      x: preciseCoordinates.application_month.x,
      y: preciseCoordinates.application_month.y,
      size: preciseCoordinates.application_month.size,
      font: font,
    });
    
    firstPage.drawText(today.getDate().toString(), {
      x: preciseCoordinates.application_day.x,
      y: preciseCoordinates.application_day.y,
      size: preciseCoordinates.application_day.size,
      font: font,
    });
    
    // 신청인 정보
    firstPage.drawText(testData.owner_name, {
      x: preciseCoordinates.applicant_name.x,
      y: preciseCoordinates.applicant_name.y,
      size: preciseCoordinates.applicant_name.size,
      font: font,
    });
    
    firstPage.drawText('1980-01-01', {
      x: preciseCoordinates.applicant_birth.x,
      y: preciseCoordinates.applicant_birth.y,
      size: preciseCoordinates.applicant_birth.size,
      font: font,
    });
    
    // PDF 저장
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('precise-coordinate-test.pdf', pdfBytes);
    
    console.log('✅ 정밀 좌표 테스트 PDF 생성 완료: precise-coordinate-test.pdf');
    console.log('📋 정밀 좌표 맵핑:', JSON.stringify(preciseCoordinates, null, 2));
    
    return preciseCoordinates;
    
  } catch (error) {
    console.error('❌ 정밀 좌표 매핑 실패:', error);
  }
}

createPreciseCoordinateMap();