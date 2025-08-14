export interface Owner {
  name: string;
  address: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  type?: 'INDIVIDUAL' | 'BUSINESS' | 'CORPORATE';
  companyName?: string;
}

export interface Vehicle {
  plate: string;
  vin: string;
  model: string;
  fuel: string; // gasoline, diesel, electric, lpg, hybrid, cng, hydrogen
  firstRegisteredAt?: string; // YYYY-MM-DD
  manufacturingDate?: string; // YYYY-MM-DD
  modelYear?: number;
  mileageKm?: number;
  weightKg?: number;
  displacementCc?: number;
  color?: string;
  engineNumber?: string;
  vehicleType?: string;
}

export interface DeregistrationInfo {
  reason: string; // 수출예정, 폐차, 기타
  needCertificate: boolean;
  applicationDate: string; // YYYY-MM-DD
  applicantBirth?: string; // YYYY-MM-DD
  exportCountry?: string;
  exportPort?: string;
  plannedExportDate?: string;
}

export interface Transaction {
  buyer?: string;
  seller?: string;
  price?: number;
  currency?: string;
  transactionDate?: string;
  invoiceNumber?: string;
}

export interface CaseSummary {
  owner: Owner;
  vehicle: Vehicle;
  dereg: DeregistrationInfo;
  transaction?: Transaction;
  additionalNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StructuredFields {
  license_plate?: string;
  vehicle_model?: string;
  chassis_number?: string;
  owner_name?: string;
  registered_address?: string;
  birth_date?: string;
  initial_registration_date?: string;
  manufacturing_date?: string;
  engine_displacement?: number;
  gross_weight?: number;
  fuel_type?: string;
  mileage_km?: number;
  engine_number?: string;
  vehicle_color?: string;
}

export interface OCRResult {
  ok: boolean;
  raw_text: string;
  structured_fields: StructuredFields;
  summary: CaseSummary;
  confidence?: number;
  processingTime?: number;
}