#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> 构建移动端镜像 fruits-ana-mobile-web:local"
docker build \
  -f "$PROJECT_DIR/deploy/docker/Dockerfile.fruits-mobile-web" \
  -t fruits-ana-mobile-web:local \
  "$PROJECT_DIR"

echo "==> 导出镜像到 images 目录"
docker save fruits-ana-mobile-web:local -o "$IMAGES_DIR/fruits-ana-mobile-web.tar"

echo
echo "==> 当前移动端镜像:"
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' \
  | grep -E '^fruits-ana-mobile-web\s' || true

echo
echo "==> 镜像文件:"
ls -lh "$IMAGES_DIR"/fruits-ana-mobile-web.tar
