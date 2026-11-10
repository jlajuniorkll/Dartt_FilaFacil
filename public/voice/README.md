# Voz do painel — áudios locais (fallback offline)

Esta pasta contém os 70 arquivos `.wav` usados pelo fallback de anúncio quando
`speechSynthesis` não estiver disponível (ex.: Smart TVs antigas) ou falhar.
Veja `src/lib/voice-fallback.ts` (player) e `src/lib/announcement.ts` (tokens).

## STATUS: ARQUIVOS GERADOS E VALIDADOS (Fase 2E.1)

- 70/70 tokens do `manifest.json` com `.wav` correspondente, nenhum órfão.
- Formato: **WAV RIFF/PCM, mono, 16-bit, 44,1 kHz** (22050/44100 aceitos) — suportado por
  qualquer navegador/Smart TV com `<audio>`; sem codec proprietário.
- Durações: 0,29 s (letras curtas) a 1,24 s (frase de teste); total ≈ 2,8 MB.
- Pronúncia verificada fonematicamente (IPA) para os 70 textos: sem expansões incorretas.
  Correções aplicadas no gerador em relação ao pt-BR natural:
  - token `e` (conjunção) → síntese de `"i"` (pt-BR fala /i/; espeak lê `"e"` isolado como /ɛ/,
    mas em contexto `"cento e vinte"` ele próprio usa /i/);
  - token `letra-e` → síntese de `"e"` (nome da letra E = /ɛ/; espeak lê `"é"` como a expansão
    quebrada "é agudo").

## Origem e licença (redistribuição comercial)

- Ferramenta: **espeak-ng** (https://github.com/espeak-ng/espeak-ng), licença **GPL-3.0-or-later**
  (código do motor + dicionários `espeak-ng-data` em árvore).
- Uso aqui: CLI **não modificada**, em container descartável; **o motor não é redistribuído**
  (apenas os `.wav` sintetizados são versionados).
- Saída sintetizada: a GPLv3 cobre a saída apenas se ela constituir "covered work"; frases curtas
  sintetizadas não são consideradas derivadas do código/dicionários. Os mantenedores afirmam que
  o uso é livre com obrigações sobre o código (que não redistribuímos). O projeto **não publica um
  grant explícito para os WAVs** — se o requisito jurídico do operador for certeza absoluta,
  substitua por locução profissional (abaixo). Não foi usado o backend MBROLA (dados de voz de
  terceiros majoritariamente não-comerciais).
- Locução profissional contratada: exige cessão de direitos ou licença de redistribuição
  comercial no contrato com o locutor.
- **Nenhum áudio de terceiros foi baixado.**

## Como regenerar os arquivos

Opção 1 — container isolado (sem instalar nada no sistema; usada nesta fase):

```bash
docker build -t filafacil-espeak-ng:local - < scripts/voice-espeak.Dockerfile
ESPEAK_NG_BIN=scripts/espeak-ng-docker.sh npm run voice:generate
```

Opção 2 — espeak-ng instalado localmente:

```bash
sudo apt-get install -y espeak-ng   # requer autorização do operador
npm run voice:generate
```

O gerador `scripts/generate-voice-phrases.ts` lê `manifest.json` e grava
`public/voice/<token>.wav` com `espeak-ng -v pt-br -s 150`. Após regenerar, rode
`npm run db:test:voice` (valida integridade, durações e URLs).

Alternativas gratuitas (se a voz robótica do espeak-ng não for aceitável):
- **Locução humana pt-BR** gravada por token (recomendado para atendimento ao público).
- Piper TTS (código MIT) — atenção: a maioria dos modelos de voz é **CC-BY-NC** (não comercial);
  verificar licença específica antes de usar.
- Coqui XTTS / Mozilla TTS — modelos sob licença não-comercial; **não usar** em produto comercial.
- Não há TTS neural gratuito e comercialmente liberado com voz pt-BR de qualidade pronta —
  para qualidade de locutor real, a via é contratação.

## Limitações de autoplay

- O navegador/SO pode exigir **gesto do usuário** antes de qualquer áudio: o painel tem o botão
  **Ativar som** (preferência salva em `localStorage`; no reload pode ser preciso clicar de novo).
- Smart TVs com modo kiosk podem exigir flags de política de autoplay no navegador do fabricante
  (ex.: Chrome OS `--autoplay-policy=no-user-gesture-required`). Sem o gesto/flag, nem o chime
  nem a voz tocam — isso é política do navegador, não bug do FilaFácil.
- Áudio em segundo plano: desde que ativado, o anúncio toca mesmo com a aba não focada.

## Testes necessários em Smart TVs reais (não executados nesta fase)

A compatibilidade com Smart TV **não foi validada em hardware real** (regra: não declarar
compatibilidade sem teste). Minimalista de homologação por modelo (LG webOS, Samsung Tizen,
TCL/Philips Android TV):

1. Abrir o painel `/display`, clicar **Ativar som** → ouvir "Voz do painel ativada".
2. **Testar voz** → ouvir o mesmo aviso.
3. Emitir e chamar senha → ouvir chime + "Senha …" completo.
4. Recarregar a página → estado aguardando interação → clique → anuncia a chamada atual.
5. Verificar indicador verde (ativo) e ausência de erro no console.

## Diagnóstico quando o painel não emite áudio

| Sintoma | Causa provável | Ação |
|---|---|---|
| Indicador **cinza** "Som desativado" | Áudio nunca ativado | Clicar **Ativar som** |
| Indicador **âmbar** "aguardando interação" | Bloqueio de autoplay pós-reload | Clicar no painel (**Ativar som**) |
| Indicador **vermelho** "indisponível" | `speechSemthesis` falhou E fallback sem arquivos | Verificar `GET /voice/manifest.json` (200) e `GET /voice/senha.wav` (200); regenerar arquivos |
| Sem chime nem voz mesmo com indicador verde | Política de autoplay do navegador/SO | Testar flag de autoplay ou gesto; conferir volume do sistema |
| Voz falha no meio (Chrome) | `speechSynthesis` do SO travou | Console mostra "tentando fallback de áudio local"; recarregar painel |
| Smart TV sem som algum | Fabricante sem Web Speech + áudio bloqueado | Ver linhas 1–5 da homologação acima |

Logs úteis (console do painel): `speechSynthesis indisponível/falhou`, `Fallback de voz indisponível`,
`Anúncio de voz falhou: <chave>`.

## Tokens

Ver `manifest.json` (70 tokens: frases, números 0–9999+ dígito-a-dígito, centenas, guichês,
prefixos por letra/dígito). A cobertura é validada por varredura exaustiva em
`scripts/db-voice-test.ts` (`npm run db:test:voice`).
