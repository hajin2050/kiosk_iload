const plateRecognizer = require('./plate-recognizer');

/**
 * 문서 타입에 따라 OCR 결과를 구조화된 필드로 매핑합니다
 * @param {string} docType - 문서 타입
 * @param {Object|string} ocrResult - OCR 결과 (텍스트 또는 객체)
 * @param {string} filename - 파일명 (옵션)
 * @returns {Object} - 매핑된 필드 객체
 */
function mapFieldsByDocumentType(docType, ocrResult, filename = '') {
  let ocrText = '';
  let structuredFields = {};

  // OCR 결과가 객체인 경우 텍스트와 구조화 필드 분리
  if (typeof ocrResult === 'object' && ocrResult !== null) {
    ocrText = ocrResult.text || '';
    structuredFields = ocrResult.structured_fields || {};
  } else if (typeof ocrResult === 'string') {
    ocrText = ocrResult;
  }

  console.log(`[Mapper] Processing ${docType} with text length: ${ocrText.length}`);

  switch (docType) {
    case 'VEHICLE_REGISTRATION':
      return mapVehicleRegistrationFields(ocrText, structuredFields, filename);
    
    case 'ID_CARD':
      return mapIdCardFields(ocrText, structuredFields);
    
    case 'DELEGATION_FORM':
      return mapDelegationFormFields(ocrText, structuredFields);
    
    case 'INVOICE':
      return mapInvoiceFields(ocrText, structuredFields);
    
    default:
      return {
        raw_text: ocrText,
        document_type: docType,
        processed_at: new Date().toISOString()
      };
  }
}

/**
 * 자동차 등록증 필드 매핑
 */
function mapVehicleRegistrationFields(text, structuredFields, filename) {
  const fields = { ...structuredFields };

  // 번호판 인식 (우선순위: 구조화 필드 -> 텍스트 추출 -> 파일명)
  if (!fields.license_plate) {
    const plateResult = plateRecognizer.extract(text, filename);
    if (plateResult) {
      fields.license_plate = plateResult.plate;
      fields.license_plate_confidence = plateResult.confidence;
      fields.license_plate_source = plateResult.source;
    }
  }

  // 텍스트에서 추가 필드 추출
  if (!fields.manufacturing_date) {
    const dateMatch = text.match(/최초등록일[:\s]*(\d{4})년?\s*(\d{1,2})월?\s*(\d{1,2})일?/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      fields.manufacturing_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  if (!fields.fuel_type) {
    const fuelMatch = text.match(/연료[의]?\s*종류[:\s]*([^\n\r,]+)/);
    if (fuelMatch) {
      fields.fuel_type = fuelMatch[1].trim();
    }
  }

  if (!fields.vehicle_model) {
    const modelMatch = text.match(/차명[:\s]*([^\n\r,]+)/);
    if (modelMatch) {
      fields.vehicle_model = modelMatch[1].trim();
    }
  }

  if (!fields.chassis_number) {
    const chassisMatch = text.match(/차대번호[:\s]*([A-Z0-9]+)/);
    if (chassisMatch) {
      fields.chassis_number = chassisMatch[1].trim();
    }
  }

  if (!fields.owner_name) {
    const ownerMatch = text.match(/소유자[:\s]*([^\n\r,]+)/);
    if (ownerMatch) {
      fields.owner_name = ownerMatch[1].trim();
    }
  }

  if (!fields.registered_address) {
    const addressMatch = text.match(/주소[:\s]*([^\n\r]+)/);
    if (addressMatch) {
      fields.registered_address = addressMatch[1].trim();
    }
  }

  if (!fields.mileage) {
    const mileageMatch = text.match(/주행거리[:\s]*([0-9,]+)\s*km/);
    if (mileageMatch) {
      fields.mileage = parseInt(mileageMatch[1].replace(/,/g, ''), 10);
    }
  }

  if (!fields.gross_weight) {
    const weightMatch = text.match(/총중량[:\s]*([0-9,]+)\s*kg/);
    if (weightMatch) {
      fields.gross_weight = parseInt(weightMatch[1].replace(/,/g, ''), 10);
    }
  }

  if (!fields.engine_displacement) {
    const engineMatch = text.match(/배기량[:\s]*([0-9,]+)\s*cc/);
    if (engineMatch) {
      fields.engine_displacement = parseInt(engineMatch[1].replace(/,/g, ''), 10);
    }
  }

  return {
    ...fields,
    document_type: 'VEHICLE_REGISTRATION',
    processed_at: new Date().toISOString(),
    confidence: 'high'
  };
}

/**
 * 신분증 필드 매핑
 */
function mapIdCardFields(text, structuredFields) {
  const fields = { ...structuredFields };

  if (!fields.name) {
    const nameMatch = text.match(/성명[:\s]*([^\n\r]+)/);
    if (nameMatch) {
      fields.name = nameMatch[1].trim();
    }
  }

  if (!fields.birth_date) {
    const birthMatch = text.match(/주민등록번호[:\s]*(\d{6})-?\d{7}/);
    if (birthMatch) {
      const birthPrefix = birthMatch[1];
      const year = parseInt(birthPrefix.substring(0, 2), 10);
      const month = birthPrefix.substring(2, 4);
      const day = birthPrefix.substring(4, 6);
      
      // 1900년대/2000년대 구분 (간단한 휴리스틱)
      const fullYear = year > 50 ? 1900 + year : 2000 + year;
      fields.birth_date = `${fullYear}-${month}-${day}`;
    }
  }

  if (!fields.address) {
    const addressMatch = text.match(/주소[:\s]*([^\n\r]+)/);
    if (addressMatch) {
      fields.address = addressMatch[1].trim();
    }
  }

  return {
    ...fields,
    document_type: 'ID_CARD',
    processed_at: new Date().toISOString(),
    confidence: 'medium'
  };
}

/**
 * 위임장 필드 매핑
 */
function mapDelegationFormFields(text, structuredFields) {
  const fields = { ...structuredFields };

  if (!fields.delegator) {
    const delegatorMatch = text.match(/위임자[:\s]*([^\n\r]+)/);
    if (delegatorMatch) {
      fields.delegator = delegatorMatch[1].trim();
    }
  }

  if (!fields.delegate) {
    const delegateMatch = text.match(/수임자[:\s]*([^\n\r]+)/);
    if (delegateMatch) {
      fields.delegate = delegateMatch[1].trim();
    }
  }

  if (!fields.purpose) {
    const purposeMatch = text.match(/위임사항[:\s]*([^\n\r]+)/);
    if (purposeMatch) {
      fields.purpose = purposeMatch[1].trim();
    }
  }

  if (!fields.vehicle_number) {
    // 번호판 인식 시도
    const plateResult = plateRecognizer.extractFromText(text);
    if (plateResult) {
      fields.vehicle_number = plateResult.plate;
    }
  }

  if (!fields.delegation_date) {
    const dateMatch = text.match(/위임일[:\s]*(\d{4})년?\s*(\d{1,2})월?\s*(\d{1,2})일?/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      fields.delegation_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return {
    ...fields,
    document_type: 'DELEGATION_FORM',
    processed_at: new Date().toISOString(),
    confidence: 'medium'
  };
}

/**
 * 인보이스 필드 매핑
 */
function mapInvoiceFields(text, structuredFields) {
  const fields = { ...structuredFields };

  if (!fields.company_name) {
    const companyMatch = text.match(/업체명[:\s]*([^\n\r]+)/);
    if (companyMatch) {
      fields.company_name = companyMatch[1].trim();
    }
  }

  if (!fields.item) {
    const itemMatch = text.match(/품목[:\s]*([^\n\r]+)/);
    if (itemMatch) {
      fields.item = itemMatch[1].trim();
    }
  }

  if (!fields.amount) {
    const amountMatch = text.match(/금액[:\s]*([0-9,]+)\s*원?/);
    if (amountMatch) {
      fields.amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
    }
  }

  if (!fields.vehicle_number) {
    // 번호판 인식 시도
    const plateResult = plateRecognizer.extractFromText(text);
    if (plateResult) {
      fields.vehicle_number = plateResult.plate;
    }
  }

  if (!fields.issue_date) {
    const dateMatch = text.match(/발행일[:\s]*(\d{4})\.?(\d{1,2})\.?(\d{1,2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      fields.issue_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return {
    ...fields,
    document_type: 'INVOICE',
    processed_at: new Date().toISOString(),
    confidence: 'medium'
  };
}

module.exports = {
  mapFieldsByDocumentType
};