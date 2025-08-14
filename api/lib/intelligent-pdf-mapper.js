const ollama = require('ollama');

class IntelligentPDFMapper {
  constructor() {
    this.pdfDimensions = { width: 595, height: 841 }; // A4 PDF 표준 크기
    this.fieldMappings = new Map();
  }

  async analyzeFieldPositions(pdfStructure) {
    const prompt = `
한국 정부의 자동차 말소등록 신청서 PDF 양식을 분석하여 각 필드의 최적 좌표를 제안해주세요.

PDF 크기: ${this.pdfDimensions.width} x ${this.pdfDimensions.height} (A4 표준)
좌표계: 왼쪽 하단이 (0,0), 오른쪽 상단이 (595,841)

다음 필드들의 최적 좌표를 JSON 형식으로 제안해주세요:

1. 소유자 성명(명칭) - 상단 소유자 정보 섹션의 성명 입력란
2. 주민등록번호(법인등록번호) - 성명 옆의 번호 입력란  
3. 주소 - 소유자 주소 입력란
4. 자동차등록번호 - 중간 부분의 차량번호 입력란
5. 차대번호 - 자동차등록번호 옆의 차대번호 입력란
6. 주행거리 - 차대번호 옆의 주행거리 입력란 (km 앞에)
7. 폐차 체크박스 - 말소등록 원인 중 첫 번째 "폐차" 체크박스
8. 발급필요 체크박스 - 말소사실증명서의 "발급 필요" 체크박스
9. 신청년도 - 신청일의 "년" 입력란
10. 신청월 - 신청일의 "월" 입력란  
11. 신청일 - 신청일의 "일" 입력란
12. 신청인 성명 - 하단 신청인 성명 입력란
13. 신청인 생년월일 - 신청인 생년월일 입력란

각 필드는 일반적으로 라벨 텍스트 바로 오른쪽이나 해당 입력 영역에 위치합니다.
한국 정부 양식의 일반적인 레이아웃을 고려하여 실용적인 좌표를 제안해주세요.

응답 형식:
{
  "owner_name": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "birth_date": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "address": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "license_plate": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "chassis_number": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "mileage": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "scrap_checkbox": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "certificate_checkbox": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "application_year": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "application_month": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "application_day": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "applicant_name": {"x": 숫자, "y": 숫자, "size": 폰트크기},
  "applicant_birth": {"x": 숫자, "y": 숫자, "size": 폰트크기}
}`;

    try {
      const response = await ollama.chat({
        model: 'qwen2.5:3b',
        messages: [{ role: 'user', content: prompt }],
        stream: false
      });

      const coordinatesText = response.message.content;
      console.log('🤖 LLM PDF 좌표 분석 결과:', coordinatesText);

      // JSON 응답 파싱 시도
      try {
        const coordinates = JSON.parse(coordinatesText);
        return this.validateAndRefineCoordinates(coordinates);
      } catch (parseError) {
        console.warn('LLM 응답 파싱 실패, 기본 좌표 사용:', parseError.message);
        return this.getDefaultCoordinates();
      }

    } catch (error) {
      console.error('LLM 분석 실패:', error.message);
      return this.getDefaultCoordinates();
    }
  }

  validateAndRefineCoordinates(coordinates) {
    const refined = {};
    
    // 각 좌표를 검증하고 PDF 범위 내로 제한
    Object.keys(coordinates).forEach(field => {
      const coord = coordinates[field];
      refined[field] = {
        x: Math.max(50, Math.min(coord.x || 100, this.pdfDimensions.width - 50)),
        y: Math.max(50, Math.min(coord.y || 700, this.pdfDimensions.height - 50)),
        size: Math.max(8, Math.min(coord.size || 10, 16))
      };
    });

    console.log(' LLM 좌표 검증 및 정제 완료');
    return refined;
  }

  getDefaultCoordinates() {
    // 기본 좌표 (이전에 작업한 좌표들을 기반으로)
    return {
      owner_name: { x: 200, y: 591, size: 12 },
      birth_date: { x: 420, y: 591, size: 12 },
      address: { x: 130, y: 521, size: 10 },
      license_plate: { x: 160, y: 428, size: 12 },
      chassis_number: { x: 380, y: 428, size: 10 },
      mileage: { x: 520, y: 428, size: 12 },
      scrap_checkbox: { x: 135, y: 371, size: 12 },
      certificate_checkbox: { x: 250, y: 191, size: 12 },
      application_year: { x: 500, y: 141, size: 12 },
      application_month: { x: 560, y: 141, size: 12 },
      application_day: { x: 590, y: 141, size: 12 },
      applicant_name: { x: 220, y: 111, size: 12 },
      applicant_birth: { x: 220, y: 86, size: 12 }
    };
  }

  async optimizeFieldPlacement(vehicleData, initialCoordinates) {
    const optimizationPrompt = `
다음 차량 정보를 PDF 양식에 배치할 때 최적화된 좌표를 제안해주세요:

차량 정보:
- 소유자명: "${vehicleData.owner_name || 'N/A'}"
- 생년월일: "${vehicleData.birth_date || 'N/A'}"
- 주소: "${vehicleData.registered_address || 'N/A'}"
- 자동차등록번호: "${vehicleData.license_plate || 'N/A'}"
- 차대번호: "${vehicleData.chassis_number || 'N/A'}"
- 주행거리: "${vehicleData.mileage || 'N/A'}"

현재 좌표: ${JSON.stringify(initialCoordinates)}

텍스트 길이와 PDF 레이아웃을 고려하여 최적화된 좌표를 제안해주세요.
특히 긴 텍스트는 적절히 줄바꿈하거나 위치를 조정해야 합니다.

같은 JSON 형식으로 응답해주세요.`;

    try {
      const response = await ollama.chat({
        model: 'qwen2.5:3b',
        messages: [{ role: 'user', content: optimizationPrompt }],
        stream: false
      });

      const optimizedText = response.message.content;
      console.log(' LLM 좌표 최적화 결과:', optimizedText);

      try {
        const optimizedCoords = JSON.parse(optimizedText);
        return this.validateAndRefineCoordinates(optimizedCoords);
      } catch (parseError) {
        console.warn('최적화 결과 파싱 실패, 초기 좌표 사용');
        return initialCoordinates;
      }

    } catch (error) {
      console.error('좌표 최적화 실패:', error.message);
      return initialCoordinates;
    }
  }

  async generateIntelligentMapping(vehicleData) {
    console.log('🧠 LLM 기반 지능형 PDF 매핑 시작...');
    
    // 1단계: 기본 필드 위치 분석
    const basicCoordinates = await this.analyzeFieldPositions();
    
    // 2단계: 실제 데이터에 맞춰 최적화
    const optimizedCoordinates = await this.optimizeFieldPlacement(vehicleData, basicCoordinates);
    
    console.log(' 최종 LLM 매핑 좌표:', optimizedCoordinates);
    return optimizedCoordinates;
  }

  formatTextForPDF(text, maxLength = 30) {
    if (!text) return '';
    
    // 한글 문자를 ASCII로 변환 (PDF 폰트 호환성)
    let formatted = text.replace(/[^\x00-\x7F]/g, (char) => {
      // 한글 이름 -> 'NAME', 주소 -> 'ADDRESS' 등으로 대체
      if (/[가-힣]/.test(char)) {
        return 'X';
      }
      return char;
    });

    // 길이 제한
    if (formatted.length > maxLength) {
      formatted = formatted.substring(0, maxLength) + '...';
    }

    return formatted;
  }
}

module.exports = IntelligentPDFMapper;