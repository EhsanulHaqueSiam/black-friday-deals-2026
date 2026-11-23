#!/usr/bin/env bash
# Refresh sources/ with the latest README of every merged deal list.
set -euo pipefail
cd "$(dirname "$0")/.."
for repo in \
  trungdq88/Awesome-Black-Friday-Cyber-Monday \
  mRs-/Black-Friday-Deals \
  danmindru/rare-big-deal \
  twf-nikhila/Awesome-Black-Friday-Cyber-Monday-deals \
  Pimjo/black-friday-deals \
  dqhieu/black-friday-deals \
  bergside/awesome-black-friday \
  v3nomtech/infosec-cert-black-friday-2026 \
  sprfrkr/awesome-black-friday-for-developers \
  Shashankt255/black-friday-deals-2026 \
  KevinKaul/black-friday-deals-2026; do
  gh api "repos/$repo/readme" --jq .content | base64 -d > "sources/${repo/\//_}.md"
done
