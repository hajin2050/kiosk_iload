const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// 한국어 폰트 지원을 위한 NotoSansCJK 폰트 경로
const NOTO_FONT_PATH = path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansCJKkr-Regular.ttf');

// PDF 템플릿 좌표 매핑 (A4 사이즈 기준)
const PDF_FIELD_COORDINATES = {
  // 차량 등록 해지 신청서 필드 좌표
  VEHICLE_REGISTRATION: {
    // 차량 정보
    plateNumber: { x: 150, y: 700, fontSize: 12 },
    vehicleModel: { x: 300, y: 700, fontSize: 10 },
    vin: { x: 150, y: 680, fontSize: 10 },
    registrationDate: { x: 300, y: 680, fontSize: 10 },
    
    // 소유자 정보
    ownerName: { x: 150, y: 650, fontSize: 12 },
    ownerType: { x: 300, y: 650, fontSize: 10 },
    companyName: { x: 450, y: 650, fontSize: 10 },
    
    // 신청 정보
    applicationDate: { x: 150, y: 620, fontSize: 10 },
    reason: { x: 150, y: 590, fontSize: 10 },
    
    // 기타 정보
    submissionDate: { x: 400, y: 100, fontSize: 10 },
    caseId: { x: 500, y: 50, fontSize: 8 }
  }
};

// PDF 템플릿 텍스트 라벨
const PDF_LABELS = {
  title: '차량 등록 해지 신청서',
  plateNumberLabel: '등록번호:',
  vehicleModelLabel: '차량모델:',
  vinLabel: '차대번호:',
  registrationDateLabel: '등록일자:',
  ownerNameLabel: '소유자명:',
  ownerTypeLabel: '소유자구분:',
  companyNameLabel: '회사명:',
  applicationDateLabel: '신청일자:',
  reasonLabel: '해지사유:',
  submissionDateLabel: '접수일시:',
  caseIdLabel: '케이스번호:'
};

/**
 * PDF 매핑 엔진 클래스
 */
class PDFMapper {
  constructor() {
    this.koreanFont = null;
    this.defaultFont = null;
  }

  /**
   * 폰트 초기화
   */
  async initializeFonts(pdfDoc) {
    pdfDoc.registerFontkit(fontkit);
    
    // 기본 폰트
    this.defaultFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // 한국어 폰트 (있는 경우)
    try {
      if (fs.existsSync(NOTO_FONT_PATH)) {
        const fontBytes = fs.readFileSync(NOTO_FONT_PATH);
        this.koreanFont = await pdfDoc.embedFont(fontBytes);
      }
    } catch (error) {
      console.warn('Failed to load Korean font, using default font:', error.message);
    }
  }

  /**
   * 텍스트에 한글이 포함되어 있는지 확인
   */
  hasKoreanCharacters(text) {
    return /[가-힣]/.test(text);
  }

  /**
   * 적절한 폰트 선택
   */
  selectFont(text) {
    if (this.koreanFont && this.hasKoreanCharacters(text)) {
      return this.koreanFont;
    }
    return this.defaultFont;
  }

  /**
   * 필드 값을 PDF에 추가
   */
  addFieldToPDF(page, fieldKey, value, coordinates) {
    if (!value || !coordinates) return;

    const font = this.selectFont(String(value));
    const fontSize = coordinates.fontSize || 10;
    
    try {
      page.drawText(String(value), {
        x: coordinates.x,
        y: coordinates.y,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    } catch (error) {
      console.error(`Failed to draw field ${fieldKey}:`, error.message);
      // 폴백: 기본 폰트로 시도
      page.drawText(String(value), {
        x: coordinates.x,
        y: coordinates.y,
        size: fontSize,
        font: this.defaultFont,
        color: rgb(0, 0, 0)
      });
    }
  }

  /**
   * PDF 라벨 추가
   */
  addLabels(page) {
    const labelFont = this.koreanFont || this.defaultFont;
    const coordinates = PDF_FIELD_COORDINATES.VEHICLE_REGISTRATION;

    // 제목
    page.drawText(PDF_LABELS.title, {
      x: 200, y: 750, size: 18, font: labelFont, color: rgb(0, 0, 0)
    });

    // 각 필드의 라벨
    const labels = [
      { text: PDF_LABELS.plateNumberLabel, x: coordinates.plateNumber.x - 80, y: coordinates.plateNumber.y },
      { text: PDF_LABELS.vehicleModelLabel, x: coordinates.vehicleModel.x - 80, y: coordinates.vehicleModel.y },
      { text: PDF_LABELS.vinLabel, x: coordinates.vin.x - 80, y: coordinates.vin.y },
      { text: PDF_LABELS.registrationDateLabel, x: coordinates.registrationDate.x - 80, y: coordinates.registrationDate.y },
      { text: PDF_LABELS.ownerNameLabel, x: coordinates.ownerName.x - 80, y: coordinates.ownerName.y },
      { text: PDF_LABELS.ownerTypeLabel, x: coordinates.ownerType.x - 80, y: coordinates.ownerType.y },
      { text: PDF_LABELS.companyNameLabel, x: coordinates.companyName.x - 80, y: coordinates.companyName.y },
      { text: PDF_LABELS.applicationDateLabel, x: coordinates.applicationDate.x - 80, y: coordinates.applicationDate.y },
      { text: PDF_LABELS.reasonLabel, x: coordinates.reason.x - 80, y: coordinates.reason.y }
    ];

    labels.forEach(label => {
      page.drawText(label.text, {
        x: label.x, y: label.y, size: 10, font: labelFont, color: rgb(0, 0, 0)
      });
    });
  }

  /**
   * CaseSummary를 PDF로 생성
   */
  async generatePDF(caseSummary, caseId) {
    try {
      const pdfDoc = await PDFDocument.create();
      await this.initializeFonts(pdfDoc);
      
      const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
      
      // 라벨 추가
      this.addLabels(page);
      
      const coordinates = PDF_FIELD_COORDINATES.VEHICLE_REGISTRATION;
      
      // 필드 매핑 및 추가
      const fieldMappings = {
        plateNumber: caseSummary.vehicleInfo?.plateNumber,
        vehicleModel: caseSummary.vehicleInfo?.model,
        vin: caseSummary.vehicleInfo?.vin,
        registrationDate: caseSummary.vehicleInfo?.registrationDate,
        ownerName: caseSummary.ownerInfo?.name,
        ownerType: this.translateOwnerType(caseSummary.ownerInfo?.type),
        companyName: caseSummary.ownerInfo?.companyName,
        applicationDate: new Date().toLocaleDateString('ko-KR'),
        reason: '수출', // 기본값
        submissionDate: new Date().toLocaleString('ko-KR'),
        caseId: caseId
      };

      // 각 필드를 PDF에 추가
      Object.keys(fieldMappings).forEach(fieldKey => {
        const value = fieldMappings[fieldKey];
        const fieldCoordinates = coordinates[fieldKey];
        
        if (value && fieldCoordinates) {
          this.addFieldToPDF(page, fieldKey, value, fieldCoordinates);
        }
      });

      // PDF 바이트 반환
      return await pdfDoc.save();
      
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }

  /**
   * 소유자 구분 번역
   */
  translateOwnerType(ownerType) {
    const translations = {
      'INDIVIDUAL': '개인',
      'BUSINESS': '사업자',
      'CORPORATE': '법인'
    };
    return translations[ownerType] || ownerType;
  }

  /**
   * PDF를 파일로 저장
   */
  async savePDFToFile(caseSummary, caseId, outputPath) {
    const pdfBytes = await this.generatePDF(caseSummary, caseId);
    fs.writeFileSync(outputPath, pdfBytes);
    return outputPath;
  }

  /**
   * PDF를 Base64로 인코딩
   */
  async generatePDFAsBase64(caseSummary, caseId) {
    const pdfBytes = await this.generatePDF(caseSummary, caseId);
    return Buffer.from(pdfBytes).toString('base64');
  }
}

module.exports = { PDFMapper, PDF_FIELD_COORDINATES, PDF_LABELS };