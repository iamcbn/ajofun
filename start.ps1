$ErrorActionPreference = "Stop"

$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$BackendPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$FrontendNodeModules = Join-Path $FrontendDir "node_modules"
$ViteBin = Join-Path $FrontendNodeModules "vite\bin\vite.js"

if (-not (Test-Path -LiteralPath $BackendPython)) {
    Write-Error "Backend virtual environment not found. Run: cd `"$BackendDir`"; uv sync --all-extras --python 3.11"
    exit 1
}

if (-not (Test-Path -LiteralPath $FrontendNodeModules)) {
    Write-Error "Frontend dependencies not found. Run: cd `"$FrontendDir`"; npm install"
    exit 1
}

$BackendEnv = Join-Path $BackendDir ".env"
$FrontendEnv = Join-Path $FrontendDir ".env"

if (-not (Test-Path -LiteralPath $BackendEnv)) {
    Write-Warning "backend\.env not found. Copy backend\.env.example to backend\.env and add DATABASE_URL and NEON_AUTH_URL."
}

if (-not (Test-Path -LiteralPath $FrontendEnv)) {
    Write-Warning "frontend\.env not found. Copy frontend\.env.example to frontend\.env and add VITE_NEON_AUTH_URL and VITE_NEON_DATA_API_URL."
}

Write-Host "Starting Ajofun backend on http://localhost:8000 ..."
$BackendProcess = Start-Process `
    -FilePath $BackendPython `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--reload", "--port", "8000", "--proxy-headers") `
    -WorkingDirectory $BackendDir `
    -NoNewWindow `
    -PassThru

$DebugFrontendProcess = $null
if (Test-Path -LiteralPath $ViteBin) {
    Write-Host "Starting Ajofun local debug sandbox (no Neon) on http://localhost:5175 ..."
    $DebugFrontendProcess = Start-Process `
        -FilePath "node" `
        -ArgumentList @("node_modules\vite\bin\vite.js", "--mode", "debug", "--port", "5175", "--strictPort") `
        -WorkingDirectory $FrontendDir `
        -NoNewWindow `
        -PassThru
} else {
    Write-Warning "Vite CLI not found at $ViteBin; skipping debug sandbox (:5175)."
}

try {
    Write-Host "Starting Ajofun Neon frontend on http://localhost:5174 ... (Press Ctrl+C to stop all)"
    Push-Location -LiteralPath $FrontendDir
    try {
        & npm run dev
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($DebugFrontendProcess -and -not $DebugFrontendProcess.HasExited) {
        Write-Host "Stopping debug frontend server (PID $($DebugFrontendProcess.Id))..."
        Stop-Process -Id $DebugFrontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($BackendProcess -and -not $BackendProcess.HasExited) {
        Write-Host "Stopping backend server (PID $($BackendProcess.Id))..."
        Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
