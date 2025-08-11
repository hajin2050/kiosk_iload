import json
import logging
from odoo import http, _
from odoo.http import request
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class KioskApiController(http.Controller):
    
    def _authenticate_request(self):
        """Authenticate request using Bearer token"""
        auth_header = request.httprequest.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return False
        
        token = auth_header.split('Bearer ', 1)[1]
        expected_token = request.env['ir.config_parameter'].sudo().get_param('kiosk_integration.shared_secret')
        
        return token == expected_token
    
    def _get_auth_error(self):
        """Return authentication error response"""
        return request.make_response(
            json.dumps({'error': 'Unauthorized'}),
            status=401,
            headers={'Content-Type': 'application/json'}
        )
    
    @http.route('/kiosk/api/case/upsert', type='json', auth='public', methods=['POST'], csrf=False)
    def upsert_case(self, **kwargs):
        """Upsert vehicle case from kiosk system"""
        if not self._authenticate_request():
            return {'error': 'Unauthorized', 'status': 401}
        
        try:
            data = request.jsonrequest
            
            # Validate required fields
            required_fields = ['external_uuid', 'plate_number', 'owner_name', 'owner_type', 'status', 'submitted_at']
            for field in required_fields:
                if not data.get(field):
                    return {'error': f'Missing required field: {field}', 'status': 400}
            
            # Find or create case
            VehicleCase = request.env['vehicle.case'].sudo()
            case = VehicleCase.search([('external_uuid', '=', data['external_uuid'])], limit=1)
            
            case_data = {
                'external_uuid': data['external_uuid'],
                'plate_number': data['plate_number'],
                'vin': data.get('vin'),
                'owner_type': data['owner_type'],
                'owner_name': data['owner_name'],
                'company_name': data.get('company_name'),
                'business_reg_no': data.get('business_reg_no'),
                'language': data.get('language', 'ko'),
                'status': data['status'],
                'submitted_at': data['submitted_at'],
                'completed_at': data.get('completed_at'),
                'ocr_validated': data.get('ocr_validated', False),
                'ocr_issues': data.get('ocr_issues'),
            }
            
            if case:
                case.write(case_data)
                _logger.info(f"Updated case {data['external_uuid']}")
            else:
                case = VehicleCase.create(case_data)
                _logger.info(f"Created case {data['external_uuid']}")
            
            return {
                'success': True,
                'case_id': case.id,
                'external_uuid': case.external_uuid
            }
            
        except ValidationError as e:
            _logger.error(f"Validation error in case upsert: {e}")
            return {'error': str(e), 'status': 400}
        except Exception as e:
            _logger.error(f"Error in case upsert: {e}")
            return {'error': 'Internal server error', 'status': 500}
    
    @http.route('/kiosk/api/document/upload', type='json', auth='public', methods=['POST'], csrf=False)
    def upload_document(self, **kwargs):
        """Upload document from kiosk system"""
        if not self._authenticate_request():
            return {'error': 'Unauthorized', 'status': 401}
        
        try:
            data = request.jsonrequest
            
            # Validate required fields
            required_fields = ['external_uuid', 'doc_type', 'filename', 'file_base64']
            for field in required_fields:
                if not data.get(field):
                    return {'error': f'Missing required field: {field}', 'status': 400}
            
            # Find case
            VehicleCase = request.env['vehicle.case'].sudo()
            case = VehicleCase.search([('external_uuid', '=', data['external_uuid'])], limit=1)
            
            if not case:
                return {'error': 'Case not found', 'status': 404}
            
            # Create document
            VehicleDocument = request.env['vehicle.document'].sudo()
            document = VehicleDocument.create_from_kiosk_data(case.id, data)
            
            _logger.info(f"Created document {document.id} for case {data['external_uuid']}")
            
            return {
                'success': True,
                'document_id': document.id,
                'case_id': case.id
            }
            
        except Exception as e:
            _logger.error(f"Error in document upload: {e}")
            return {'error': 'Internal server error', 'status': 500}
    
    @http.route('/kiosk/api/case/<string:external_uuid>/status', type='json', auth='public', methods=['GET'], csrf=False)
    def get_case_status(self, external_uuid, **kwargs):
        """Get case status for kiosk system"""
        if not self._authenticate_request():
            return {'error': 'Unauthorized', 'status': 401}
        
        try:
            VehicleCase = request.env['vehicle.case'].sudo()
            case = VehicleCase.search([('external_uuid', '=', external_uuid)], limit=1)
            
            if not case:
                return {'error': 'Case not found', 'status': 404}
            
            # Collect validated fields from all documents
            validated_fields = {}
            for doc in case.document_ids:
                if doc.mapped_fields:
                    try:
                        mapped = doc.mapped_fields if isinstance(doc.mapped_fields, dict) else json.loads(doc.mapped_fields)
                        validated_fields.update(mapped)
                    except (json.JSONDecodeError, TypeError):
                        continue
            
            return {
                'success': True,
                'status': case.status,
                'ocr_validated': case.ocr_validated,
                'validated_fields': validated_fields,
                'completed_at': case.completed_at.isoformat() if case.completed_at else None
            }
            
        except Exception as e:
            _logger.error(f"Error getting case status: {e}")
            return {'error': 'Internal server error', 'status': 500}