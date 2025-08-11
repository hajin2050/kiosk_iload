# 🚀 간편한 Odoo 연동 테스트 가이드

## Option 1: Odoo.sh (클라우드) 사용 (추천)

### 1. Odoo.sh 계정 생성
1. https://www.odoo.sh 방문
2. **Start Free Trial** 클릭
3. 이메일로 계정 생성
4. 새 데이터베이스 생성

### 2. 연동 설정 업데이트
`.env` 파일 수정:
```bash
# 기존
ODOO_BASE=http://localhost:8069

# 변경 (실제 Odoo.sh URL로 변경)
ODOO_BASE=https://your-database.odoo.com
ODOO_SHARED_SECRET=your_secure_shared_secret_here
```

## Option 2: Docker 수동 실행 (권장)

### 1. Docker Desktop 실행
- Applications > Docker Desktop 실행
- Docker가 실행될 때까지 대기

### 2. PostgreSQL 컨테이너 실행
```bash
docker run -d \
  --name postgres-odoo \
  -e POSTGRES_USER=odoo \
  -e POSTGRES_PASSWORD=odoo \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 \
  postgres:13
```

### 3. Odoo 컨테이너 실행
```bash
docker run -d \
  --name odoo-server \
  -p 8069:8069 \
  --link postgres-odoo:db \
  -e DB_HOST=db \
  -e DB_USER=odoo \
  -e DB_PASSWORD=odoo \
  -v $(pwd)/odoo_integration:/mnt/extra-addons \
  odoo:16.0
```

### 4. 접속 확인
```bash
curl http://localhost:8069
# 또는 브라우저에서 http://localhost:8069 접속
```

## Option 3: 로컬 테스트 모드

키오스크가 Odoo 없이도 동작하도록 설정:

### 1. Mock Odoo 서버 생성
```bash
cd /Users/hajin/iload_kiosk/api
```

### 2. Mock 서버 파일 생성
`lib/mock-odoo.js` 파일 생성 후 실제 Odoo 대신 사용

## Option 4: 시스템 Odoo 설치 (고급)

### 1. PostgreSQL 설치
```bash
# Homebrew 권한 수정 후
sudo chown -R $(whoami) /usr/local/share/man/man8
brew install postgresql
brew services start postgresql
```

### 2. Odoo 소스 다운로드
```bash
cd /tmp
git clone https://www.github.com/odoo/odoo --depth 1 --branch 16.0
cd odoo
pip3 install -r requirements.txt
```

### 3. Odoo 실행
```bash
./odoo-bin -d odoo_test -i base --without-demo=all
```

## 🧪 현재 구현된 기능 테스트

Odoo가 실행되면 다음 순서로 테스트:

### 1. 키오스크 백엔드 실행
```bash
cd /Users/hajin/iload_kiosk/api
npm start
```

### 2. 프론트엔드 실행
```bash
cd /Users/hajin/iload_kiosk/kiosk-ui
npm run dev
```

### 3. 전체 플로우 테스트
1. **http://localhost:3000** 접속
2. 새 신청서 작성
3. 서류 업로드 (OCR 처리)
4. 신청 완료 후 Odoo 확인
5. PDF 다운로드 테스트

### 4. Odoo 관리자 패널
1. **http://localhost:8069** 접속
2. 관리자로 로그인
3. **Kiosk Integration** 메뉴 확인
4. Vehicle Cases 데이터 확인

## 🚨 간단한 테스트용 Mock 서버

실제 Odoo 설치가 어려우면 Mock 서버로 먼저 테스트 가능:

```javascript
// api/lib/mock-odoo-server.js
const express = require('express');
const app = express();

app.use(express.json());

// Mock endpoints
app.post('/kiosk/api/case/upsert', (req, res) => {
  console.log('Mock: Case created', req.body);
  res.json({ success: true, id: Date.now() });
});

app.post('/kiosk/api/document/upload', (req, res) => {
  console.log('Mock: Document uploaded');
  res.json({ success: true });
});

app.get('/kiosk/api/case/:id/status', (req, res) => {
  res.json({
    status: 'COMPLETED',
    ocr_validated: true
  });
});

app.post('/kiosk/api/case/:id/pdf', (req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.send(Buffer.from('Mock PDF Content'));
});

app.listen(8069, () => {
  console.log('Mock Odoo server running on :8069');
});
```

실행:
```bash
node api/lib/mock-odoo-server.js
```

이제 키오스크가 Mock Odoo와 연동되어 전체 플로우를 테스트할 수 있습니다! 🎉