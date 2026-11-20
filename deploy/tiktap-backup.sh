#!/usr/bin/env bash
# 每日加密备份：sqlite .backup 快照 → openssl AES-256 加密 → 保留 7 天
set -euo pipefail

DB=/srv/tiktap/apps/server/data/tiktap-auto.db
DIR=/srv/tiktap/backups
ENV_FILE=/srv/tiktap/.env

mkdir -p "$DIR"
chmod 700 "$DIR"

KEY=$(sed -n 's/^BACKUP_KEY=//p' "$ENV_FILE" | head -1)
if [ -z "$KEY" ]; then
  echo "缺少 BACKUP_KEY，跳过加密备份" >&2
  exit 1
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

sqlite3 "$DB" ".backup $TMP"
OUT="$DIR/tiktap-$(date +%F).db.enc"
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "pass:$KEY" -in "$TMP" -out "$OUT"
chmod 600 "$OUT"

find "$DIR" -name 'tiktap-*.db.enc' -mtime +7 -delete
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
