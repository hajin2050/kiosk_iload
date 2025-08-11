import json
import requests
import logging
from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class VehicleCase(models.Model):
    _name = 'vehicle.case'
    _description = 'Vehicle Deregistration Case'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'submitted_at desc'

    # External reference
    external_uuid = fields.Char(
        string='External UUID',
        required=True,
        index=True,
        copy=False,
        help='UUID from kiosk system'
    )
    
    # Vehicle information
    plate_number = fields.Char(
        string='Plate Number',
        required=True,
        tracking=True
    )
    vin = fields.Char(
        string='VIN Number',
        tracking=True
    )
    
    # Owner information
    owner_type = fields.Selection([
        ('PERSONAL', 'Individual'),
        ('SOLE_PROPRIETOR', 'Sole Proprietor'),
        ('CORPORATION', 'Corporation'),
    ], string='Owner Type', required=True, tracking=True)
    
    owner_name = fields.Char(
        string='Owner Name',
        required=True,
        tracking=True
    )
    company_name = fields.Char(
        string='Company Name',
        tracking=True
    )
    business_reg_no = fields.Char(
        string='Business Registration Number',
        tracking=True
    )
    
    # Metadata
    language = fields.Selection([
        ('ko', 'Korean'),
        ('en', 'English'),
        ('zh', 'Chinese'),
        ('ar', 'Arabic'),
        ('ru', 'Russian'),
    ], string='Language', default='ko')
    
    # Status and workflow
    status = fields.Selection([
        ('RECEIVED', 'Received'),
        ('NEED_MORE_DOCS', 'Need More Documents'),
        ('COMPLETED', 'Completed'),
    ], string='Status', default='RECEIVED', required=True, tracking=True)
    
    # OCR validation
    ocr_validated = fields.Boolean(
        string='OCR Validated',
        default=False,
        tracking=True
    )
    ocr_issues = fields.Text(
        string='OCR Issues',
        tracking=True
    )
    
    # Timestamps
    submitted_at = fields.Datetime(
        string='Submitted At',
        required=True
    )
    completed_at = fields.Datetime(
        string='Completed At',
        tracking=True
    )
    
    # Relations
    document_ids = fields.One2many(
        'vehicle.document',
        'case_id',
        string='Documents'
    )
    
    # Computed fields
    document_count = fields.Integer(
        string='Document Count',
        compute='_compute_document_count'
    )
    
    @api.depends('document_ids')
    def _compute_document_count(self):
        for record in self:
            record.document_count = len(record.document_ids)
    
    @api.model
    def create(self, vals):
        """Override create to ensure external_uuid uniqueness"""
        existing = self.search([('external_uuid', '=', vals.get('external_uuid'))])
        if existing:
            return existing.write(vals) and existing
        
        case = super().create(vals)
        case.message_post(
            body=_("Case created from kiosk system"),
            message_type='notification'
        )
        return case
    
    def write(self, vals):
        """Override write to track important changes"""
        result = super().write(vals)
        
        # Sync back to kiosk if status or OCR validation changes
        if 'status' in vals or 'ocr_validated' in vals:
            self._sync_to_kiosk()
        
        return result
    
    def _sync_to_kiosk(self):
        """Sync case changes back to kiosk system"""
        kiosk_base = self.env['ir.config_parameter'].sudo().get_param('kiosk_integration.kiosk_base_url')
        shared_secret = self.env['ir.config_parameter'].sudo().get_param('kiosk_integration.shared_secret')
        
        if not kiosk_base or not shared_secret:
            _logger.warning("Kiosk integration not configured")
            return
        
        for record in self:
            try:
                # Prepare sync data
                sync_data = {
                    'status': record.status,
                    'validatedFields': {},
                    'ocrValidated': record.ocr_validated,
                    'ocrIssues': record.ocr_issues,
                }
                
                # Add validated OCR fields from documents
                for doc in record.document_ids:
                    if doc.mapped_fields:
                        try:
                            mapped = json.loads(doc.mapped_fields) if isinstance(doc.mapped_fields, str) else doc.mapped_fields
                            sync_data['validatedFields'].update(mapped)
                        except (json.JSONDecodeError, TypeError):
                            continue
                
                # Make API call to kiosk
                url = f"{kiosk_base.rstrip('/')}/api/vehicle-case/{record.external_uuid}"
                headers = {
                    'Authorization': f'Bearer {shared_secret}',
                    'Content-Type': 'application/json'
                }
                
                response = requests.patch(url, json=sync_data, headers=headers, timeout=10)
                response.raise_for_status()
                
                record.message_post(
                    body=_("Successfully synced to kiosk system"),
                    message_type='notification'
                )
                
            except requests.RequestException as e:
                _logger.error(f"Failed to sync case {record.external_uuid} to kiosk: {e}")
                record.message_post(
                    body=_("Failed to sync to kiosk system: %s") % str(e),
                    message_type='notification'
                )
    
    def action_sync_to_kiosk(self):
        """Manual sync action from UI"""
        self._sync_to_kiosk()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Success'),
                'message': _('Sync to kiosk initiated'),
                'type': 'success',
            }
        }
    
    def action_generate_pdf(self):
        """Generate PDF report for the case"""
        self.ensure_one()
        return self.env.ref('kiosk_integration.action_report_vehicle_case').report_action(self)
    
    def action_view_documents(self):
        """View documents related to this case"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Documents'),
            'res_model': 'vehicle.document',
            'view_mode': 'tree,form',
            'domain': [('case_id', '=', self.id)],
            'context': {'default_case_id': self.id},
        }
    
    def action_set_received(self):
        """Set status to received"""
        self.write({'status': 'RECEIVED'})
    
    def action_need_more_docs(self):
        """Set status to need more documents"""
        self.write({'status': 'NEED_MORE_DOCS'})
    
    def action_complete(self):
        """Set status to completed"""
        self.write({
            'status': 'COMPLETED',
            'completed_at': fields.Datetime.now(),
            'ocr_validated': True
        })
    
    @api.constrains('external_uuid')
    def _check_external_uuid_unique(self):
        for record in self:
            if self.search_count([('external_uuid', '=', record.external_uuid), ('id', '!=', record.id)]) > 0:
                raise ValidationError(_('External UUID must be unique'))
    
    def name_get(self):
        """Custom name display"""
        result = []
        for record in self:
            name = f"{record.plate_number} - {record.owner_name}"
            result.append((record.id, name))
        return result