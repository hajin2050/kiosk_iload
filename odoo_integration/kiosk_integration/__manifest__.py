{
    'name': 'Vehicle Deregistration Kiosk Integration',
    'version': '1.0.0',
    'category': 'Services',
    'summary': 'Integration module for vehicle deregistration kiosk system',
    'description': """
Vehicle Deregistration Kiosk Integration
========================================
This module provides integration between the vehicle deregistration kiosk system and Odoo ERP.

Features:
* Bidirectional sync with kiosk backend
* OCR result management and validation
* Document management with attachments
* PDF generation for deregistration forms
* Status workflow management
    """,
    'author': 'Kiosk Integration Team',
    'depends': ['base', 'mail', 'web'],
    'data': [
        'security/ir.model.access.csv',
        'views/vehicle_case_views.xml',
        'views/vehicle_document_views.xml',
        'views/menu.xml',
        'data/vehicle_case_data.xml',
        'reports/vehicle_case_report.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': True,
    'license': 'LGPL-3',
}