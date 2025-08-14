const fs = require('fs');
const path = require('path');

const mockSamples = {
  VEHICLE_REGISTRATION: {
    text: `자동차등록증
문서확인번호: 3851319808049559
등록번호: 12로8681
차대번호: KPAZZZ12345678901
차명: G4 렉스턴
최초등록일: 2019년 07월 19일
연료의 종류: 전기
총중량: 2040 kg
배기량: 1998 cc
소유자: 홍길동
주소: 서울특별시 중구 세종대로 110
주행거리: 45,678 km`,
    structured_fields: {
      manufacturing_date: "2019-07-19",
      fuel_type: "전기", 
      license_plate: "12로8681",
      vehicle_model: "G4 렉스턴",
      chassis_number: "KPAZZZ12345678901",
      registered_address: "서울특별시 중구 세종대로 110",
      owner_name: "홍길동",
      mileage: 45678,
      gross_weight: 2040,
      engine_displacement: 1998
    }
  },
  ID_CARD: {
    text: `주민등록증
성명: 홍길동  
주민등록번호: 850101-1234567
주소: 서울특별시 중구 세종대로 110
발급일: 2020.01.15`,
    structured_fields: {
      name: "홍길동",
      birth_date: "1985-01-01", 
      address: "서울특별시 중구 세종대로 110",
      issue_date: "2020-01-15"
    }
  },
  DELEGATION_FORM: {
    text: `위임장
위임자: 홍길동
수임자: 김철수
위임사항: 자동차 말소등록 업무 일체
차량번호: 12로8681
위임일: 2024년 8월 12일`,
    structured_fields: {
      delegator: "홍길동",
      delegate: "김철수", 
      purpose: "자동차 말소등록 업무 일체",
      vehicle_number: "12로8681",
      delegation_date: "2024-08-12"
    }
  },
  INVOICE: {
    text: `세금계산서
업체명: (주)자동차매매상
품목: 중고자동차 매매
차량번호: 12로8681
금액: 39,409,090 원
발행일: 2024.08.10`,
    structured_fields: {
      company_name: "(주)자동차매매상",
      item: "중고자동차 매매",
      vehicle_number: "12로8681", 
      amount: 39409090,
      issue_date: "2024-08-10"
    }
  }
};

class MockOcrEngine {
  async run(filePath, documentType) {
    console.log(`[MockOCR] Processing ${documentType} document: ${filePath}`);
    
    // 짧은 지연시간으로 실제 처리하는 것처럼 보이게 함
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const sample = mockSamples[documentType] || {
      text: "Mock OCR result - document processing completed",
      structured_fields: {}
    };
    
    // 파일명에서 번호판 정보가 있으면 이를 활용
    const filename = path.basename(filePath);
    const plateMatch = this.extractPlateFromFilename(filename);
    
    if (plateMatch && documentType === 'VEHICLE_REGISTRATION') {
      sample.structured_fields.license_plate = plateMatch.plate;
      // 텍스트에도 반영
      sample.text = sample.text.replace('12로8681', plateMatch.plate);
    }
    
    return {
      text: sample.text,
      structured_fields: sample.structured_fields,
      method: 'mock-surya',
      confidence: this.getRandomConfidence()
    };
  }
  
  extractPlateFromFilename(filename) {
    // 한국 자동차 번호판 패턴들
    const patterns = [
      /\b(\d{2,3}[가-힣]\d{4})\b/g,           // 12로8681
      /\b(\d{2,3}\s*[가-힣]\s*\d{4})\b/g,     // 12 로 8681
      /([서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주]\d{2,3}[가-힣]\d{4})/g
    ];
    
    for (const pattern of patterns) {
      const matches = filename.match(pattern);
      if (matches && matches.length > 0) {
        const plate = matches[0].replace(/\s/g, ''); // 공백 제거
        return {
          plate,
          confidence: 0.85,
          method: 'mock-plate-regex'
        };
      }
    }
    
    return null;
  }
  
  getRandomConfidence() {
    const confidences = ['high', 'medium', 'low'];
    const weights = [0.6, 0.3, 0.1]; // high가 60% 확률
    
    const random = Math.random();
    let sum = 0;
    
    for (let i = 0; i < weights.length; i++) {
      sum += weights[i];
      if (random <= sum) {
        return confidences[i];
      }
    }
    
    return 'medium';
  }
}

module.exports = new MockOcrEngine();