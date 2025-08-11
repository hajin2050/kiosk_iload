const ocrText = `
자동차등록증
문서확인번호: 3851319808049559
자동차등록규칙 [별지 제1호서식] <개정 2025. 2. 17.>

자동차등록증
호 202506-044649 호 최초등록일: 2019년 07월 19일
자동차등록번호: 12로8681
차명: G4 렉스턴  
차대번호: KPBGAZAF1KP053475
제조연일: 2019-07
소유자: 이왕우
주소: 전주시 완산구

차량정보:
1825 mm 총중량 2635 kg
연료: 경유
배기량: 2157 cc
`;

console.log('🔍 입력 OCR 텍스트:');
console.log(ocrText);
console.log('\n📋 OCR 매핑 결과:');

// 현재 OCR 매핑 로직 시뮬레이션
const fields = {};

// 1. 자동차 등록번호
const platePatterns = [
  /(\d{2,3}[가-힣로나다라마바사아자차카타파하]\d{4})/g
];
for (const pattern of platePatterns) {
  const matches = ocrText.match(pattern);
  if (matches) {
    fields.license_plate = matches[0];
    console.log(`✅ 차량번호: ${fields.license_plate}`);
    break;
  }
}

// 2. 차명
const vehicleModelPatterns = [
  /차명[:\s]*([가-힣A-Za-z0-9\s\-]+)/g,
  /(G[0-9]+\s*렉스턴)/g
];
for (const pattern of vehicleModelPatterns) {
  const matches = ocrText.match(pattern);
  if (matches) {
    fields.vehicle_model = matches[0].replace('차명:', '').trim();
    console.log(`✅ 차명: ${fields.vehicle_model}`);
    break;
  }
}

// 3. 차대번호
const vinPatterns = [
  /([A-HJ-NPR-Z0-9]{17})/g
];
for (const pattern of vinPatterns) {
  const matches = ocrText.match(pattern);
  if (matches) {
    fields.chassis_number = matches[0];
    console.log(`✅ 차대번호: ${fields.chassis_number}`);
    break;
  }
}

// 4. 소유자명
const namePatterns = [
  /소유자[:\s]*([가-힣]{2,5})/g
];
for (const pattern of namePatterns) {
  const matches = ocrText.match(pattern);
  if (matches) {
    fields.owner_name = matches[1];
    console.log(`✅ 소유자: ${fields.owner_name}`);
    break;
  }
}

// 5. 제조연일
const manufacturingPatterns = [
  /제조연일[:\s]*(\d{4})-(\d{1,2})/g,
  /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g
];
for (const pattern of manufacturingPatterns) {
  const matches = Array.from(ocrText.matchAll(pattern));
  if (matches && matches.length > 0) {
    const match = matches[0];
    if (match.length >= 4 && match[3]) {
      fields.manufacturing_date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    } else if (match.length >= 3 && match[2]) {
      fields.manufacturing_date = `${match[1]}-${match[2].padStart(2, '0')}-01`;
    }
    console.log(`✅ 제조연일: ${fields.manufacturing_date}`);
    break;
  }
}

// 6. 주소
const addressPatterns = [
  /주소[:\s]*([가-힣\s]+)/g,
  /(전주시\s*완산구)/g
];
for (const pattern of addressPatterns) {
  const matches = ocrText.match(pattern);
  if (matches) {
    fields.registered_address = matches[1] || matches[0];
    console.log(`✅ 주소: ${fields.registered_address}`);
    break;
  }
}

// 7. 총중량
const weightPatterns = [
  /(\d{1,4})\s*mm\s+총중량\s+(\d{1,4})\s*kg/g
];
for (const pattern of weightPatterns) {
  const matches = Array.from(ocrText.matchAll(pattern));
  if (matches && matches.length > 0 && matches[0][2]) {
    fields.gross_weight = parseInt(matches[0][2]);
    console.log(`✅ 총중량: ${fields.gross_weight}kg`);
    break;
  }
}

// 8. 연료
const fuelPatterns = [
  /연료[:\s]*([가-힣]+)/g
];
for (const pattern of fuelPatterns) {
  const matches = ocrText.match(pattern);
  if (matches) {
    fields.fuel_type = matches[1];
    console.log(`✅ 연료: ${fields.fuel_type}`);
    break;
  }
}

// 9. 배기량
const displacementPatterns = [
  /배기량[:\s]*(\d{1,4})\s*(?:cc|CC)/g,
  /(\d{1,4})\s*cc/g
];
for (const pattern of displacementPatterns) {
  const matches = ocrText.match(pattern);
  if (matches) {
    fields.engine_displacement = parseInt(matches[1]);
    console.log(`✅ 배기량: ${fields.engine_displacement}cc`);
    break;
  }
}

// 10. 최초등록일
const initialRegPatterns = [
  /최초등록일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g
];
for (const pattern of initialRegPatterns) {
  const matches = Array.from(ocrText.matchAll(pattern));
  if (matches && matches.length > 0) {
    const match = matches[0];
    fields.initial_registration_date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    console.log(`✅ 최초등록일: ${fields.initial_registration_date}`);
    break;
  }
}

console.log('\n📊 최종 추출 결과:');
console.log(JSON.stringify(fields, null, 2));

// 정확도 평가
const expectedValues = {
  license_plate: '12로8681',
  vehicle_model: 'G4 렉스턴',
  chassis_number: 'KPBGAZAF1KP053475',
  owner_name: '이왕우',
  manufacturing_date: '2019-07-01',
  registered_address: '전주시 완산구',
  gross_weight: 2635,
  fuel_type: '경유',
  engine_displacement: 2157,
  initial_registration_date: '2019-07-19'
};

console.log('\n🎯 정확도 평가:');
let correct = 0;
let total = Object.keys(expectedValues).length;

for (const [key, expected] of Object.entries(expectedValues)) {
  const actual = fields[key];
  const isCorrect = actual && actual.toString() === expected.toString();
  console.log(`${isCorrect ? '✅' : '❌'} ${key}: 예상="${expected}" 실제="${actual || 'null'}"`);
  if (isCorrect) correct++;
}

console.log(`\n📈 전체 정확도: ${correct}/${total} (${Math.round(correct/total*100)}%)`);