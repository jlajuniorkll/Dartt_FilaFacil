# FilaFácil — Arquitetura SQLite (Fase 1)

## 1. Objetivo

Preparar a migração do Firebase/Firestore para SQLite, preservando os contratos
existentes (`AppSettings`, `Ticket`, `DailyQueue`, `DashboardStats`) e **sem**
alterar a lógica de negócio ou a interface nesta fase.

## 2. Tecnologia escolhida: `better-sqlite3`

| Critério | Prisma | Drizzle | better-sqlite3 |
|---|---|---|---|
| Runtime | Engine binária + cliente | Biblioteca JS + driver | Nativo, sem engine externo |
| Peso no container | Alto (query engine) | Baixo | Mínimo |
| Transações ACID | Sim | Sim | Sim (síncrono, `db.transaction`) |
| Controle de WAL/busy_timeout | Parcial (via DSN) | Via driver | Total (pragmas explícitos) |
| Compatibilidade Next.js 15 | Boa, exige codegen | Boa | Boa com `serverExternalPackages` |

**Decisão:** `better-sqlite3` (v13) + `@types/better-sqlite3`.

Justificativa: o FilaFácil é um app single-node (kiosk + painéis no mesmo
host, deploy via Docker/Coolify). O volume de escritas (emissão/chamada de
senhas) é baixo e latência síncrona é vantajosa. better-sqlite3 oferece
transações confiáveis e atômicas sem processo/engine extra, com
`serverExternalPackages: ['better-sqlite3']` no `next.config.ts` para que o
bundle server não tente empacotar o módulo nativo.

*Não utilizado Prisma* por adicionar engine binária e codegen, e *não usado
Drizzle* por ser uma camada desnecessária nesta etapa — o schema é pequeno e o
SQL direto é auditável. Se o projeto evoluir para múltiplos nós, a decisão
deve ser reavaliada (SQLite é single-node).

## 3. Localização e configuração do banco

- Variável de ambiente: **`SQLITE_PATH`**
  - Valor absoluto ou relativo (resolvido com `path.resolve`).
  - Padrão quando ausente: `./data/filafacil.db` (diretório `data/` é criado
    com `mkdir -p` na primeira conexão e está no `.gitignore`).
  - Em produção (Docker/Coolify), aponte para um volume persistente,
    ex.: `SQLITE_PATH=/data/filafacil.db`.
- Conexão **preguiçosa e singleton** (`getDb()` em `src/lib/db/connection.ts`):
  nada abre o arquivo durante o build; o banco só é aberto na primeira
  chamada efetiva, com cache em `globalThis` (sobrevive ao HMR do dev).
- **Somente server-side**: `connection.ts` lança erro se importado em bundle
  client (`typeof window !== 'undefined'`) e depende do módulo nativo, que o
  webpack não resolve para o cliente. Componentes client-side **não** devem
  importar `src/lib/db/*`.

## 4. Pragmas e robustez

Aplicados a cada conexão em `getDb()`:

| Pragma | Valor | Efeito |
|---|---|---|
| `journal_mode` | `WAL` | Leituras concorrentes com escrita; `-wal`/`-shm` no `.gitignore` |
| `synchronous` | `NORMAL` | Seguro sob WAL com bom desempenho |
| `busy_timeout` | `5000` | Aguarda locks em vez de falhar imediatamente |
| `foreign_keys` | `ON` | Constraints referenciais sempre ativas |

## 5. Fuso operacional

- Fuso oficial: **`America/Sao_Paulo`** (`src/lib/db/time.ts`).
- `business_date` (coluna `YYYY-MM-DD`) identifica o "dia operacional" da
  fila — equivalente à chave `dailyQueues/{YYYY-MM-DD}` do Firestore.
- `getBusinessDate()` usa `Intl.DateTimeFormat('en-CA', …)` com
  `timeZone: 'America/Sao_Paulo'` (independe do TZ do host/container).
- Carimbos de emissão/chamada continuam em ISO 8601 UTC (`issued_at`,
  `called_at`), como no código atual (`new Date().toISOString()`).

## 6. Schema (versão 2 — Fase 2A)

> A versão 1 (`initial_schema`) foi criada na Fase 1. A migração 2
> (`ticket_types_active_and_tickets_unique_removed`) adicionou `ticket_types.active`
> para soft-delete de tipos de senha (necessária porque `tickets` referencia `ticket_types`
> via FK — apagar fisicamente quebraria o histórico) e removeu a restrição
> `UNIQUE (business_date, ticket_type_id, display_number)` de `tickets`, incompatível com a
> semântica de reinício de numeração do Firebase (resetSequenceCounters), substituindo-a pelo
> índice não único `idx_tickets_business_date_type_number`.

Migração versionada em `src/lib/db/migrations.ts`. Tabela de controle
`schema_migrations(version PK, name, applied_at)`; cada migração roda dentro
de uma transação própria e é aplicada uma única vez.

### Tabelas

| Tabela | Papel | Substitui (Firestore) |
|---|---|---|
| `profiles` | Perfis estáticos `admin`/`operator` (CHECK) | conceito de `role` em `users/{uid}` |
| `users` | Usuários (`id` = uid, `email` único COLLATE NOCASE, `role` FK→profiles, `password_hash` opcional) | coleção `users` |
| `settings` | Singleton `id = 1`: `priority_enabled`, `counter_configuration`, `total_counters` | doc `app/settings` |
| `youtube_urls` | URLs da playlist por `settings_id` + `position` | campo `youtubeUrls` |
| `ticket_types` | Tipos de senha / configuração de botões (`prefix`, `priority`, `frequency`, `automatic_numbering`, `start_number`, `color`, …) | `settings.buttons[]` |
| `tickets` | Senhas emitidas (`business_date`, `ticket_number`, `display_number`, `issued_at`, `called`, `called_at`, `counter`) | subcoleção `dailyQueues/{data}/tickets` |
| `daily_sequences` | Sequência de numeração por (dia, tipo) — `last_number` | `sequenceCounters{buttonId: n}` |
| `priority_call_counters` | Contador de chamadas por tipo no dia (P:F) | `callCounters{buttonId: n}` |
| `call_history` | Histórico ordenado de chamadas (suporta `is_repeat`) | `callHistory[]` (cap 10 derivável via `ORDER BY id DESC LIMIT 10`) |

`lastCalled` não tem tabela: deriva-se da linha mais recente de
`call_history` (ou da senha chamada mais recente do dia).

### Índices e constraints

- `tickets`: `UNIQUE (business_date, ticket_type_id, display_number)`;
  `CHECK` coerente entre `called` e `called_at`;
  índice `(business_date, called, issued_at)` — fila pendente;
  índice `(business_date, ticket_type_id)`; índice `(called_at)` — dashboard.
- `daily_sequences` / `priority_call_counters`: PK composta `(business_date, ticket_type_id)`.
- `call_history`: índices `(business_date, id DESC)` e `(ticket_id)`.
- `youtube_urls`: `UNIQUE (settings_id, position)`.
- FKs com `ON DELETE CASCADE` onde o filho não faz sentido órfão
  (sequences/counters/urls); `tickets` e `call_history` preservam referência
  (sem cascade) para histórico.
- CHECK `id IN ('admin','operator')` em `profiles`; `frequency >= 1`;
  `display_number >= 1`; `call_count >= 0`.

## 7. Inicialização segura e idempotente

`initializeDatabase()` (`src/lib/db/init.ts`):

1. Abre/cria o banco (diretório incluído).
2. Aplica migrações pendentes em ordem.
3. Semeia **somente dados não sensíveis**, de forma guardada (nunca sobrescreve o que já existe):
   - `profiles`: `admin`, `operator` (via `INSERT OR IGNORE`);
   - `settings` id=1 com os defaults atuais do app (`priority_enabled=1`, `counter_configuration='none'`, `total_counters=5`), apenas se ausente;
   - `ticket_types` padrão (`btn-1` Preferencial / `btn-2` Normal), apenas se a tabela estiver vazia;
   - `youtube_urls` padrão (as mesmas 2 URLs de `initialSettings`), apenas se não houver nenhuma para settings 1.
4. **Nenhum usuário é criado** e **nenhuma senha/credencial padrão** é inserida — usuários devem ser provisionados na fase de migração/autenticação com hashes reais.

CLI: `npm run db:init` (usa `SQLITE_PATH` se definido).

## 8. Transações e operações atômicas

better-sqlite3 expõe `db.transaction(fn)` (BEGIN…COMMIT com ROLLBACK automático em exceção). O desenho do schema cobre os dois pontos críticos:

- **Emissão**: `daily_sequences` com upsert `last_number + 1` + `INSERT` em `tickets` com `UNIQUE (business_date, ticket_type_id, display_number)` — sequência e inserção no mesmo BEGIN garantem ausência de números duplicados mesmo sob concorrência.
- **Chamada**: atualização do ticket (`called`, `called_at`, `counter`) + incremento de `priority_call_counters` + inserção em `call_history` na mesma transação.

A camada de dados da Fase 2 deverá usar esse mecanismo; a Fase 1 não altera `src/lib/data.ts`.

## 9. Migrações futuras

Adicionar novo objeto a `migrations` com `version` crescente + SQL
correspondente. Nunca editar migração já aplicada. `runMigrations` ignora
versões `<=` a `MAX(version)` de `schema_migrations`.

## 10. O que está explicitamente fora de escopo (Fase 1)

- Remoção/substituição do Firebase (`src/lib/firebase.ts`, `data.ts`, `auth/*`).
- Migração de dados do Firestore para SQLite.
- Autenticação local (hash de senha, sessões).
- Qualquer alteração visual ou de contratos (`types.ts`).
- Commit/push/deploy.

## 11. Verificação

- `npm run db:test` — smoke test em banco temporário (13 verificações: pragmas, idempotência, seeds, timezone, transações atômicas com commit e rollback, índice de numeração, FK, histórico).
- `npm run db:test:services` — 17 testes de serviço em banco temporário, incluindo concorrência entre processos (workers tsx paralelos).
- `npm run typecheck` — TypeScript estrito.

---

# FilaFácil — Fase 2A — Camada de Serviços SQLite

## 12. Arquivo e garantias

`src/lib/db/queue-service.ts` implementa os mesmos contratos de dados de `src/lib/data.ts` (Firestore):
`getSettings`, `updateSettings`, `generateTicket`, `getPendingTickets`, `callNextTicket`,
`callNextTicketByType`, `repeatLastCall`, `getQueueStatus`, `resetQueue`, `resetSequenceCounters`,
`getDashboardStats`.

- Server-only (`typeof window` guard) e **não conectado à interface** (sem imports em `src/app/*`).
- Sem `revalidatePath`/`next/cache` — a invalidação continua na camada de server actions.
- better-sqlite3 é síncrono: chamadas são atômicas por construção dentro de um mesmo processo;
  para multi-processo (vários nós no mesmo host é impossível — o banco é um arquivo), as escritas
  cruzadas são protegidas por transações `immediate()` + `busy_timeout`.

## 13. Migrações estruturais da Fase 2A (migração 2)

1. `ticket_types.active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))` +
   índice `(active, sort_order)`. `getSettings` só retorna tipos ativos.
   `updateSettings` faz **soft-delete** dos botões removidos da configuração
   (hard-delete impossível: `tickets.ticket_type_id` é FK).
2. **Remoção do `UNIQUE (business_date, ticket_type_id, display_number)`** em `tickets`
   (rebuild da tabela com `foreign_keys = OFF`, seguido de `PRAGMA foreign_key_check`).
   Motivo: o Firebase permite reemitir `P001` após `resetSequenceCounters` — números duplicados
   são parte da semântica de negócio (a UI identifica senhas pelo `id`, não pelo número).
   `resetQueue` continua apagando as senhas do dia (paridade com o Firebase), mas
   `resetSequenceCounters`/`resetQueue` podem reemitir números com histórico retido — por isso a
   constraint foi removida. Substituída pelo índice não único `idx_tickets_business_date_type_number`.
   Correção estrutural documentada e aplicada via migração versionada, como exigido.

## 14. Concorrência e integridade

- **Emissão**: `BEGIN IMMEDIATE`; leitura de `daily_sequences`; `UPDATE/UPSERT` com `last_number+1`;
  `INSERT` em `tickets`. Dois processos não conseguem obter o mesmo `last_number` (write lock do WAL).
  Verificado por testes com 3 workers paralelos emitindo 10 senhas cada: 30 números únicos.
- **Chamada**: seleção do próximo ticket + `UPDATE tickets SET called=1 ... WHERE id=? AND called=0`
  + incremento de `priority_call_counters` + `INSERT call_history`, **tudo na mesma transação**.
  O `WHERE called = 0` é a guarda definitiva contra dois operadores chamarem a mesma senha —
  se 0 linhas forem afetadas, a transação aborta (rollback). Verificado com 2 workers paralelos.
- `callNextTicket` atualiza os contadores de prioridade **dentro** da mesma transação da chamada
  (o Firestore fazia em duas operações separadas) — sem janela de inconsistência.

## 15. Diferenças em relação ao Firestore

| Aspecto | Firestore | SQLite (Fase 2A) |
|---|---|---|
| IDs de senhas | `ticket-{ts}-{prefix}` | `ticket-{ts}-{prefix}-{8 hex}` (entropia maior) |
| `revalidatePath` | Chamado nas funções | Não chamado — fica na camada de actions (Fase 2B) |
| `callCounters`/`sequenceCounters` | Mapas JSON aninhados | Tabelas `priority_call_counters` / `daily_sequences` (PK composta) |
| `lastCalled`/`callHistory` | Array embutido no doc diário | `call_history` (ordem por `id DESC`), teto de 10 derivável |
| Reset do dia | Deleta tickets/histórico do dia | **Mesma semântica** (delete do dia) — dias anteriores intactos |
| Reset de sequência | Seta contadores ao valor inicial | Upsert idempotente dos valores iniciais (funciona com ou sem linhas) |
| Data do "dia" | `toISOString().split('T')[0]` (UTC) | `business_date` em `America/Sao_Paulo` (correto) |
| Dashboard por período | Itera documentos por dia local | `business_date BETWEEN from AND to` (fuso operacional) |
| Concorrência | `runTransaction` do Firestore | `immediate()` + constraint de guarda `called = 0` |
| Chamada dupla | Possível janela entre seleção e update | Janela inexistente (seleção + update atômicos) |
| Soft-delete de botões | N/A (doc aninhado) | `ticket_types.active` |

## 16. Reset de fila e o conflito com senhas históricas

- `resetQueue()`: apaga **apenas o dia operacional corrente** (histórico de chamadas e senhas),
  zera sequências e contadores do dia. Dias anteriores são preservados. Paridade exata com o
  Firebase, incluindo a perda do dashboard "do dia" após o reset.
- **Incompatibilidade documentada**: `resetSequenceCounters()` com senhas históricas retidas reemite
  números já usados (o Firebase se comporta da mesma forma). A constraint UNIQUE, proposta na Fase 1,
  foi removida por ser incompatível com essa semântica. Reinício de numeração mid-day duplica
  números — aceitável porque a interface identifica senhas pelo `id`.
- Se retenção de histórico do dia for exigida no futuro, `resetQueue` precisa virar soft-reset
  (ex.: `tickets.voided_at`) — **requer aprovação explícita** e migração nova.

## 17. Métricas do dashboard (nomes potencialmente incorretos — revisar antes de exibir)

- `averageServiceTime` **não é tempo de atendimento**: é `called_at - issued_at`, ou seja,
  **tempo de espera** entre emitir e chamar. 
- `estimatedWaitTime` = `média(hoje) × senhas pendentes` — estimativa grosseira, não fila real.
- `waitingCount` sempre reflete a fila atual (todas as datas? não — só o dia corrente).
  Correto e intencional, mas merece nome diferente numa revisão futura (ex.: `currentWaitingCount`).
- `ticketsByCounter` usa `localeCompare` em "Guichê N" (ordenação alfabética, ex.: "Guichê 10" < "Guichê 2").
- `todayString` (estimativa de espera) usa o filtro do período; se o período não incluir hoje,
  a média de hoje sai 0 e `estimatedWaitTime` = 0 — comportamento herdado do Firebase.
- As chaves não foram renomeadas nesta fase (contrato preservado). Revisão sugerida para Fase 3+.

## 18. Preparação para a Fase 2B (substituição controlada)

1. Criar `src/lib/data.sqlite.ts` (ou branch em `data.ts` por env flag `DATA_BACKEND=sqlite|firestore`),
   delegando para `queue-service.ts` e mantendo `revalidatePath` nas actions.
2. Wiring de autenticação local (hash de senha, sessão) — sem usuários padrão.
3. Script de migração de dados Firestore → SQLite (settings, botões, senhas históricas).
4. Checklist: testes de regressão da UI, validação em staging com `SQLITE_PATH` em volume,
   backup do arquivo SQLite antes de cada deploy (Coolify).

---

# FilaFácil — Fase 2B — Autenticação local SQLite

## 19. Escopo e arquitetura

Autenticação local, server-side, **sem** substituir o fluxo Firebase da interface (isso é a Fase 2C).
O fluxo ativo de login continua `src/app/login/login-form.tsx` + `auth-context.tsx` + `lib/auth/actions.ts`.
NADA em `src/app/**` importa os novos módulos.

Novos módulos:

- `src/lib/db/auth-service.ts` — núcleo: usuários, senha (Argon2id), sessões, bloqueio por tentativas,
  desativação, bootstrap do primeiro admin, helpers de autorização (`requireUser`, `requireAdmin`,
  `requireOperatorOrAdmin`, `hasRole`).
- `src/lib/auth/session.ts` — cookie `filafacil_session` (`HttpOnly`, `SameSite=Lax`, `Secure` em
  produção; override via `FILAFACIL_COOKIE_SECURE=true|false`), `Path=/`, `Max-Age=7d`.
- `src/lib/auth/authorization.ts` — `getCurrentUser`/`requireAuthenticated`/`requireAdmin`/`requireOperator`
  baseados no cookie; ainda **não conectados** às actions/rotas.
- `scripts/create-admin.ts` — bootstrap manual do primeiro administrador (interativo, TTY obrigatório,
  sem args/env de senha; recusa quando já existe qualquer usuário).
- `scripts/reset-password.ts` — redefinição manual de senha (caminho de migração do Firebase: a senha
  original não é exportável; o usuário define uma nova senha). Revoga todas as sessões.
- Migração 3 `auth_sessions_and_login_attempts`: tabelas `sessions`, `login_attempts`; `users` ganha
  `disabled_at` e `last_login_at`.

## 20. Senhas e sessões

- Hash **Argon2id** (`@node-rs/argon2`, m=19 MiB, t=2, p=1 — mínimo OWASP), sem senha em texto puro.
- Senha mínima: 12 caracteres com letras e números (`validatePasswordStrength`).
- Token de sessão: 256 bits aleatórios (`randomBytes`, base64url); no banco fica apenas
  `sha256(token)`; comparação do lookup é feita para o hash (índice único) + checagem administrativa.
- Sessão absoluta de 7 dias (sem renovação silenciosa); `purgeExpiredSessions()` remove expiradas
  (chamada dentro de operações de autenticação e disponível para cron futuro).
- Logout/revogação: `revokeSession` (atual) e `revokeAllSessionsForUser` (reset de senha, desativação)
  marcam `revoked_at`; `validateSession` rejeita revogadas, expiradas e usuários desativados.
- Persistência: sessões vivem no SQLite → sobrevivem a restart/deploy (com volume persistente).
- Proteção de força bruta: 5 falhas em 15 minutos por e-mail ⇒ bloqueio por 15 min (mesmo com a senha
  correta); mensagens sempre genéricas (sem enumeração de usuários); tentativas antigas expurgadas após 24h.
- CSRF: cookie `SameSite=Lax` + fato de que mutações são Server Actions (o Next valida Origin/Host).
  Login em si é ação pública (ver matriz) e nunca carrega cookie de sessão.

## 21. Primeiro administrador (procedimento proposto — NÃO executado nesta fase)

1. Subir a app com `SQLITE_PATH` apontando para o banco persistente.
2. Executar manualmente: `npm run auth:create-admin`
   - exige TTY interativo; pede e-mail, senha e confirmação (senha não ecoa);
   - política: mín. 12 caracteres com letras e números;
   - recusa se **qualquer** usuário já existir (bootstrap é único e irrepetível).
3. Registrar o procedimento no runbook de deploy. Nunca agendar em startup/CI/CD.

## 22. Migração de usuários do Firebase

- O Firebase armazena hashes scrypt não exportáveis em texto puro — **senha original não migra**.
- Plano: exportar usuários (e-mail + custom claim/role) do Firebase; criar cada um localmente via
  `npm run auth:create-admin`/script de migração respeitando perfis (admin/operator); para cada
  usuário criado sem senha conhecida, executar `scripts/reset-password.ts` por usuário
  (senha definida pelo próprio usuário sob supervisão) **ou** distribuir link de set-password
  quando a Fase 2C introduzir recuperação — caso contrário, reset manual assistido.
- Depois da migração, congelar login Firebase, verificar logs de acesso, então Fase 2C
  (troca de actions) e remoção do Firebase em fase posterior (fora desta Fase 2B).

## 23. Matriz de permissões (alvo da Fase 2C)

| Ação / rota | Acesso |
|---|---|
| `/request` (kiosk emissão — `generateTicket`) | **Público** (sem login) |
| `/display` (painel) | **Público** |
| `GET /api/queue/status` | **Público** (dados mínimos do painel) |
| `/login` | **Público** |
| `/call` (chamar/repetir senha) | admin, operator |
| `/home` | usuário autenticado |
| `/dashboard`, `/settings` (métricas, configuração) | admin |
| `resetQueue`, `resetSequenceCounters`, `updateSettings` | admin |
| Criar/desativar usuários, reset de senha | admin |
| `callNextTicket`, `callNextTicketByType`, `repeatLastCall` | admin, operator |

Hoje as guardas existem no **serviço** (`requireAdmin` etc.) e **não são impostas pelas actions** —
chegará na Fase 2C junto com a troca de UI.

## 24. Vulnerabilidades encontradas na auditoria (a corrigir na 2C/posterior)

1. Proteção de rotas atual é **100% client-side** (`useAuth` no useEffect) — HTML/JS é público e
   os dados/actions são chamáveis diretamente.
2. Server actions (`actions.ts`, `data.ts`) **não verificam sessão nem perfil** — qualquer visitante
   pode invocar `callNextTicket`, `resetQueue`, `updateSettings` chamando os endpoints de action.
3. `/api/queue/status` expõe último chamado (por design do painel público) — ok, mas deve ser
   restrito a dados mínimos quando a 2C ser aplicada (sem PII).
4. Logout chama `cookies().delete()` sem `await` (bug pré-existente de tipos) e o cookie
   `__session` deletado nunca é criado — a sessão real do Firebase vive no client (IndexedDB).
5. `seed.ts` com senhas fracas e hardcoded (`administrador`, `operador`) — **não usar em produção**;
   substituir pelos scripts `auth:create-admin` / `auth:reset-password`.
6. Sem rate limiting no login Firebase (proteção depende do provedor); o novo auth tem
   bloqueio local de tentativas.
7. `getUserRole` consulta Firestore com o SDK client no servidor — papel vem do banco do Firebase
   sem sessão server-side validada; sessões locais (Fase 2B) eliminam essa dependência.
8. AuthProvider trava o app inteiro com loader se o Firebase falhar — após a 2C, o loader deve
   refletir apenas a sessão local (ou remover o gate global).

## 25. Riscos e notas

- `SESSION_MAX_AGE` 7 dias absoluto: revisar com o negócio (kiosk ocioso vs. segurança).
- SQLite persistente exige volume no Coolify/Docker — sessões sumirem em restart se o caminho for efêmero.
- `FILAFACIL_COOKIE_SECURE=false` só para debug local http; nunca em produção.
- A senha nunca passa por logs, argv ou env (TTY obrigatório nos scripts; nunca ecoada).
- `login_attempts` guarda e-mails de tentativas — considerar LGPD/retenção de 24h já implementada.

---

# FilaFácil — Fase 2C — Integração completa com SQLite

## 26. O que mudou

- `src/lib/firebase.ts` e `src/lib/seed.ts` **removidos** (não há mais imports de firebase em src/).
- `src/lib/data.ts` reescrito como camada fina sobre `queue-service.ts` + autorização por sessão SQLite.
- `src/lib/actions.ts` reescrito com tipos de retorno discriminados (`ActionOutcome`) e erro genérico
  `Erro interno do servidor.` para falhas inesperadas (sem vazar internals).
- `src/lib/auth/actions.ts` reescrito: `signIn` (e-mail+senha → sessão), `signOut` (revoga sessão),
  `getSessionUser`. `seedUser`/`getUserRole` removidos.
- `src/lib/auth/auth-context.tsx` lê a sessão via `getSessionUser()` (sem Firebase); loader global mantido.
- `src/lib/auth/authorization.ts` + `guards.ts`: guardas server-side usadas pelo data.ts.
- `GET /api/queue/status` permanece público (painel); `revalidatePath(url)` removido (rota é `force-dynamic`).
- Correção dos 3 erros TS pré-existentes (`DisplayClient.tsx:100`, `data.ts:202`, `auth/actions.ts:33`).

## 27. Autorização aplicada nas Server Actions (efetiva)

| Função | Acesso |
|---|---|
| `getSettings`, `generateTicket`, `getQueueStatus` | Público |
| `getPendingTickets`, `callNextTicket`, `callNextTicketByType`, `repeatLastCall` | admin ou operator |
| `updateSettings`, `getDashboardStats`, `resetQueue`, `resetSequenceCounters` | admin |

Guardas nunca leem papel do cliente — o papel vem da sessão SQLite via cookie `filafacil_session`.
Em contexto sem cookie (scripts/testes), `authorization.ts` resolve `null` → `assertRole` lança
`UNAUTHENTICATED` (nunca "loga" por acidente). `resetQueue`/`resetSequenceCounters` exigem admin;
tentativas retornam `{ success: false, code: 'FORBIDDEN' }`.

`generateTicket` público só emite para `ticket_types` ativos (configuração) — IDs inválidos abortam.
`updateSettings` faz soft-delete de botões removidos; histórico de senhas preservado via FK.

## 28. Mapa de migração de fluxos

- Dashboard → `getDashboardStats` (SQLite) · admin only.
- Chamada → `callNextTicket*`, `repeatLastCall`, `getPendingTickets` (admin/operator).
- Painel público → `/api/queue/status` (público, JSON mínimo; polling de 3s preservado).
- Emissão → `generateTicket` (público; botões ativos apenas).
- Configurações → `getSettings` (público, read) / `updateSettings` (admin).
- Login → `signIn` (ação pública; cookie HttpOnly/Lax/Secure); contexto cliente via `getSessionUser`.
- Genkit/YouTube: **intocados**.

## 29. Limitações e notas de homologação

- O kiosk `/request` continua exigindo configuração válida em `ticket_types` (seed ou bootstrap).
- Primeiro acesso: criar admin com `npm run auth:create-admin` (Fase 2B) — não há criação automática.
- Verificação visual real da UI requer browser Playwright/Chromium — **não executado aqui**; o que foi
  verificado: suíte de integração (21), testes HTTP em dev server isolado (portas 9124, `/`, `/login`,
  `/request`, `/display`, `/api/queue/status` — todos 200 e conteúdo correto), typecheck limpo,
  RSC sem erros no log do dev server. Nenhuma homologação visual está declarada.
- `next build` não executado nesta sessão (2 vCPUs; sem Docker aqui). Recomendado antes de merge.

---

# FilaFácil — Fase 2E — Voz gratuita do painel (sem Gemini)

## 30. Como funciona

Fluxo por chamada detectada pelo polling de 3s (`/api/queue/status`):

1. Detecção por **diff do histórico** (ids `ticket.id:calledAt` das últimas 10 chamadas), não apenas
   `lastCalled` — chamadas intermediárias dentro da janela de 3s **não são mais perdidas** e a
   repetição intencional (novo `calledAt`) é anunciada corretamente. Entradas já anunciadas são
   marcadas em um Set; no reload do painel o histórico inicial é pré-marcado (sem replay).
2. Notificação: `/notification.mp3` (legado, preservado).
3. Voz (primeira opção): **Web Speech API** (`window.speechSynthesis`) — `pt-BR`, escolha de voz
   entre variantes `pt-BR` → `pt-*` → padrão do navegador; aguarda `voiceschanged` com timeout;
   `rate`/`volume`/`pitch` configuráveis (e persistidos em `localStorage`); fila FIFO interna;
   timeout de 20s; ao final/erro loga e resolve `false`.
4. **Fallback local** (segunda opção): sequência de `.wav` pré-gravados em `public/voice/`
   (ex.: `senha.wav`, `letra-p.wav`, `duzentos.wav`, `e.wav`, `guiche.wav`, `mil.wav` …),
   reproduzidos em ordem via `<audio>`, zero rede, zero API key.

## 31. Fase 2E.1 — ARQUIVOS DE ÁUDIO GERADOS

Os 70 `.wav` do fallback foram **gerados e validados** com espeak-ng em **container temporário**
(`scripts/voice-espeak.Dockerfile` + `scripts/espeak-ng-docker.sh` — nada instalado no sistema
hospedeiro; regeneração: `ESPEAK_NG_BIN=scripts/espeak-ng-docker.sh npm run voice:generate`).

- Formato: WAV RIFF/PCM mono 16-bit 44,1 kHz (suportado por qualquer `<audio>` de navegador/TV).
- Pronúncia verificada por fonemas IPA nos 70 textos; 2 correções pt-BR aplicadas no gerador:
  token `e` (conjunção) sintetizado como `"i"` e `letra-e` sintetizado como `"e"` (detalhes e
  análise de licença GPLv3/saída em `public/voice/README.md`).
- Licença: motor espeak-ng GPL-3.0+ usado como CLI não modificada, sem redistribuição do motor;
  artefatos sintetizados versionados no repositório.
- Inclusão no Docker: `Dockerfile` copia `/app/public` para o standalone (linha 29) — verificado
  por teste estático e por smoke HTTP standalone (`/voice/*.wav` → 200 `audio/wav` com
  `Accept-Ranges`).

## 32. Autoplay e ativação

- Botão **Ativar som** (obrigatório antes do primeiro anúncio) — um gesto do usuário habilita a cadeia
  de áudio; `localStorage['filafacil.audio.enabled']='1'` lembra a preferência entre reloads
  (no reload, o estado fica "aguardando interação" até um clique — o Chrome pode bloquear sem gesto).
- Botão **Testar voz** (anuncia "Voz do painel ativada" ou a sequência `teste` no fallback).
- Indicador discreto no canto superior direito: verde (ativo), âmbar (aguardando interação),
  vermelho (indisponível), cinza (desativado). Não altera o visual geral do painel.
- O chime e a voz tocam a cada chamada **mesmo** se a página estiver em segundo plano, desde que o
  áudio esteja ativado no painel e o navegador permita autoplay (política de cada fabricante/Smart TV).

## 33. Dependências removidas

`genkit`, `genkit-cli`, `@genkit-ai/googleai`, `@genkit-ai/next`, `wav`, `@types/wav`, `patch-package`
— usadas exclusivamente pela síntese de voz do Gemini. Nenhum código Google AI permanece no `src/`
(verificado por teste). `.genkit/` removido do `.gitignore`.

## 34. Comportamento esperado

| Ambiente | Resultado |
|---|---|
| Chrome/Edge (PC/notebook) | Voz via `speechSynthesis` sistema; sem rede; sem custo |
| Smart TV com Web Speech | Mesma voz via sistema (qualidade varia por fabricante) |
| Smart TV sem `speechSynthesis` | Fallback local: sequência dos 70 `.wav` de `public/voice/` (chime + "Senha …") |
| Arquivo de token ausente/corrompido | Sequência aborta; indicador vermelho; erro no console |

Limitações: vozes pt-BR do `speechSynthesis` dependem do navegador/OS; a voz do espeak-ng é
robótica porém inteligível (alternativas documentadas em `public/voice/README.md`); Smart TVs
antigas frequentemente não expõem `speechSynthesis`. **Nenhuma homologação em Smart TV real foi
feita** — os testes cobrem lógica e integridade dos arquivos (19/19), não a reprodução em
hardware.

## 35. Testes

`npm run db:test:voice` — 19 verificações (texto falado, soletração de prefixo, prefixos
compostos, guichê multi-tamanho, dedupe por id+calledAt, repetição, mil/9k/>9999 dígitos, tokens
do manifesto, fallback switch, ausência de Gemini no src, zero URLs externas no código de voz,
gerador consistente, **manifesto íntegro com varredura exaustiva 0–9999/prefixos/guichês,
arquivos existentes e não-vazios sem órfãos, WAV RIFF/PCM mono 16-bit com duração plausível,
Dockerfile copia public/, URLs `/voice/<token>.wav`, reprodução sequencial sem sobreposição com
aborto em falha e chamadas consecutivas, disponibilidade via manifesto (4 cenários de fetch)**).

Total do projeto: 97 testes (13 smoke + 17 serviço + 27 auth + 21 2C + 19 voz) + 7 da Fase 2F
(seção 40) = **104 verificações**.

## 36. Fase 2F — Auditoria de segurança (antes/depois)

`npm audit` antes: **18** (2 críticas, 12 altas, 4 moderadas). Depois: **1** (alta, zod).
Arquivos do comparativo: `/tmp/opencode/audit-{before,mid,post,final}.json`.

Principais advisories corrigidos pelo salto **Next 15.3.3 → 15.5.29** (tag `backport` da linha 15;
`latest` é 16.4.6 — **não migrar para 16** nesta fase): RCE por flight protocol, SSRF no
middleware, Server Actions (DoS e exposição), request smuggling nos rewrites, image optimizer,
cache poisoning e demais GHSA da linha 15.0–15.4. Dependências transitivas corrigidas via
`npm audit fix` (sem `--force`): brace-expansion, nanoid, lodash, fflate, yaml, source-map-js,
@babel/runtime, glob, minimatch, sucrase.

Atualizações cirúrgicas (nenhuma outra major bumpada):

| Pacote | Antes | Depois | Motivo |
|---|---|---|---|
| next | 15.3.3 | 15.5.29 (exato) | 38 advisories fechados; linha 15 preservada |
| react / react-dom | 18.3.1 | 18.3.1 (inalterado) | peer de next@15 aceita `^18.2.0` |
| jspdf | 2.5.2 | ^4.2.1 | advisories críticos (GHSA-x72j-9w5v-j8m4, GHSA-w3jw-8fqc-j6h6) |
| jspdf-autotable | 3.8.4 | ^5.0.9 | peer `jspdf ^2||^3||^4`; API compatível (`UserOptions`, `lastAutoTable.finalY`, default export — verificado em dist) |
| overrides.next.postcss | — | ^8.5.32 | fecha advisory sob `node_modules/next`; exigiu cirurgia no lock (remoção da chave `node_modules/next/node_modules/postcss` + `rm -rf node_modules/next` + `npm install` — não regenerar o lock inteiro) |
| zod | 3.24.2 | 3.24.2 (inalterado) | ver seção 39 |

## 37. Hardening do build (`next.config.ts`)

- Removidos `typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` — build não mascara
  falhas; `tsc --noEmit` e `next build` rodam limpos. **ESLint não está instalado** no repositório
  (decisão avaliada: não adicionar agora — TypeScript estrito + testes cobrem o gap; recomendação
  futura: `eslint-config-next` em fase própria).
- `poweredByHeader: false` (header `X-Powered-By` ausente — verificado via curl).
- `headers()` globais: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
  microphone=(), geolocation=(), payment=()`. HSTS fica a cargo do proxy reverso (Coolify/HTTPS).
- `output: 'standalone'` e `serverExternalPackages: ['better-sqlite3']` inalterados.
- Proteção same-origin das Server Actions permanece na configuração padrão do Next 15
  (sem `serverActions.allowedOrigins` customizado — guardado por teste).

## 38. Revisão da fronteira de confiança

- Guards de autorização em `src/lib/data.ts` + `src/lib/auth/guards.ts` (matriz da seção 27)
  mantidos; papéis sempre lidos da sessão SQLite.
- Validação de entrada: `generateTicket` rejeita `buttonId` fora de `settings.buttons`;
  `updateSettings` é admin-only e numéricos são coercidos (`Math.max(0, Math.trunc(...))`);
  erros retornados ao cliente permanecem genéricos (máscara de detalhe do servidor).
- Rate-limit de login (`login_attempts`) e cookies `httpOnly/sameSite=lax/secure` inalterados
  (cobertos pelos 27 testes de auth).
- Endpoint público `/api/queue/status` expõe apenas estado de fila para o display (sem PII).
- Varredura de segredos: nenhum `.env`, chave ou credencial versionado (`git ls-files` +
  regex AIza/sk-/PRIVATE KEY — limpo).
- **Pendência recomendada (fora do escopo desta fase):** rate-limit no `generateTicket`
  (atualmente público por design do totem; abuso só cria senhas inválidas — sem PII).

## 39. Risco residual

**1 advisory alto restante: `zod <4.6.6` (GHSA-mrhx-c7xc-m3w5).** O fix disponível é major
(`zod@4.6.7`). Decisão: **não migrar** — zod é usado apenas client-side (`login-form.tsx`,
`SettingsClient.tsx` via zodResolver); a única exposição é DoS do próprio cliente (self-DoS).
Migração 3→4 exige revisão de contratos de schema em dois formularios — recomendar como tarefa
próxima, com testes, fora desta fase. Todos os demais advisories (18 → 1) estão fechados.

## 40. Testes da Fase 2F

`npm run db:test:2f` — 7 verificações de regressão: build sem flags de mascaramento, headers de
segurança presentes, piso do Next ≥ 15.5.29 na linha 15, React na linha 18, jspdf ≥ 4.2.1 +
override postcss, zod permanecendo v3 (migração não silenciosa), sem `serverActions.allowedOrigins`.
Suíte completa: **104 verificações** (97 + 7).

Validações executadas: `tsc --noEmit` limpo; `next build` limpo (10 rotas, mesmos tamanhos de
rota); smoke do standalone host (8 rotas 200, `/voice/*.wav` → 200 `audio/wav` RIFF, headers,
SQLite+WAL criado no boot); `docker build -t filafacil-app:2f` + smoke do container (8 rotas 200,
WAV 38266 B, headers, healthcheck OK, migrações 1–3, `journal_mode=wal`) em porta isolada com
container de smoke removido ao final (demais containers intactos).

Nota operacional: o `standalone` exige `public/` e `.next/static/` copiados ao lado de
`server.js` com cwd nessa pasta (o Dockerfile já faz isso — `COPY public`/`COPY static`;
o smoke host replicou o mesmo layout).
