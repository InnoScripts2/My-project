# Kiosk Agent Deployment Script for Windows
# This script deploys the kiosk agent to a production environment

param(
    [string]$DeployDir = "C:\kiosk-agent",
    [string]$ServiceName = "KioskAgent"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Kiosk Agent Deployment ===" -ForegroundColor Green
Write-Host "Deploy directory: $DeployDir"
Write-Host ""

# Check if running as administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Error: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

# Step 1: Check Node.js installation
Write-Host "[1/7] Checking Node.js installation..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version
    Write-Host "Node.js $nodeVersion is installed" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js is not installed. Please install Node.js 20.x from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Step 2: Create deployment directory
Write-Host "[2/7] Creating deployment directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $DeployDir | Out-Null
New-Item -ItemType Directory -Force -Path "$DeployDir\data" | Out-Null
New-Item -ItemType Directory -Force -Path "$DeployDir\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "$DeployDir\config" | Out-Null

# Step 3: Get project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)

# Step 4: Build the application
Write-Host "[3/7] Building application..." -ForegroundColor Cyan
Set-Location $ProjectRoot
npm install --workspace=apps/kiosk-agent
Set-Location "$ProjectRoot\apps\kiosk-agent"
npm run build

# Step 5: Copy files to deployment directory
Write-Host "[4/7] Copying files to $DeployDir..." -ForegroundColor Cyan
Copy-Item -Path "$ProjectRoot\apps\kiosk-agent\dist\*" -Destination "$DeployDir\dist" -Recurse -Force
Copy-Item -Path "$ProjectRoot\apps\kiosk-agent\package*.json" -Destination $DeployDir -Force

if (Test-Path "$ProjectRoot\apps\kiosk-agent\config") {
    Copy-Item -Path "$ProjectRoot\apps\kiosk-agent\config\*" -Destination "$DeployDir\config" -Recurse -Force
}

# Step 6: Install production dependencies
Write-Host "[5/7] Installing production dependencies..." -ForegroundColor Cyan
Set-Location $DeployDir
npm ci --production --ignore-scripts

# Step 7: Install as Windows Service using NSSM or Node-Windows
Write-Host "[6/7] Installing Windows Service..." -ForegroundColor Cyan

# Check if service already exists
$serviceExists = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($serviceExists) {
    Write-Host "Stopping existing service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force
    # Wait for service to stop
    Start-Sleep -Seconds 5
}

# Install node-windows globally if not present
try {
    npm list -g node-windows | Out-Null
} catch {
    Write-Host "Installing node-windows..." -ForegroundColor Yellow
    npm install -g node-windows
}

# Create service installation script
$serviceScript = @"
const Service = require('node-windows').Service;

// Create a new service object
const svc = new Service({
  name: '$ServiceName',
  description: 'Kiosk Agent - Self-service car diagnostics',
  script: '$DeployDir\\dist\\index.js',
  nodeOptions: [],
  env: [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'AGENT_ENV', value: 'PROD' },
    { name: 'AGENT_PORT', value: '7070' },
    { name: 'DATABASE_URL', value: '$DeployDir\\data\\kiosk.db' },
    { name: 'LOG_LEVEL', value: 'info' }
  ]
});

// Listen for the 'install' event
svc.on('install', function(){
  console.log('Service installed successfully');
  svc.start();
});

// Install the service
svc.install();
"@

$serviceScript | Out-File -FilePath "$DeployDir\install-service.js" -Encoding UTF8

# Run service installation
node "$DeployDir\install-service.js"

Write-Host "[7/7] Waiting for service to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Check service status
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    Write-Host ""
    Write-Host "=== Deployment Complete ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Service Status: $($service.Status)" -ForegroundColor $(if ($service.Status -eq 'Running') { 'Green' } else { 'Yellow' })
    Write-Host ""
    Write-Host "Service management commands:" -ForegroundColor Cyan
    Write-Host "  Start-Service -Name $ServiceName      - Start the service"
    Write-Host "  Stop-Service -Name $ServiceName       - Stop the service"
    Write-Host "  Restart-Service -Name $ServiceName    - Restart the service"
    Write-Host "  Get-Service -Name $ServiceName        - Check service status"
    Write-Host ""
} else {
    Write-Host "Warning: Service installation may have failed. Please check manually." -ForegroundColor Yellow
}
