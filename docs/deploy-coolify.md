# FilaFácil — Deploy no Coolify (preparação)

> Documento de preparação. O Coolify **não** foi configurado nesta fase e este manual não
> substitui o teste em homologação antes de produção.

## 1. Visão geral

- Aplicação Next.js 15 compilada em modo `standalone` (`output: 'standalone'` no `next.config.ts`).
- Banco SQLite (WAL) **fora da imagem**, em volume persistente `/data` no container.
- Imagem: `Dockerfile` multi-stage (node:22-bookworm-slim), usuário não-root (`node`), porta 3000.
- Nenhuma dependência de containers/serviços do Nexus. Instância única (SQLite é single-node).

## 2. Repositório e branch

- Repositório: `https://github.com/jlajuniorkll/Dartt_FilaFacil`
- Branch para desenvolvimento/homologação: `dev`
- SHA base das fases: `622a30c8005764f476c54fa4a92ff128406d6ebb`

## 3. Estratégia de build

1. `node:22-bookworm-slim` instala deps com `npm ci` (reproduzível, lockfile).
2. Build via `npm run build` (não executável offline no CI? — executa `next build`, ~1–3 min).
3. Imagem final `runner` inclui apenas `.next/standalone`, `.next/static`, `public` e os CLIs
   `scripts/create-admin.mjs` / `scripts/reset-password.mjs`.
4. Healthcheck interno: `GET http://127.0.0.1:3000/api/queue/status` (público, 200).

## 4. Porta

- Interna: `3000` (variável `PORT` também aceita, desde que `HOSTNAME=0.0.0.0`).
- Coolify roteia o domínio externo (HTTPS) para a porta 3000 do container.

## 5. Domínio de desenvolvimento

Sugestão (a definir no Coolify): `fila.<seu-dominio>` ou `fila-dev.<seu-dominio>` para homologação.
Não apontar DNS para nada nesta fase.

## 6. Variáveis de ambiente

| Variável | Valor | Obrigatória | Notas |
|---|---|---|---|
| `SQLITE_PATH` | `/data/filafacil.db` | Sim (padrão já embutido na imagem) | Banco fora do filesystem da imagem |
| `TZ` | `America/Sao_Paulo` | Sim (já embutida) | Dia operacional do negócio |
| `PORT` | `3000` | Não (padrão) | |
| `HOSTNAME` | `0.0.0.0` | Sim (já embutida) | |
| `NODE_ENV` | `production` | Sim (já embutida) | |
| `FILAFACIL_COOKIE_SECURE` | `true` (padrão via NODE_ENV=production) | Não | `false` só para debug local em HTTP |

> **Não há mais variáveis `NEXT_PUBLIC_FIREBASE_*`** — remover de qualquer ambiente configurado.
> Nenhum segredo fica no `Dockerfile`, no repositório ou no lockfile.

## 7. Volume persistente

- Criar volume nomeado no Coolify: `filafacil-data` montado em `/data`.
- Conteúdo do volume: `filafacil.db`, `filafacil.db-wal`, `filafacil.db-shm`.
- Nunca versionar `*.db*` (já ignorado pelo `.gitignore`).

## 8. Inicialização do SQLite

Ordem correta (automática, sem intervenção):

1. Container inicia → `node server.js` (standalone).
2. Na primeira consulta ao banco (ex.: health check `GET /api/queue/status` do Coolify),
   os serviços abrem `/data/filafacil.db`, aplicam migrações pendentes (`schema_migrations`)
   e semeiam defaults **não sensíveis** (2 perfis, 2 tipos de senha, settings padrão,
   2 URLs de YouTube) apenas se ausentes — inicialização preguiçosa e idempotente
   (`initializeDatabase` via `ready()` em cada serviço).
3. Migrações usam transações `immediate()` — sem risco com validações concorrentes na subida.
4. **Nunca** cria usuários/administrador, nunca reseta senhas/filas e nunca toca dados existentes.
   O healthcheck do Dockerfile garante essa primeira consulta automaticamente.

## 9. Primeiro administrador (manual, obrigatório)

Com o container rodando e o volume montado:

```bash
docker exec -it <nome-do-container> node scripts/create-admin.mjs
```

- Exige TTY interativo; pede e-mail, senha e confirmação (senha não ecoa).
- Recusa se qualquer usuário existir. Política: mín. 12 caracteres com letras e números.
- Redefinição de senha: `docker exec -it <nome-do-container> node scripts/reset-password.mjs`
  (revoga todas as sessões do usuário).

## 10. HTTPS

- Coolify termina TLS no proxy (Let's Encrypt automático) e encaminha HTTP para `https://<dominio>`.
- Cookie de sessão (`filafacil_session`): `HttpOnly`, `SameSite=Lax`, `Secure` em produção,
  `Path=/`, Max-Age 7 dias. Somente sobre HTTPS ele trafega como `Secure`.

## 11. Health check

- Caminho: `/api/queue/status`
- Esperado: HTTP 200 com JSON `{"lastCalled": ..., "history": [...], "videos": [...]}`.
- Alternativa: `/login` (200).

## 12. Backup e restauração

### Backup (agendar no Coolify ou cron externo)

```bash
docker exec <nome-do-container> node -e "const db=require('better-sqlite3')('/data/filafacil.db',{readonly:true});db.backup('/data/backups/filafacil-\$(date +%F-%H%M).db').then(()=>{console.log('backup ok');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"
```

- `better-sqlite3` exporta `.backup()` (online, consistente com WAL).
- Guardar `/data/backups/` num segundo local (S3/outro host) — fora da máquina principal.
- Retenção sugerida: 30 dias. Testar restauração periodicamente.

### Restauração

1. Parar a aplicação.
2. Copiar o backup para o volume: `filafacil.db` (remover `-wal`/`-shm` do conjunto corrompido).
3. Subir o container; a primeira consulta (health check) aplica as migrações pendentes
   (idempotentes — não destrutivas).

## 13. Logs

- `docker logs -f <nome-do-container>` ou painel de logs do Coolify.
- Esperado: sem erros após o primeiro `GET /api/queue/status` (health check dispara a abertura
  do SQLite e as migrações v1→v3).
- Falhas de abertura do SQLite aparecem nos logs da primeira requisição — verificar antes de
  depurar rotas.

## 14. Rollback

**Aplicação:** no Coolify, reverter para o deployment anterior (imagem/tag anterior). O volume `/data`
não é afetado — senhas/sessões/senhas emitidas permanecem.

**Banco (destrutivo — sempre preferir backup):**
1. Parar o app.
2. Backup de segurança do estado atual: `cp` do `filafacil.db` atual.
3. Restaurar o backup anterior (passo 12) e subir novamente.
4. Migrações aplicadas são cumulativas — rollback de imagem pode encontrar schema mais novo;
   migrações são aditivas e não destrutivas (v1→v2→v3), então versões anteriores do app toleram o schema novo.

## 15. Áudio do painel (diagnóstico)

Se o `/display` não emitir voz: seguir a tabela de diagnóstico de `public/voice/README.md`
(indicador cinza/âmbar/vermelho, autoplay, `/voice/manifest.json` e `/voice/*.wav` devem
responder 200 `audio/wav` no mesmo domínio). Os 70 arquivos de fallback estão dentro da imagem
(`COPY ... /app/public ./public`).

## 16. Checklist de publicação (homologação primeiro)

- [ ] Volume nomeado criado; `SQLITE_PATH=/data/filafacil.db` confirmado.
- [ ] Primeiro admin criado manualmente via `docker exec`; login testado no domínio de homologação.
- [ ] `/request` emite senha, `/call` chama, `/display` atualiza a cada 3s.
- [ ] `GET /voice/senha.wav` responde 200 `audio/wav` (fallback de áudio presente na imagem).
- [ ] Painel: **Ativar som** → "Voz do painel ativada" ouvida.
- [ ] HTTPS válido; cookie `Secure` presente no DevTools.
- [ ] Backup manual executado e validado (`.backup`).
- [ ] Logs sem erros após o health check.
- [ ] Nenhum teste executado contra a produção.
