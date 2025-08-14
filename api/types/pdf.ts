// 표준 스키마 정의 (프론트/백엔드 공용)
export interface CaseSummary {
  owner: {
    name: string;
    rrnOrCorpNo?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  vehicle: {
    plate: string;
    vin?: string;
    model?: string;
    fuel?: string;
    firstRegisteredAt?: string;
    mileageKm?: number;
    weightKg?: number;
    displacementCc?: number;
  };
  dereg: {
    reason: '폐차' | '반품' | '행정처분이행' | '수출예정' | '도난' | '횡령편취' | '재해사고' | '차령초과압류' | '연구시험' | '특수용도' | '섬해체' | '외교SOFA양도' | '도로외한정' | '기타' | '지자체멸실인정';
    needCertificate?: boolean;
    applicationDate?: string;
    applicantBirth?: string;
  };
  invoice?: {
    shipper: string;
    buyer: string;
    notify?: string;
    pol?: string;
    pod?: string;
    destination?: string;
    itemDesc?: string;
    qty?: number;
    unitPrice?: number;
    amount?: number;
    weightKg?: number;
    noAndDate?: string;
  };
}

// PDF 필드 매핑 인터페이스
export interface PdfFieldMap {
  font: string;
  page: number;
  origin: 'bottom-left' | 'top-left';
  pageSize?: { width: number; height: number };
  fields: Record<string, PdfField>;
}

export interface PdfField {
  type: 'text' | 'checkbox' | 'checkbox-group' | 'date' | 'stamp';
  pdfField?: string; // AcroForm 필드명
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fontSize?: number;
  lineHeight?: number;
  maxLines?: number;
  format?: string;
  box?: number; // 체크박스 크기
  options?: Record<string, { x: number; y: number; box: number }>; // 체크박스 그룹용
  text?: string; // 서명/도장용 텍스트
}

export interface PdfTemplate {
  id: string;
  name: string;
  templatePath: string;
  fieldMapPath: string;
  kind: 'DEREG_FORM' | 'INVOICE';
}