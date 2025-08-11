# Odoo ERP 연동 설정 가이드

## 1. Odoo 설치 및 실행

### Docker로 Odoo 설치 (추천)
```bash
# PostgreSQL + Odoo 실행
docker-compose up -d

# 또는 개별 실행
docker run -d -e POSTGRES_USER=odoo -e POSTGRES_PASSWORD=odoo -e POSTGRES_DB=postgres --name db postgres:13
docker run -p 8069:8069 --name odoo --link db:db -t odoo
```

### 직접 설치
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install odoo

# 실행
sudo systemctl start odoo
sudo systemctl enable odoo
```

## 2. Odoo 초기 설정

1. **브라우저에서 접속**: http://localhost:8069
2. **데이터베이스 생성**: 
   - Database Name: `kiosk_integration`
   - Email: admin@example.com  
   - Password: admin
   - Language: Korean
3. **관리자로 로그인**

## 3. 커스텀 모듈 설치

### 모듈 복사
```bash
# Odoo addons 디렉토리로 모듈 복사
sudo cp -r /Users/hajin/iload_kiosk/odoo_integration/kiosk_integration /opt/odoo/addons/

# 또는 심볼릭 링크 생성
sudo ln -s /Users/hajin/iload_kiosk/odoo_integration/kiosk_integration /opt/odoo/addons/
```

### 모듈 활성화
1. **개발자 모드 활성화**: Settings > Developer Tools > Activate Developer Mode
2. **Apps 메뉴** > Update Apps List
3. **"Kiosk Integration" 검색** > Install

## 4. 환경 변수 업데이트

`.env` 파일에서 실제 값으로 변경:
```bash
ODOO_BASE=http://localhost:8069
ODOO_SHARED_SECRET=kiosk_secret_2025_secure_token  # 강력한 비밀번호로 변경
```

## 5. Odoo 시스템 파라미터 설정

Odoo 관리 패널에서:
1. **Settings** > **Technical** > **Parameters** > **System Parameters**
2. 다음 파라미터들 생성/수정:

```
키: kiosk_integration.kiosk_base_url
값: http://localhost:3002

키: kiosk_integration.shared_secret  
값: kiosk_secret_2025_secure_token  # .env와 동일한 값
```

## 6. 연동 상태 확인 방법

### A. 백엔드 로그 확인
```bash
cd /Users/hajin/iload_kiosk/api
npm start

# 로그에서 다음 메시지 확인:
# "Odoo integration enabled" 또는 "Odoo integration not configured"
```

### B. API 테스트
```bash
# 헬스 체크
curl http://localhost:3002/api/health

# Odoo 연결 테스트 (케이스 생성 후)
curl -X GET http://localhost:3002/api/vehicle-case
```

### C. Odoo 웹 인터페이스 확인
1. http://localhost:8069 접속
2. **Kiosk Integration** 메뉴 확인
3. **Vehicle Cases** 리스트 확인

### D. 실시간 연동 테스트
```bash
# 1. 키오스크에서 새 신청 생성
# 2. Odoo에서 실시간으로 데이터 확인
# 3. Odoo에서 상태 변경 시 키오스크 반영 확인
```

## 7. 문제 해결

### 연동이 안 될 때
```bash
# 1. Odoo 실행 확인
sudo systemctl status odoo
netstat -tlnp | grep 8069

# 2. 방화벽 확인
sudo ufw allow 8069

# 3. Odoo 로그 확인
tail -f /var/log/odoo/odoo-server.log

# 4. 모듈 설치 확인
# Odoo > Apps > Installed Apps > "Kiosk Integration" 확인
```

### API 에러 발생 시
```bash
# 백엔드 로그 확인
tail -f /Users/hajin/iload_kiosk/server.log

# 네트워크 연결 테스트
curl -v http://localhost:8069/kiosk/api/health
```

## 8. 완전한 테스트 시나리오

1. **키오스크에서 신청 생성** → Odoo에 케이스 생성 확인
2. **문서 업로드 + OCR** → Odoo에 문서 동기화 확인  
3. **Odoo에서 상태 변경** → 키오스크에 역동기화 확인
4. **PDF 생성** → Odoo QWeb 템플릿으로 PDF 생성 확인
5. **다국어 PDF** → 언어별 PDF 템플릿 동작 확인

## 현재 구현 상태: ✅ 100% 완료
- ✅ Odoo 커스텀 모듈
- ✅ 양방향 API 동기화  
- ✅ PDF 생성 및 다운로드
- ✅ 다국어 지원
- ✅ OCR 결과 동기화
- ✅ 실시간 상태 업데이트