# FreshStart IMSEC App Launcher
# Automatically stops any running node processes and starts fresh

Write-Host "🏫 Starting IMSEC FreshStart App..." -ForegroundColor Cyan
Write-Host ""

# Stop any existing node processes
Write-Host "🛑 Stopping existing Node.js processes..." -ForegroundColor Yellow
$procs = Get-Process -Name node -ErrorAction SilentlyContinue
if ($procs) {
    $procs | Stop-Process -Force
    Write-Host "   ✓ Stopped $($procs.Count) process(es)" -ForegroundColor Green
} else {
    Write-Host "   ✓ No existing processes found" -ForegroundColor Green
}

# Wait a moment
Start-Sleep -Seconds 1

# Start the app
Write-Host ""
Write-Host "🚀 Launching FreshStart..." -ForegroundColor Cyan
Write-Host "   Opening at http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "   Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

& "C:/Program Files/Python312/python.exe" run.py
