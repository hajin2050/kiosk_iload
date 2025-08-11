const { Ollama } = require('ollama');

// Ollama 클라이언트 초기화
const ollama = new Ollama({ 
  host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' 
});

// LLM을 사용한 OCR 결과 검증 및 보완
async function validateAndEnhanceOCRResult(documentType, ocrText, mappedFields, imagePath = null) {
  try {
    // 사용 가능한 모델 확인
    const models = await ollama.list();
    const availableModel = findBestAvailableModel(models);
    
    if (!availableModel) {
      console.log('No suitable LLM model found. Please run: ollama pull qwen2.5:7b');
      return getDefaultValidationResult(mappedFields, ['No LLM model available']);
    }

    const prompt = createValidationPrompt(documentType, ocrText, mappedFields);
    
    const response = await ollama.chat({
      model: availableModel,
      messages: [{
        role: 'user',
        content: prompt
      }],
      options: {
        temperature: 0.1, // 일관성을 위해 낮은 temperature 설정
        top_p: 0.9,
        num_predict: 1000
      }
    });
    
    return parseValidationResponse(response.message.content, mappedFields);
    
  } catch (error) {
    console.error('LLM Validation Error:', error);
    return getDefaultValidationResult(mappedFields, ['LLM validation failed: ' + error.message]);
  }
}

// 문서 타입별 검증 프롬프트 생성
function createValidationPrompt(documentType, ocrText, mappedFields) {
  const basePrompt = `
다음은 OCR로 추출된 문서 텍스트와 자동으로 매핑된 필드입니다.
문서 타입: ${documentType}

OCR 텍스트:
${ocrText}

추출된 필드:
${JSON.stringify(mappedFields, null, 2)}

이 정보를 검증하고 보완해주세요:
1. 추출된 필드가 올바른지 확인
2. 누락된 중요 필드가 있다면 OCR 텍스트에서 추가 추출
3. 오류가 있다면 수정
4. 신뢰도 평가

응답 형식 (JSON):
{
  "validated": true/false,
  "confidence": "high/medium/low",
  "corrected_fields": {
    // 수정된 또는 추가된 필드들
  },
  "errors": [
    // 발견된 오류들
  ]
}
`;

  // 문서 타입별 특화 검증 가이드라인
  const typeSpecificGuideline = getTypeSpecificGuideline(documentType);
  
  return basePrompt + '\n\n' + typeSpecificGuideline;
}

// 문서 타입별 검증 가이드라인
function getTypeSpecificGuideline(documentType) {
  switch (documentType) {
    case 'VEHICLE_REGISTRATION':
      return `
한국 차량 등록증 OCR 데이터 추출 및 검증 가이드라인:

## 필수 추출 대상 (11개 필드)

1. **license_plate**: 자동차 등록번호
   - 형식: 12가1234, 서울12가1234
   - 검증: 공백 제거, 한글+숫자 조합

2. **vehicle_model**: 차명
   - 예시: "현대 소나타", "기아 K5"
   - 제조사 + 모델명 함께 추출

3. **manufacturing_date**: 제조연일
   - 형식: YYYY-MM-DD
   - 검증: 1980~현재년도 범위

4. **chassis_number**: 차대번호/VIN
   - 형식: 17자리 영숫자 (I,O,Q 제외)
   - 검증: 정확한 17자리 확인

5. **registered_address**: 사용본거지
   - 형식: 전체 주소 (시/도부터 상세주소까지)
   - 개행 연결하여 완전한 주소 구성

6. **owner_name**: 성명
   - 형식: 2-5자 한글 이름
   - 검증: 한글만, 특수문자 제거

7. **birth_date**: 생년월일
   - 형식: YYYY-MM-DD
   - 주민등록번호 앞 6자리에서 추출 가능

8. **mileage**: 주행거리 (중요!)
   - **검사 유효기간별 주행거리 중 가장 높은 숫자 선택**
   - 단위: km (킬로미터)
   - 쉼표 제거 후 숫자만 추출

9. **gross_weight**: 총중량
   - 단위: kg
   - 범위: 500~50000kg

10. **engine_displacement**: 배기량
    - 단위: CC
    - 범위: 50~8000cc

11. **fuel_type**: 연료
    - 표준값: "휘발유", "경유", "LPG", "전기", "하이브리드", "CNG"
    - 가솔린→휘발유, 디젤→경유 변환

## 출력 형식
enhanced_fields에 다음 구조로 반환:
{
  "license_plate": "12가1234",
  "vehicle_model": "현대 소나타",
  "manufacturing_date": "2020-03-15",
  "chassis_number": "KMHD141CBLA123456",
  "registered_address": "서울특별시 강남구 역삼동 123-45",
  "owner_name": "홍길동",
  "birth_date": "1980-05-20",
  "mileage": 85000,
  "gross_weight": 1500,
  "engine_displacement": 2000,
  "fuel_type": "휘발유"
}

## 검증 우선순위
1. **주행거리**: 여러 검사기록이 있을 경우 최댓값 선택
2. **날짜 형식**: 모든 날짜를 YYYY-MM-DD로 통일
3. **숫자 필드**: mileage, gross_weight, engine_displacement는 정수형
4. **연료 표준화**: 다양한 표현을 표준 연료명으로 통일
5. **필수 필드**: 11개 필드 모두 값이 있어야 함 (없으면 "정보없음")

## 품질 기준
- confidence: high (8개 이상 필드 추출), medium (5-7개), low (4개 이하)
- validated: 필수 필드 중 license_plate, owner_name 포함 시 true
      `;
    
    case 'ID_CARD':
      return `
신분증 검증 가이드라인:
- name: 한글 이름 (2-4글자)
- ssn: 주민등록번호 형식 (6자리-7자리)
- address: 한국 주소 형식
- 개인정보 보호를 위해 민감정보는 마스킹 처리
      `;
    
    default:
      return `일반 문서로 처리하여 텍스트 추출 품질을 확인해주세요.`;
  }
}

// LLM 응답 파싱
function parseValidationResponse(response, originalFields) {
  try {
    // JSON 응답 추출
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        validated: parsed.validated || false,
        confidence: parsed.confidence || 'low',
        fields: { ...originalFields, ...parsed.corrected_fields },
        errors: parsed.errors || [],
        enhanced_fields: parsed.corrected_fields || {}
      };
    }
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
  }
  
  // 파싱 실패 시 기본값 반환
  return {
    validated: false,
    confidence: 'low',
    fields: originalFields,
    errors: ['Failed to parse LLM response'],
    enhanced_fields: {}
  };
}

// 사용 가능한 최적 모델 찾기
function findBestAvailableModel(models) {
  // 선호하는 모델 순서 (성능 vs 속도)
  const preferredModels = [
    'qwen2.5:7b',      // 최고 성능
    'qwen2.5:3b',      // 균형잡힌 성능
    'llama3.2:3b',     // 빠른 속도
    'gemma2:2b',       // 가벼운 모델
    'phi3:mini'        // 최소 모델
  ];
  
  for (const preferred of preferredModels) {
    const found = models.models?.find(model => 
      model.name.includes(preferred.split(':')[0])
    );
    if (found) {
      return found.name;
    }
  }
  
  // 아무 모델이라도 있으면 첫 번째 사용
  return models.models?.[0]?.name || null;
}

// 기본 검증 결과 반환
function getDefaultValidationResult(mappedFields, errors = []) {
  return {
    validated: false,
    fields: mappedFields,
    confidence: 'low',
    errors: errors,
    enhanced_fields: {}
  };
}

// 추출된 필드 품질 검증
function validateExtractedFields(fields, documentType) {
  const errors = [];
  const warnings = [];
  
  if (documentType === 'VEHICLE_REGISTRATION') {
    // 차량 등록증 검증 규칙
    
    // 1. 자동차 등록번호 검증
    if (fields.license_plate) {
      const platePattern = /^\d{2,3}[가-힣]\d{4}$/;
      if (!platePattern.test(fields.license_plate.replace(/\s/g, ''))) {
        errors.push('차량번호 형식이 올바르지 않습니다');
      }
    }
    
    // 2. 제조연일 검증
    if (fields.manufacturing_date) {
      const date = new Date(fields.manufacturing_date);
      const currentYear = new Date().getFullYear();
      const year = date.getFullYear();
      
      if (isNaN(date.getTime()) || year < 1980 || year > currentYear) {
        errors.push('제조연일이 올바르지 않습니다');
      }
    }
    
    // 3. 차대번호 검증
    if (fields.chassis_number) {
      if (fields.chassis_number.length !== 17) {
        errors.push('차대번호는 17자리여야 합니다');
      } else if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(fields.chassis_number)) {
        warnings.push('차대번호에 유효하지 않은 문자가 포함되어 있을 수 있습니다');
      }
    }
    
    // 4. 성명 검증
    if (fields.owner_name) {
      if (!/^[가-힣]{2,5}$/.test(fields.owner_name)) {
        errors.push('성명은 2-5자의 한글이어야 합니다');
      }
    }
    
    // 5. 생년월일 검증
    if (fields.birth_date) {
      const birthDate = new Date(fields.birth_date);
      const currentDate = new Date();
      const age = currentDate.getFullYear() - birthDate.getFullYear();
      
      if (isNaN(birthDate.getTime()) || age < 18 || age > 100) {
        warnings.push('생년월일이 일반적인 범위를 벗어납니다');
      }
    }
    
    // 6. 주행거리 검증
    if (fields.mileage) {
      const mileage = parseInt(fields.mileage);
      if (isNaN(mileage) || mileage < 0 || mileage > 1000000) {
        warnings.push('주행거리가 일반적인 범위를 벗어납니다');
      }
    }
    
    // 7. 총중량 검증
    if (fields.gross_weight) {
      const weight = parseInt(fields.gross_weight);
      if (isNaN(weight) || weight < 500 || weight > 50000) {
        warnings.push('총중량이 일반적인 범위를 벗어납니다');
      }
    }
    
    // 8. 배기량 검증
    if (fields.engine_displacement) {
      const displacement = parseInt(fields.engine_displacement);
      if (isNaN(displacement) || displacement < 50 || displacement > 8000) {
        warnings.push('배기량이 일반적인 범위를 벗어납니다');
      }
    }
    
    // 9. 연료 검증
    if (fields.fuel_type) {
      const validFuels = ['휘발유', '경유', 'LPG', '전기', '하이브리드', 'CNG'];
      if (!validFuels.includes(fields.fuel_type)) {
        warnings.push('연료 타입을 표준 형식으로 확인해주세요');
      }
    }
    
    // 필수 필드 체크
    const requiredFields = ['license_plate', 'owner_name'];
    const missingRequired = requiredFields.filter(field => !fields[field]);
    
    if (missingRequired.length > 0) {
      errors.push(`필수 필드가 누락됨: ${missingRequired.join(', ')}`);
    }
  }
  
  return { errors, warnings };
}

// 신뢰도 계산
function calculateConfidence(fields, documentType, errors) {
  if (documentType === 'VEHICLE_REGISTRATION') {
    const expectedFields = [
      'license_plate', 'vehicle_model', 'manufacturing_date', 'chassis_number',
      'registered_address', 'owner_name', 'birth_date', 'mileage',
      'gross_weight', 'engine_displacement', 'fuel_type'
    ];
    
    const extractedCount = expectedFields.filter(field => fields[field] && fields[field] !== '정보없음').length;
    const errorCount = errors.length;
    
    if (extractedCount >= 8 && errorCount === 0) return 'high';
    if (extractedCount >= 5 && errorCount <= 1) return 'medium';
    return 'low';
  }
  
  return 'medium';
}

module.exports = {
  validateAndEnhanceOCRResult,
  validateExtractedFields,
  calculateConfidence
};