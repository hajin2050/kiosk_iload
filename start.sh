#!/bin/bash

# Mock OCR Kiosk Pipeline - Startup Script

echo " Starting Mock OCR Kiosk Pipeline..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo " Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo " Node.js version $NODE_VERSION is too old. Please upgrade to version 18+ and try again."
    exit 1
fi

echo " Node.js version $NODE_VERSION detected"

# Install backend dependencies
echo " Installing backend dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo " Failed to install backend dependencies"
    exit 1
fi

# Setup database
echo "  Setting up database..."
if [ ! -f ".env" ]; then
    echo " Creating .env file from template..."
    cp .env.example .env
fi

npx prisma generate
npx prisma migrate dev --name init
if [ $? -ne 0 ]; then
    echo " Failed to setup database"
    exit 1
fi

# Install frontend dependencies
echo " Installing frontend dependencies..."
cd kiosk-ui
npm install
if [ $? -ne 0 ]; then
    echo " Failed to install frontend dependencies"
    exit 1
fi

# Setup frontend environment
if [ ! -f ".env.local" ]; then
    echo " Creating frontend .env.local file from template..."
    cp .env.local.example .env.local
fi

cd ..

echo " Setup completed successfully!"
echo ""
echo " To start the application:"
echo "1. Start backend:  cd api && node server.js"
echo "2. Start frontend: cd kiosk-ui && npm run dev"
echo ""
echo " Access the application:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3002"
echo ""
echo " For more information, see README.md"