# FilaFácil

Sistema de gerenciamento de filas (senhas de atendimento) com emissão pública, chamada por guichê,
painel de exibição e dashboard administrativo. Next.js 15 + SQLite (WAL) + sessões locais (Argon2id).

## Requisitos

- Node.js 22

## Desenvolvimento

```bash
npm ci
npm run dev          # http://localhost:9002
```

`SQLITE_PATH` define o arquivo do banco (padrão `./data/filafacil.db`, gitignored).
O schema é aplicado automaticamente na primeira execução (migrações idempotentes).

## Primeiro administrador (manual)

```bash
npm run auth:create-admin
```

Exige terminal interativo; cria o primeiro admin apenas em banco vazio.

## Scripts

- `npm run typecheck` — TypeScript
- `npm run db:test` / `db:test:services` / `db:test:auth` / `db:test:2c` — suítes automatizadas
- `npm run auth:reset-password` — redefinição manual de senha

## Deploy

Ver `docs/deploy-coolify.md` (Docker + Coolify, volume `/data`, HTTPS, backup e rollback).
