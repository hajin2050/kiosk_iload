const fs = require('fs');
const path = require('path');
// Use Node.js built-in fetch (Node 18+)
const fetch = globalThis.fetch;

class OdooSync {
  constructor() {
    this.odooBase = process.env.ODOO_BASE;
    this.sharedSecret = process.env.ODOO_SHARED_SECRET;
    this.enabled = !!(this.odooBase && this.sharedSecret);
    
    if (!this.enabled) {
      console.warn('Odoo integration not configured. Set ODOO_BASE and ODOO_SHARED_SECRET environment variables.');
    }
  }

  async syncCase(caseData) {
    if (!this.enabled) return null;

    try {
      const url = `${this.odooBase.replace(/\/$/, '')}/kiosk/api/case/upsert`;
      
      const payload = {
        external_uuid: caseData.id,
        plate_number: caseData.plateNumber,
        vin: caseData.vin,
        owner_type: caseData.ownerType,
        owner_name: caseData.ownerName,
        company_name: caseData.companyName,
        business_reg_no: caseData.businessRegNumber,
        language: caseData.language,
        status: caseData.status,
        submitted_at: caseData.submittedAt,
        completed_at: caseData.completedAt,
        ocr_validated: caseData.llmValidated,
        ocr_issues: caseData.llmIssues ? JSON.stringify(caseData.llmIssues) : null,
        summary_json: caseData.summaryJson ? JSON.stringify(caseData.summaryJson) : null
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sharedSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Successfully synced case ${caseData.id} to Odoo:`, result);
      return result;

    } catch (error) {
      console.error(`Failed to sync case ${caseData.id} to Odoo:`, error);
      // Could implement retry logic here
      return null;
    }
  }

  async syncDocument(caseId, documentData, filePath) {
    if (!this.enabled) return null;

    try {
      // Read file and convert to base64
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
      }

      const fileBuffer = fs.readFileSync(absolutePath);
      const fileBase64 = fileBuffer.toString('base64');
      
      // Get file info
      const stats = fs.statSync(absolutePath);
      const fileName = path.basename(absolutePath);
      
      // Determine MIME type based on extension
      const ext = path.extname(fileName).toLowerCase();
      let mimeType = 'application/octet-stream';
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg';
          break;
        case '.png':
          mimeType = 'image/png';
          break;
        case '.pdf':
          mimeType = 'application/pdf';
          break;
      }

      const url = `${this.odooBase.replace(/\/$/, '')}/kiosk/api/document/upload`;
      
      const payload = {
        external_uuid: caseId,
        doc_type: documentData.type,
        filename: fileName,
        mimetype: mimeType,
        file_base64: fileBase64,
        ocr_text: documentData.ocrResult || '',
        mapped_fields: documentData.mappedFields || {}
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sharedSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Successfully synced document ${documentData.id} to Odoo:`, result);
      return result;

    } catch (error) {
      console.error(`Failed to sync document ${documentData.id} to Odoo:`, error);
      return null;
    }
  }

  async updateCaseVehicleData(caseId, vehicleData) {
    if (!this.enabled) return null;

    try {
      const url = `${this.odooBase.replace(/\/$/, '')}/kiosk/api/case/${caseId}/vehicle-data`;
      
      const payload = {
        vehicle_data: vehicleData
      };

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.sharedSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Successfully updated vehicle data for case ${caseId}:`, result);
      return result;

    } catch (error) {
      console.error(`Failed to update vehicle data for case ${caseId}:`, error);
      return null;
    }
  }

  async getCaseStatus(caseId) {
    if (!this.enabled) return null;

    try {
      const url = `${this.odooBase.replace(/\/$/, '')}/kiosk/api/case/${caseId}/status`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sharedSecret}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error(`Failed to get case status from Odoo for ${caseId}:`, error);
      return null;
    }
  }

  async generatePDF(caseId) {
    if (!this.enabled) {
      throw new Error('Odoo integration not configured');
    }

    try {
      const url = `${this.odooBase.replace(/\/$/, '')}/kiosk/api/case/${caseId}/pdf`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sharedSecret}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const pdfBuffer = await response.buffer();
      return pdfBuffer;

    } catch (error) {
      console.error(`Failed to generate PDF from Odoo for ${caseId}:`, error);
      throw error;
    }
  }

  async uploadPDFs(caseId, pdfFiles) {
    if (!this.enabled) return null;

    try {
      const url = `${this.odooBase.replace(/\/$/, '')}/kiosk/api/case/${caseId}/upload-pdf`;
      
      // Convert file paths to base64
      const pdfData = [];
      for (const pdfFile of pdfFiles) {
        const absolutePath = path.isAbsolute(pdfFile) ? pdfFile : path.join(process.cwd(), pdfFile);
        
        if (fs.existsSync(absolutePath)) {
          const fileBuffer = fs.readFileSync(absolutePath);
          const fileBase64 = fileBuffer.toString('base64');
          const fileName = path.basename(absolutePath);
          
          pdfData.push({
            filename: fileName,
            file_base64: fileBase64,
            description: this.getPDFDescription(fileName)
          });
        }
      }

      const payload = {
        pdf_files: pdfData
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sharedSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Successfully uploaded ${result.total_files} PDFs for case ${caseId}:`, result);
      return result;

    } catch (error) {
      console.error(`Failed to upload PDFs for case ${caseId}:`, error);
      return null;
    }
  }

  getPDFDescription(fileName) {
    const name = fileName.toLowerCase();
    if (name.includes('deregistration') || name.includes('말소')) {
      return 'Vehicle Deregistration Form (말소신청서)';
    } else if (name.includes('invoice') || name.includes('인보이스')) {
      return 'Export Invoice (수출 인보이스)';
    } else if (name.includes('certificate') || name.includes('증명')) {
      return 'Export Certificate (수출 증명서)';
    }
    return 'Generated Document';
  }

  // Retry mechanism for failed syncs
  async retrySync(syncFunction, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await syncFunction();
        if (result) return result;
      } catch (error) {
        console.log(`Sync attempt ${i + 1} failed:`, error);
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
        }
      }
    }
    return null;
  }
}

module.exports = new OdooSync();