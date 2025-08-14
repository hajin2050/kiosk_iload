#!/bin/bash

echo "=== Odoo Server Status ==="
echo

# Check if Mock Odoo is running
if curl -s http://localhost:8069/health > /dev/null; then
    echo "Mock Odoo Server: RUNNING"
    
    # Get summary data
    echo
    echo "=== Data Summary ==="
    curl -s http://localhost:8069/debug/data | jq '{
        total_cases: (.cases | length),
        total_documents: ([.documents[] | length] | add // 0),
        cases: [.cases[] | {id: .external_uuid, plate: .plate_number, owner: .owner_name, status: .status}],
        documents_by_case: (.documents | to_entries | map({case_id: .key, doc_count: (.value | length)}))
    }'
    
    echo
    echo "=== Full Data ==="
    echo "Visit: http://localhost:8069/debug/data"
    echo "Health: http://localhost:8069/health"
    
else
    echo "Mock Odoo Server: NOT RUNNING"
    echo "Start with: node api/lib/mock-odoo-server.js"
fi

echo
echo "=== Available Endpoints ==="
echo "  GET  /health                    - Health check"
echo "  GET  /debug/data                - View all data"
echo "  POST /kiosk/api/case/upsert     - Sync case"
echo "  POST /kiosk/api/document/upload - Sync document"
echo