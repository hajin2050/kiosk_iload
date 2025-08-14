# -*- coding: utf-8 -*-
import logging
from odoo import http
from odoo.http import request
from werkzeug.utils import redirect

_logger = logging.getLogger(__name__)

class BackendRedirectController(http.Controller):
    
    @http.route('/', type='http', auth='public', website=True, sitemap=False)
    def root_redirect(self, **kw):
        """
        루트 경로(/) 접근 시 자동으로 백엔드로 리다이렉트
        16.0/17.0 공통 적용
        """
        # 로그인된 사용자 확인
        if request.env.user._is_internal():
            _logger.info('Internal user accessing root, redirecting to /web')
            return redirect('/web')
        
        # 외부 사용자는 웹사이트로 (웹사이트가 있는 경우)
        try:
            if hasattr(request.env['ir.module.module'], 'search'):
                website_installed = request.env['ir.module.module'].sudo().search([
                    ('name', '=', 'website'),
                    ('state', '=', 'installed')
                ])
                if website_installed:
                    return redirect('/web')  # 웹사이트 메인으로
        except:
            pass
            
        # 기본적으로 웹 클라이언트로
        return redirect('/web')
    


# 16.0/17.0 차이점 처리를 위한 상속 클래스
try:
    from odoo.addons.web.controllers.home import Home
    
    class HomeExtended(Home):
        """
        기본 Home 컨트롤러 확장 - 내부사용자 자동 리다이렉트
        """
        
        @http.route()
        def index(self, *args, **kw):
            """
            메인 인덱스 페이지 오버라이드
            내부사용자는 무조건 /web으로 리다이렉트
            """
            if request.env.user._is_internal():
                return redirect('/web')
            return super().index(*args, **kw)
        
        @http.route()
        def web_login(self, redirect=None, **kw):
            """
            로그인 컨트롤러 오버라이드  
            """
            # POST 요청 (실제 로그인 시)
            if request.httprequest.method == 'POST':
                response = super().web_login(redirect=redirect, **kw)
                
                # 로그인 성공 후 내부사용자면 백엔드로
                if request.env.user._is_internal() and not redirect:
                    from werkzeug.utils import redirect as werkzeug_redirect
                    return werkzeug_redirect('/web#home')
                    
                return response
            
            # GET 요청 (로그인 폼 표시)
            return super().web_login(redirect=redirect, **kw)

except ImportError:
    _logger.warning('Cannot import Home controller, basic redirect only')