#!/usr/bin/env bash
# Выкладка сайта в Yandex Object Storage (запускается из .github/workflows/deploy-yc.yml).
# push — только изменённые файлы коммитов BEFORE..SHA; иначе — полная синхронизация.
set -euo pipefail
EP=https://storage.yandexcloud.net
AWS=${AWS:-aws}

skip() { case "$1" in .github/*|CNAME|README.md|.gitignore) return 0;; esac; return 1; }
cache() { case "$1" in *.html|*.xml|*.txt) echo "public, max-age=300";; *) echo "public, max-age=86400";; esac; }

full_sync() {
  echo "Полная синхронизация"
  EXCL=(--exclude ".git/*" --exclude ".github/*" --exclude "CNAME" --exclude "README.md")
  # HTML — короткий кэш, чтобы новые статьи появлялись сразу; остальное — подольше
  $AWS s3 sync . "s3://$BUCKET" --endpoint-url $EP --delete "${EXCL[@]}" --exclude "*.html" --exclude "*.xml" --exclude "*.txt" --cache-control "public, max-age=86400"
  $AWS s3 sync . "s3://$BUCKET" --endpoint-url $EP "${EXCL[@]}" --exclude "*" --include "*.html" --include "*.xml" --include "*.txt" --cache-control "public, max-age=300"
}

if [ "${EVENT:-}" != "push" ] || [ -z "${BEFORE:-}" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ] \
   || ! git fetch -q --depth=1 origin "$BEFORE"; then
  full_sync; exit 0
fi

up=0; rm=0
while IFS= read -r -d '' st && IFS= read -r -d '' f; do
  skip "$f" && continue
  if [ "$st" = "D" ]; then
    $AWS s3 rm "s3://$BUCKET/$f" --endpoint-url $EP --only-show-errors; rm=$((rm+1))
  else
    $AWS s3 cp "$f" "s3://$BUCKET/$f" --endpoint-url $EP --cache-control "$(cache "$f")" --only-show-errors; up=$((up+1))
  fi
done < <(git diff -z --name-status --no-renames "$BEFORE" "$SHA")
echo "Загружено файлов: $up, удалено: $rm"
