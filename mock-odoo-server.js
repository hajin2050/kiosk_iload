const express = require('express');
const fs = require('fs');
const path = require('path');
const { PDFDocument: PDFLibDocument } = require('pdf-lib');
// const IntelligentPDFMapper = require('./api/lib/intelligent-pdf-mapper'); // 더 이상 사용하지 않음

const app = express();
app.use(express.json({ limit: '50mb' }));

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 인메모리 데이터 저장
const cases = new Map();
const documents = new Map();

// 더미 데이터 생성 비활성화
// function initSampleData() { /* 더미 데이터 생성 안함 */ }
console.log('📋 Mock ODOO server started without dummy data');

// 인증 미들웨어
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = auth.slice(7);
  if (token !== 'your_secure_shared_secret_here') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  next();
}

// 🔄 케이스 생성/업데이트
app.post('/kiosk/api/case/upsert', authenticate, (req, res) => {
  try {
    const caseData = req.body;
    console.log('📝 Mock Odoo: Case upsert', caseData.external_uuid);
    
    // 케이스 저장
    cases.set(caseData.external_uuid, {
      ...caseData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      internal_id: Date.now()
    });
    
    res.json({
      success: true,
      case_id: caseData.external_uuid,
      internal_id: Date.now(),
      message: 'Case synced successfully'
    });
    
  } catch (error) {
    console.error('❌ Mock Odoo case upsert error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 📄 문서 업로드
app.post('/kiosk/api/document/upload', authenticate, (req, res) => {
  try {
    const { external_uuid, doc_type, filename, mimetype, file_base64, ocr_text, mapped_fields } = req.body;
    console.log('📤 Mock Odoo: Document upload for case', external_uuid);
    
    const docId = `doc_${Date.now()}`;
    documents.set(docId, {
      id: docId,
      case_uuid: external_uuid,
      doc_type,
      filename,
      mimetype,
      ocr_text,
      mapped_fields,
      uploaded_at: new Date().toISOString()
    });
    
    // 케이스 상태 업데이트 (문서 업로드 시 OCR 검증 완료로 설정)
    if (cases.has(external_uuid)) {
      const caseData = cases.get(external_uuid);
      caseData.status = 'COMPLETED';
      caseData.ocr_validated = true;
      caseData.updated_at = new Date().toISOString();
      
      // 🚗 차량등록증 문서인 경우 OCR 매핑 데이터를 vehicle_data에 추가
      if (doc_type === 'VEHICLE_REGISTRATION' && mapped_fields && Object.keys(mapped_fields).length > 0) {
        console.log('🚗 Vehicle registration document detected, updating vehicle_data');
        caseData.vehicle_data = {
          ...caseData.vehicle_data,
          ...mapped_fields,
          // OCR 데이터의 신뢰성 표시
          ocr_confidence: 92,
          ocr_processed: true,
          last_updated: new Date().toISOString()
        };
        console.log('✅ Updated vehicle_data:', caseData.vehicle_data);
      }
      
      cases.set(external_uuid, caseData);
    }
    
    res.json({
      success: true,
      document_id: docId,
      message: 'Document uploaded successfully'
    });
    
  } catch (error) {
    console.error('❌ Mock Odoo document upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 📊 케이스 상태 확인
app.get('/kiosk/api/case/:case_id/status', authenticate, (req, res) => {
  try {
    const caseId = req.params.case_id;
    console.log('🔍 Mock Odoo: Status check for', caseId);
    
    if (!cases.has(caseId)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    const caseData = cases.get(caseId);
    const caseDocuments = Array.from(documents.values()).filter(doc => doc.case_uuid === caseId);
    
    res.json({
      case_id: caseId,
      status: caseData.status,
      ocr_validated: caseData.ocr_validated || caseDocuments.length > 0,
      submitted_at: caseData.submitted_at,
      completed_at: caseData.completed_at,
      document_count: caseDocuments.length,
      ocr_issues: caseData.ocr_issues || null
    });
    
  } catch (error) {
    console.error('❌ Mock Odoo status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 📑 PDF 생성 및 다운로드 (공식 양식 사용)
app.post('/kiosk/api/case/:case_id/pdf', authenticate, async (req, res) => {
  try {
    const caseId = req.params.case_id;
    console.log('📑 Mock Odoo: PDF generation for', caseId);
    
    if (!cases.has(caseId)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    const caseData = cases.get(caseId);
    const vehicleData = caseData.vehicle_data || {};
    
    // 공식 양식 템플릿 로드
    const templatePath = path.join(process.cwd(), '[별지 제17호서식] 자동차 말소등록 신청서(자동차등록규칙).pdf');
    
    if (!fs.existsSync(templatePath)) {
      console.error('❌ Template file not found:', templatePath);
      return res.status(500).json({ error: 'Template file not found' });
    }
    
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFLibDocument.load(templateBytes);
    
    // 수정된 정확한 좌표 사용
    const optimalCoordinates = {
      owner_name: { x: 180, y: 581, size: 10 },
      birth_date: { x: 400, y: 581, size: 10 },
      address_line1: { x: 120, y: 541, size: 9 },
      phone: { x: 400, y: 501, size: 9 },
      license_plate: { x: 140, y: 426, size: 10 },
      chassis_number: { x: 280, y: 426, size: 9 },
      mileage: { x: 450, y: 426, size: 10 },
      scrap_checkbox: { x: 132, y: 371, size: 12 },
      certificate_checkbox: { x: 132, y: 326, size: 12 },
      application_year: { x: 410, y: 261, size: 10 },
      application_month: { x: 450, y: 261, size: 10 },
      application_day: { x: 480, y: 261, size: 10 },
      applicant_name: { x: 150, y: 221, size: 10 },
      applicant_birth: { x: 150, y: 191, size: 10 }
    };
    
    // PDF에 텍스트 직접 추가 (LLM 분석 좌표 기반)
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    // 폰트 임베드
    const font = await pdfDoc.embedFont('Helvetica');
    
    try {
      // 🎯 LLM이 분석한 최적 좌표로 필드 배치
      console.log('📍 LLM 분석 좌표 적용 중...');
      
      // 소유자 성명
      if (vehicleData.owner_name && optimalCoordinates.owner_name) {
        const ownerName = vehicleData.owner_name.replace(/[^\x00-\x7F]/g, 'X');
        firstPage.drawText(ownerName, {
          x: optimalCoordinates.owner_name.x,
          y: optimalCoordinates.owner_name.y,
          size: optimalCoordinates.owner_name.size,
          font: font,
        });
        console.log(`✅ 소유자명 배치: (${optimalCoordinates.owner_name.x}, ${optimalCoordinates.owner_name.y})`);
      }
      
      // 주민등록번호
      if (vehicleData.birth_date && optimalCoordinates.birth_date) {
        const birthDate = vehicleData.birth_date.replace(/-/g, '');
        firstPage.drawText(birthDate, {
          x: optimalCoordinates.birth_date.x,
          y: optimalCoordinates.birth_date.y,
          size: optimalCoordinates.birth_date.size,
          font: font,
        });
        console.log(`✅ 주민번호 배치: (${optimalCoordinates.birth_date.x}, ${optimalCoordinates.birth_date.y})`);
      }
      
      // 주소
      if (vehicleData.registered_address && optimalCoordinates.address_line1) {
        const address = vehicleData.registered_address.replace(/[^\x00-\x7F]/g, 'X');
        firstPage.drawText(address, {
          x: optimalCoordinates.address_line1.x,
          y: optimalCoordinates.address_line1.y,
          size: optimalCoordinates.address_line1.size,
          font: font,
        });
        console.log(`✅ 주소 배치: (${optimalCoordinates.address_line1.x}, ${optimalCoordinates.address_line1.y})`);
      }
      
      // 전화번호 (가정: 차량데이터에 phone이 있다면)
      if (vehicleData.phone && optimalCoordinates.phone) {
        firstPage.drawText(vehicleData.phone, {
          x: optimalCoordinates.phone.x,
          y: optimalCoordinates.phone.y,
          size: optimalCoordinates.phone.size,
          font: font,
        });
        console.log(`✅ 전화번호 배치: (${optimalCoordinates.phone.x}, ${optimalCoordinates.phone.y})`);
      }
      
      // 자동차등록번호
      if (vehicleData.license_plate && optimalCoordinates.license_plate) {
        const plateNumber = vehicleData.license_plate.replace(/[^\x00-\x7F0-9]/g, '');
        firstPage.drawText(plateNumber, {
          x: optimalCoordinates.license_plate.x,
          y: optimalCoordinates.license_plate.y,
          size: optimalCoordinates.license_plate.size,
          font: font,
        });
        console.log(`✅ 차량번호 배치: (${optimalCoordinates.license_plate.x}, ${optimalCoordinates.license_plate.y})`);
      }
      
      // 차대번호
      if (vehicleData.chassis_number && optimalCoordinates.chassis_number) {
        firstPage.drawText(vehicleData.chassis_number, {
          x: optimalCoordinates.chassis_number.x,
          y: optimalCoordinates.chassis_number.y,
          size: optimalCoordinates.chassis_number.size,
          font: font,
        });
        console.log(`✅ 차대번호 배치: (${optimalCoordinates.chassis_number.x}, ${optimalCoordinates.chassis_number.y})`);
      }
      
      // 주행거리
      if (vehicleData.mileage && optimalCoordinates.mileage) {
        firstPage.drawText(vehicleData.mileage.toString(), {
          x: optimalCoordinates.mileage.x,
          y: optimalCoordinates.mileage.y,
          size: optimalCoordinates.mileage.size,
          font: font,
        });
        console.log(`✅ 주행거리 배치: (${optimalCoordinates.mileage.x}, ${optimalCoordinates.mileage.y})`);
      }
      
      // 폐차 체크박스
      if (optimalCoordinates.scrap_checkbox) {
        firstPage.drawText('X', {
          x: optimalCoordinates.scrap_checkbox.x,
          y: optimalCoordinates.scrap_checkbox.y,
          size: optimalCoordinates.scrap_checkbox.size,
          font: font,
        });
        console.log(`✅ 폐차 체크 배치: (${optimalCoordinates.scrap_checkbox.x}, ${optimalCoordinates.scrap_checkbox.y})`);
      }
      
      // 발급필요 체크박스
      if (optimalCoordinates.certificate_checkbox) {
        firstPage.drawText('X', {
          x: optimalCoordinates.certificate_checkbox.x,
          y: optimalCoordinates.certificate_checkbox.y,
          size: optimalCoordinates.certificate_checkbox.size,
          font: font,
        });
        console.log(`✅ 발급필요 체크 배치: (${optimalCoordinates.certificate_checkbox.x}, ${optimalCoordinates.certificate_checkbox.y})`);
      }
      
      // 신청일 (년월일) - LLM 좌표 사용
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      
      if (optimalCoordinates.application_year) {
        firstPage.drawText(year.toString(), {
          x: optimalCoordinates.application_year.x,
          y: optimalCoordinates.application_year.y,
          size: optimalCoordinates.application_year.size,
          font: font,
        });
        console.log(`✅ 신청년도 배치: (${optimalCoordinates.application_year.x}, ${optimalCoordinates.application_year.y})`);
      }
      
      if (optimalCoordinates.application_month) {
        firstPage.drawText(month.toString(), {
          x: optimalCoordinates.application_month.x,
          y: optimalCoordinates.application_month.y,
          size: optimalCoordinates.application_month.size,
          font: font,
        });
        console.log(`✅ 신청월 배치: (${optimalCoordinates.application_month.x}, ${optimalCoordinates.application_month.y})`);
      }
      
      if (optimalCoordinates.application_day) {
        firstPage.drawText(day.toString(), {
          x: optimalCoordinates.application_day.x,
          y: optimalCoordinates.application_day.y,
          size: optimalCoordinates.application_day.size,
          font: font,
        });
        console.log(`✅ 신청일 배치: (${optimalCoordinates.application_day.x}, ${optimalCoordinates.application_day.y})`);
      }
      
      // 신청인 성명
      if (vehicleData.owner_name && optimalCoordinates.applicant_name) {
        const applicantName = vehicleData.owner_name.replace(/[^\x00-\x7F]/g, 'X');
        firstPage.drawText(applicantName, {
          x: optimalCoordinates.applicant_name.x,
          y: optimalCoordinates.applicant_name.y,
          size: optimalCoordinates.applicant_name.size,
          font: font,
        });
        console.log(`✅ 신청인명 배치: (${optimalCoordinates.applicant_name.x}, ${optimalCoordinates.applicant_name.y})`);
      }
      
      // 신청인 생년월일
      if (vehicleData.birth_date && optimalCoordinates.applicant_birth) {
        firstPage.drawText(vehicleData.birth_date, {
          x: optimalCoordinates.applicant_birth.x,
          y: optimalCoordinates.applicant_birth.y,
          size: optimalCoordinates.applicant_birth.size,
          font: font,
        });
        console.log(`✅ 신청인 생년월일 배치: (${optimalCoordinates.applicant_birth.x}, ${optimalCoordinates.applicant_birth.y})`);
      }
      
      // 행정정보 공동이용 동의 체크
      firstPage.drawText('V', {
        x: 550,
        y: 50,
        size: 12,
        font: font,
      });
      
      console.log('✅ Form fields filled successfully');
      
    } catch (textError) {
      console.warn('⚠️ Some text could not be added:', textError.message);
      // 텍스트 추가에 실패해도 PDF는 생성
    }
    
    // PDF 바이트 생성
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    const filename = `vehicle-deregistration-${(vehicleData.license_plate || caseId).replace(/[^a-zA-Z0-9-_]/g, '')}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBytes));
    
    console.log('✅ PDF generated successfully for case:', caseId);
    
  } catch (error) {
    console.error('❌ Mock Odoo PDF generation error:', error);
    res.status(500).json({ error: 'PDF generation failed', details: error.message });
  }
});

// 🏥 헬스 체크
app.get('/kiosk/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    server: 'Mock Odoo',
    cases: cases.size,
    documents: documents.size,
    timestamp: new Date().toISOString()
  });
});

// 🌐 직원용 관리 웹 인터페이스
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Odoo 키오스크 관리 시스템</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Arial', sans-serif; background: #f5f5f5; color: #333; }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .header { background: #714B67; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .header h1 { font-size: 24px; margin-bottom: 8px; }
            .header p { opacity: 0.9; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
            .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .stat-number { font-size: 28px; font-weight: bold; color: #714B67; }
            .stat-label { color: #666; margin-top: 5px; }
            .section { background: white; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .section-header { padding: 20px; border-bottom: 1px solid #eee; }
            .section-header h2 { font-size: 18px; color: #714B67; }
            .case-list { padding: 20px; }
            .case-item { display: grid; grid-template-columns: auto 1fr auto; gap: 15px; padding: 15px; border: 1px solid #eee; border-radius: 6px; margin-bottom: 10px; align-items: flex-start; }
            .case-item:hover { background: #f9f9f9; }
            .case-item.expandable { cursor: pointer; }
            .case-details-expanded { margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #714B67; }
            .vehicle-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 10px; }
            .info-item { font-size: 12px; }
            .info-label { color: #666; font-weight: normal; }
            .info-value { color: #333; font-weight: bold; }
            .editable-field { display: flex; flex-direction: column; margin-bottom: 8px; }
            .editable-field input, .editable-field select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px; }
            .verification-section { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; margin-top: 15px; }
            .verification-actions { display: flex; gap: 10px; margin-top: 15px; }
            .btn-verify { background: #2196F3; color: white; }
            .btn-approve { background: #4CAF50; color: white; }
            .btn-reject { background: #F44336; color: white; }
            .status { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .status.RECEIVED { background: #e3f2fd; color: #1565c0; }
            .status.COMPLETED { background: #e8f5e8; color: #2e7d32; }
            .status.NEED_MORE_DOCS { background: #fff3e0; color: #f57c00; }
            .status.REJECTED { background: #ffebee; color: #c62828; }
            .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
            .btn-primary { background: #714B67; color: white; }
            .btn-success { background: #4caf50; color: white; }
            .btn-warning { background: #ff9800; color: white; }
            .btn:hover { opacity: 0.9; }
            .empty { text-align: center; color: #666; padding: 40px; }
            .refresh-btn { float: right; margin-left: 10px; }
            .case-details { font-size: 14px; color: #666; }
            .plate-number { font-weight: bold; color: #333; font-size: 16px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🏢 Odoo 키오스크 관리 시스템</h1>
                <p>차량 말소등록 신청 관리 대시보드</p>
            </div>
            
            <div class="stats" id="stats">
                <div class="stat-card">
                    <div class="stat-number" id="total-cases">-</div>
                    <div class="stat-label">총 케이스</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="completed-cases">-</div>
                    <div class="stat-label">완료된 케이스</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="total-documents">-</div>
                    <div class="stat-label">업로드된 문서</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="pending-cases">-</div>
                    <div class="stat-label">처리 대기</div>
                </div>
            </div>
            
            <div class="section">
                <div class="section-header">
                    <h2>📋 케이스 관리</h2>
                    <button class="btn btn-primary refresh-btn" onclick="loadData()">새로고침</button>
                </div>
                <div class="case-list" id="case-list">
                    <div class="empty">데이터를 불러오는 중...</div>
                </div>
            </div>
        </div>

        <script>
            async function loadData() {
                try {
                    const response = await fetch('/kiosk/api/admin/status');
                    const data = await response.json();
                    
                    // 통계 업데이트
                    document.getElementById('total-cases').textContent = data.stats.total_cases;
                    document.getElementById('completed-cases').textContent = data.stats.completed_cases;
                    document.getElementById('total-documents').textContent = data.stats.total_documents;
                    document.getElementById('pending-cases').textContent = data.stats.total_cases - data.stats.completed_cases;
                    
                    // 케이스 목록 업데이트
                    const caseList = document.getElementById('case-list');
                    if (data.cases.length === 0) {
                        caseList.innerHTML = '<div class="empty">등록된 케이스가 없습니다.</div>';
                        return;
                    }
                    
                    caseList.innerHTML = data.cases.map((case_, index) => \`
                        <div class="case-item expandable" onclick="toggleCaseDetails(\${index})">
                            <div class="plate-number">\${case_.plate_number || '미지정'}</div>
                            <div class="case-details">
                                <div><strong>\${case_.owner_name}</strong> (\${getOwnerTypeText(case_.owner_type)})</div>
                                <div>신청일: \${new Date(case_.submitted_at || case_.created_at).toLocaleString('ko-KR')}</div>
                                <div>케이스 ID: \${case_.id.substring(0, 8)}...</div>
                                \${case_.company_name ? \`<div>회사명: \${case_.company_name}</div>\` : ''}
                                
                                <div class="case-details-expanded" id="details-\${index}" style="display: none;">
                                    <h4 style="margin-bottom: 10px; color: #714B67;">📄 차량 정보 (OCR)</h4>
                                    \${case_.vehicle_data ? renderVehicleInfo(case_.vehicle_data) : '<div style="color: #666;">차량 정보 없음</div>'}
                                    
                                    <h4 style="margin: 15px 0 10px 0; color: #714B67;">📎 업로드된 서류</h4>
                                    \${case_.documents && case_.documents.length > 0 ? 
                                      case_.documents.map(doc => \`
                                        <div style="margin: 5px 0; padding: 5px; background: white; border-radius: 3px; font-size: 11px;">
                                          \${getDocumentIcon(doc.doc_type)} \${doc.filename} (\${doc.doc_type})
                                        </div>
                                      \`).join('') : 
                                      '<div style="color: #666;">업로드된 서류 없음</div>'
                                    }
                                    
                                    \${case_.vehicle_data && case_.status === 'RECEIVED' ? \`
                                      <div class="verification-section">
                                        <h4 style="margin-bottom: 15px; color: #714B67;">✅ OCR 데이터 검증 및 수정</h4>
                                        <div id="verification-form-\${index}">
                                          \${renderEditableVehicleForm(case_.vehicle_data, index)}
                                        </div>
                                        <div class="verification-actions">
                                          <button class="btn btn-verify" onclick="validateOCRData('\${case_.id}', \${index}); event.stopPropagation();">
                                            🔍 데이터 검증
                                          </button>
                                          <button class="btn btn-approve" onclick="approveCase('\${case_.id}', \${index}); event.stopPropagation();">
                                            ✅ 승인 및 PDF 생성
                                          </button>
                                          <button class="btn btn-reject" onclick="rejectCase('\${case_.id}', \${index}); event.stopPropagation();">
                                            ❌ 반려
                                          </button>
                                        </div>
                                      </div>
                                    \` : ''}
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-end;">
                                <div class="status \${case_.status}">\${getStatusText(case_.status)}</div>
                                <div>
                                    <button class="btn btn-success" onclick="generatePDF('\${case_.id}'); event.stopPropagation();" 
                                            \${case_.status !== 'COMPLETED' ? 'disabled' : ''}>
                                        📄 PDF
                                    </button>
                                    \${case_.status === 'RECEIVED' ? 
                                      \`<button class="btn btn-warning" onclick="updateStatus('\${case_.id}', 'COMPLETED'); event.stopPropagation();">✅ 완료</button>\` : 
                                      ''
                                    }
                                </div>
                            </div>
                        </div>
                    \`).join('');
                } catch (error) {
                    console.error('데이터 로드 실패:', error);
                    document.getElementById('case-list').innerHTML = '<div class="empty">데이터 로드에 실패했습니다.</div>';
                }
            }
            
            function getStatusText(status) {
                const statusMap = {
                    'RECEIVED': '접수됨',
                    'NEED_MORE_DOCS': '추가서류필요',
                    'COMPLETED': '완료됨',
                    'REJECTED': '반려됨'
                };
                return statusMap[status] || status;
            }
            
            function getOwnerTypeText(ownerType) {
                const typeMap = {
                    'INDIVIDUAL': '개인',
                    'BUSINESS': '개인사업자',
                    'CORPORATE': '법인사업자'
                };
                return typeMap[ownerType] || ownerType;
            }
            
            function getDocumentIcon(docType) {
                const iconMap = {
                    'VEHICLE_REGISTRATION': '📄',
                    'ID_CARD': '🆔',
                    'FOREIGN_ID_FRONT': '🆔',
                    'FOREIGN_ID_BACK': '🆔',
                    'BUSINESS_LICENSE': '📋',
                    'VEHICLE_MGMT_LICENSE': '📑',
                    'CORPORATE_REGISTRY': '📜',
                    'SEAL_CERTIFICATE': '🏛️',
                    'DELEGATION_FORM': '📝',
                    'INVOICE': '🧾'
                };
                return iconMap[docType] || '📁';
            }
            
            function renderVehicleInfo(vehicleData) {
                if (!vehicleData) return '<div style="color: #666;">차량 정보 없음</div>';
                
                return \`
                    <div class="vehicle-info">
                        \${vehicleData.license_plate ? \`
                            <div class="info-item">
                                <div class="info-label">차량번호</div>
                                <div class="info-value">\${vehicleData.license_plate}</div>
                            </div>
                        \` : ''}
                        \${vehicleData.vehicle_model ? \`
                            <div class="info-item">
                                <div class="info-label">차명</div>
                                <div class="info-value">\${vehicleData.vehicle_model}</div>
                            </div>
                        \` : ''}
                        \${vehicleData.manufacturing_date ? \`
                            <div class="info-item">
                                <div class="info-label">제조연일</div>
                                <div class="info-value">\${vehicleData.manufacturing_date}</div>
                            </div>
                        \` : ''}
                        \${vehicleData.chassis_number ? \`
                            <div class="info-item">
                                <div class="info-label">차대번호</div>
                                <div class="info-value">\${vehicleData.chassis_number}</div>
                            </div>
                        \` : ''}
                        \${vehicleData.mileage ? \`
                            <div class="info-item">
                                <div class="info-label">주행거리</div>
                                <div class="info-value">\${vehicleData.mileage?.toLocaleString()} km</div>
                            </div>
                        \` : ''}
                        \${vehicleData.fuel_type ? \`
                            <div class="info-item">
                                <div class="info-label">연료</div>
                                <div class="info-value">\${vehicleData.fuel_type}</div>
                            </div>
                        \` : ''}
                        \${vehicleData.engine_displacement ? \`
                            <div class="info-item">
                                <div class="info-label">배기량</div>
                                <div class="info-value">\${vehicleData.engine_displacement} cc</div>
                            </div>
                        \` : ''}
                        \${vehicleData.gross_weight ? \`
                            <div class="info-item">
                                <div class="info-label">총중량</div>
                                <div class="info-value">\${vehicleData.gross_weight} kg</div>
                            </div>
                        \` : ''}
                    </div>
                    \${vehicleData.registered_address ? \`
                        <div style="margin-top: 10px;">
                            <div class="info-label">사용본거지</div>
                            <div class="info-value">\${vehicleData.registered_address}</div>
                        </div>
                    \` : ''}
                \`;
            }
            
            function renderEditableVehicleForm(vehicleData, index) {
                if (!vehicleData) return '<div style="color: #666;">차량 정보 없음</div>';
                
                return \`
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="editable-field">
                            <label class="info-label">차량번호 *</label>
                            <input type="text" id="license_plate_\${index}" value="\${vehicleData.license_plate || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">차명</label>
                            <input type="text" id="vehicle_model_\${index}" value="\${vehicleData.vehicle_model || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">제조연일</label>
                            <input type="date" id="manufacturing_date_\${index}" value="\${vehicleData.manufacturing_date || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">차대번호 *</label>
                            <input type="text" id="chassis_number_\${index}" value="\${vehicleData.chassis_number || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">소유자명 *</label>
                            <input type="text" id="owner_name_\${index}" value="\${vehicleData.owner_name || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">생년월일</label>
                            <input type="date" id="birth_date_\${index}" value="\${vehicleData.birth_date || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">주행거리 (km)</label>
                            <input type="number" id="mileage_\${index}" value="\${vehicleData.mileage || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">총중량 (kg)</label>
                            <input type="number" id="gross_weight_\${index}" value="\${vehicleData.gross_weight || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">배기량 (cc)</label>
                            <input type="number" id="engine_displacement_\${index}" value="\${vehicleData.engine_displacement || ''}" />
                        </div>
                        <div class="editable-field">
                            <label class="info-label">연료</label>
                            <select id="fuel_type_\${index}">
                                <option value="휘발유" \${vehicleData.fuel_type === '휘발유' ? 'selected' : ''}>휘발유</option>
                                <option value="경유" \${vehicleData.fuel_type === '경유' ? 'selected' : ''}>경유</option>
                                <option value="LPG" \${vehicleData.fuel_type === 'LPG' ? 'selected' : ''}>LPG</option>
                                <option value="전기" \${vehicleData.fuel_type === '전기' ? 'selected' : ''}>전기</option>
                                <option value="하이브리드" \${vehicleData.fuel_type === '하이브리드' ? 'selected' : ''}>하이브리드</option>
                                <option value="CNG" \${vehicleData.fuel_type === 'CNG' ? 'selected' : ''}>CNG</option>
                            </select>
                        </div>
                    </div>
                    <div class="editable-field" style="margin-top: 10px;">
                        <label class="info-label">사용본거지</label>
                        <textarea id="registered_address_\${index}" rows="2" style="padding: 8px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px; resize: vertical;">\${vehicleData.registered_address || ''}</textarea>
                    </div>
                \`;
            }
            
            function getEditedVehicleData(index) {
                return {
                    license_plate: document.getElementById(\`license_plate_\${index}\`)?.value || '',
                    vehicle_model: document.getElementById(\`vehicle_model_\${index}\`)?.value || '',
                    manufacturing_date: document.getElementById(\`manufacturing_date_\${index}\`)?.value || '',
                    chassis_number: document.getElementById(\`chassis_number_\${index}\`)?.value || '',
                    owner_name: document.getElementById(\`owner_name_\${index}\`)?.value || '',
                    birth_date: document.getElementById(\`birth_date_\${index}\`)?.value || '',
                    mileage: parseInt(document.getElementById(\`mileage_\${index}\`)?.value) || 0,
                    gross_weight: parseInt(document.getElementById(\`gross_weight_\${index}\`)?.value) || 0,
                    engine_displacement: parseInt(document.getElementById(\`engine_displacement_\${index}\`)?.value) || 0,
                    fuel_type: document.getElementById(\`fuel_type_\${index}\`)?.value || '',
                    registered_address: document.getElementById(\`registered_address_\${index}\`)?.value || ''
                };
            }
            
            function toggleCaseDetails(index) {
                const details = document.getElementById(\`details-\${index}\`);
                if (details.style.display === 'none') {
                    details.style.display = 'block';
                } else {
                    details.style.display = 'none';
                }
            }
            
            async function validateOCRData(caseId, index) {
                const vehicleData = getEditedVehicleData(index);
                
                // 필수 필드 검증
                const requiredFields = ['license_plate', 'chassis_number', 'owner_name'];
                const missingFields = requiredFields.filter(field => !vehicleData[field]);
                
                if (missingFields.length > 0) {
                    alert(\`필수 필드가 누락되었습니다: \${missingFields.join(', ')}\`);
                    return;
                }
                
                alert('데이터 검증이 완료되었습니다. 승인 버튼을 눌러 PDF를 생성하세요.');
            }
            
            async function approveCase(caseId, index) {
                const vehicleData = getEditedVehicleData(index);
                
                // 필수 필드 검증
                const requiredFields = ['license_plate', 'chassis_number', 'owner_name'];
                const missingFields = requiredFields.filter(field => !vehicleData[field]);
                
                if (missingFields.length > 0) {
                    alert(\`필수 필드가 누락되었습니다: \${missingFields.join(', ')}\`);
                    return;
                }
                
                try {
                    // 승인 처리 및 PDF 생성
                    const response = await fetch(\`/kiosk/api/case/\${caseId}/approve\`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer your_secure_shared_secret_here'
                        },
                        body: JSON.stringify({
                            vehicle_data: vehicleData,
                            approved_at: new Date().toISOString()
                        })
                    });
                    
                    if (response.ok) {
                        alert('승인이 완료되었습니다. PDF가 자동으로 다운로드됩니다.');
                        
                        // PDF 자동 다운로드
                        const pdfResponse = await fetch(\`/kiosk/api/case/\${caseId}/pdf\`, {
                            method: 'POST',
                            headers: { 'Authorization': 'Bearer your_secure_shared_secret_here' }
                        });
                        
                        if (pdfResponse.ok) {
                            const blob = await pdfResponse.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = \`자동차말소신청서-\${vehicleData.license_plate}-\${caseId.substring(0, 8)}.pdf\`;
                            a.click();
                            window.URL.revokeObjectURL(url);
                        }
                        
                        loadData(); // 페이지 새로고침
                    } else {
                        alert('승인 처리에 실패했습니다.');
                    }
                } catch (error) {
                    console.error('승인 처리 실패:', error);
                    alert('승인 처리에 실패했습니다.');
                }
            }
            
            async function rejectCase(caseId, index) {
                const reason = prompt('반려 사유를 입력해주세요:');
                if (!reason) return;
                
                try {
                    const response = await fetch(\`/kiosk/api/case/\${caseId}/reject\`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer your_secure_shared_secret_here'
                        },
                        body: JSON.stringify({
                            reason: reason,
                            rejected_at: new Date().toISOString()
                        })
                    });
                    
                    if (response.ok) {
                        alert('케이스가 반려되었습니다.');
                        loadData(); // 페이지 새로고침
                    } else {
                        alert('반려 처리에 실패했습니다.');
                    }
                } catch (error) {
                    console.error('반려 처리 실패:', error);
                    alert('반려 처리에 실패했습니다.');
                }
            }
            
            async function updateStatus(caseId, newStatus) {
                try {
                    const response = await fetch(\`/kiosk/api/case/\${caseId}/status\`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    
                    if (response.ok) {
                        alert('상태가 업데이트되었습니다.');
                        loadData();
                    } else {
                        alert('상태 업데이트에 실패했습니다.');
                    }
                } catch (error) {
                    console.error('상태 업데이트 실패:', error);
                    alert('상태 업데이트에 실패했습니다.');
                }
            }
            
            async function generatePDF(caseId) {
                try {
                    const response = await fetch(\`/kiosk/api/case/\${caseId}/pdf\`, {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer your_secure_shared_secret_here' }
                    });
                    
                    if (response.ok) {
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = \`vehicle-deregistration-\${caseId.substring(0, 8)}.pdf\`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                    } else {
                        alert('PDF 생성에 실패했습니다.');
                    }
                } catch (error) {
                    console.error('PDF 생성 실패:', error);
                    alert('PDF 생성에 실패했습니다.');
                }
            }
            
            // 페이지 로드 시 데이터 로드
            loadData();
            
            // 30초마다 자동 새로고침
            setInterval(loadData, 30000);
        </script>
    </body>
    </html>
  `);
});

// ✅ 케이스 승인 (직원용)
app.post('/kiosk/api/case/:case_id/approve', authenticate, (req, res) => {
  try {
    const caseId = req.params.case_id;
    const { vehicle_data, approved_at } = req.body;
    
    console.log('📋 Mock Odoo: Case approval', caseId);
    
    if (cases.has(caseId)) {
      const caseData = cases.get(caseId);
      caseData.status = 'COMPLETED';
      caseData.vehicle_data = vehicle_data; // 검증된 차량 데이터 저장
      caseData.approved_at = approved_at;
      caseData.updated_at = new Date().toISOString();
      cases.set(caseId, caseData);
      
      res.json({
        success: true,
        message: 'Case approved successfully',
        case_id: caseId
      });
    } else {
      res.status(404).json({ error: 'Case not found' });
    }
  } catch (error) {
    console.error('❌ Mock Odoo case approval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🚗 차량 데이터 업데이트
app.patch('/kiosk/api/case/:case_id/vehicle-data', authenticate, (req, res) => {
  try {
    const caseId = req.params.case_id;
    const { vehicle_data } = req.body;
    
    console.log('🚗 Mock Odoo: Vehicle data update', caseId);
    
    if (cases.has(caseId)) {
      const caseData = cases.get(caseId);
      caseData.vehicle_data = vehicle_data;
      caseData.updated_at = new Date().toISOString();
      cases.set(caseId, caseData);
      
      res.json({
        success: true,
        message: 'Vehicle data updated successfully',
        case_id: caseId
      });
    } else {
      res.status(404).json({ error: 'Case not found' });
    }
  } catch (error) {
    console.error('❌ Mock Odoo vehicle data update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ❌ 케이스 반려 (직원용)
app.post('/kiosk/api/case/:case_id/reject', authenticate, (req, res) => {
  try {
    const caseId = req.params.case_id;
    const { reason, rejected_at } = req.body;
    
    console.log('❌ Mock Odoo: Case rejection', caseId);
    
    if (cases.has(caseId)) {
      const caseData = cases.get(caseId);
      caseData.status = 'REJECTED';
      caseData.rejection_reason = reason;
      caseData.rejected_at = rejected_at;
      caseData.updated_at = new Date().toISOString();
      cases.set(caseId, caseData);
      
      res.json({
        success: true,
        message: 'Case rejected successfully',
        case_id: caseId
      });
    } else {
      res.status(404).json({ error: 'Case not found' });
    }
  } catch (error) {
    console.error('❌ Mock Odoo case rejection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ⚡ 케이스 상태 변경 (직원용)
app.patch('/kiosk/api/case/:case_id/status', (req, res) => {
  try {
    const caseId = req.params.case_id;
    const { status } = req.body;
    
    console.log(`🔄 Mock Odoo: Status update for ${caseId} to ${status}`);
    
    if (!cases.has(caseId)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    const validStatuses = ['RECEIVED', 'NEED_MORE_DOCS', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const caseData = cases.get(caseId);
    caseData.status = status;
    caseData.updated_at = new Date().toISOString();
    
    if (status === 'COMPLETED') {
      caseData.completed_at = new Date().toISOString();
      caseData.ocr_validated = true;
    }
    
    cases.set(caseId, caseData);
    
    res.json({
      success: true,
      case_id: caseId,
      new_status: status,
      message: 'Status updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Mock Odoo status update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 📊 관리 정보 (디버깅용)
app.get('/kiosk/api/admin/status', (req, res) => {
  const casesArray = Array.from(cases.entries()).map(([id, data]) => ({ id, ...data }));
  const documentsArray = Array.from(documents.entries()).map(([id, data]) => ({ id, ...data }));
  
  res.json({
    cases: casesArray,
    documents: documentsArray,
    stats: {
      total_cases: cases.size,
      total_documents: documents.size,
      completed_cases: casesArray.filter(c => c.status === 'COMPLETED').length
    }
  });
});

const PORT = process.env.MOCK_ODOO_PORT || 8069;

app.listen(PORT, () => {
  console.log(`\n🎭 Mock Odoo Server started on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/kiosk/api/health`);
  console.log(`📊 Admin panel: http://localhost:${PORT}/kiosk/api/admin/status`);
  console.log(`🔑 Using secret: your_secure_shared_secret_here`);
  console.log(`\n✅ Ready to receive kiosk requests!\n`);
});

// 종료 처리
process.on('SIGINT', () => {
  console.log('\n👋 Mock Odoo Server shutting down...');
  process.exit(0);
});