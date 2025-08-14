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
from surya.model.recognition.processor import load_processor as load_rec_processor

def process_korean_vehicle_document(image_path):
    """
    한국어 차량등록증에 특화된 OCR 처리
    """
    try:
        print(f"🚀 Surya OCR로 처리 중: {image_path}", file=sys.stderr)
        
        # stdout flush를 위해 버퍼링 비활성화
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
        
        # 이미지 로드
        image = Image.open(image_path)
        
        # 모델 로드 (한국어 최적화)
        det_processor, det_model = load_det_processor(), load_det_model()
        rec_model, rec_processor = load_rec_model(), load_rec_processor()
        
        # OCR 실행 (한국어 특화)
        langs = ["ko", "en"]  # 한국어 + 영어
        predictions = run_ocr(
            [image], 
            [langs], 
            det_model, 
            det_processor, 
            rec_model,
            rec_processor
        )
        
        # 결과 파싱
        result = predictions[0]
        print("predict : ",predictions[0], file=sys.stderr)
        
        # 구조화된 텍스트 추출
        import re
        extracted_text = ""
        structured_fields = {}
        
        # 패턴 정의
        plate_re = re.compile(r'(\d{2,3}[가-힣로나다라마바사아자차카타파하]\d{4})')
        vin_re = re.compile(r'\b([A-HJ-NPR-Z0-9]{17})\b')
        disp_re = re.compile(r'(\d{2,5})\s*cc', re.IGNORECASE)
        weight_re = re.compile(r'총중량\s*:?\s*([\d,]+)\s*kg', re.IGNORECASE)
        date_re = re.compile(r'(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일')
        mileage_re = re.compile(r'([\d,]+)\s*km', re.IGNORECASE)
        fuels = ['휘발유', '경유', '전기', 'LPG', '하이브리드', 'CNG', '수소']
        
        mileage_candidates = []
        
        for text_line in result.text_lines:
            line_text = text_line.text.strip()
            extracted_text += line_text + "\n"
            
            # 차량번호
            plate_match = plate_re.search(line_text)
            if plate_match and 'license_plate' not in structured_fields:
                structured_fields['license_plate'] = plate_match.group(1)
            
            # VIN (차대번호)
            vin_match = vin_re.search(line_text)
            if vin_match and 'chassis_number' not in structured_fields:
                structured_fields['chassis_number'] = vin_match.group(1)
            
            # 차명
            if ('차명' in line_text or '차종' in line_text):
                if ':' in line_text:
                    parts = line_text.split(':', 1)
                    if len(parts) > 1:
                        structured_fields['vehicle_model'] = parts[1].strip()
            
            # 주소
            if '주소' in line_text or '사용본거지' in line_text or ('시' in line_text and '구' in line_text):
                if ':' in line_text:
                    addr = line_text.split(':', 1)[1].strip() if ':' in line_text else line_text
                else:
                    addr = line_text.strip()
                if 'registered_address' not in structured_fields or len(addr) > len(structured_fields.get('registered_address', '')):
                    structured_fields['registered_address'] = addr
            
            # 소유자명
            if '성명' in line_text or '소유자' in line_text:
                if ':' in line_text:
                    owner = line_text.split(':', 1)[1].strip()
                    if owner:
                        structured_fields['owner_name'] = owner
            elif 'owner_name' not in structured_fields and re.match(r'^[가-힣]{2,5}$', line_text):
                structured_fields['owner_name'] = line_text
            
            # 생년월일
            if '생년월일' in line_text:
                date_match = date_re.search(line_text)
                if date_match:
                    structured_fields['birth_date'] = f"{date_match.group(1)}-{date_match.group(2).zfill(2)}-{date_match.group(3).zfill(2)}"
            
            # 최초등록일
            if '최초등록' in line_text or ('등록일' in line_text and '최초' in line_text):
                date_match = date_re.search(line_text)
                if date_match:
                    structured_fields['initial_registration_date'] = f"{date_match.group(1)}-{date_match.group(2).zfill(2)}-{date_match.group(3).zfill(2)}"
            
            # 제조연월
            elif '제조' in line_text or '제작' in line_text or '제장' in line_text:
                date_match = date_re.search(line_text)
                if date_match:
                    structured_fields['manufacturing_date'] = f"{date_match.group(1)}-{date_match.group(2).zfill(2)}-{date_match.group(3).zfill(2)}"
            
            # 배기량
            disp_match = disp_re.search(line_text)
            if disp_match:
                structured_fields['engine_displacement'] = int(disp_match.group(1))
            
            # 총중량
            weight_match = weight_re.search(line_text)
            if weight_match:
                structured_fields['gross_weight'] = int(weight_match.group(1).replace(',', ''))
            
            # 연료
            for fuel in fuels:
                if fuel in line_text and 'fuel_type' not in structured_fields:
                    structured_fields['fuel_type'] = fuel
                    break
            
            # 주행거리 후보
            mileage_match = mileage_re.search(line_text)
            if mileage_match:
                km = int(mileage_match.group(1).replace(',', ''))
                if km > 0:
                    mileage_candidates.append(km)
            
            # 원동기형식/엔진번호
            if '원동기형식' in line_text or '엔진번호' in line_text:
                if ':' in line_text:
                    engine = line_text.split(':', 1)[1].strip()
                    if engine:
                        structured_fields['engine_number'] = engine
            
            # 차량색상
            if '색상' in line_text or '차량색' in line_text:
                if ':' in line_text:
                    color = line_text.split(':', 1)[1].strip()
                    if color:
                        structured_fields['vehicle_color'] = color
        
        # 주행거리는 최대값 선택
        if mileage_candidates:
            structured_fields['mileage_km'] = max(mileage_candidates)
        
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
        # JSON 출력 전에 stderr로 완료 메시지 출력
        print("JSON output starting", file=sys.stderr)
        sys.stderr.flush()
        
        # JSON을 한 줄로 출력 (파싱 안정성을 위해)
        json_output = json.dumps(result, ensure_ascii=False, separators=(',', ':'))
        print(json_output)
        sys.stdout.flush()
        
        print("JSON output completed", file=sys.stderr)
        sys.stderr.flush()

if __name__ == "__main__":
    main()