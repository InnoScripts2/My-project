param(
    [string]$CommonName = "localhost",
    [string]$CertPath = "$PSScriptRoot\..\..\certs",
    [SecureString]$PfxPassword
)

$ErrorActionPreference = 'Stop'

# Ensure output directory
try { $CertPath = (Resolve-Path -LiteralPath $CertPath -ErrorAction Stop).Path } catch { }
if (-not $CertPath) { $CertPath = Join-Path -Path $PSScriptRoot -ChildPath "..\..\certs" }
New-Item -ItemType Directory -Force -Path $CertPath | Out-Null

Write-Host "[cert] Generating self-signed certificate for CN=$CommonName"

# New-SelfSignedCertificate expects plain DNS names (not X500-formatted SAN strings)
$dnsNames = @($CommonName, 'localhost', '127.0.0.1')
$cert = New-SelfSignedCertificate -DnsName $dnsNames -CertStoreLocation Cert:\CurrentUser\My -FriendlyName "Kiosk Dev HTTPS ($CommonName)" -KeyAlgorithm RSA -KeyLength 2048 -NotAfter (Get-Date).AddYears(2)

# Export PFX
$pfxPath = Join-Path $CertPath "dev-cert-$CommonName.pfx"
$sec = if ($PfxPassword) { $PfxPassword } else { Read-Host -Prompt "[cert] Enter PFX password (leave empty for none)" -AsSecureString }
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $sec | Out-Null

# Export CER (public)
$cerPath = Join-Path $CertPath "dev-cert-$CommonName.cer"
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

# Convert to PEM (key+cert) using .NET (for simple dev use)
$pemCertPath = Join-Path $CertPath "dev-cert-$CommonName.pem"
$pemKeyPath = Join-Path $CertPath "dev-key-$CommonName.pem"

try {
    Add-Type -AssemblyName System.Security
    $bytes = [System.IO.File]::ReadAllBytes($pfxPath)
    # Extract plain-text password (if provided) for .NET X509 ctor
    $plainPass = if ($PfxPassword) { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($PfxPassword)) } else { $null }
    if ($plainPass) { $x509 = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($bytes, $plainPass) } else { $x509 = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($bytes) }
    $certBytes = $x509.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    $certBase64 = [System.Convert]::ToBase64String($certBytes)
    Set-Content -Path $pemCertPath -NoNewline -Value ("-----BEGIN CERTIFICATE-----`n" + $certBase64 + "`n-----END CERTIFICATE-----`n")

    # Private key export in PKCS#12 requires external tools for clean PEM; here we note PFX usage is preferred.
    # As a fallback, users can use OpenSSL to extract PEM key if needed.
    Set-Content -Path $pemKeyPath -Value "# Use PFX for HTTPS (HTTPS_PFX). To extract PEM key, use OpenSSL:" -Encoding UTF8
    Add-Content -Path $pemKeyPath -Value "# openssl pkcs12 -in dev-cert-$CommonName.pfx -nocerts -out dev-key-$CommonName.pem -nodes"
}
catch {
    Write-Warning "[cert] Could not create PEM files automatically: $_"
}

Write-Host "[cert] Done. Files:"
Write-Host "       PFX: $pfxPath"
Write-Host "       CER: $cerPath"
Write-Host "       PEM cert: $pemCertPath"
Write-Host "       PEM key (placeholder): $pemKeyPath"
Write-Host "[cert] To use with dev-static: set HTTPS_PFX (and optionally HTTPS_PASSPHRASE) or HTTPS_CERT/HTTPS_KEY and run 'npm run static'"
