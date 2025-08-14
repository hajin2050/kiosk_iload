#!/bin/bash

# 키오스크용 브라우저 실행 스크립트
# 주소창, 탭, 메뉴 모두 숨김

echo "🖥️  키오스크 브라우저 시작..."

# Chrome 키오스크 모드 (주소창/탭 완전 숨김)
if command -v google-chrome &> /dev/null; then
    echo "Chrome으로 키오스크 모드 실행"
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
        --disable-web-security \
        --no-default-browser-check \
        --no-sandbox \
        --disable-dev-shm-usage \
        --start-fullscreen \
        --window-position=0,0 \
        --window-size=1080,1920 \
        --user-data-dir=/tmp/kiosk-data \
        http://localhost:3000

# macOS Chrome
elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    echo "macOS Chrome으로 키오스크 모드 실행"
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
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
        --start-fullscreen \
        --window-position=0,0 \
        --window-size=1080,1920 \
        --user-data-dir=/tmp/kiosk-data \
        http://localhost:3000

# Chromium 대안
elif command -v chromium-browser &> /dev/null; then
    echo "Chromium으로 키오스크 모드 실행"
    chromium-browser \
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
        --start-fullscreen \
        --window-position=0,0 \
        --window-size=1080,1920 \
        --user-data-dir=/tmp/kiosk-data \
        http://localhost:3000

# Firefox 키오스크 모드
elif command -v firefox &> /dev/null; then
    echo "Firefox로 키오스크 모드 실행"
    firefox \
        --kiosk \
        --private-window \
        --new-instance \
        --no-remote \
        http://localhost:3000

else
    echo "❌ Chrome, Chromium, 또는 Firefox를 찾을 수 없습니다."
    echo "브라우저를 설치하고 다시 시도해주세요."
    exit 1
fi