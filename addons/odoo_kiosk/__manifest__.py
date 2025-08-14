{
    "name": "Kiosk Vehicle Dereg",
    "version": "1.0.0",
    "category": "Tools",
    "summary": "차량 수출 케이스 관리 시스템",
    "description": """
        차량 수출 케이스 관리를 위한 Odoo 모듈
        - OCR 데이터 관리
        - PDF 생성 및 다운로드
        - 케이스 상태 관리
    """,
    "author": "Your Company",
    "depends": ["base", "mail"],
    "data": [
        "security/security.xml",
        "security/ir.model.access.csv",
        "data/user_data.xml",
        "views/vehicle_case_views.xml",
        "views/dashboard_views.xml",
    ],
    "application": True,
    "installable": True,
    "license": "LGPL-3",
}