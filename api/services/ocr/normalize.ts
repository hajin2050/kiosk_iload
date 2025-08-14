import { CaseSummary, StructuredFields } from '../../types/caseSummary';

export function toCaseSummary(fields: StructuredFields): CaseSummary {
  const now = new Date();
  const today = formatDate(now);
  
  return {
    owner: {
      name: fields.owner_name || '',
      address: fields.registered_address || '',
      birthDate: fields.birth_date || '',
      type: 'INDIVIDUAL' // Default, can be updated later
    },
    vehicle: {
      plate: fields.license_plate || '',
      vin: fields.chassis_number || '',
      model: fields.vehicle_model || '',
      fuel: normalizeFuel(fields.fuel_type),
      firstRegisteredAt: fields.initial_registration_date || fields.manufacturing_date || '',
      manufacturingDate: fields.manufacturing_date || '',
      mileageKm: safeNumber(fields.mileage_km),
      weightKg: safeNumber(fields.gross_weight),
      displacementCc: safeNumber(fields.engine_displacement),
      engineNumber: fields.engine_number || '',
      color: fields.vehicle_color || ''
    },
    dereg: {
      reason: '수출예정', // Default export reason
      needCertificate: true,
      applicationDate: today,
      applicantBirth: fields.birth_date || ''
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

export function normalizeFuel(fuel?: string): string {
  if (!fuel) return '';
  
  const fuelMap: Record<string, string> = {
    '휘발유': 'gasoline',
    '경유': 'diesel',
    '전기': 'electric',
    'LPG': 'lpg',
    '하이브리드': 'hybrid',
    'CNG': 'cng',
    '수소': 'hydrogen',
    '가솔린': 'gasoline',
    '디젤': 'diesel'
  };
  
  return fuelMap[fuel] || fuel.toLowerCase();
}

export function denormalizeFuel(fuel?: string): string {
  if (!fuel) return '';
  
  const fuelMap: Record<string, string> = {
    'gasoline': '휘발유',
    'diesel': '경유',
    'electric': '전기',
    'lpg': 'LPG',
    'hybrid': '하이브리드',
    'cng': 'CNG',
    'hydrogen': '수소'
  };
  
  return fuelMap[fuel.toLowerCase()] || fuel;
}

export function mergeCaseSummaries(
  existing: Partial<CaseSummary>,
  updated: Partial<CaseSummary>
): CaseSummary {
  return {
    owner: {
      ...existing.owner,
      ...updated.owner
    } as CaseSummary['owner'],
    vehicle: {
      ...existing.vehicle,
      ...updated.vehicle
    } as CaseSummary['vehicle'],
    dereg: {
      ...existing.dereg,
      ...updated.dereg
    } as CaseSummary['dereg'],
    transaction: updated.transaction || existing.transaction,
    additionalNotes: updated.additionalNotes || existing.additionalNotes,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function validateCaseSummary(summary: CaseSummary): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required fields
  if (!summary.vehicle.plate) {
    errors.push('Vehicle plate number is required');
  }
  
  if (!summary.owner.name) {
    errors.push('Owner name is required');
  }
  
  if (!summary.vehicle.vin) {
    warnings.push('Vehicle VIN is missing');
  }
  
  if (!summary.dereg.applicationDate) {
    errors.push('Application date is required');
  }
  
  // Validate plate format
  if (summary.vehicle.plate) {
    const plateRe = /^\d{2,3}[가-힣로나다라마바사아자차카타파하]\d{4}$/;
    if (!plateRe.test(summary.vehicle.plate)) {
      warnings.push('License plate format may be invalid');
    }
  }
  
  // Validate VIN
  if (summary.vehicle.vin) {
    const vinRe = /^[A-HJ-NPR-Z0-9]{17}$/;
    if (!vinRe.test(summary.vehicle.vin.toUpperCase())) {
      warnings.push('VIN format may be invalid (should be 17 characters)');
    }
  }
  
  // Validate dates
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (summary.dereg.applicantBirth && !dateRe.test(summary.dereg.applicantBirth)) {
    warnings.push('Birth date format should be YYYY-MM-DD');
  }
  
  if (summary.vehicle.firstRegisteredAt && !dateRe.test(summary.vehicle.firstRegisteredAt)) {
    warnings.push('Registration date format should be YYYY-MM-DD');
  }
  
  // Validate numeric values
  if (summary.vehicle.mileageKm !== undefined && summary.vehicle.mileageKm < 0) {
    warnings.push('Mileage cannot be negative');
  }
  
  if (summary.vehicle.weightKg !== undefined && summary.vehicle.weightKg < 0) {
    warnings.push('Weight cannot be negative');
  }
  
  if (summary.vehicle.displacementCc !== undefined && summary.vehicle.displacementCc < 0) {
    warnings.push('Engine displacement cannot be negative');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

function safeNumber(value: any): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : undefined;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function cleanupText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
    .trim();
}

export function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+/g);
  return matches ? matches.map(n => parseInt(n, 10)).filter(n => !isNaN(n)) : [];
}

export function formatKoreanDate(year: number, month: number, day: number): string {
  return `${year}년 ${month}월 ${day}일`;
}

export function parseKoreanDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return null;
}