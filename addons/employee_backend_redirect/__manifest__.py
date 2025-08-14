# -*- coding: utf-8 -*-
{
    'name': 'Employee Backend Redirect',
    'version': '17.0.1.0.0',  # 16.0/17.0 호환
    'category': 'Tools',
    'summary': '직원 로그인 시 자동으로 백엔드(ERP) 화면으로 리다이렉트',
    'description': '''
    직원들이 로그인하면 항상 Odoo ERP 백엔드로 자동 진입
    - 내부 사용자 로그인 시 /web#action=... 자동 이동
    - "로그인되었습니다" 화면 우회
    - 포털/웹사이트 사용자는 제외
    ''',
    'author': 'Your Company',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'web',
        # 'website',  # 웹사이트가 설치된 경우만
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/ir_actions.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    
    # 16.0/17.0 호환성
    'external_dependencies': {
        'python': [],
    },
}