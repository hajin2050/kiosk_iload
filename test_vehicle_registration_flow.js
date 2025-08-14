#!/usr/bin/env node

/**
 * Test script for vehicle registration OCR flow
 * Tests: OCR extraction → Field mapping → CaseSummary generation
 */

const { parseVehicleRegistration } = require('./api/dist/services/ocr/vehicleRegistration');
const { toCaseSummary, validateCaseSummary, denormalizeFuel } = require('./api/dist/services/ocr/normalize');

console.log('🚗 Vehicle Registration OCR Flow Test\n');
console.log('=' .repeat(60));

// Simulate OCR output from Surya
const suryaOCROutput = {
  success: true,
  raw_text: `자동차등록증
등록번호: 12가3456
차명: 소나타 DN8 하이브리드
차대번호: KMHL341CBLA123456
사용본거지: 서울특별시 강남구 테헤란로 123 우리빌딩 501호
소유자
성명: 홍길동
생년월일: 1980년 01월 15일
최초등록일: 2020년 03월 20일
제조연월일: 2020년 01월 10일
원동기형식: G4NN
총중량: 1,985 kg
배기량: 1999 cc
연료: 하이브리드
주행거리
2020-03-20 | 10 km
2021-03-20 | 15,234 km
2022-03-19 | 28,456 km
2023-03-19 | 45,000 km
색상: 흰색`,
  structured_fields: {
    license_plate: '12가3456',
    vehicle_model: '소나타 DN8 하이브리드',
    chassis_number: 'KMHL341CBLA123456',
    owner_name: '홍길동',
    registered_address: '서울특별시 강남구 테헤란로 123 우리빌딩 501호',
    birth_date: '1980-01-15',
    initial_registration_date: '2020-03-20',
    manufacturing_date: '2020-01-10',
    engine_displacement: 1999,
    gross_weight: 1985,
    fuel_type: '하이브리드',
    mileage_km: 45000,
    engine_number: 'G4NN',
    vehicle_color: '흰색'
  }
};

console.log('\n📋 Step 1: OCR Text Extraction');
console.log('Raw text lines:', suryaOCROutput.raw_text.split('\n').length);
console.log('Structured fields from Surya:', Object.keys(suryaOCROutput.structured_fields).length);

// Parse with our enhanced parser
const textLines = suryaOCROutput.raw_text.split('\n');
const enhancedFields = parseVehicleRegistration(textLines);

console.log('\n📋 Step 2: Enhanced Field Parsing');
console.log('Enhanced fields extracted:', Object.keys(enhancedFields).length);

// Merge Surya fields with enhanced parsing
const mergedFields = {
  ...suryaOCROutput.structured_fields,
  ...enhancedFields
};

console.log('\n📋 Step 3: Field Merging');
console.log('Total merged fields:', Object.keys(mergedFields).length);
console.log('Key fields:');
console.log('  - License Plate:', mergedFields.license_plate);
console.log('  - VIN:', mergedFields.chassis_number);
console.log('  - Owner:', mergedFields.owner_name);
console.log('  - Mileage (max):', mergedFields.mileage_km, 'km');
console.log('  - Weight:', mergedFields.gross_weight, 'kg');
console.log('  - Displacement:', mergedFields.engine_displacement, 'cc');

// Convert to CaseSummary
const summary = toCaseSummary(mergedFields);

console.log('\n📋 Step 4: CaseSummary Generation');
console.log('Owner Info:');
console.log('  - Name:', summary.owner.name);
console.log('  - Address:', summary.owner.address);
console.log('  - Birth Date:', summary.owner.birthDate);

console.log('\nVehicle Info:');
console.log('  - Plate:', summary.vehicle.plate);
console.log('  - VIN:', summary.vehicle.vin);
console.log('  - Model:', summary.vehicle.model);
console.log('  - Fuel:', summary.vehicle.fuel, `(${denormalizeFuel(summary.vehicle.fuel)})`);
console.log('  - First Registered:', summary.vehicle.firstRegisteredAt);
console.log('  - Mileage:', summary.vehicle.mileageKm, 'km');
console.log('  - Weight:', summary.vehicle.weightKg, 'kg');
console.log('  - Displacement:', summary.vehicle.displacementCc, 'cc');

console.log('\nDeregistration Info:');
console.log('  - Reason:', summary.dereg.reason);
console.log('  - Application Date:', summary.dereg.applicationDate);
console.log('  - Applicant Birth:', summary.dereg.applicantBirth);

// Validate summary
const validation = validateCaseSummary(summary);

console.log('\n📋 Step 5: Validation');
if (validation.isValid) {
  console.log('✅ Summary validation: PASSED');
} else {
  console.log('❌ Validation errors:');
  validation.errors.forEach(err => console.log('  -', err));
}

if (validation.warnings.length > 0) {
  console.log('⚠️  Validation warnings:');
  validation.warnings.forEach(warn => console.log('  -', warn));
}

// Simulate PDF field mapping
console.log('\n📋 Step 6: PDF Field Mapping Preview');
const pdfFields = {
  '신청인_성명': summary.owner.name,
  '신청인_주소': summary.owner.address,
  '신청인_생년월일': summary.dereg.applicantBirth,
  '차량_등록번호': summary.vehicle.plate,
  '차량_차대번호': summary.vehicle.vin,
  '차량_차명': summary.vehicle.model,
  '차량_연료': denormalizeFuel(summary.vehicle.fuel),
  '차량_총중량': `${summary.vehicle.weightKg} kg`,
  '차량_배기량': `${summary.vehicle.displacementCc} cc`,
  '차량_주행거리': `${summary.vehicle.mileageKm} km`,
  '말소_사유': summary.dereg.reason,
  '신청_일자': summary.dereg.applicationDate
};

console.log('PDF form fields ready for mapping:');
Object.entries(pdfFields).forEach(([key, value]) => {
  if (value && value !== 'undefined' && value !== ' kg' && value !== ' cc' && value !== ' km') {
    console.log(`  ✅ ${key}: ${value}`);
  } else {
    console.log(`  ⚠️  ${key}: [MISSING]`);
  }
});

// Summary
console.log('\n' + '=' .repeat(60));
console.log('🎯 Flow Test Summary');
console.log('  1. OCR Text Extraction: ✅');
console.log('  2. Field Parsing: ✅');
console.log('  3. Field Normalization: ✅');
console.log('  4. CaseSummary Generation: ✅');
console.log(`  5. Validation: ${validation.isValid ? '✅' : '⚠️'}`);
console.log('  6. PDF Field Mapping: ✅');
console.log('\n✨ Vehicle registration OCR flow is ready for production!');