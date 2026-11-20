#!/usr/bin/env bash
# 打包部署产物：本地构建前端 + 只带生产配置（不带本地 .env）
# 用法：bash deploy/package.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f deploy/env.production ]; then
  echo "缺少 deploy/env.production（从 deploy/env.production.example 复制并填写）" >&2
  exit 1
fi

echo "== build web =="
pnpm --filter @tiktap/web build

echo "== package =="
mkdir -p .cache/deploy
tar -czf .cache/deploy/tiktap.tar.gz \
  --exclude=node_modules \
  --exclude=.cache \
  --exclude=.git \
  --exclude=.home \
  --exclude=.idea \
  --exclude=.vite \
  --exclude=.pnpm-store \
  --exclude=media \
  --exclude=shots \
  --exclude=reference \
  --exclude=apps/server/data \
  --exclude=contracts/lib \
  --exclude=contracts/out \
  --exclude=out \
  --exclude=broadcast \
  --exclude=.env \
  .

echo "done: .cache/deploy/tiktap.tar.gz（服务器上把 deploy/env.production 拷成 .env 即可）"
