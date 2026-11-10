# FilaFácil — imagem descartável para gerar os áudios do fallback de voz.
# NÃO instala nada no sistema hospedeiro. Uso:
#   docker build -t filafacil-espeak-ng:local - < scripts/voice-espeak.Dockerfile
#   ESPEAK_NG_BIN=scripts/espeak-ng-docker.sh npm run voice:generate
# Licença: espeak-ng é GPL-3.0-or-later (usado como CLI; o motor não é redistribuído).
FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends espeak-ng \
    && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["espeak-ng"]
