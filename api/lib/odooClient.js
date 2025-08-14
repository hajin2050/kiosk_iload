const axios = require('axios');

class OdooClient {
  constructor(
    baseUrl = process.env.ODOO_URL || 'http://localhost:8069',
    db = process.env.ODOO_DB || 'kiosk_db',
    username = process.env.ODOO_USER || 'admin',
    password = process.env.ODOO_PASS || 'admin'
  ) {
    this.baseUrl = baseUrl;
    this.db = db;
    this.username = username;
    this.password = password;
    this.uid = null;
    this.requestId = 1;
  }

  async jsonRpcCall(url, method, params) {
    const payload = {
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

      const data = response.data;

      if (data.error) {
        throw new Error(`Odoo RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      return data.result;
    } catch (error) {
      if (error.response) {
        console.error('Odoo RPC Response Error:', error.response.data);
      }
      throw error;
    }
  }

  async authenticate() {
    try {
      const result = await this.jsonRpcCall(
        '/jsonrpc',
        'call',
        {
          service: 'common',
          method: 'authenticate',
          args: [this.db, this.username, this.password, {}]
        }
      );
      
      if (!result) {
        throw new Error('Authentication returned null/false - check credentials');
      }
      
      this.uid = result;
      return result;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  async executeKw(model, method, args, kwargs = {}) {
    if (!this.uid) {
      await this.authenticate();
    }

    return await this.jsonRpcCall(
      '/jsonrpc',
      'call',
      {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.db,
          this.uid,
          this.password,
          model,
          method,
          args,
          kwargs
        ]
      }
    );
  }

  async upsertVehicleCaseToOdoo(payload) {
    try {
      // Search for existing record by ext_id
      const existingIds = await this.executeKw(
        'vehicle.case',
        'search',
        [[['ext_id', '=', payload.ext_id]]],
        { limit: 1 }
      );

      let result;
      if (existingIds && existingIds.length > 0) {
        // Update existing record
        result = await this.executeKw(
          'vehicle.case',
          'write',
          [existingIds, payload]
        );
        console.log(`Updated Odoo vehicle.case ID: ${existingIds[0]}`);
        return existingIds[0];
      } else {
        // Create new record
        result = await this.executeKw(
          'vehicle.case',
          'create',
          [payload]
        );
        console.log(`Created new Odoo vehicle.case ID: ${result}`);
        return result;
      }
    } catch (error) {
      console.error('Odoo upsert failed:', error);
      throw error;
    }
  }

  async attachPdfToOdoo(extId, kind, filename, base64Data) {
    try {
      // Find the vehicle case
      const caseIds = await this.executeKw(
        'vehicle.case',
        'search',
        [[['ext_id', '=', extId]]],
        { limit: 1 }
      );

      if (!caseIds || caseIds.length === 0) {
        throw new Error(`No vehicle.case found with ext_id: ${extId}`);
      }

      const caseId = caseIds[0];

      // Create attachment
      const attachmentId = await this.executeKw(
        'ir.attachment',
        'create',
        [{
          name: filename,
          type: 'binary',
          datas: base64Data,
          res_model: 'vehicle.case',
          res_id: caseId,
          mimetype: 'application/pdf'
        }]
      );

      console.log(`Attached PDF ${filename} to vehicle.case ${caseId}`);
      return attachmentId;
    } catch (error) {
      console.error('Failed to attach PDF to Odoo:', error);
      throw error;
    }
  }
}

module.exports = OdooClient;