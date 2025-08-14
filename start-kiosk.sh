#!/bin/bash

# 키오스크 모드 시작 스크립트
echo "🚀 iLoad 키오스크 시스템 시작 중..."

# 프로세스 종료 함수
cleanup() {
    echo "🛑 키오스크 시스템 종료 중..."
    kill $API_PID $UI_PID 2>/dev/null
    exit 0
}

# Ctrl+C 트랩 설정
trap cleanup SIGINT SIGTERM

# 환경 변수 설정
export NODE_ENV=production
export NEXT_PUBLIC_API_BASE=http://localhost:3001

# 1. API 서버 시작
echo "📡 API 서버 시작 중..."
cd api
node server.js &
API_PID=$!

# API 서버 준비 대기
sleep 5

# 2. Next.js UI 서버 시작
echo "🖥️  UI 서버 시작 중..."
cd ../kiosk-ui
npm run build
npm start &
UI_PID=$!

# UI 서버 준비 대기
sleep 10

# 3. 키오스크 브라우저 실행
echo "🖼️  키오스크 브라우저 실행 중..."

# macOS - Chrome 키오스크 모드
if [[ "$OSTYPE" == "darwin"* ]]; then
    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
        --kiosk \
        --fullscreen \
        --no-first-run \
        --disable-features=Translate \
        --disable-infobars \
        --disable-suggestions-service \
        --disable-save-password-bubble \
        --disable-session-crashed-bubble \
        --disable-component-extensions-with-background-pages \
        --disable-background-timer-throttling \
        --disable-renderer-backgrounding \
        --disable-backgrounding-occluded-windows \
        --disable-field-trial-config \
        --disable-back-forward-cache \
        --disable-ipc-flooding-protection \
        --no-default-browser-check \
        --autoplay-policy=no-user-gesture-required \
        --user-data-dir=/tmp/kiosk-chrome \
        http://localhost:3000/kiosk &

# Linux - Chromium 키오스크 모드
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    chromium-browser \
        --kiosk \
        --fullscreen \
        --no-first-run \
        --disable-features=Translate \
        --disable-infobars \
        --disable-suggestions-service \
        --disable-save-password-bubble \
        --disable-session-crashed-bubble \
        --disable-component-extensions-with-background-pages \
        --disable-background-timer-throttling \
        --disable-renderer-backgrounding \
        --disable-backgrounding-occluded-windows \
        --disable-field-trial-config \
        --disable-back-forward-cache \
        --disable-ipc-flooding-protection \
        --no-default-browser-check \
        --autoplay-policy=no-user-gesture-required \
        --user-data-dir=/tmp/kiosk-chrome \
        http://localhost:3000/kiosk &

# Windows - Chrome 키오스크 모드
elif [[ "$OSTYPE" == "msys" ]]; then
    "C:\Program Files\Google\Chrome\Application\chrome.exe" \
        --kiosk \
        --fullscreen \
        --no-first-run \
        --disable-features=Translate \
        --disable-infobars \
        --disable-suggestions-service \
        --disable-save-password-bubble \
        --disable-session-crashed-bubble \
        --disable-component-extensions-with-background-pages \
        --disable-background-timer-throttling \
        --disable-renderer-backgrounding \
        --disable-backgrounding-occluded-windows \
        --disable-field-trial-config \
        --disable-back-forward-cache \
        --disable-ipc-flooding-protection \
        --no-default-browser-check \
        --autoplay-policy=no-user-gesture-required \
        --user-data-dir=C:\temp\kiosk-chrome \
        http://localhost:3000/kiosk &
fi

BROWSER_PID=$!

echo "✅ 키오스크 시스템 실행 완료!"
echo "📱 URL: http://localhost:3000/kiosk"
echo "🔧 종료하려면 Ctrl+C를 누르세요"

# 프로세스 모니터링
wait $BROWSER_PID

# 정리
cleanup