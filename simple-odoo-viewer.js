#!/usr/bin/env node

/**
 * 간단한 Odoo 데이터 뷰어
 * Node.js API 서버의 데이터를 Odoo 형식으로 표시
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const app = express();
const prisma = new PrismaClient();
const PORT = 8069; // Odoo 기본 포트

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 정적 파일 제공
app.use(express.static('public'));

// 메인 대시보드
app.get('/', async (req, res) => {
  try {
    const cases = await prisma.vehicleCase.findMany({
      include: { documents: true },
      orderBy: { submittedAt: 'desc' }
    });
    
    const stats = {
      total: cases.length,
      received: cases.filter(c => c.status === 'RECEIVED').length,
      completed: cases.filter(c => c.status === 'COMPLETED').length,
      needDocs: cases.filter(c => c.status === 'NEED_MORE_DOCS').length,
      ocrComplete: cases.filter(c => c.summaryJson !== null).length
    };
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vehicle Export Cases - Odoo Style</title>
        <style>
          body { font-family: 'Lucida Grande', Ubuntu, Tahoma, Verdana, sans-serif; margin: 0; background: #f0f0f0; }
          .header { background: #875A7B; color: white; padding: 10px 20px; }
          .header h1 { margin: 0; font-size: 18px; }
          .container { padding: 20px; }
          .stats { display: flex; gap: 20px; margin-bottom: 20px; }
          .stat-card { background: white; padding: 15px; border-radius: 5px; text-align: center; min-width: 120px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .stat-number { font-size: 24px; font-weight: bold; color: #875A7B; }
          .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
          .cases-table { background: white; border-radius: 5px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .table-header { background: #f5f5f5; padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd; }
          .case-row { padding: 10px; border-bottom: 1px solid #eee; display: flex; align-items: center; }
          .case-row:hover { background: #f9f9f9; }
          .case-id { width: 200px; font-family: monospace; font-size: 11px; }
          .case-plate { width: 100px; font-weight: bold; }
          .case-owner { width: 150px; }
          .case-status { width: 120px; }
          .case-date { width: 150px; font-size: 12px; color: #666; }
          .case-docs { width: 80px; text-align: center; }
          .status-badge { padding: 2px 8px; border-radius: 3px; font-size: 11px; color: white; }
          .status-received { background: #17a2b8; }
          .status-completed { background: #28a745; }
          .status-need-docs { background: #ffc107; color: #333; }
          .has-summary { color: #28a745; font-weight: bold; }
          .view-link { color: #875A7B; text-decoration: none; }
          .view-link:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🚗 Vehicle Export Cases Management</h1>
        </div>
        
        <div class="container">
          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">${stats.total}</div>
              <div class="stat-label">Total Cases</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.ocrComplete}</div>
              <div class="stat-label">OCR Complete</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.received}</div>
              <div class="stat-label">Received</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.completed}</div>
              <div class="stat-label">Completed</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.needDocs}</div>
              <div class="stat-label">Need Docs</div>
            </div>
          </div>
          
          <div class="cases-table">
            <div class="table-header">
              <div style="display: flex;">
                <div class="case-id">Case ID</div>
                <div class="case-plate">Plate</div>
                <div class="case-owner">Owner</div>
                <div class="case-status">Status</div>
                <div class="case-date">Date</div>
                <div class="case-docs">OCR</div>
                <div>Actions</div>
              </div>
            </div>
            
            ${cases.map(c => `
              <div class="case-row">
                <div class="case-id">${c.id}</div>
                <div class="case-plate">${c.plateNumber || '-'}</div>
                <div class="case-owner">${c.ownerName || '-'}</div>
                <div class="case-status">
                  <span class="status-badge status-${c.status.toLowerCase().replace('_', '-')}">${c.status}</span>
                </div>
                <div class="case-date">${new Date(c.submittedAt).toLocaleDateString('ko-KR')}</div>
                <div class="case-docs">
                  <span class="${c.summaryJson ? 'has-summary' : ''}">${c.summaryJson ? '✓' : '-'}</span>
                </div>
                <div>
                  <a href="/case/${c.id}" class="view-link">View</a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    res.status(500).send('Database error: ' + error.message);
  }
});

// 케이스 상세 보기
app.get('/case/:id', async (req, res) => {
  try {
    const case_ = await prisma.vehicleCase.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    });
    
    if (!case_) {
      return res.status(404).send('Case not found');
    }
    
    let summary = null;
    if (case_.summaryJson) {
      try {
        summary = JSON.parse(case_.summaryJson);
      } catch (e) {
        console.error('Failed to parse summaryJson:', e);
      }
    }
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Case ${case_.id} - Vehicle Export</title>
        <style>
          body { font-family: 'Lucida Grande', Ubuntu, Tahoma, Verdana, sans-serif; margin: 0; background: #f0f0f0; }
          .header { background: #875A7B; color: white; padding: 10px 20px; display: flex; align-items: center; }
          .header h1 { margin: 0; font-size: 18px; }
          .back-btn { background: rgba(255,255,255,0.2); color: white; text-decoration: none; padding: 5px 10px; border-radius: 3px; margin-right: 20px; }
          .back-btn:hover { background: rgba(255,255,255,0.3); }
          .container { padding: 20px; }
          .case-info { background: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .info-row { display: flex; margin-bottom: 10px; }
          .info-label { width: 150px; font-weight: bold; color: #666; }
          .info-value { flex: 1; }
          .section { background: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .section h3 { margin-top: 0; color: #875A7B; }
          .json-data { background: #f8f9fa; padding: 15px; border-radius: 3px; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
          .status-badge { padding: 3px 10px; border-radius: 3px; font-size: 12px; color: white; background: #875A7B; }
        </style>
      </head>
      <body>
        <div class="header">
          <a href="/" class="back-btn">← Back</a>
          <h1>Case Details: ${case_.plateNumber || case_.id}</h1>
        </div>
        
        <div class="container">
          <div class="case-info">
            <div class="info-row">
              <div class="info-label">Case ID:</div>
              <div class="info-value" style="font-family: monospace;">${case_.id}</div>
            </div>
            <div class="info-row">
              <div class="info-label">License Plate:</div>
              <div class="info-value"><strong>${case_.plateNumber || '-'}</strong></div>
            </div>
            <div class="info-row">
              <div class="info-label">Owner:</div>
              <div class="info-value">${case_.ownerName || '-'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Owner Type:</div>
              <div class="info-value">${case_.ownerType || '-'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Company:</div>
              <div class="info-value">${case_.companyName || '-'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Status:</div>
              <div class="info-value"><span class="status-badge">${case_.status}</span></div>
            </div>
            <div class="info-row">
              <div class="info-label">Submitted:</div>
              <div class="info-value">${new Date(case_.submittedAt).toLocaleString('ko-KR')}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Documents:</div>
              <div class="info-value">${case_.documents.length} files</div>
            </div>
          </div>
          
          ${summary ? `
            <div class="section">
              <h3>📄 OCR Summary (CaseSummary JSON)</h3>
              <div class="json-data">${JSON.stringify(summary, null, 2)}</div>
            </div>
          ` : `
            <div class="section">
              <h3>📄 OCR Summary</h3>
              <p style="color: #999; font-style: italic;">No OCR data available for this case.</p>
            </div>
          `}
          
          <div class="section">
            <h3>📎 Documents</h3>
            ${case_.documents.length > 0 ? 
              case_.documents.map(doc => `
                <div style="margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px;">
                  <strong>${doc.type}</strong><br>
                  <small style="color: #666;">
                    ID: ${doc.id}<br>
                    File: ${doc.filePath}<br>
                    Uploaded: ${new Date(doc.createdAt).toLocaleString('ko-KR')}
                  </small>
                </div>
              `).join('') :
              '<p style="color: #999; font-style: italic;">No documents uploaded yet.</p>'
            }
          </div>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    res.status(500).send('Database error: ' + error.message);
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚗 Vehicle Export Cases Dashboard`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔍 케이스 확인: http://localhost:${PORT}/case/[CASE_ID]`);
  console.log(`⚙️  백엔드 API: http://localhost:3002`);
  console.log(`🖥️  프론트엔드: http://localhost:3003`);
});