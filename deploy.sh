#!/usr/bin/env bash
# MAG — one-click deploy for macOS / Linux / WSL / Git Bash
# What this does:
#   1. Creates a PUBLIC GitHub repo named "MAG" under your account
#   2. Pushes every file in this folder to it
#   3. Enables GitHub Pages with "GitHub Actions" as the source
#   4. Prints the live URL
#
# Requirements (one-time):
#   - GitHub CLI:  brew install gh    (Mac)
#                  sudo apt install gh (Linux)
#   - Git:         usually preinstalled
#
# Run:
#   chmod +x deploy.sh
#   ./deploy.sh

set -e
REPO_NAME="MAG"

echo "MAG deploy starting…"

# 1. Tooling check
command -v gh  >/dev/null || { echo "Install gh: https://cli.github.com"; exit 1; }
command -v git >/dev/null || { echo "Install git first."; exit 1; }

# 2. Auth
if ! gh auth status >/dev/null 2>&1; then
  echo "Signing you into GitHub…"
  gh auth login --web --git-protocol https
fi

# 3. Init git if needed
if [ ! -d .git ]; then
  echo "Initialising git…"
  git init -b main >/dev/null
  git add .
  git -c user.email="moggielton@gmail.com" -c user.name="MAG" commit -m "Initial MAG deploy" >/dev/null
fi

# 4. Create or push
USER=$(gh api user --jq .login)
if ! gh repo view "$REPO_NAME" >/dev/null 2>&1; then
  echo "Creating repo $USER/$REPO_NAME (public)…"
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
else
  echo "Repo exists — pushing current contents…"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$USER/$REPO_NAME.git"
  git push -u origin main --force
fi

# 5. Enable Pages with Actions source
echo "Enabling GitHub Pages…"
gh api -X POST "repos/$USER/$REPO_NAME/pages" \
  -f build_type=workflow 2>/dev/null || \
gh api -X PUT "repos/$USER/$REPO_NAME/pages" \
  -f build_type=workflow 2>/dev/null || true

LIVE_URL="https://$USER.github.io/$REPO_NAME/"
echo
echo "================================================="
echo "  MAG deployed!"
echo "  Repo:  https://github.com/$USER/$REPO_NAME"
echo "  Live:  $LIVE_URL"
echo "================================================="
echo
echo "First deploy takes ~60-90 seconds to go live."
echo "Watch progress at: https://github.com/$USER/$REPO_NAME/actions"
echo
echo "Next: set up email reminder secrets (see README — section 3)"
