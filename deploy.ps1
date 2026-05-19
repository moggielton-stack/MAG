# MAG — one-click deploy for Windows
# What this does:
#   1. Creates a PUBLIC GitHub repo named "MAG" under your account
#   2. Pushes every file in this folder to it
#   3. Enables GitHub Pages with "GitHub Actions" as the source
#   4. Prints the live URL when ready
#
# Requirements (one-time, ~3 min):
#   - GitHub CLI: winget install --id GitHub.cli   (or download from cli.github.com)
#   - Git:        winget install --id Git.Git      (usually already installed)
#
# Run this from PowerShell inside the MAG folder:
#   cd "$env:USERPROFILE\Desktop\0 - Financial Report\Financial Report\MAG"
#   .\deploy.ps1

$ErrorActionPreference = "Stop"
$repoName = "MAG"

Write-Host "MAG deploy starting..." -ForegroundColor Cyan

# 1. Check gh + git installed
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "GitHub CLI not found." -ForegroundColor Red
    Write-Host "Install it with:  winget install --id GitHub.cli" -ForegroundColor Yellow
    Write-Host "Then re-run this script." -ForegroundColor Yellow
    exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git not found. Install: winget install --id Git.Git" -ForegroundColor Red
    exit 1
}

# 2. Auth check — opens browser if not signed in
Write-Host "Checking GitHub auth..." -ForegroundColor Cyan
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Signing you into GitHub..." -ForegroundColor Yellow
    gh auth login --web --git-protocol https
    if ($LASTEXITCODE -ne 0) { Write-Host "Auth failed." -ForegroundColor Red; exit 1 }
}

# 3. Init git in this folder if not already
if (-not (Test-Path ".git")) {
    Write-Host "Initialising git..." -ForegroundColor Cyan
    git init -b main | Out-Null
    git add . | Out-Null
    git -c user.email="moggielton@gmail.com" -c user.name="MAG" commit -m "Initial MAG deploy" | Out-Null
}

# 4. Create the repo (or push to existing)
Write-Host "Creating GitHub repo '$repoName' (public)..." -ForegroundColor Cyan
$repoExists = gh repo view $repoName 2>$null
if ($LASTEXITCODE -ne 0) {
    gh repo create $repoName --public --source=. --remote=origin --push
    if ($LASTEXITCODE -ne 0) { Write-Host "Repo creation failed." -ForegroundColor Red; exit 1 }
} else {
    Write-Host "Repo already exists — pushing current contents..." -ForegroundColor Yellow
    $userInfo = gh api user --jq .login
    git remote remove origin 2>$null
    git remote add origin "https://github.com/$userInfo/$repoName.git"
    git push -u origin main --force
}

# 5. Enable GitHub Pages with Actions source
$user = gh api user --jq .login
Write-Host "Enabling GitHub Pages (Actions source)..." -ForegroundColor Cyan
$pagesBody = '{"build_type":"workflow"}'
gh api -X POST "repos/$user/$repoName/pages" --input - <<< $pagesBody 2>$null
if ($LASTEXITCODE -ne 0) {
    # Pages might already be configured — try update instead
    gh api -X PUT "repos/$user/$repoName/pages" --input - <<< $pagesBody 2>$null
}

# 6. Output
$liveUrl = "https://$user.github.io/$repoName/"
Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  MAG deployed!" -ForegroundColor Green
Write-Host "  Repo:  https://github.com/$user/$repoName" -ForegroundColor Green
Write-Host "  Live:  $liveUrl" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host ""
Write-Host "First deploy takes ~60-90 seconds to go live." -ForegroundColor Yellow
Write-Host "Watch progress at: https://github.com/$user/$repoName/actions" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next: set up the email reminder secrets (see README — section 3)" -ForegroundColor Cyan
