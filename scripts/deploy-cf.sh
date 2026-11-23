#!/usr/bin/env bash
# Deploys dist/ + functions/ to Cloudflare Pages, creating the project and the D1 events
# database on first run. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/cf.ts
W="npx -y wrangler@4"
$W pages project create bf26-deals --production-branch main >/dev/null 2>&1 || true
$W d1 create bf26-events >/dev/null 2>&1 || true
ID=$($W d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const x=JSON.parse(s).find(d=>d.name==="bf26-events");process.stdout.write(x?x.uuid:"")}catch{}})' || true)
mv wrangler.toml wrangler.src.toml
trap 'mv wrangler.src.toml wrangler.toml' EXIT
if [ -n "$ID" ]; then
  sed "s/__D1_ID__/$ID/" wrangler.src.toml > wrangler.toml
  $W d1 execute bf26-events --remote --command "CREATE TABLE IF NOT EXISTS counts (id TEXT NOT NULL, type TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (id, type))" >/dev/null
else
  # Token without D1 access: deploy without the database; likes/stats stay off until it's granted.
  echo "::warning::No D1 access for this token; deploying without engagement counters."
  sed '/\[\[d1_databases\]\]/,$d' wrangler.src.toml > wrangler.toml
fi
$W pages deploy dist --project-name bf26-deals --branch main --commit-dirty=true
