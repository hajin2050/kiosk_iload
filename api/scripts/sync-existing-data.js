#!/usr/bin/env node

/**
 * 기존 DB 데이터를 Odoo로 동기화하는 스크립트
 * 사용법: node api/scripts/sync-existing-data.js [--dry-run] [--case-id=<id>]
 */

require('dotenv').config({ path: '../../.env' });
const { PrismaClient } = require('@prisma/client');
const odooSync = require('../lib/odoo-sync');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// CLI 파라미터 파싱
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const caseIdArg = args.find(arg => arg.startsWith('--case-id='));
const specificCaseId = caseIdArg ? caseIdArg.split('=')[1] : null;

async function syncExistingData() {
  console.log('Starting Odoo sync for existing data...');
  
  if (!odooSync.enabled) {
    console.error('Odoo integration not configured. Please set ODOO_BASE and ODOO_SHARED_SECRET environment variables.');
    process.exit(1);
  }
  
  if (isDryRun) {
    console.log('DRY RUN MODE - No actual sync will be performed');
  }
  
  if (specificCaseId) {
    console.log(`Syncing specific case: ${specificCaseId}`);
  }
  
  try {
    // 케이스 조회
    const whereClause = specificCaseId ? { id: specificCaseId } : {};
    const cases = await prisma.vehicleCase.findMany({
      where: whereClause,
      include: { 
        documents: {
          where: {
            ocrResult: { not: null } // OCR이 완료된 문서만
          }
        }
      },
      orderBy: { submittedAt: 'desc' }
    });
    
    console.log(`Found ${cases.length} cases to sync`);
    
    let syncedCases = 0;
    let syncedDocuments = 0;
    let errors = [];
    
    for (const caseData of cases) {
      console.log(`\nProcessing case ${caseData.id} (${caseData.plateNumber || 'No plate'})`);
      
      try {
        // 1. 케이스 동기화
        if (!isDryRun) {
          const caseResult = await odooSync.syncCase(caseData);
          if (caseResult) {
            console.log(`  Case synced successfully`);
            syncedCases++;
          } else {
            console.log(`  Case sync failed`);
            errors.push(`Case ${caseData.id}: sync failed`);
          }
        } else {
          console.log(`  [DRY RUN] Would sync case`);
          syncedCases++;
        }
        
        // 2. 문서 동기화
        for (const document of caseData.documents) {
          console.log(`    Processing document ${document.id} (${document.type})`);
          
          try {
            // 파일 경로 확인
            const absolutePath = path.isAbsolute(document.filePath) 
              ? document.filePath 
              : path.join(process.cwd(), document.filePath);
            
            if (!fs.existsSync(absolutePath)) {
              console.log(`    File not found: ${absolutePath}`);
              errors.push(`Document ${document.id}: file not found`);
              continue;
            }
            
            if (!isDryRun) {
              const docResult = await odooSync.syncDocument(caseData.id, document, absolutePath);
              if (docResult) {
                console.log(`    Document synced successfully`);
                syncedDocuments++;
              } else {
                console.log(`    Document sync failed`);
                errors.push(`Document ${document.id}: sync failed`);
              }
            } else {
              console.log(`    [DRY RUN] Would sync document`);
              syncedDocuments++;
            }
            
            // 동기화 간 약간의 지연 (서버 부하 방지)
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (docError) {
            console.error(`    Document sync error:`, docError.message);
            errors.push(`Document ${document.id}: ${docError.message}`);
          }
        }
        
        // 케이스 간 지연
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (caseError) {
        console.error(`Case sync error:`, caseError.message);
        errors.push(`Case ${caseData.id}: ${caseError.message}`);
      }
    }
    
    // 결과 요약
    console.log('\nSync Summary:');
    console.log(`Cases: ${syncedCases}/${cases.length}`);
    console.log(`Documents: ${syncedDocuments}/${cases.reduce((total, c) => total + c.documents.length, 0)}`);
    
    if (errors.length > 0) {
      console.log(`\nErrors (${errors.length}):`);
      errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (isDryRun) {
      console.log('\nDRY RUN completed - no actual sync performed');
    } else {
      console.log('\nSync completed!');
    }
    
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 메인 실행
if (require.main === module) {
  syncExistingData().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = { syncExistingData };