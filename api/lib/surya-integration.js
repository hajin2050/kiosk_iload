const { spawn } = require('child_process');
const path = require('path');

/**
 * Surya OCR을 사용한 고정밀 한국어 문서 OCR
 */
async function performSuryaOCR(imagePath) {
  return new Promise((resolve, reject) => {
    try {
      console.log('🚀 Starting Surya OCR processing:', imagePath);
      
      const pythonScript = path.join(__dirname, 'surya-ocr.py');
      const pythonProcess = spawn('python3', [pythonScript, imagePath]);
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        // Surya OCR 로딩 로그들을 출력
        console.log('Surya OCR:', data.toString().trim());
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            if (result.success) {
              console.log('✅ Surya OCR completed successfully');
              console.log(`📊 Extracted ${result.total_lines} text lines`);
              console.log(`🎯 Found ${Object.keys(result.structured_fields).length} structured fields`);
              resolve(result);
            } else {
              console.error('❌ Surya OCR failed:', result.error);
              reject(new Error(`Surya OCR failed: ${result.error}`));
            }
          } catch (parseError) {
            console.error('❌ Failed to parse Surya OCR result:', parseError);
            reject(new Error(`Failed to parse OCR result: ${parseError.message}`));
          }
        } else {
          console.error('❌ Surya OCR process failed with code:', code);
          console.error('stderr:', stderr);
          reject(new Error(`Surya OCR process failed with code ${code}: ${stderr}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.error('❌ Failed to start Surya OCR process:', error);
        reject(new Error(`Failed to start OCR process: ${error.message}`));
      });
      
      // 타임아웃 설정 (60초)
      setTimeout(() => {
        pythonProcess.kill('SIGKILL');
        reject(new Error('Surya OCR processing timed out after 60 seconds'));
      }, 600000);
      
    } catch (error) {
      console.error('❌ Surya OCR integration error:', error);
      reject(error);
    }
  });
}

/**
 * Surya OCR 결과를 기존 필드 형식으로 매핑
 */
function mapSuryaResultToFields(suryaResult) {
  const fields = suryaResult.structured_fields || {};
  
  // 기존 시스템과 호환되도록 필드명 매핑
  const mappedFields = {
    license_plate: fields.license_plate || '',
    vehicle_model: fields.vehicle_model || '',
    chassis_number: fields.chassis_number || '',
    owner_name: fields.owner_name || '',
    registered_address: fields.registered_address || '',
    manufacturing_date: fields.manufacturing_date || '',
    initial_registration_date: fields.initial_registration_date || '',
    gross_weight: fields.gross_weight || 0,
    fuel_type: fields.fuel_type || '',
    engine_displacement: fields.engine_displacement || 0,
    
    // 메타데이터
    ocr_confidence: suryaResult.confidence || 'high',
    raw_text: suryaResult.raw_text || '',
    processing_method: 'surya-ocr',
    total_lines_detected: suryaResult.total_lines || 0
  };
  
  // 빈 필드 제거
  Object.keys(mappedFields).forEach(key => {
    if (mappedFields[key] === '' || mappedFields[key] === 0) {
      delete mappedFields[key];
    }
  });
  
  console.log('📋 Surya OCR mapped fields:', Object.keys(mappedFields));
  return mappedFields;
}

/**
 * Surya OCR 사용 가능성 검사
 */
async function checkSuryaAvailability() {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python3', ['-c', 'import surya; print("OK")']);
    
    pythonProcess.on('close', (code) => {
      resolve(code === 0);
    });
    
    pythonProcess.on('error', () => {
      resolve(false);
    });
    
    // 5초 타임아웃
    setTimeout(() => {
      pythonProcess.kill('SIGKILL');
      resolve(false);
    }, 5000);
  });
}

module.exports = {
  performSuryaOCR,
  mapSuryaResultToFields,
  checkSuryaAvailability
};