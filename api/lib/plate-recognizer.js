class PlateRecognizer {
  constructor() {
    // 한국 자동차 번호판 패턴 정의
    this.patterns = [
      // 기본 패턴: 12로8681, 123가1234 등
      {
        regex: /\b(\d{2,3}[가-힣]\d{4})\b/g,
        confidence: 0.9,
        description: '기본 번호판 패턴'
      },
      // 공백이 있는 패턴: 12 로 8681
      {
        regex: /\b(\d{2,3}\s*[가-힣]\s*\d{4})\b/g,
        confidence: 0.85,
        description: '공백 포함 번호판 패턴'
      },
      // 지역명이 포함된 패턴
      {
        regex: /\b((서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\d{2,3}[가-힣]\d{4})\b/g,
        confidence: 0.95,
        description: '지역명 포함 번호판 패턴'
      },
      // 전기차 번호판 패턴 (예: 12로8681)
      {
        regex: /\b(\d{2,3}[로]\d{4})\b/g,
        confidence: 0.92,
        description: '전기차 번호판 패턴'
      }
    ];

    // 한국어 자동차 번호판 한글자 리스트
    this.validKoreanChars = [
      '가', '나', '다', '라', '마', '거', '너', '더', '러', '머',
      '고', '노', '도', '로', '모', '구', '누', '두', '루', '무',
      '바', '사', '아', '자', '카', '타', '파', '하', '허', '호'
    ];
  }

  /**
   * 텍스트에서 번호판을 추출합니다
   * @param {string} text - OCR 결과 텍스트
   * @returns {Object|null} - { plate, confidence, method } 또는 null
   */
  extractFromText(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const results = [];

    // 각 패턴으로 매칭 시도
    for (const pattern of this.patterns) {
      const matches = [...text.matchAll(pattern.regex)];
      
      for (const match of matches) {
        const rawPlate = match[1];
        const cleanPlate = this.cleanPlate(rawPlate);
        
        if (this.isValidPlate(cleanPlate)) {
          results.push({
            plate: cleanPlate,
            confidence: pattern.confidence,
            method: 'mock-plate-regex',
            pattern: pattern.description,
            raw: rawPlate
          });
        }
      }
    }

    // 가장 높은 confidence를 가진 결과 반환
    if (results.length > 0) {
      results.sort((a, b) => b.confidence - a.confidence);
      return results[0];
    }

    return null;
  }

  /**
   * 파일명에서 번호판을 추출합니다
   * @param {string} filename - 파일명
   * @returns {Object|null} - { plate, confidence, method } 또는 null
   */
  extractFromFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return null;
    }

    // 파일 확장자 제거
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    
    return this.extractFromText(nameWithoutExt);
  }

  /**
   * 번호판 문자열을 정리합니다 (공백, 특수문자 제거)
   * @param {string} plate - 원본 번호판 문자열
   * @returns {string} - 정리된 번호판 문자열
   */
  cleanPlate(plate) {
    if (!plate) return '';
    
    // 공백과 불필요한 문자 제거
    return plate.replace(/[\s\-_\.]/g, '').trim();
  }

  /**
   * 번호판이 유효한 형식인지 검증합니다
   * @param {string} plate - 번호판 문자열
   * @returns {boolean} - 유효성 여부
   */
  isValidPlate(plate) {
    if (!plate || plate.length < 6 || plate.length > 9) {
      return false;
    }

    // 기본 패턴 검증: 숫자-한글-숫자 조합
    const basicPattern = /^\d{2,3}[가-힣]\d{4}$/;
    if (!basicPattern.test(plate)) {
      return false;
    }

    // 한글 문자가 유효한 번호판 문자인지 확인
    const koreanChar = plate.match(/[가-힣]/)?.[0];
    if (koreanChar && !this.validKoreanChars.includes(koreanChar)) {
      return false;
    }

    return true;
  }

  /**
   * 복합 추출: 텍스트와 파일명에서 모두 시도하여 가장 좋은 결과 반환
   * @param {string} text - OCR 텍스트
   * @param {string} filename - 파일명
   * @returns {Object|null} - 최적 결과 또는 null
   */
  extract(text, filename) {
    const results = [];

    // 텍스트에서 추출 시도
    const textResult = this.extractFromText(text);
    if (textResult) {
      textResult.source = 'text';
      results.push(textResult);
    }

    // 파일명에서 추출 시도
    const filenameResult = this.extractFromFilename(filename);
    if (filenameResult) {
      filenameResult.source = 'filename';
      // 파일명에서 추출한 결과는 confidence를 약간 낮춤
      filenameResult.confidence *= 0.9;
      results.push(filenameResult);
    }

    if (results.length === 0) {
      return null;
    }

    // confidence가 높은 순으로 정렬하고 첫 번째 반환
    results.sort((a, b) => b.confidence - a.confidence);
    
    const best = results[0];
    console.log(`[PlateRecognizer] Found plate '${best.plate}' from ${best.source} (confidence: ${best.confidence})`);
    
    return best;
  }
}

module.exports = new PlateRecognizer();