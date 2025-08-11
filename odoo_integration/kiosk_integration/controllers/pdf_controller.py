import json
import base64
import logging
from odoo import http, _
from odoo.http import request
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)


class PDFController(http.Controller):

    def _authenticate_request(self):
        """Authenticate API request using shared secret"""
        auth_header = request.httprequest.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return False

        token = auth_header[7:]  # Remove 'Bearer ' prefix
        expected_token = request.env['ir.config_parameter'].sudo().get_param('kiosk_integration.shared_secret')
        
        return token == expected_token

    @http.route('/kiosk/api/case/<string:case_id>/pdf', type='http', auth='public', methods=['POST'], csrf=False)
    def generate_pdf(self, case_id, **kwargs):
        """Generate PDF report for a vehicle case"""
        try:
            # Authenticate request
            if not self._authenticate_request():
                return request.make_response(
                    json.dumps({'error': 'Unauthorized'}),
                    status=401,
                    headers=[('Content-Type', 'application/json')]
                )

            # Find the case
            case = request.env['vehicle.case'].sudo().search([
                ('external_uuid', '=', case_id)
            ], limit=1)

            if not case:
                return request.make_response(
                    json.dumps({'error': 'Case not found'}),
                    status=404,
                    headers=[('Content-Type', 'application/json')]
                )

            # Generate PDF using the report
            report = request.env.ref('kiosk_integration.action_report_vehicle_case')
            pdf_content, _ = report.sudo()._render_qweb_pdf(case.ids)

            # Return PDF
            response = request.make_response(
                pdf_content,
                headers=[
                    ('Content-Type', 'application/pdf'),
                    ('Content-Disposition', f'attachment; filename="vehicle-deregistration-{case_id}.pdf"')
                ]
            )
            return response

        except Exception as e:
            _logger.error(f"Error generating PDF for case {case_id}: {e}")
            return request.make_response(
                json.dumps({'error': 'Internal server error', 'message': str(e)}),
                status=500,
                headers=[('Content-Type', 'application/json')]
            )

    @http.route('/kiosk/api/case/<string:case_id>/status', type='json', auth='public', methods=['GET'], csrf=False)
    def get_case_status(self, case_id, **kwargs):
        """Get case processing status"""
        try:
            # Authenticate request
            if not self._authenticate_request():
                return {'error': 'Unauthorized'}

            # Find the case
            case = request.env['vehicle.case'].sudo().search([
                ('external_uuid', '=', case_id)
            ], limit=1)

            if not case:
                return {'error': 'Case not found'}

            # Return status information
            return {
                'case_id': case.external_uuid,
                'status': case.status,
                'ocr_validated': case.ocr_validated,
                'submitted_at': case.submitted_at.isoformat() if case.submitted_at else None,
                'completed_at': case.completed_at.isoformat() if case.completed_at else None,
                'document_count': len(case.document_ids),
                'ocr_issues': case.ocr_issues
            }

        except Exception as e:
            _logger.error(f"Error getting case status for {case_id}: {e}")
            return {'error': 'Internal server error', 'message': str(e)}