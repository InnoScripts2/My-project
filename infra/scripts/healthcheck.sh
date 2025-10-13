#!/bin/bash
# Health check script for kiosk-agent deployment

set -e

AGENT_URL="${AGENT_URL:-http://localhost:7070}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"

echo "=== Kiosk Agent Health Check ==="
echo ""

# Function to check endpoint
check_endpoint() {
    local name="$1"
    local url="$2"
    local expected_code="${3:-200}"
    
    echo -n "Checking $name... "
    
    if command -v curl >/dev/null 2>&1; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    else
        echo "SKIP (curl not found)"
        return
    fi
    
    if [ "$response" = "$expected_code" ]; then
        echo "OK (HTTP $response)"
    else
        echo "FAIL (HTTP $response, expected $expected_code)"
        return 1
    fi
}

# Check kiosk-agent
check_endpoint "Kiosk Agent" "$AGENT_URL/api/health" || true

# Check metrics endpoint
check_endpoint "Agent Metrics" "$AGENT_URL/metrics" || true

# Check Prometheus (if running)
if check_endpoint "Prometheus" "$PROMETHEUS_URL/-/healthy" 200 2>/dev/null; then
    true
else
    echo "Prometheus appears to be down or not deployed"
fi

# Check Grafana (if running)
if check_endpoint "Grafana" "$GRAFANA_URL/api/health" 200 2>/dev/null; then
    true
else
    echo "Grafana appears to be down or not deployed"
fi

echo ""
echo "Health check complete"
