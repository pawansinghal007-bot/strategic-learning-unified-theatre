# Load .env automatically
Get-Content .env | ForEach-Object {
    if ($_ -match "=") {
        $name, $value = $_ -split "=", 2
        Set-Item -Path "Env:$name" -Value $value
    }
}

Write-Host "Environment variables loaded." -ForegroundColor Green