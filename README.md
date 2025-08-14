# Mock OCR Kiosk Pipeline

대기시간 없이 진행상황 파악이 가능한 모의(Mock) OCR 파이프라인과 UI입니다. 실제 OCR 서비스로의 교체가 쉬운 어댑터 패턴을 적용했습니다.

## 🚀 기술 스택

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Express.js, Node.js 18+, Multer (파일 업로드)
- **Database**: Prisma + SQLite (로컬 개발용)
- **Communication**: REST API, fetch 기반
- **OCR**: Mock 엔진 (실제 OCR로 교체 가능한 구조)

## 📋 3단계 워크플로우

### Step 1: 케이스 생성 & 필수서류 안내
- 좌측 사이드바에 필수 서류 목록 표시 (차량등록증, 위임장, 인보이스, 신분증)
- 각 서류 클릭 시 파일 선택 → 자동 업로드 → OCR 처리 → 상태 업데이트

### Step 2: 문서 업로드 & 미리보기 (등록증 강조)
- 업로드된 문서 썸네일과 미리보기
- **자동차 등록증** 중앙 강조 표시
- 번호판 인식 로직 (정규식 기반 + 파일명 fallback)
- 실시간 OCR 처리 및 결과 표시

### Step 3: OCR 결과 종합 페이지
- 모든 문서의 OCR 결과 통합 표시
- 문서별 필드 테이블 + 통합 요약 카드
- 핵심 필드 하이라이트 (번호판, 차종, 소유자 등)
- 신뢰도 및 출처 정보 표시

## 🏗️ 프로젝트 구조

```
/
├── api/                          # Express.js Backend
│   ├── lib/
│   │   ├── mock-ocr-engine.js   # Mock OCR 엔진
│   │   ├── plate-recognizer.js  # 번호판 인식 로직
│   │   ├── mapper.js            # OCR→구조화 필드 매핑
│   │   └── prisma.js            # Prisma 클라이언트
│   ├── routes/
│   │   └── document.js          # 문서 업로드/OCR API
│   └── server.js                # Express 서버
├── kiosk-ui/                    # Next.js Frontend  
│   ├── app/
│   │   └── steps/
│   │       ├── 1/page.tsx       # Step 1: 케이스 생성
│   │       ├── 2/page.tsx       # Step 2: 문서 업로드
│   │       └── 3/page.tsx       # Step 3: OCR 결과
│   ├── components/
│   │   ├── SidebarRequiredDocs.tsx
│   │   ├── DocCard.tsx
│   │   ├── PlateBadge.tsx
│   │   ├── CaseSummary.tsx
│   │   └── ResultTable.tsx
│   └── lib/
│       └── api.ts               # API 클라이언트
└── prisma/
    └── schema.prisma            # 데이터베이스 스키마
```

## 🚀 로컬 실행 방법

### 1. 프로젝트 클론 및 환경 설정

```bash
cd iload_kiosk

# 환경 변수 설정
cp .env.example .env
cp kiosk-ui/.env.local.example kiosk-ui/.env.local
```

### 2. 백엔드 설정 및 실행

```bash
# 의존성 설치
npm install

# Prisma 데이터베이스 설정
npx prisma migrate dev --name init
npx prisma generate

# 백엔드 서버 실행 (포트 3002)
cd api && node server.js
```

### 3. 프론트엔드 설정 및 실행

```bash
# 프론트엔드 디렉토리로 이동
cd kiosk-ui

# 의존성 설치
npm install

# 개발 서버 실행 (포트 3000)
npm run dev
```

### 4. 접속

- **프론트엔드**: http://localhost:3000
- **백엔드 API**: http://localhost:3002
- **API Health Check**: http://localhost:3002/api/health

## 📝 주요 API 엔드포인트

### 케이스 관리
- `POST /api/vehicle-case` - 케이스 생성
- `GET /api/vehicle-case/:id` - 케이스 조회
- `GET /api/cases/:caseId/summary` - 종합 결과 조회

### 문서 관리
- `POST /api/documents` - 문서 업로드 (multipart/form-data)
- `POST /api/documents/:id/ocr` - Mock OCR 처리

## 🔧 Mock OCR 엔진

### 특징
- **즉시 응답**: 대기시간 없음
- **문서별 샘플 데이터**: 각 문서 타입에 맞는 구조화된 결과 생성
- **번호판 인식**: 정규식 기반 + 파일명에서 추출
- **신뢰도 시뮬레이션**: 랜덤 confidence 값 생성

### OCR 결과 형식

```typescript
interface OcrResult {
  text: string;
  structured_fields: Record<string, any>;
  method: 'mock-surya';
  confidence: 'high' | 'medium' | 'low';
}
```

### 번호판 인식

```typescript
// 지원 패턴
- 12로8681 (기본 패턴)
- 12 로 8681 (공백 포함)
- 서울12가1234 (지역명 포함)

// 추출 소스
1. OCR 텍스트 우선
2. 파일명에서 fallback
3. 사용자 수정 가능
```

## 📊 데이터베이스 스키마

### VehicleCase
- 케이스 기본 정보 (번호판, 소유자, 상태)
- 문서들과의 관계 (1:N)

### Document  
- 문서 메타데이터와 OCR 결과
- JSON 필드로 유연한 구조화 데이터 저장

## 🔄 확장 가능한 설계

### OCR 서비스 교체
```javascript
// 현재: Mock OCR
const mockOcrEngine = require('./lib/mock-ocr-engine');
const result = await mockOcrEngine.run(filePath, docType);

// 실제 OCR로 교체시
const realOcrEngine = require('./lib/real-ocr-engine');
const result = await realOcrEngine.run(filePath, docType);
```

### 입력 방식 확장
```javascript
// 현재: 파일 업로드
const uploader = new FileUploader();

// 카메라/스캐너 추가시
const cameraUploader = new CameraUploader();
const scannerUploader = new ScannerUploader();
```

## 🧪 테스트

### 테스트 시나리오
1. **Step 1**: 케이스 생성 → 사이드바에서 서류 클릭 → 파일 업로드
2. **Step 2**: 차량등록증 미리보기 → 번호판 정보 확인
3. **Step 3**: 통합 결과 확인 → 문서별/통합 탭 전환

### 샘플 데이터
- `12로8681 050375.jpg` - 전기차 번호판 포함
- 각 문서 타입별 Mock 데이터 자동 생성

## 🚨 중요 사항

### JSON 필드 업데이트
Prisma에서 JSON 필드 업데이트시 반드시 `{ set: ... }` 사용:

```javascript
await prisma.document.update({
  where: { id },
  data: {
    mappedFields: { set: mappedFields }  // ✅ 올바른 방법
    // mappedFields: mappedFields        // ❌ 잘못된 방법
  }
});
```

### 환경 변수 확인
- `.env` 파일에 `DATABASE_URL` 설정
- 프론트엔드 `.env.local`에 `NEXT_PUBLIC_API_BASE` 설정

### 포트 충돌 방지
- 백엔드: 포트 3002
- 프론트엔드: 포트 3000

## 🔧 문제 해결

### 1. Prisma 관련 오류
```bash
# 스키마 재생성
npx prisma generate

# 데이터베이스 초기화
npx prisma migrate reset
```

### 2. 파일 업로드 실패
- `storage/` 디렉토리 권한 확인
- 파일 크기 제한 (현재 10MB)
- 지원 형식: JPG, PNG, PDF

### 3. OCR 처리 지연
Mock 엔진은 즉시 응답하므로, 지연이 있다면 네트워크나 DB 이슈 확인

## 📈 향후 개선 사항

1. **실제 OCR 통합**: Tesseract, Google Vision API, NAVER CLOVA OCR
2. **배치 처리**: Queue 시스템 도입 (Redis, Bull)
3. **실시간 업데이트**: WebSocket 또는 Server-Sent Events
4. **다국어 지원**: 현재 한국어 중심 → 영어, 중국어 확장
5. **모바일 최적화**: 터치 인터페이스 개선

## 📞 지원

문제가 발생하면 다음을 확인하세요:
1. 환경 변수 설정 (.env 파일들)
2. 포트 충돌 (3000, 3002)
3. Node.js 버전 (18+ 권장)
4. 데이터베이스 연결 (SQLite 파일 생성 확인)

---

**목표**: "대기시간 없이 진행상황 파악이 가능한" Mock OCR 파이프라인 ✅