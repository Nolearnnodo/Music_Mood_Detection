# Mood Radio launcher
#
# Usage from repo root:
#   .\start.ps1                # backend + frontend dev
#   .\start.ps1 -BackendOnly   # backend only
#   .\start.ps1 -FrontendOnly  # frontend (vite) only
#   .\start.ps1 -Api           # backend in --api-only, useful with vite
#   .\start.ps1 -Port 9090     # change backend port
#   .\start.ps1 -NoVulkan      # disable GPU acceleration
#
# Must be executed from the repository root (the folder that contains
# Music_Directory, scripts, models, build).

param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$Api,
    [string]$Port = "8080",
    [switch]$NoVulkan
)

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
if (-not (Test-Path (Join-Path $root "Music_Directory"))) {
    Write-Host "[start.ps1] This script must live next to Music_Directory/. Aborting." -ForegroundColor Red
    exit 1
}
Set-Location $root

$exe       = Join-Path $root "build\MusicMoodCLI.exe"
$models    = Join-Path $root "models"
$musicDir  = Join-Path $root "Music_Directory"
$webRoot   = Join-Path $root "build\web"
$frontDir  = Join-Path $root "frontend\web"

function Start-Backend {
    if (-not (Test-Path $exe)) {
        Write-Host "[start.ps1] Missing $exe. Build with cmake --build build first." -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $models)) {
        Write-Host "[start.ps1] models/ not found at $models" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $musicDir)) {
        Write-Host "[start.ps1] Music_Directory/ not found at $musicDir" -ForegroundColor Yellow
    }

    Get-Process MusicMoodCLI -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "[start.ps1] Killing previous backend PID=$($_.Id)" -ForegroundColor DarkGray
        try { $_ | Stop-Process -Force -ErrorAction SilentlyContinue } catch {}
    }

    $argList = @(
        "--model-dir", $models,
        "--music-dir", $musicDir,
        "--port", $Port
    )
    if ($Api -or $FrontendOnly) {
        $argList += "--api-only"
    } else {
        if (Test-Path $webRoot) {
            $argList += @("--web-root", $webRoot)
        } else {
            Write-Host "[start.ps1] build/web missing, falling back to --api-only" -ForegroundColor Yellow
            $argList += "--api-only"
        }
    }
    if ($NoVulkan) { $argList += "--no-vulkan" }

    Write-Host "[start.ps1] backend: $exe $($argList -join ' ')" -ForegroundColor Cyan
    if ($BackendOnly) {
        & $exe @argList
    } else {
        Start-Process -FilePath $exe -ArgumentList $argList -WorkingDirectory $root | Out-Null
        Write-Host "[start.ps1] Backend launched in a new window on port $Port." -ForegroundColor Green
    }
}

function Start-Frontend {
    if (-not (Test-Path $frontDir)) {
        Write-Host "[start.ps1] frontend/web not found" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path (Join-Path $frontDir "node_modules"))) {
        Write-Host "[start.ps1] frontend/web has no node_modules, running npm install ..." -ForegroundColor Yellow
        Push-Location $frontDir
        npm install
        Pop-Location
    }
    Write-Host "[start.ps1] Starting Vite dev server (http://localhost:5173)" -ForegroundColor Cyan
    Push-Location $frontDir
    try { npm run dev } finally { Pop-Location }
}

if ($FrontendOnly) {
    Start-Frontend
} elseif ($BackendOnly) {
    Start-Backend
} else {
    Start-Backend
    Start-Sleep -Seconds 1
    Start-Frontend
}