import json
import base64
import logging
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class VehicleDocument(models.Model):
    _name = 'vehicle.document'
    _description = 'Vehicle Document'
    _inherit = ['mail.thread']
    _order = 'uploaded_at desc'

    case_id = fields.Many2one(
        'vehicle.case',
        string='Case',
        required=True,
        ondelete='cascade'
    )
    
    doc_type = fields.Selection([
        ('VEHICLE_REGISTRATION', 'Vehicle Registration'),
        ('DELEGATION_FORM', 'Delegation Form'),
        ('INVOICE', 'Invoice'),
        ('ID_CARD', 'ID Card'),
        ('ETC', 'Other'),
    ], string='Document Type', required=True)
    
    attachment_id = fields.Many2one(
        'ir.attachment',
        string='Attachment',
        required=True,
        ondelete='cascade'
    )
    
    ocr_text = fields.Text(
        string='OCR Text',
        help='Raw OCR extracted text'
    )
    
    mapped_fields = fields.Json(
        string='Mapped Fields',
        help='JSON object containing extracted field mappings'
    )
    
    uploaded_at = fields.Datetime(
        string='Uploaded At',
        required=True,
        default=fields.Datetime.now
    )
    
    # Computed fields
    filename = fields.Char(
        string='Filename',
        related='attachment_id.name',
        readonly=True
    )
    
    file_size = fields.Integer(
        string='File Size',
        related='attachment_id.file_size',
        readonly=True
    )
    
    mimetype = fields.Char(
        string='MIME Type',
        related='attachment_id.mimetype',
        readonly=True
    )
    
    def name_get(self):
        """Custom name display"""
        result = []
        for record in self:
            doc_type_label = dict(record._fields['doc_type'].selection).get(record.doc_type, record.doc_type)
            name = f"{doc_type_label} - {record.filename or 'Unknown'}"
            result.append((record.id, name))
        return result
    
    @api.model
    def create_from_kiosk_data(self, case_id, doc_data):
        """Create document from kiosk data"""
        # Create attachment from base64 data
        attachment_data = {
            'name': doc_data.get('filename', 'unknown'),
            'datas': doc_data.get('file_base64', ''),
            'mimetype': doc_data.get('mimetype', 'application/octet-stream'),
            'res_model': 'vehicle.document',
            'res_id': 0,  # Will be updated after document creation
        }
        
        attachment = self.env['ir.attachment'].create(attachment_data)
        
        # Create document record
        document_data = {
            'case_id': case_id,
            'doc_type': doc_data.get('doc_type', 'ETC'),
            'attachment_id': attachment.id,
            'ocr_text': doc_data.get('ocr_text', ''),
            'mapped_fields': doc_data.get('mapped_fields', {}),
            'uploaded_at': fields.Datetime.now(),
        }
        
        document = self.create(document_data)
        
        # Update attachment to link to created document
        attachment.write({
            'res_id': document.id,
            'description': f'Document for case {document.case_id.plate_number}'
        })
        
        return document
    
    def action_view_attachment(self):
        """Open attachment in new window"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{self.attachment_id.id}',
            'target': 'new',
        }
    
    def write(self, vals):
        """Override write to track mapped_fields changes"""
        result = super().write(vals)
        
        # If mapped_fields changed, sync back to kiosk
        if 'mapped_fields' in vals:
            for record in self:
                record.case_id._sync_to_kiosk()
        
        return result