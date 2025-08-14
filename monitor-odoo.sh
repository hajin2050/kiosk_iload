#!/bin/bash

echo "Monitoring Odoo Server..."
echo "Press Ctrl+C to stop"
echo

while true; do
    clear
    echo "=== Odoo Server Monitor - $(date) ==="
    echo
    
    if curl -s http://localhost:8069/health > /dev/null; then
        echo "Status: ONLINE"
        echo
        
        # Get case count
        CASES=$(curl -s http://localhost:8069/debug/data | jq '.cases | length')
        DOCS=$(curl -s http://localhost:8069/debug/data | jq '[.documents[] | length] | add // 0')
        
        echo "Cases: $CASES"
        echo "Documents: $DOCS"
        echo
        
        echo "Recent Cases:"
        curl -s http://localhost:8069/debug/data | jq -r '.cases[] | "- \(.plate_number) (\(.owner_name)) - \(.status)"'
        
    else
        echo "Status: OFFLINE"
        echo "Start with: node api/lib/mock-odoo-server.js"
    fi
    
    echo
    echo "Refreshing in 5 seconds..."
    sleep 5
done