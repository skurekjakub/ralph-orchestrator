#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Deploying Ralph Dashboard to Vercel..."
npx vercel --prod
echo "Done!"
