const axios = require('axios');

interface OdooJsonRpcRequest {
  jsonrpc: string;
  method: string;
  params: any;
  id: number;
}

interface OdooJsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

class OdooClient {
  private baseUrl: string;
  private db: string;
  private username: string;
  private password: string;
  private uid: number | null = null;
  private requestId = 1;

  constructor(
    baseUrl: string = 'http://localhost:8069',
    db: string = 'odoo',
    username: string = 'admin',
    password: string = 'admin'
  ) {
    this.baseUrl = baseUrl;
    this.db = db;
    this.username = username;
    this.password = password;
  }

  private async jsonRpcCall(url: string, method: string, params: any): Promise<any> {
    const payload: OdooJsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}${url}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000
        }
      );

      if (response.data.error) {
        throw new Error(`Odoo RPC Error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      console.error('Odoo JSON-RPC call failed:', error);
      throw error;
    }
  }

  async authenticate(): Promise<number> {
    if (this.uid) {
      return this.uid;
    }

    const result = await this.jsonRpcCall('/jsonrpc', 'call', {
      service: 'common',
      method: 'authenticate',
      args: [this.db, this.username, this.password, {}]
    });

    if (!result) {
      throw new Error('Authentication failed');
    }

    this.uid = result;
    return this.uid;
  }

  private async executeKw(model: string, method: string, args: any[] = [], kwargs: any = {}): Promise<any> {
    await this.authenticate();

    return this.jsonRpcCall('/jsonrpc', 'call', {
      service: 'object',
      method: 'execute_kw',
      args: [this.db, this.uid, this.password, model, method, args, kwargs]
    });
  }

  async upsertVehicleCaseToOdoo(payload: any): Promise<number> {
    const {
      id: extId,
      plateNumber,
      summary,
      status,
      submittedAt,
      completedAt
    } = payload;

    // CaseSummary에서 필요한 필드 추출
    const ownerName = summary?.ownerInfo?.name || 'Unknown';
    const ownerType = summary?.ownerInfo?.type || 'INDIVIDUAL';
    const companyName = summary?.ownerInfo?.companyName || '';

    const vehicleCaseData = {
      ext_id: extId.toString(),
      plate_number: plateNumber,
      owner_name: ownerName,
      owner_type: ownerType,
      company_name: companyName,
      status: status,
      submitted_at: submittedAt,
      completed_at: completedAt,
      summary_json: summary
    };

    try {
      // ext_id로 기존 레코드 검색
      const existingIds = await this.executeKw('vehicle.case', 'search', [
        [['ext_id', '=', extId.toString()]]
      ]);

      if (existingIds.length > 0) {
        // 기존 레코드 업데이트
        const odooId = existingIds[0];
        await this.executeKw('vehicle.case', 'write', [
          [odooId],
          vehicleCaseData
        ]);
        console.log(`Updated existing vehicle case in Odoo: ext_id=${extId}, odoo_id=${odooId}`);
        return odooId;
      } else {
        // 새 레코드 생성
        const odooId = await this.executeKw('vehicle.case', 'create', [vehicleCaseData]);
        console.log(`Created new vehicle case in Odoo: ext_id=${extId}, odoo_id=${odooId}`);
        return odooId;
      }
    } catch (error) {
      console.error('Failed to upsert vehicle case to Odoo:', error);
      throw error;
    }
  }

  async attachPdfToOdoo(extId: string, kind: string, filename: string, base64Data: string): Promise<void> {
    try {
      // ext_id로 vehicle.case 레코드 찾기
      const vehicleCaseIds = await this.executeKw('vehicle.case', 'search', [
        [['ext_id', '=', extId]]
      ]);

      if (vehicleCaseIds.length === 0) {
        throw new Error(`Vehicle case not found with ext_id: ${extId}`);
      }

      const vehicleCaseId = vehicleCaseIds[0];

      // 첨부파일 생성
      const attachmentData = {
        name: filename,
        type: 'binary',
        datas: base64Data,
        res_model: 'vehicle.case',
        res_id: vehicleCaseId,
        description: `${kind} PDF document`
      };

      const attachmentId = await this.executeKw('ir.attachment', 'create', [attachmentData]);
      console.log(`Attached PDF to Odoo: ext_id=${extId}, attachment_id=${attachmentId}, filename=${filename}`);
    } catch (error) {
      console.error('Failed to attach PDF to Odoo:', error);
      throw error;
    }
  }

  async getVehicleCase(extId: string): Promise<any> {
    try {
      const vehicleCaseIds = await this.executeKw('vehicle.case', 'search', [
        [['ext_id', '=', extId]]
      ]);

      if (vehicleCaseIds.length === 0) {
        return null;
      }

      const vehicleCases = await this.executeKw('vehicle.case', 'read', [
        vehicleCaseIds,
        ['ext_id', 'plate_number', 'owner_name', 'owner_type', 'company_name', 'status', 'submitted_at', 'completed_at', 'summary_json']
      ]);

      return vehicleCases[0];
    } catch (error) {
      console.error('Failed to get vehicle case from Odoo:', error);
      throw error;
    }
  }

  async searchVehicleCases(domain: any[] = [], limit: number = 100): Promise<any[]> {
    try {
      const vehicleCaseIds = await this.executeKw('vehicle.case', 'search', [domain], { limit });
      
      if (vehicleCaseIds.length === 0) {
        return [];
      }

      const vehicleCases = await this.executeKw('vehicle.case', 'read', [
        vehicleCaseIds,
        ['ext_id', 'plate_number', 'owner_name', 'owner_type', 'company_name', 'status', 'submitted_at', 'completed_at']
      ]);

      return vehicleCases;
    } catch (error) {
      console.error('Failed to search vehicle cases in Odoo:', error);
      throw error;
    }
  }
}

module.exports = OdooClient;