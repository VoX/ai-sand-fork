#!/usr/bin/env bash
set -euo pipefail

# Load nvm if available
export NVM_DIR="${HOME}/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  source "$NVM_DIR/nvm.sh"
  nvm use 22 --silent 2>/dev/null || nvm use default --silent
fi

# Verify node version meets Playwright minimum (18.19+)
NODE_VERSION=$(node -v | sed 's/v//')
MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
MINOR=$(echo "$NODE_VERSION" | cut -d. -f2)
if [ "$MAJOR" -lt 18 ] || { [ "$MAJOR" -eq 18 ] && [ "$MINOR" -lt 19 ]; }; then
  echo "Error: Node.js >= 18.19 required (found v${NODE_VERSION})"
  exit 1
fi

cd "$(dirname "$0")"

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  bun install
fi

# Install Playwright browsers if needed
if [ ! -d "${HOME}/.cache/ms-playwright/chromium-"* ] 2>/dev/null; then
  echo "Installing Playwright Chromium..."
  npx playwright install chromium
fi

# Run tests, forwarding all arguments
npx playwright test "$@"
