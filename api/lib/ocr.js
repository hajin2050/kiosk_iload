const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Surya OCR 통합
const { performSuryaOCR, mapSuryaResultToFields, checkSuryaAvailability } = require('./surya-integration');

// 🎭 Mock OCR data for testing - REMOVE THIS FUNCTION TO ENABLE REAL OCR
function getMockOCRResult(imagePath) {
  const filename = path.basename(imagePath).toLowerCase();
  
  // 차량등록증 mock 데이터
  if (filename.includes('8681') || filename.includes('vehicle') || filename.includes('registration')) {
    return {
      text: `자동차등록증
문서확인번호: 3851319808049559
자동차등록규칙 [별지 제1호서식] <개정 2025. 2. 17.>

자동차등록번호: 12로8681
차명: G4 렉스턴
차대번호: KPBGAZAF1KP053475
제조연일: 2019-07
최초등록일: 2019년 07월 19일

소유자: 이왕우
사용본거지: 전주시 완산구 여울로 161, 108동 903호

차량정보:
전장: 4850 mm
전폭: 1960 mm  
전고: 1825 mm
총중량: 2635 kg
배기량: 2157 cc
연료: 경유
최대정원: 9명
주행거리: 60,816 km`,
      structured_fields: {
        license_plate: '12로8681',
        vehicle_model: 'G4 렉스턴',
        chassis_number: 'KPBGAZAF1KP053475',
        owner_name: '이왕우',
        registered_address: '전주시 완산구 여울로 161, 108동 903호',
        manufacturing_date: '2019-07-01',
        initial_registration_date: '2019-07-19',
        gross_weight: 2635,
        engine_displacement: 2157,
        fuel_type: '경유',
        mileage: 60816
      },
      method: 'mock-ocr',
      confidence: 'high'
    };
  }
  
  // 신분증 mock 데이터
  if (filename.includes('id') || filename.includes('신분증') || filename.includes('img_')) {
    return {
      text: `주민등록증
이왕우
740801-1******
전주시 완산구 여울로 161, 108동 903호
발급일자: 2020.05.15`,
      structured_fields: {
        name: '이왕우',
        birth_date: '1974-08-01',
        address: '전주시 완산구 여울로 161, 108동 903호',
        issue_date: '2020-05-15'
      },
      method: 'mock-ocr',
      confidence: 'high'
    };
  }
  
  // 기본 mock 데이터
  return {
    text: `문서 내용을 인식했습니다.
파일명: ${filename}
Mock OCR 결과입니다.`,
    structured_fields: {},
    method: 'mock-ocr',
    confidence: 'medium'
  };
}

// OCR 전처리: 이미지 품질 개선
async function preprocessImage(imagePath) {
  try {
    // PDF 파일인 경우 전처리 스킵
    const ext = path.extname(imagePath).toLowerCase();
    if (ext === '.pdf') {
      console.log('PDF file detected, skipping preprocessing');
      return imagePath;
    }
    
    const outputPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '_processed.png');
    
    // 이미지 정보 확인
    const metadata = await sharp(imagePath).metadata();
    console.log('Image metadata:', metadata);
    
    await sharp(imagePath)
      .resize({ width: Math.max(metadata.width || 800, 1500) }) // 최소 1500px 너비로 확대
      .greyscale() // 그레이스케일 변환
      .normalize() // 대비 정규화
      .sharpen() // 선명도 증가
      .png()
      .toFile(outputPath);
      
    return outputPath;
  } catch (error) {
    console.warn('Image preprocessing failed, using original:', error.message);
    return imagePath; // 전처리 실패시 원본 이미지 사용
  }
}

// 개선된 OCR 실행 (Surya OCR 우선, Tesseract OCR 백업)
async function performOCR(imagePath) {
  try {
    console.log('🔍 Starting advanced OCR for file:', imagePath);
    
    // 파일 존재 확인
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }
    
    // PDF 파일 차단
    const ext = path.extname(imagePath).toLowerCase();
    if (ext === '.pdf') {
      console.log('PDF file detected, OCR not supported');
      return 'PDF 파일은 OCR 처리가 지원되지 않습니다. 이미지 파일(JPG, PNG)을 업로드해주세요.';
    }
    
    // 🚧 TEMPORARY: Mock OCR data for testing - Remove these 2 lines to enable real Surya OCR
    console.log('🎭 Using mock OCR data for testing');
    return getMockOCRResult(imagePath);
    
    // 1️⃣ Surya OCR 시도 (고정밀 OCR) - UNCOMMENT BELOW TO ENABLE REAL OCR
    // const isSuryaAvailable = await checkSuryaAvailability()
    // if (!isSuryaAvailable) {
    //   throw new Error('Surya OCR services is now avilable')
    // }
    // console.log('Using Surya OCR high-precision mode') 
    // const suryaResult = await performSuryaOCR(imagePath)
    // 
    // if (!suryaResult || !suryaResult.raw_text) {
    //   throw new Error('can not extraxt surya results')
    // }
    // 
    // console.log("Surya OCR completed successfully")
    // return {
    //   text: suryaResult.raw_text,
    //   structured_fields: suryaResult.structured_fields || {},
    //   method: 'surya-ocr',
    //   confidence: suryaResult.confidence || 'high'
    // }
      } catch (error) {
    console.error('❌ OCR Error (Surya):', error.message)
    // 서버 크래시 방지: 문자열로 반환하면 상위 라우트에서 그대로 저장/표시됩니다.
    return `OCR 처리에 실패했습니다: ${error.message}`
  }
}

// 차량등록증 필드 매핑 (기존 로직 유지)
function mapVehicleRegistrationFields(ocrText) {
  const fields = {}

  console.log('원본 OCR 텍스트 전체:', ocrText)
  console.log('OCR 텍스트 길이:', ocrText.length)

  // 1) 번호판
  const platePatterns = [
    /(\d{2,3}[가-힣로나다라마바사아자차카타파하]\d{4})/g,
    /(\d{2,3}\s*[가-힣로나다라마바사아자차카타파하]\s*\d{4})/g,
    /(12[로]\d{4})/g,
    /(1[2-3][로나다라마바사아자차카타파하]\d{4})/g,
    /(\d{2,3}[가-힣]+\d{3,4})/g,
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*\d{2,3}[가-힣]\d{4}/g
  ]
  for (const p of platePatterns) {
    const m = ocrText.match(p)
    if (m?.length) { fields.license_plate = m[0].replace(/\s/g, ''); break }
  }

  // 2) 차명/차종
  const vehicleModelPatterns = [
    /(현대|기아|삼성|쌍용|GM대우|한국GM|르노삼성|쉐보레)\s*([가-힣A-Za-z0-9\s\-]+)/g,
    /차명[:\s]*([가-힣A-Za-z0-9\s\-]+)/g,
    /차종[:\s]*([가-힣A-Za-z0-9\s\-]+)/g,
    /(G[0-9]+\s*렉스턴|세단)/g,
    /([A-Z0-9]+\s*(렉스턴|세단))/g,
    /(렉스턴|세단|SUV|트럭|버스|승합차|화물차)/g
  ]
  for (const p of vehicleModelPatterns) {
    const m = ocrText.match(p)
    if (m) { fields.vehicle_model = m[0].trim(); break }
  }

  // 3) 제조연월일
  const datePatterns = [
    /(\d{4})[.\-년\s]*(\d{1,2})[.\-월\s]*(\d{1,2})[일]?/g,
    /제작\s*[:\-]?\s*(\d{4})[.\-년\s]*(\d{1,2})[.\-월\s]*(\d{1,2})/g
  ]
  for (const p of datePatterns) {
    const matches = Array.from(ocrText.matchAll(p))
    for (const match of matches) {
      const [ , y, m, d ] = match.map(v => v)
      const year = parseInt(y), month = parseInt(m), day = parseInt(d)
      if (year >= 1980 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        fields.manufacturing_date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
        break
      }
    }
    if (fields.manufacturing_date) break
  }

  // 4) 차대번호
  const vinPatterns = [
    /([A-HJ-NPR-Z0-9]{17})/g,
    /(KP[A-Z0-9]{15})/g, /(KM[A-Z0-9]{15})/g, /(KN[A-Z0-9]{15})/g,
    /차대번호[:\s]*([A-HJ-NPR-Z0-9\s]{17,20})/g,
    /차체번호[:\s]*([A-HJ-NPR-Z0-9\s]{17,20})/g,
    /([A-Z]{2,3}[A-Z0-9]{14,15})/g
  ]
  for (const p of vinPatterns) {
    const m = ocrText.match(p)
    if (m) {
      const clean = m[m.length - 1].replace(/\s/g, '')
      if (clean.length === 17) { fields.chassis_number = clean; break }
    }
  }

  // 5) 주소
  const addrPatterns = [
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣\s]*시?[가-힣\s]*구?[가-힣\s]*동?[가-힣\s\-0-9]+/g,
    /본거지[:\s]*([가-힣\s\-0-9]+)/g,
    /주소[:\s]*([가-힣\s\-0-9]+)/g
  ]
  for (const p of addrPatterns) {
    const m = ocrText.match(p)
    if (m?.length) { fields.registered_address = m[0].trim(); break }
  }

  // 6) 소유자 성명
  const namePatterns = [
    /성명[:\s]*([가-힣]{2,5})/g,
    /소유자[:\s]*([가-힣]{2,5})/g,
    /이름[:\s]*([가-힣]{2,5})/g,
    /([가-힣]{2,4})\s*\(개인\)/g,
    /^\s*([가-힣]{2,4})\s*$/gm,
    /\b([가-힣]{2,4})\b/g
  ]
  for (const p of namePatterns) {
    const m = ocrText.match(p)
    if (m) { fields.owner_name = m[m.length - 1]; break }
  }

  console.log('ℹ️ 생년월일은 신분증에서만 추출됩니다 (차량등록증 제외)')

  // 배기량
  const dispPatterns = [
    /배기량[:\s]*(\d{1,4})\s*(?:cc|CC|㏄|시시)/gi,
    /(\d{1,4})\s*(?:cc|CC|㏄|시시)/gi
  ]
  for (const p of dispPatterns) {
    const m = ocrText.match(p)
    if (m) {
      const val = parseInt(m[m.length - 1])
      if (val >= 50 && val <= 8000) { fields.engine_displacement = val; break }
    }
  }

  // 연료
  const fuelPatterns = [
    /연료[:\s]*(휘발유|경유|LPG|전기|하이브리드|CNG|가솔린|디젤)/gi,
    /(휘발유|경유|LPG|전기|하이브리드|CNG|가솔린|디젤)/gi
  ]
  for (const p of fuelPatterns) {
    const m = ocrText.match(p)
    if (m) {
      let fuelType = m[m.length - 1].toLowerCase()
      const fuelMap = { '가솔린':'휘발유', '디젤':'경유', 'lpg':'LPG', 'cng':'CNG', '전기':'전기', '하이브리드':'하이브리드' }
      fields.fuel_type = fuelMap[fuelType] || fuelType
      break
    }
  }

  // 숫자/한글 샘플 추출(디버깅/참고)
  const nums = ocrText.match(/\d+/g); if (nums) fields.detected_numbers = nums.slice(0, 10)
  const kr   = ocrText.match(/[가-힣]{2,}/g); if (kr) fields.detected_korean = kr.slice(0, 15)

  // 주행거리(최댓값 선택)
  const mileagePatterns = [
    /([\d,]+)\s*(?:km|키로|킬로|KM)/gi,
    /주행거리[:\s]*([\d,]+)/gi,
    /거리[:\s]*([\d,]+)/gi,
    /([\d,]+)\s*$(?=.*주행)/gmi
  ]
  const mileCandidates = []
  for (const p of mileagePatterns) {
    for (const m of Array.from(ocrText.matchAll(p))) {
      const v = parseInt(m[1].replace(/,/g, ''))
      if (v > 0 && v < 2_000_000) mileCandidates.push(v)
    }
  }
  if (mileCandidates.length) {
    fields.mileage = Math.max(...mileCandidates)
    console.log(`🔍 주행거리 감지: ${fields.mileage}km (후보: ${mileCandidates.join(', ')})`)
  }

  // 총중량
  const weightPatterns = [
    /총중량[:\s]*([\d,]+)\s*(?:kg|킬로|KG)/gi,
    /([\d,]+)\s*kg\s*총중량/gi,
    /중량[:\s]*([\d,]+)\s*(?:kg|킬로|KG)/gi,
    /([\d,]+)\s*mm\s+총중량\s+([\d,]+)\s*kg/gi
  ]
  for (const p of weightPatterns) {
    const matches = Array.from(ocrText.matchAll(p))
    if (matches.length) {
      const last = matches[matches.length - 1]
      const weight = last[2] ? parseInt(last[2].replace(/,/g, '')) : parseInt(last[1].replace(/,/g, ''))
      if (weight >= 500 && weight <= 50000) { fields.gross_weight = weight; break }
    }
  }

  console.log('추출된 필드들:', Object.keys(fields))
  console.log('최종 매핑된 데이터:', fields)
  return fields
}

// 신분증 필드 매핑
function mapIdCardFields(ocrText) {
  const fields = {}
  const ssnMatch = ocrText.match(/(\d{6}-\d{7})/); if (ssnMatch) fields.ssn = ssnMatch[1]
  const nameMatch = ocrText.match(/([가-힣]{2,4})/); if (nameMatch) fields.name = nameMatch[1]
  const addressMatch = ocrText.match(/([가-힣]+(시|도|구|군)[^\n]+)/); if (addressMatch) fields.address = addressMatch[1]
  return fields
}

// 문서 타입별 필드 매핑 (Surya 결과 우선)
function mapFieldsByDocumentType(documentType, ocrResult) {
  // Surya 객체 결과
  if (typeof ocrResult === 'object' && ocrResult?.text) {
    const ocrText = ocrResult.text

    // Surya의 구조화 필드가 있으면 우선 사용
    if (ocrResult.structured_fields && Object.keys(ocrResult.structured_fields).length > 0) {
      console.log('🎯 Using Surya OCR structured fields')
      return mapSuryaResultToFields({
        structured_fields: ocrResult.structured_fields,
        raw_text: ocrText,
        confidence: ocrResult.confidence
      })
    }

    // 없으면 텍스트 기반 매핑
    switch (documentType) {
      case 'VEHICLE_REGISTRATION': return mapVehicleRegistrationFields(ocrText)
      case 'ID_CARD':              return mapIdCardFields(ocrText)
      default:                     return { extracted_text: ocrText.slice(0, 500), method: ocrResult.method }
    }
  }

  // 문자열 결과(에러 메시지 등)도 안전 처리
  const text = typeof ocrResult === 'string' ? ocrResult : String(ocrResult || '')
  switch (documentType) {
    case 'VEHICLE_REGISTRATION': return mapVehicleRegistrationFields(text)
    case 'ID_CARD':              return mapIdCardFields(text)
    default:                     return { extracted_text: text.slice(0, 500) }
  }
}

module.exports = {
  performOCR,          // Surya 전용
  mapFieldsByDocumentType
}