$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$markdownFiles = Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Filter '*.md' |
    Where-Object { $_.FullName -notmatch '[\\/](\.git|node_modules|\.next|\.gradle|build|coverage)[\\/]' }

$missing = [System.Collections.Generic.List[string]]::new()
$linkPattern = [regex]'\[[^\]]+\]\((?<target>[^)]+)\)'

foreach ($file in $markdownFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    foreach ($match in $linkPattern.Matches($content)) {
        $rawTarget = $match.Groups['target'].Value.Trim()
        $pathPart = ($rawTarget -split '#', 2)[0].Trim().Trim('<', '>')

        if (-not $pathPart -or $pathPart -match '^(https?://|mailto:|tel:)') {
            continue
        }

        $decodedPath = [System.Uri]::UnescapeDataString($pathPart)
        $candidate = Join-Path -Path $file.DirectoryName -ChildPath $decodedPath
        if (-not (Test-Path -LiteralPath $candidate)) {
            $relativeFile = $file.FullName.Substring($repoRoot.Length).TrimStart([char[]]'\/')
            $missing.Add("${relativeFile}: ${rawTarget}")
        }
    }
}

if ($missing.Count -gt 0) {
    Write-Error ("Broken Markdown links:`n" + ($missing -join "`n"))
}

Write-Host "Markdown links OK ($($markdownFiles.Count) files)."
