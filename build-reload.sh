#!/usr/bin/env bash
# build-reload.sh — збирає розширення та перезавантажує його в Chrome.
#
# Використання:
#   bash build-reload.sh          # одноразова збірка + reload
#   bash build-reload.sh --watch  # відстежувати зміни та перебудовувати автоматично
#
# Передумови:
#   - Chrome запущено через .\start-chrome-debug.ps1
#   - .env.local містить EXTENSION_ID=<твій-id>

set -euo pipefail

WATCH=false
for arg in "$@"; do
  [[ "$arg" == "--watch" ]] && WATCH=true
done

build_and_reload() {
  echo ""
  echo "🔨 Збираємо розширення..."
  if bun run build; then
    echo "🔄 Перезавантажуємо в Chrome..."
    bun run scripts/reload-extension.ts
  else
    echo -e "\x1b[31m❌ Збірка завершилась з помилкою\x1b[0m"
    return 1
  fi
}

if $WATCH; then
  echo "👁️  Режим спостереження. Ctrl+C для виходу."
  echo "   Відстежуємо: entrypoints/, modules/, lib/"
  echo ""

  # Перша збірка при старті
  build_and_reload || true

  # Відстежуємо зміни файлів
  while true; do
    # Чекаємо зміну у вихідних файлах (потрібен inotifywait або fswatch)
    if command -v inotifywait &>/dev/null; then
      inotifywait -r -e modify,create,delete \
        entrypoints/ modules/ lib/ wxt.config.ts \
        --exclude '\.output' -q 2>/dev/null
      echo "📝 Зміну виявлено — перебудовуємо..."
      build_and_reload || true
    elif command -v fswatch &>/dev/null; then
      fswatch -r -1 entrypoints/ modules/ lib/ wxt.config.ts \
        --exclude '\.output' 2>/dev/null
      echo "📝 Зміну виявлено — перебудовуємо..."
      build_and_reload || true
    else
      echo "⚠️  --watch потребує 'inotifywait' (inotify-tools) або 'fswatch'"
      echo "   Встанови один з них, або використовуй 'bun run dev' для dev-режиму"
      exit 1
    fi
  done
else
  build_and_reload
fi
