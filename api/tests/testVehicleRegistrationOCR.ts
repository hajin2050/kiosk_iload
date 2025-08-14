import { parseVehicleRegistration, validateStructuredFields } from '../services/ocr/vehicleRegistration';
import { toCaseSummary, validateCaseSummary, normalizeFuel } from '../services/ocr/normalize';
import { StructuredFields, CaseSummary } from '../types/caseSummary';

// Sample OCR text lines from a Korean vehicle registration document
const sampleTextLines = [
  '자동차등록증',
  '등록번호: 12가3456',
  '차명: 소나타 DN8 하이브리드',
  '차대번호: KMHL341CBLA123456',
  '사용본거지: 서울특별시 강남구 테헤란로 123 우리빌딩 501호',
  '소유자',
  '성명: 홍길동',
  '생년월일: 1980년 01월 15일',
  '주소: 서울특별시 강남구 테헤란로 123',
  '최초등록일: 2020년 03월 20일',
  '제조연월일: 2020년 01월 10일',
  '검사유효기간',
  '2022년 03월 19일부터',
  '2024년 03월 19일까지',
  '원동기형식: G4NN',
  '총중량: 1,985 kg',
  '배기량: 1999 cc',
  '연료: 하이브리드',
  '주행거리',
  '검사일자 | 주행거리',
  '2020-03-20 | 10 km',
  '2021-03-20 | 15,234 km',
  '2022-03-19 | 28,456 km',
  '2023-03-19 | 45,000 km',
  '색상: 흰색'
];

function runTests() {
  console.log('🧪 Testing Vehicle Registration OCR Parser\n');
  console.log('=' .repeat(50));
  
  // Test 1: Parse structured fields
  console.log('\n📋 Test 1: Parse Structured Fields');
  const structuredFields = parseVehicleRegistration(sampleTextLines);
  
  console.log('Extracted fields:');
  console.log(JSON.stringify(structuredFields, null, 2));
  
  // Verify critical fields
  const expectedFields = [
    'license_plate',
    'vehicle_model',
    'chassis_number',
    'owner_name',
    'registered_address',
    'birth_date',
    'initial_registration_date',
    'manufacturing_date',
    'engine_displacement',
    'gross_weight',
    'fuel_type',
    'mileage_km'
  ];
  
  const missingFields = expectedFields.filter(field => !structuredFields[field as keyof StructuredFields]);
  if (missingFields.length > 0) {
    console.log('❌ Missing fields:', missingFields);
  } else {
    console.log('✅ All critical fields extracted');
  }
  
  // Test 2: Validate structured fields
  console.log('\n📋 Test 2: Validate Structured Fields');
  const validation = validateStructuredFields(structuredFields);
  
  if (validation.isValid) {
    console.log('✅ Validation passed');
  } else {
    console.log('❌ Validation failed:');
    validation.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  // Test 3: Convert to CaseSummary
  console.log('\n📋 Test 3: Convert to CaseSummary');
  const summary = toCaseSummary(structuredFields);
  
  console.log('Generated summary:');
  console.log(JSON.stringify(summary, null, 2));
  
  // Test 4: Validate CaseSummary
  console.log('\n📋 Test 4: Validate CaseSummary');
  const summaryValidation = validateCaseSummary(summary);
  
  if (summaryValidation.isValid) {
    console.log('✅ Summary validation passed');
  } else {
    console.log('❌ Summary validation errors:');
    summaryValidation.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (summaryValidation.warnings.length > 0) {
    console.log('⚠️  Summary validation warnings:');
    summaryValidation.warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  // Test 5: Verify specific field mappings
  console.log('\n📋 Test 5: Verify Field Mappings');
  const checks = [
    { field: 'License Plate', expected: '12가3456', actual: summary.vehicle.plate },
    { field: 'Owner Name', expected: '홍길동', actual: summary.owner.name },
    { field: 'VIN', expected: 'KMHL341CBLA123456', actual: summary.vehicle.vin },
    { field: 'Mileage (max)', expected: 45000, actual: summary.vehicle.mileageKm },
    { field: 'Weight', expected: 1985, actual: summary.vehicle.weightKg },
    { field: 'Displacement', expected: 1999, actual: summary.vehicle.displacementCc },
    { field: 'Fuel', expected: 'hybrid', actual: summary.vehicle.fuel },
    { field: 'Birth Date', expected: '1980-01-15', actual: summary.dereg.applicantBirth }
  ];
  
  let allPassed = true;
  checks.forEach(check => {
    if (check.expected === check.actual) {
      console.log(`✅ ${check.field}: ${check.actual}`);
    } else {
      console.log(`❌ ${check.field}: Expected ${check.expected}, got ${check.actual}`);
      allPassed = false;
    }
  });
  
  // Test 6: Test fuel normalization
  console.log('\n📋 Test 6: Fuel Type Normalization');
  const fuelTests = [
    { input: '휘발유', expected: 'gasoline' },
    { input: '경유', expected: 'diesel' },
    { input: '전기', expected: 'electric' },
    { input: 'LPG', expected: 'lpg' },
    { input: '하이브리드', expected: 'hybrid' }
  ];
  
  fuelTests.forEach(test => {
    const result = normalizeFuel(test.input);
    if (result === test.expected) {
      console.log(`✅ ${test.input} → ${result}`);
    } else {
      console.log(`❌ ${test.input} → ${result} (expected ${test.expected})`);
    }
  });
  
  // Test 7: Edge cases
  console.log('\n📋 Test 7: Edge Cases');
  
  // Test with minimal data
  const minimalLines = [
    '12가3456',
    '홍길동'
  ];
  
  const minimalFields = parseVehicleRegistration(minimalLines);
  const minimalSummary = toCaseSummary(minimalFields);
  console.log('Minimal data extraction:');
  console.log(`  - Plate: ${minimalSummary.vehicle.plate || 'NOT FOUND'}`);
  console.log(`  - Name: ${minimalSummary.owner.name || 'NOT FOUND'}`);
  
  // Test with invalid VIN
  const invalidVinLines = [
    '차대번호: INVALIDVIN123'  // Too short
  ];
  
  const invalidVinFields = parseVehicleRegistration(invalidVinLines);
  const vinValidation = validateStructuredFields(invalidVinFields);
  console.log(`Invalid VIN validation: ${vinValidation.errors.length > 0 ? '✅ Caught' : '❌ Missed'}`);
  
  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('🎯 Test Summary');
  if (allPassed && validation.isValid && summaryValidation.isValid) {
    console.log('✅ All tests passed successfully!');
  } else {
    console.log('⚠️  Some tests failed. Review the output above.');
  }
}

// Run tests
runTests();