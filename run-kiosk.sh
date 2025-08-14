#!/bin/bash

# 완전한 키오스크 시스템 실행
# 서버 시작 → 키오스크 브라우저 실행

echo "🚀 키오스크 시스템 시작 중..."

# 기존 프로세스 정리
echo "이전 프로세스 정리 중..."
pkill -f "node.*server.js" 2>/dev/null
pkill -f "npm.*start" 2>/dev/null
pkill -f "next.*start" 2>/dev/null

# 환경 변수 설정
export NODE_ENV=production
export NEXT_PUBLIC_API_BASE=http://localhost:3001

# 1. API 서버 시작
echo "📡 API 서버 시작 중..."
cd api
nohup node server.js > ../logs/api.log 2>&1 &
API_PID=$!
echo "API PID: $API_PID"

# 2. Next.js 빌드 및 시작
echo "🔨 Next.js 빌드 중..."
cd ../kiosk-ui
npm run build

echo "🖥️  UI 서버 시작 중..."
nohup npm start > ../logs/ui.log 2>&1 &
UI_PID=$!
echo "UI PID: $UI_PID"

# 로그 디렉터리 생성
mkdir -p ../logs

# 서버 시작 대기
echo "⏳ 서버 시작 대기 중..."
sleep 8

# 서버 상태 확인
echo "🔍 서버 상태 확인 중..."
if curl -s http://localhost:3001/api/health > /dev/null; then
    echo "✅ API 서버 정상"
else
    echo "❌ API 서버 응답 없음"
fi

if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ UI 서버 정상"
else
    echo "❌ UI 서버 응답 없음"
fi

# 3. 키오스크 브라우저 실행
echo "🖼️  키오스크 브라우저 실행 중..."
cd ..

# Chrome 키오스크 모드 (주소창 완전 숨김)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if [ -f "$CHROME_PATH" ]; then
        echo "macOS Chrome 키오스크 모드"
        "$CHROME_PATH" \
            --kiosk \
            --fullscreen \
            --no-first-run \
            --disable-infobars \
            --disable-suggestions-service \
            --disable-save-password-bubble \
            --disable-session-crashed-bubble \
            --disable-component-extensions-with-background-pages \
            --disable-extensions \
            --disable-plugins \
            --disable-translate \
            --disable-web-security \
            --no-default-browser-check \
            --no-sandbox \
            --disable-dev-shm-usage \
            --start-fullscreen \
            --user-data-dir=/tmp/kiosk-chrome-data \
            http://localhost:3000/portrait &
        BROWSER_PID=$!
    else
        echo "Chrome을 찾을 수 없습니다. 수동으로 브라우저를 실행해주세요:"
        echo "URL: http://localhost:3000/portrait"
    fi

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v google-chrome &> /dev/null; then
        echo "Linux Chrome 키오스크 모드"
        google-chrome \
            --kiosk \
            --fullscreen \
            --no-first-run \
            --disable-infobars \
            --disable-suggestions-service \
            --disable-save-password-bubble \
            --disable-session-crashed-bubble \
            --disable-component-extensions-with-background-pages \
            --disable-extensions \
            --disable-plugins \
            --disable-translate \
            --no-default-browser-check \
            --no-sandbox \
            --disable-dev-shm-usage \
            --start-fullscreen \
            --user-data-dir=/tmp/kiosk-chrome-data \
            http://localhost:3000/portrait &
        BROWSER_PID=$!
    elif command -v chromium-browser &> /dev/null; then
        echo "Linux Chromium 키오스크 모드"
        chromium-browser \
            --kiosk \
            --fullscreen \
            --no-first-run \
            --disable-infobars \
            --user-data-dir=/tmp/kiosk-chrome-data \
            http://localhost:3000/portrait &
        BROWSER_PID=$!
    fi
fi

# 종료 함수
cleanup() {
    echo ""
    echo "🛑 키오스크 시스템 종료 중..."
    
    # 브라우저 종료
    if [ ! -z "$BROWSER_PID" ]; then
        kill $BROWSER_PID 2>/dev/null
    fi
    
    # 서버 종료
    kill $API_PID $UI_PID 2>/dev/null
    
    # Chrome 프로세스 정리
    pkill -f "chrome.*kiosk" 2>/dev/null
    
    # 임시 데이터 정리
    rm -rf /tmp/kiosk-chrome-data 2>/dev/null
    
    echo "✅ 시스템 종료 완료"
    exit 0
}

# Ctrl+C 트랩 설정
trap cleanup SIGINT SIGTERM

echo ""
echo "✅ 키오스크 시스템 실행 완료!"
echo "📱 URL: http://localhost:3000/portrait"
echo "🔧 종료하려면 Ctrl+C를 누르세요"
echo ""

# 프로세스 ID 저장
echo "$API_PID" > kiosk.pid
echo "$UI_PID" >> kiosk.pid

# 무한 대기 (종료 신호까지)
while true; do
    sleep 1
done