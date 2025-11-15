[CmdletBinding()]
param(
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'

# Helper script for Session 05. By default prints the git mv commands that will
# relocate legacy non-Android directories into the consolidated structure. Run
# with -Execute to perform the moves (ensures destination parents exist).

$repoRoot = Get-Item -LiteralPath (Join-Path $PSScriptRoot "..\..")

$targets = @(
    [pscustomobject]@{ Source = "apps/kiosk-agent"; Destination = "03-apps/02-application/kiosk-agent-legacy"; Category = "applications" },
    [pscustomobject]@{ Source = "apps/kiosk"; Destination = "03-apps/02-application/kiosk-shell"; Category = "applications" },
    [pscustomobject]@{ Source = "apps/android-kiosk"; Destination = "03-apps/02-application/android-kiosk"; Category = "applications" },
    [pscustomobject]@{ Source = "apps/admin"; Destination = "03-apps/02-application/admin"; Category = "applications" },
    [pscustomobject]@{ Source = "apps-unified"; Destination = "03-apps/01-legacy/apps-unified"; Category = "legacy-apps" },
    [pscustomobject]@{ Source = "packages"; Destination = "02-domains/03-domain"; Category = "shared-domain" },
    [pscustomobject]@{ Source = "infra"; Destination = "06-infra/04-infrastructure/infra-root"; Category = "infra" },
    [pscustomobject]@{ Source = "infra-unified"; Destination = "06-infra/04-infrastructure/infra-unified"; Category = "infra" },
    [pscustomobject]@{ Source = "docs"; Destination = "09-docs/01-interfaces/docs-root"; Category = "docs" },
    [pscustomobject]@{ Source = "docs-unified"; Destination = "09-docs/02-application/docs-unified"; Category = "docs" },
    [pscustomobject]@{ Source = "plan-80-session-roadmap.md"; Destination = "09-docs/02-application/plans/plan-80-session-roadmap.md"; Category = "docs" },
    [pscustomobject]@{ Source = "plan-project-context.md"; Destination = "09-docs/02-application/plans/plan-project-context.md"; Category = "docs" },
    [pscustomobject]@{ Source = "templates"; Destination = "10-tools/01-interfaces/templates"; Category = "tooling" },
    [pscustomobject]@{ Source = "tools"; Destination = "10-tools/01-interfaces/tools-root"; Category = "tooling" },
    [pscustomobject]@{ Source = "functions"; Destination = "06-infra/02-application/functions"; Category = "infra" },
    [pscustomobject]@{ Source = "modules"; Destination = "04-packages/02-application/modules"; Category = "shared-domain" },
    [pscustomobject]@{ Source = "node-legacy"; Destination = "10-tools/03-domain/node-legacy"; Category = "legacy-apps" },
    [pscustomobject]@{ Source = "dist"; Destination = "10-tools/04-infrastructure/dist-artifacts"; Category = "artifacts" },
    [pscustomobject]@{ Source = "build"; Destination = "10-tools/04-infrastructure/build-artifacts"; Category = "artifacts" },
    [pscustomobject]@{ Source = "logs"; Destination = "07-ops/04-infrastructure/logs"; Category = "ops" },
    [pscustomobject]@{ Source = "assets"; Destination = "10-tools/02-application/assets"; Category = "tooling" },
    [pscustomobject]@{ Source = "public"; Destination = "10-tools/02-application/public"; Category = "tooling" },
    [pscustomobject]@{ Source = "shared"; Destination = "04-packages/03-domain/shared"; Category = "shared-domain" },
    [pscustomobject]@{ Source = "supabase"; Destination = "05-integrations/02-application/supabase"; Category = "integrations" },
    [pscustomobject]@{ Source = "certs"; Destination = "08-security/03-domain/certs"; Category = "security" },
    [pscustomobject]@{ Source = "keys"; Destination = "08-security/03-domain/keys"; Category = "security" }
)

$plan = @()

foreach ($entry in $targets) {
    $sourcePath = Join-Path $repoRoot.FullName $entry.Source
    $destinationPath = Join-Path $repoRoot.FullName $entry.Destination
    $exists = Test-Path -LiteralPath $sourcePath
    $plan += [pscustomobject]@{
        Source      = $entry.Source
        Destination = $entry.Destination
        Category    = $entry.Category
        Exists      = $exists
    }

    if (-not $exists) {
        Write-Warning "Source missing: $($entry.Source)"
        continue
    }

    $destParent = Split-Path -Parent $destinationPath
    if (-not (Test-Path -LiteralPath $destParent)) {
        Write-Verbose "Destination parent will be created: $destParent"
    }

    $sourceItem = Get-Item -LiteralPath $sourcePath
    $isContainer = $sourceItem.PSIsContainer
    $hasFiles = $false
    if ($isContainer) {
        $hasFiles = [bool](Get-ChildItem -LiteralPath $sourcePath -Recurse -File -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
    }

    if ($isContainer -and -not $hasFiles) {
        if (-not $Execute) {
            Write-Host "# Empty directory \"$($entry.Source)\" -> ensure destination \"$($entry.Destination)\""
            continue
        }

        if (-not (Test-Path -LiteralPath $destinationPath)) {
            New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
        }

        Remove-Item -LiteralPath $sourcePath -Force -Recurse
        continue
    }

    if (-not $Execute) {
        Write-Host "git mv \"$($entry.Source)\" \"$($entry.Destination)\""
        continue
    }

    if (-not (Test-Path -LiteralPath $destParent)) {
        New-Item -ItemType Directory -Path $destParent -Force | Out-Null
    }

    $trackedItems = & git -C $repoRoot.FullName ls-files -- $entry.Source 2>$null
    $isTracked = $trackedItems -and $trackedItems.Length -gt 0

    if ($isTracked) {
        $gitArgs = @('mv', '--', $entry.Source, $entry.Destination)
        $gitProcess = Start-Process -FilePath 'git' -ArgumentList $gitArgs -WorkingDirectory $repoRoot.FullName -NoNewWindow -PassThru -Wait
        if ($gitProcess.ExitCode -ne 0) {
            throw "git mv failed for $($entry.Source)"
        }
    }
    else {
        Move-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }
}

$plan | Sort-Object Category, Source | Format-Table -AutoSize
