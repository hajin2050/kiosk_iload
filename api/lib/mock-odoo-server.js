#!/usr/bin/env node

/**
 * Mock Odoo Server for testing Kiosk integration
 * 실제 Odoo 서버가 없을 때 연동 테스트를 위한 Mock 서버
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json({ limit: '50mb' }));

// Mock 데이터 저장
const mockDatabase = {
  cases: new Map(),
  documents: new Map()
};

// Authorization 미들웨어
const authorize = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.ODOO_SHARED_SECRET || 'your_secure_shared_secret_here';
  
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Case upsert endpoint
app.post('/kiosk/api/case/upsert', authorize, (req, res) => {
  console.log('Received case upsert:', req.body);
  
  const caseData = {
    id: Date.now(),
    external_uuid: req.body.external_uuid,
    plate_number: req.body.plate_number,
    vin: req.body.vin,
    owner_type: req.body.owner_type,
    owner_name: req.body.owner_name,
    company_name: req.body.company_name,
    business_reg_no: req.body.business_reg_no,
    language: req.body.language,
    status: req.body.status,
    submitted_at: req.body.submitted_at,
    completed_at: req.body.completed_at,
    ocr_validated: req.body.ocr_validated,
    ocr_issues: req.body.ocr_issues,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  mockDatabase.cases.set(req.body.external_uuid, caseData);
  
  console.log('Case stored successfully:', caseData.external_uuid);
  
  res.json({
    ok: true,
    id: caseData.id,
    external_uuid: caseData.external_uuid,
    status: caseData.status
  });
});

// Document upload endpoint
app.post('/kiosk/api/document/upload', authorize, (req, res) => {
  console.log('Received document upload for case:', req.body.external_uuid);
  
  const documentData = {
    id: Date.now(),
    external_uuid: req.body.external_uuid,
    doc_type: req.body.doc_type,
    filename: req.body.filename,
    mimetype: req.body.mimetype,
    file_size: Buffer.from(req.body.file_base64, 'base64').length,
    ocr_text: req.body.ocr_text,
    mapped_fields: req.body.mapped_fields,
    created_at: new Date().toISOString()
  };
  
  const documentsForCase = mockDatabase.documents.get(req.body.external_uuid) || [];
  documentsForCase.push(documentData);
  mockDatabase.documents.set(req.body.external_uuid, documentsForCase);
  
  console.log(`Document stored successfully: ${documentData.filename} (${documentData.file_size} bytes)`);
  
  res.json({
    ok: true,
    id: documentData.id,
    filename: documentData.filename,
    doc_type: documentData.doc_type
  });
});

// Vehicle data update endpoint
app.patch('/kiosk/api/case/:caseId/vehicle-data', authorize, (req, res) => {
  console.log('Received vehicle data update for case:', req.params.caseId);
  
  const caseData = mockDatabase.cases.get(req.params.caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }
  
  caseData.vehicle_data = req.body.vehicle_data;
  caseData.updated_at = new Date().toISOString();
  
  console.log('Vehicle data updated successfully');
  
  res.json({
    ok: true,
    external_uuid: caseData.external_uuid,
    updated_at: caseData.updated_at
  });
});

// Case status endpoint
app.get('/kiosk/api/case/:caseId/status', authorize, (req, res) => {
  console.log('Status check for case:', req.params.caseId);
  
  const caseData = mockDatabase.cases.get(req.params.caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }
  
  res.json({
    ok: true,
    external_uuid: caseData.external_uuid,
    status: caseData.status,
    ocr_validated: caseData.ocr_validated,
    documents_count: (mockDatabase.documents.get(req.params.caseId) || []).length,
    last_updated: caseData.updated_at
  });
});

// PDF generation endpoint
app.post('/kiosk/api/case/:caseId/pdf', authorize, (req, res) => {
  console.log('PDF generation request for case:', req.params.caseId);
  
  const caseData = mockDatabase.cases.get(req.params.caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }
  
  // Mock PDF content
  const pdfContent = Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Mock Vehicle Deregistration PDF for Case: ${req.params.caseId}) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
299
%%EOF`);
  
  console.log('Mock PDF generated successfully');
  
  res.setHeader('Content-Type', 'application/pdf');
  res.send(pdfContent);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    service: 'Mock Odoo Server',
    cases_count: mockDatabase.cases.size,
    documents_count: Array.from(mockDatabase.documents.values()).reduce((total, docs) => total + docs.length, 0),
    timestamp: new Date().toISOString()
  });
});

// Serve UI
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'mock-odoo-ui.html');
  res.sendFile(htmlPath);
});

// Serve UI assets
app.get('/ui', (req, res) => {
  const htmlPath = path.join(__dirname, 'mock-odoo-ui.html');
  res.sendFile(htmlPath);
});

// 현재 저장된 데이터 조회 (디버깅용)
app.get('/debug/data', (req, res) => {
  res.json({
    cases: Array.from(mockDatabase.cases.values()),
    documents: Object.fromEntries(mockDatabase.documents)
  });
});

const PORT = process.env.ODOO_PORT || 8069;

app.listen(PORT, () => {
  console.log('Mock Odoo Server started on port', PORT);
  console.log('Available endpoints:');
  console.log('  POST /kiosk/api/case/upsert');
  console.log('  POST /kiosk/api/document/upload');
  console.log('  PATCH /kiosk/api/case/:caseId/vehicle-data');
  console.log('  GET /kiosk/api/case/:caseId/status');
  console.log('  POST /kiosk/api/case/:caseId/pdf');
  console.log('  GET /health');
  console.log('  GET /debug/data');
  console.log('');
  console.log('Authorization: Bearer', process.env.ODOO_SHARED_SECRET || 'your_secure_shared_secret_here');
});

module.exports = app;