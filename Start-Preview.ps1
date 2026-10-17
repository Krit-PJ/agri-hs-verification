$hsPreviewRoot = $PSScriptRoot
$hsPreviewPort = 8081
$hsPreviewPython = Get-Command python -ErrorAction SilentlyContinue
if (-not $hsPreviewPython) { Write-Host "Python is required. See README.md"; exit 1 }
$hsPreviewListener = Get-NetTCPConnection -LocalPort $hsPreviewPort -State Listen -ErrorAction SilentlyContinue
if (-not $hsPreviewListener) {
  Start-Process -FilePath $hsPreviewPython.Source -ArgumentList @('-m','http.server',"$hsPreviewPort",'--bind','127.0.0.1') -WorkingDirectory $hsPreviewRoot -WindowStyle Hidden
}
Start-Process "http://127.0.0.1:$hsPreviewPort/"
