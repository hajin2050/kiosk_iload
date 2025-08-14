from odoo import models, fields, api
from odoo.exceptions import UserError
from datetime import datetime, timedelta
import base64
import requests
import json

class VehicleCase(models.Model):
    _name = "vehicle.case"
    _description = "Vehicle Deregistration Case"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _rec_name = "plate_number"

    ext_id = fields.Char(index=True, copy=False)           # Express VehicleCase.id
    plate_number = fields.Char(required=True, tracking=True, string="차량번호")
    owner_name   = fields.Char(required=True, tracking=True, string="소유자명")
    owner_type   = fields.Selection([
        ('INDIVIDUAL','개인'), ('BUSINESS','사업자'), ('CORPORATE','법인')
    ], default='INDIVIDUAL', tracking=True, string="소유자 유형")
    company_name = fields.Char(string="회사명")
    status = fields.Selection([
        ('RECEIVED','접수됨'), ('NEED_MORE_DOCS','추가서류필요'), ('COMPLETED','완료')
    ], default='RECEIVED', tracking=True, string="상태")

    submitted_at = fields.Datetime(string="제출일시")
    completed_at = fields.Datetime(string="완료일시")

    # 표준 스키마(CaseSummary) 저장 — Odoo 16+ Json, 하위버전은 Text로 대체
    summary_json = fields.Json(string="Summary JSON")

    def action_download_pdf(self):
        """PDF 다운로드 액션"""
        self.ensure_one()
        
        # Express API에서 PDF 가져오기
        try:
            response = requests.get(f'http://localhost:3002/api/vehicle-cases/{self.ext_id}/pdf')
            if response.status_code == 200:
                # PDF를 첨부파일로 저장
                attachment = self.env['ir.attachment'].create({
                    'name': f'vehicle_export_{self.plate_number}_{datetime.now().strftime("%Y%m%d")}.pdf',
                    'type': 'binary',
                    'datas': base64.b64encode(response.content),
                    'res_model': self._name,
                    'res_id': self.id,
                    'mimetype': 'application/pdf',
                })
                
                # 다운로드 URL 반환
                return {
                    'type': 'ir.actions.act_url',
                    'url': f'/web/content/{attachment.id}?download=true',
                    'target': 'self',
                }
        except Exception as e:
            raise UserError(f'PDF 다운로드 실패: {str(e)}')

    def action_generate_pdf(self):
        """PDF 생성 액션"""
        self.ensure_one()
        
        # Express API로 PDF 생성 요청
        try:
            response = requests.post(
                f'http://localhost:3002/api/vehicle-cases/{self.ext_id}/generate-pdf',
                json={'caseId': self.ext_id}
            )
            if response.status_code == 200:
                return self.action_download_pdf()
        except Exception as e:
            raise UserError(f'PDF 생성 실패: {str(e)}')

    # 첨부는 표준 ir.attachment 사용(폼 우측 상단 첨부 버튼으로 다운로드 가능)