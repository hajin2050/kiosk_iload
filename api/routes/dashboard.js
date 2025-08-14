const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { PDFMapper } = require('../lib/pdf-mapper');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const prisma = new PrismaClient();
const pdfMapper = new PDFMapper();

// Dashboard Home - 케이스 목록과 통계
router.get('/', async (req, res) => {
  try {
    const cases = await prisma.vehicleCase.findMany({
      include: { documents: true },
      orderBy: { submittedAt: 'desc' }
    });

    const stats = {
      total: cases.length,
      received: cases.filter(c => c.status === 'RECEIVED').length,
      need_docs: cases.filter(c => c.status === 'NEED_MORE_DOCS').length,
      completed: cases.filter(c => c.status === 'COMPLETED').length
    };

    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>차량 등록해지 관리 대시보드</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Malgun Gothic', sans-serif; background: #f5f5f5; }
            .header { background: #2c3e50; color: white; padding: 1rem; text-align: center; }
            .container { max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
            .stat-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
            .stat-number { font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem; }
            .stat-label { color: #666; }
            .received { color: #3498db; }
            .need-docs { color: #f39c12; }
            .completed { color: #27ae60; }
            .total { color: #34495e; }
            .cases-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .table-header { background: #34495e; color: white; padding: 1rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #eee; }
            th { background: #f8f9fa; font-weight: bold; }
            .status-badge { padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
            .status-received { background: #e3f2fd; color: #1976d2; }
            .status-need-docs { background: #fff3e0; color: #f57c00; }
            .status-completed { background: #e8f5e8; color: #388e3c; }
            .action-btn { padding: 0.5rem 1rem; margin: 0.25rem; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; }
            .btn-view { background: #3498db; color: white; }
            .btn-edit { background: #f39c12; color: white; }
            .btn-complete { background: #27ae60; color: white; }
            .btn-pdf { background: #e74c3c; color: white; }
            .action-btn:hover { opacity: 0.8; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🚗 차량 등록해지 관리 대시보드</h1>
            <p>직원용 케이스 관리 시스템</p>
        </div>
        
        <div class="container">
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number total">${stats.total}</div>
                    <div class="stat-label">전체 케이스</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number received">${stats.received}</div>
                    <div class="stat-label">접수 완료</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number need-docs">${stats.need_docs}</div>
                    <div class="stat-label">서류 보완 필요</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number completed">${stats.completed}</div>
                    <div class="stat-label">처리 완료</div>
                </div>
            </div>

            <div class="cases-table">
                <div class="table-header">
                    <h2>📋 케이스 목록</h2>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>케이스 ID</th>
                            <th>차량번호</th>
                            <th>소유자</th>
                            <th>상태</th>
                            <th>제출일시</th>
                            <th>완료일시</th>
                            <th>작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cases.map(case_ => `
                            <tr>
                                <td>${case_.id.slice(-8)}</td>
                                <td><strong>${case_.plateNumber}</strong></td>
                                <td>${case_.ownerName}${case_.companyName ? ` (${case_.companyName})` : ''}</td>
                                <td><span class="status-badge status-${case_.status.toLowerCase().replace('_', '-')}">${getStatusText(case_.status)}</span></td>
                                <td>${new Date(case_.submittedAt).toLocaleString('ko-KR')}</td>
                                <td>${case_.completedAt ? new Date(case_.completedAt).toLocaleString('ko-KR') : '-'}</td>
                                <td>
                                    <a href="/api/dashboard/case/${case_.id}" class="action-btn btn-view">상세보기</a>
                                    ${case_.status !== 'COMPLETED' ? `<a href="/api/dashboard/case/${case_.id}/complete" class="action-btn btn-complete">완료처리</a>` : ''}
                                    <a href="/api/pdf/generate/${case_.id}" class="action-btn btn-pdf">PDF생성</a>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <script>
            function getStatusText(status) {
                const statusMap = {
                    'RECEIVED': '접수완료',
                    'NEED_MORE_DOCS': '서류보완필요', 
                    'COMPLETED': '처리완료'
                };
                return statusMap[status] || status;
            }
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 케이스 상세 조회
router.get('/case/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const case_ = await prisma.vehicleCase.findUnique({
      where: { id },
      include: { documents: true }
    });

    if (!case_) {
      return res.status(404).send('Case not found');
    }

    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>케이스 상세 - ${case_.plateNumber}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Malgun Gothic', sans-serif; background: #f5f5f5; }
            .header { background: #2c3e50; color: white; padding: 1rem; }
            .container { max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
            .card { background: white; border-radius: 8px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .back-btn { background: #95a5a6; color: white; padding: 0.5rem 1rem; text-decoration: none; border-radius: 4px; display: inline-block; margin-bottom: 1rem; }
            .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
            .info-item { margin-bottom: 1rem; }
            .info-label { font-weight: bold; color: #666; margin-bottom: 0.25rem; }
            .info-value { font-size: 1.1rem; }
            .status-badge { padding: 0.5rem 1rem; border-radius: 20px; font-weight: bold; }
            .status-received { background: #e3f2fd; color: #1976d2; }
            .status-need-docs { background: #fff3e0; color: #f57c00; }
            .status-completed { background: #e8f5e8; color: #388e3c; }
            .documents { margin-top: 2rem; }
            .doc-item { border: 1px solid #ddd; padding: 1rem; margin-bottom: 1rem; border-radius: 4px; }
            .actions { text-align: center; margin-top: 2rem; }
            .action-btn { padding: 1rem 2rem; margin: 0.5rem; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-weight: bold; }
            .btn-complete { background: #27ae60; color: white; }
            .btn-pdf { background: #e74c3c; color: white; }
            .btn-edit { background: #f39c12; color: white; }
        </style>
    </head>
    <body>
        <div class="header">
            <a href="/api/dashboard" class="back-btn">← 대시보드로 돌아가기</a>
            <h1>케이스 상세 정보</h1>
        </div>
        
        <div class="container">
            <div class="card">
                <h2>🚗 ${case_.plateNumber} - ${case_.ownerName}</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">케이스 ID</div>
                        <div class="info-value">${case_.id}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">차량번호</div>
                        <div class="info-value">${case_.plateNumber}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">소유자명</div>
                        <div class="info-value">${case_.ownerName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">소유자 구분</div>
                        <div class="info-value">${case_.ownerType}</div>
                    </div>
                    ${case_.companyName ? `
                    <div class="info-item">
                        <div class="info-label">회사명</div>
                        <div class="info-value">${case_.companyName}</div>
                    </div>
                    ` : ''}
                    <div class="info-item">
                        <div class="info-label">상태</div>
                        <div class="info-value">
                            <span class="status-badge status-${case_.status.toLowerCase().replace('_', '-')}">
                                ${getStatusText(case_.status)}
                            </span>
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">제출일시</div>
                        <div class="info-value">${new Date(case_.submittedAt).toLocaleString('ko-KR')}</div>
                    </div>
                    ${case_.completedAt ? `
                    <div class="info-item">
                        <div class="info-label">완료일시</div>
                        <div class="info-value">${new Date(case_.completedAt).toLocaleString('ko-KR')}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            ${case_.documents.length > 0 ? `
            <div class="card">
                <h3>📄 업로드된 문서 (${case_.documents.length}개)</h3>
                <div class="documents">
                    ${case_.documents.map(doc => `
                        <div class="doc-item">
                            <strong>${doc.type}</strong>
                            <p>파일: ${doc.filePath.split('/').pop()}</p>
                            <p>업로드: ${new Date(doc.createdAt).toLocaleString('ko-KR')}</p>
                            ${doc.ocrConfidence ? `<p>OCR 신뢰도: ${doc.ocrConfidence}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <div class="actions">
                ${case_.status !== 'COMPLETED' ? `
                    <a href="/api/dashboard/case/${case_.id}/complete" class="action-btn btn-complete">✓ 완료처리</a>
                ` : ''}
                <a href="/api/pdf/generate/${case_.id}" class="action-btn btn-pdf">📄 PDF 생성</a>
            </div>
        </div>

        <script>
            function getStatusText(status) {
                const statusMap = {
                    'RECEIVED': '접수완료',
                    'NEED_MORE_DOCS': '서류보완필요', 
                    'COMPLETED': '처리완료'
                };
                return statusMap[status] || status;
            }
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Case detail error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 케이스 완료 처리
router.get('/case/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    
    const updatedCase = await prisma.vehicleCase.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    res.redirect(`/api/dashboard/case/${id}?completed=true`);
  } catch (error) {
    console.error('Complete case error:', error);
    res.status(500).send('Internal Server Error');
  }
});

function getStatusText(status) {
  const statusMap = {
    'RECEIVED': '접수완료',
    'NEED_MORE_DOCS': '서류보완필요', 
    'COMPLETED': '처리완료'
  };
  return statusMap[status] || status;
}

module.exports = router;