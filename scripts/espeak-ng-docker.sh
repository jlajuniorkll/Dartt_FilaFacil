#!/usr/bin/env bash
# Executa espeak-ng dentro de um container temporário (container não altera o
# sistema hospedeiro). Requer a imagem:
#   docker build -t filafacil-espeak-ng:local - < scripts/voice-espeak.Dockerfile
# Uso: ESPEAK_NG_BIN=scripts/espeak-ng-docker.sh npm run voice:generate
set -euo pipefail

IMAGE="${ESPEAK_IMAGE:-filafacil-espeak-ng:local}"
VOICE_DIR="$(cd "$(dirname "$0")/../public/voice" && pwd)"

args=()
for arg in "$@"; do
  case "$arg" in
    "$VOICE_DIR"/*) args+=("/voice/${arg#"$VOICE_DIR"/}") ;;
    *) args+=("$arg") ;;
  esac
done

exec docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$VOICE_DIR:/voice" \
  "$IMAGE" \
  "${args[@]}"
