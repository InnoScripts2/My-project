#!/bin/bash
# Infrastructure validation script

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== Kiosk Agent Infrastructure Validation ==="
echo ""

ERRORS=0
WARNINGS=0

# Function to check file exists
check_file() {
    local file="$1"
    local description="$2"
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description exists"
    else
        echo -e "${RED}✗${NC} $description missing: $file"
        ERRORS=$((ERRORS + 1))
    fi
}

# Function to check directory exists
check_dir() {
    local dir="$1"
    local description="$2"
    
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $description exists"
    else
        echo -e "${RED}✗${NC} $description missing: $dir"
        ERRORS=$((ERRORS + 1))
    fi
}

# Function to check command exists
check_command() {
    local cmd="$1"
    local description="$2"
    
    if command -v "$cmd" >/dev/null 2>&1; then
        local version=$(${cmd} --version 2>&1 | head -1)
        echo -e "${GREEN}✓${NC} $description installed: $version"
    else
        echo -e "${YELLOW}!${NC} $description not found (optional)"
        WARNINGS=$((WARNINGS + 1))
    fi
}

echo "Checking Infrastructure Files..."
echo ""

# Docker files
check_file "infra/docker/Dockerfile" "Dockerfile"
check_file "infra/docker/docker-compose.yml" "Docker Compose"
check_file "infra/docker/.dockerignore" ".dockerignore"
check_file "infra/docker/.env.example" "Environment example"
check_file "infra/docker/prometheus.yml" "Prometheus config"
check_file "infra/docker/alertmanager.yml" "Alertmanager config"
check_file "infra/docker/nginx.conf" "Nginx config"
check_file "infra/docker/alerts/rules.yml" "Alert rules"
check_file "infra/docker/build.sh" "Build script"

echo ""
echo "Checking Systemd Files..."
echo ""

check_file "infra/systemd/kiosk-agent.service" "Agent service"
check_file "infra/systemd/kiosk-docker.service" "Docker service"

echo ""
echo "Checking Deployment Scripts..."
echo ""

check_file "infra/scripts/deploy.sh" "Linux deploy script"
check_file "infra/scripts/deploy.ps1" "Windows deploy script"
check_file "infra/scripts/healthcheck.sh" "Health check script"

# Check executable permissions
if [ -x "infra/scripts/deploy.sh" ]; then
    echo -e "${GREEN}✓${NC} deploy.sh is executable"
else
    echo -e "${YELLOW}!${NC} deploy.sh is not executable"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -x "infra/scripts/healthcheck.sh" ]; then
    echo -e "${GREEN}✓${NC} healthcheck.sh is executable"
else
    echo -e "${YELLOW}!${NC} healthcheck.sh is not executable"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "Checking Monitoring Configuration..."
echo ""

check_dir "infra/monitoring" "Monitoring directory"
check_file "infra/monitoring/README.md" "Monitoring docs"
check_dir "infra/monitoring/grafana/provisioning/datasources" "Grafana datasources"
check_dir "infra/monitoring/grafana/provisioning/dashboards" "Grafana dashboards"
check_file "infra/monitoring/grafana/provisioning/datasources/prometheus.yml" "Prometheus datasource"
check_file "infra/monitoring/grafana/provisioning/dashboards/dashboards.yml" "Dashboard config"

echo ""
echo "Checking Documentation..."
echo ""

check_file "docs/tech/deployment.md" "Deployment guide"
check_file "docs/tech/ci-cd.md" "CI/CD guide"
check_file "docs/tech/quick-reference.md" "Quick reference"
check_file "infra/README.md" "Infra README"
check_file "infra/docker/README.md" "Docker README"
check_file "infra/docker/ssl/README.md" "SSL README"

echo ""
echo "Checking GitHub Actions..."
echo ""

check_file ".github/workflows/agent-ci.yml" "CI workflow"
check_file ".github/workflows/agent-cd.yml" "CD workflow"

echo ""
echo "Checking Application Files..."
echo ""

check_file "apps/kiosk-agent/package.json" "Agent package.json"
check_file "apps/kiosk-agent/tsconfig.json" "TypeScript config"
check_file "apps/kiosk-agent/tsconfig.build.json" "Build config"

echo ""
echo "Checking Required Commands..."
echo ""

check_command "node" "Node.js"
check_command "npm" "npm"
check_command "docker" "Docker"
check_command "docker" "Docker Compose"
check_command "git" "Git"

echo ""
echo "Validating Docker Configuration..."
echo ""

if command -v docker >/dev/null 2>&1; then
    cd infra/docker
    
    if docker compose config >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} docker-compose.yml is valid"
    else
        echo -e "${RED}✗${NC} docker-compose.yml has errors"
        ERRORS=$((ERRORS + 1))
    fi
    
    cd ../..
fi

echo ""
echo "Checking SSL Setup..."
echo ""

if [ -f "infra/docker/ssl/server.crt" ] && [ -f "infra/docker/ssl/server.key" ]; then
    echo -e "${GREEN}✓${NC} SSL certificates exist"
else
    echo -e "${YELLOW}!${NC} SSL certificates not found (run infra/docker/ssl/generate-self-signed.sh)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "=== Validation Summary ==="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo ""
    echo "Ready to deploy:"
    echo "  Docker: cd infra/docker && docker compose up -d"
    echo "  Systemd: sudo bash infra/scripts/deploy.sh"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}${WARNINGS} warning(s) found${NC}"
    echo "Infrastructure is functional but has some warnings."
    exit 0
else
    echo -e "${RED}${ERRORS} error(s) found${NC}"
    [ $WARNINGS -gt 0 ] && echo -e "${YELLOW}${WARNINGS} warning(s) found${NC}"
    echo "Please fix errors before deployment."
    exit 1
fi
