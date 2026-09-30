#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="$(cd "$PROJECT_DIR/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$WORKSPACE/fruits_ana_mobile_deploy_${STAMP}.tar.gz"

tar -czf "$OUT" \
  -C "$WORKSPACE" \
  fruits_ana_mobile/images

echo "已生成移动端部署包: $OUT"
ls -lh "$OUT"
