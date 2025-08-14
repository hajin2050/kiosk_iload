#!/bin/bash

# iLoad Kiosk - Odoo Integration Startup Script
# 사용법: ./start-odoo-integration.sh [mock|real]

MODE=${1:-mock}

echo "Starting iLoad Kiosk Odoo Integration..."

# 환경 변수 확인
if [ ! -f .env ]; then
    echo ".env file not found. Please create one based on .env.example"
    exit 1
fi

source .env

# Check if ODOO configuration exists
if [ -z "$ODOO_BASE" ] || [ -z "$ODOO_SHARED_SECRET" ]; then
    echo "ODOO_BASE and ODOO_SHARED_SECRET are required in .env file"
    echo "   Current .env values:"
    echo "   ODOO_BASE=${ODOO_BASE}"
    echo "   ODOO_SHARED_SECRET=${ODOO_SHARED_SECRET}"
fi

case $MODE in
    "mock")
        echo "Starting Mock Odoo Server on port 8069..."
        node api/lib/mock-odoo-server.js &
        MOCK_PID=$!
        echo "Mock Odoo Server PID: $MOCK_PID"
        
        # Wait for server to start
        sleep 2
        
        # Test connection
        echo "Testing Mock Odoo connection..."
        if curl -s http://localhost:8069/health > /dev/null; then
            echo "Mock Odoo Server is running"
            
            echo ""
            echo "Available commands:"
            echo "  # Sync all existing data (dry run)"
            echo "  node api/scripts/sync-existing-data.js --dry-run"
            echo ""
            echo "  # Sync all existing data (actual)"
            echo "  node api/scripts/sync-existing-data.js"
            echo ""
            echo "  # Sync specific case"
            echo "  node api/scripts/sync-existing-data.js --case-id=<case-id>"
            echo ""
            echo "  # Check Mock Odoo data"
            echo "  curl http://localhost:8069/debug/data | jq ."
            echo ""
            echo "  # Stop Mock Odoo"
            echo "  kill $MOCK_PID"
            echo ""
            echo "Mock Odoo Server Dashboard: http://localhost:8069/debug/data"
        else
            echo "Failed to start Mock Odoo Server"
            kill $MOCK_PID 2>/dev/null
            exit 1
        fi
        ;;
        
    "real")
        echo "Starting with Real Odoo Server..."
        echo "Please ensure your real Odoo server is running at: $ODOO_BASE"
        
        # Test real Odoo connection
        if curl -s "$ODOO_BASE/web/health" > /dev/null 2>&1; then
            echo "Real Odoo Server is accessible"
        else
            echo "Cannot reach Odoo server at $ODOO_BASE"
            echo "   Please ensure your Odoo server is running"
        fi
        
        echo ""
        echo "📋 Available commands:"
        echo "  # Sync all existing data (dry run first!)"
        echo "  node api/scripts/sync-existing-data.js --dry-run"
        echo ""
        echo "  # Sync all existing data (actual)"
        echo "  node api/scripts/sync-existing-data.js"
        ;;
        
    *)
        echo "Usage: $0 [mock|real]"
        echo ""
        echo "  mock - Start with Mock Odoo Server (for testing)"
        echo "  real - Use Real Odoo Server (for production)"
        exit 1
        ;;
esac

echo ""
echo "Notes:"
echo "  - New cases will automatically sync to Odoo when created"
echo "  - Documents will sync after OCR processing"
echo "  - Case status changes will sync to Odoo"
echo "  - Use the sync script for existing data"
echo ""