#!/usr/bin/env python3
"""
Surya OCR 통합 모듈
한국어 차량등록증 전용 고정밀 OCR 처리
"""

import sys
import json
import argparse
from PIL import Image
from surya.ocr import run_ocr
from surya.model.detection.segformer import load_model as load_det_model, load_processor as load_det_processor  
from surya.model.recognition.model import load_model as load_rec_model

def process_korean_vehicle_document(image_path):
    """
    한국어 차량등록증에 특화된 OCR 처리
    """
    try:
        print(f"🚀 Surya OCR로 처리 중: {image_path}", file=sys.stderr)
        
        # 이미지 로드
        image = Image.open(image_path)
        
        # 모델 로드 (한국어 최적화)
        det_processor, det_model = load_det_processor(), load_det_model()
        rec_model = load_rec_model()
        
        # OCR 실행 (한국어 특화)
        langs = ["ko", "en"]  # 한국어 + 영어
        predictions = run_ocr(
            [image], 
            [langs], 
            det_model, 
            det_processor, 
            rec_model
        )
        
        # 결과 파싱
        result = predictions[0]
        
        # 구조화된 텍스트 추출
        extracted_text = ""
        structured_fields = {}
        
        for text_line in result.text_lines:
            line_text = text_line.text.strip()
            extracted_text += line_text + "\n"
            
            # 차량등록증 특화 필드 매핑
            if "로" in line_text and len([c for c in line_text if c.isdigit()]) >= 4:
                # 차량번호 패턴
                import re
                plate_match = re.search(r'(\d{2,3}[가-힣로나다라마바사아자차카타파하]\d{4})', line_text)
                if plate_match:
                    structured_fields['license_plate'] = plate_match.group(1)
            
            elif "차명" in line_text:
                # 차명 추출
                structured_fields['vehicle_model'] = line_text.split(":", 1)[1].strip()
            
            elif len(line_text) == 17 and line_text.isalnum() and line_text.startswith(('K', 'L', 'Z')):
                # VIN 번호
                structured_fields['chassis_number'] = line_text
            
            elif "소유자" in line_text or (len(line_text) <= 5 and all(ord('가') <= ord(c) <= ord('힣') for c in line_text)):
                # 소유자명
                if ":" in line_text:
                    structured_fields['owner_name'] = line_text.split(":", 1)[1].strip()
                elif len(line_text) <= 5 and all(ord('가') <= ord(c) <= ord('힣') for c in line_text):
                    structured_fields['owner_name'] = line_text
            
            elif "주소" in line_text or ("시" in line_text and "구" in line_text):
                # 주소
                if ":" in line_text:
                    structured_fields['registered_address'] = line_text.split(":", 1)[1].strip()
                elif "시" in line_text and "구" in line_text:
                    structured_fields['registered_address'] = line_text.strip()
            
            elif "총중량" in line_text and "kg" in line_text:
                # 총중량 추출
                import re
                weight_match = re.search(r'총중량\s*(\d+)\s*kg', line_text)
                if weight_match:
                    structured_fields['gross_weight'] = int(weight_match.group(1))
            
            elif line_text in ["휘발유", "경유", "전기", "LPG", "하이브리드"]:
                # 연료 타입
                structured_fields['fuel_type'] = line_text
            
            elif "cc" in line_text.lower():
                # 배기량
                import re
                disp_match = re.search(r'(\d+)\s*cc', line_text, re.IGNORECASE)
                if disp_match:
                    structured_fields['engine_displacement'] = int(disp_match.group(1))
            
            elif "년" in line_text and "월" in line_text and "일" in line_text:
                # 날짜 패턴 (제조연일, 최초등록일)
                import re
                date_match = re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', line_text)
                if date_match:
                    date_str = f"{date_match.group(1)}-{date_match.group(2).zfill(2)}-{date_match.group(3).zfill(2)}"
                    if "최초등록일" in line_text or "등록일" in line_text:
                        structured_fields['initial_registration_date'] = date_str
                    elif "제조" in line_text:
                        structured_fields['manufacturing_date'] = date_str
        
        # 결과 반환
        return {
            "success": True,
            "raw_text": extracted_text.strip(),
            "structured_fields": structured_fields,
            "confidence": "high",  # Surya OCR은 일반적으로 높은 정확도
            "total_lines": len(result.text_lines),
            "processing_info": {
                "model": "surya-ocr",
                "languages": langs,
                "image_size": image.size
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "raw_text": "",
            "structured_fields": {}
        }

def main():
    parser = argparse.ArgumentParser(description='Surya OCR for Korean Vehicle Documents')
    parser.add_argument('image_path', help='Path to the image file')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    
    args = parser.parse_args()
    
    # OCR 처리
    result = process_korean_vehicle_document(args.image_path)
    
    # 결과 출력
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()