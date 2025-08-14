import { StructuredFields } from '../../types/caseSummary';

export function parseVehicleRegistration(textLines: string[]): StructuredFields {
  const out: StructuredFields = {};
  
  // Regular expressions for Korean vehicle registration parsing
  const plateRe = /(\d{2,3}[가-힣로나다라마바사아자차카타파하]\d{4})/;
  const vinRe = /\b([A-HJ-NPR-Z0-9]{17})\b/;
  const dispRe = /(\d{2,5})\s*cc/i;
  const weightRe = /총중량\s*:?\s*([\d,]+)\s*kg/i;
  const dateRe = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
  const mileageRe = /([\d,]+)\s*km/i;
  const fuels = ['휘발유', '경유', '전기', 'LPG', '하이브리드', 'CNG', '수소'];
  
  const mileageCandidates: number[] = [];
  
  for (const line of textLines.map(s => s.trim())) {
    // License plate
    const plateMatch = plateRe.exec(line);
    if (plateMatch && !out.license_plate) {
      out.license_plate = plateMatch[1];
    }
    
    // VIN (Chassis number)
    const vinMatch = vinRe.exec(line);
    if (vinMatch && !out.chassis_number) {
      out.chassis_number = vinMatch[1];
    }
    
    // Vehicle model
    if (line.includes('차명') || line.includes('차종')) {
      const parts = line.split(/[:：]/);
      if (parts[1]) {
        out.vehicle_model = parts[1].trim();
      }
    }
    
    // Address
    if (line.includes('주소') || line.includes('사용본거지') || 
        (line.includes('시') && line.includes('구'))) {
      const val = line.includes(':') ? line.split(/[:：]/)[1]?.trim() : line;
      if (val && (!out.registered_address || val.length > out.registered_address.length)) {
        out.registered_address = val;
      }
    }
    
    // Owner name
    if (line.includes('성명') || line.includes('소유자')) {
      const parts = line.split(/[:：]/);
      if (parts[1]) {
        out.owner_name = parts[1].trim();
      }
    } else if (!out.owner_name && /^[가-힣]{2,5}$/.test(line)) {
      // Korean name pattern (2-5 characters)
      out.owner_name = line;
    }
    
    // Birth date
    if (line.includes('생년월일')) {
      const dateMatch = dateRe.exec(line);
      if (dateMatch) {
        out.birth_date = `${dateMatch[1]}-${pad2(dateMatch[2])}-${pad2(dateMatch[3])}`;
      }
    }
    
    // Initial registration date
    if (line.includes('최초등록') || line.includes('등록일')) {
      const dateMatch = dateRe.exec(line);
      if (dateMatch) {
        out.initial_registration_date = `${dateMatch[1]}-${pad2(dateMatch[2])}-${pad2(dateMatch[3])}`;
      }
    }
    
    // Manufacturing date
    if (line.includes('제조') || line.includes('제작') || line.includes('제장')) {
      const dateMatch = dateRe.exec(line);
      if (dateMatch) {
        out.manufacturing_date = `${dateMatch[1]}-${pad2(dateMatch[2])}-${pad2(dateMatch[3])}`;
      }
    }
    
    // Engine displacement
    const dispMatch = dispRe.exec(line);
    if (dispMatch) {
      out.engine_displacement = parseInt(dispMatch[1], 10);
    }
    
    // Gross weight
    const weightMatch = weightRe.exec(line);
    if (weightMatch) {
      out.gross_weight = parseInt(weightMatch[1].replace(/,/g, ''), 10);
    }
    
    // Fuel type
    const fuelMatch = fuels.find(f => line.includes(f));
    if (fuelMatch && !out.fuel_type) {
      out.fuel_type = fuelMatch;
    }
    
    // Mileage candidates
    const mileageMatch = mileageRe.exec(line);
    if (mileageMatch) {
      const km = parseInt(mileageMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(km) && km > 0) {
        mileageCandidates.push(km);
      }
    }
    
    // Engine number
    if (line.includes('원동기형식') || line.includes('엔진번호')) {
      const parts = line.split(/[:：]/);
      if (parts[1]) {
        out.engine_number = parts[1].trim();
      }
    }
    
    // Vehicle color
    if (line.includes('색상') || line.includes('차량색')) {
      const parts = line.split(/[:：]/);
      if (parts[1]) {
        out.vehicle_color = parts[1].trim();
      }
    }
  }
  
  // Select maximum mileage from candidates
  if (mileageCandidates.length > 0) {
    out.mileage_km = Math.max(...mileageCandidates);
  }
  
  return out;
}

export function validateStructuredFields(fields: StructuredFields): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Validate license plate format
  if (fields.license_plate) {
    const plateRe = /^\d{2,3}[가-힣로나다라마바사아자차카타파하]\d{4}$/;
    if (!plateRe.test(fields.license_plate)) {
      errors.push('Invalid license plate format');
    }
  }
  
  // Validate VIN (17 characters, no I/O/Q)
  if (fields.chassis_number) {
    const vinRe = /^[A-HJ-NPR-Z0-9]{17}$/;
    if (!vinRe.test(fields.chassis_number.toUpperCase())) {
      errors.push('Invalid VIN format (must be 17 alphanumeric characters, no I/O/Q)');
    }
  }
  
  // Validate dates
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (fields.birth_date && !dateRe.test(fields.birth_date)) {
    errors.push('Invalid birth date format');
  }
  if (fields.initial_registration_date && !dateRe.test(fields.initial_registration_date)) {
    errors.push('Invalid registration date format');
  }
  if (fields.manufacturing_date && !dateRe.test(fields.manufacturing_date)) {
    errors.push('Invalid manufacturing date format');
  }
  
  // Validate numeric fields
  if (fields.mileage_km && fields.mileage_km < 0) {
    errors.push('Invalid mileage (cannot be negative)');
  }
  if (fields.gross_weight && fields.gross_weight < 0) {
    errors.push('Invalid weight (cannot be negative)');
  }
  if (fields.engine_displacement && fields.engine_displacement < 0) {
    errors.push('Invalid engine displacement (cannot be negative)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function pad2(n: string | number): string {
  return String(n).padStart(2, '0');
}