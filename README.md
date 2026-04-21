# Grimorio

Sistema de fichas de RPG com backend em Node.js + TypeScript + Express + Prisma e frontend em HTML/CSS/JS.

## Estrutura

```text
frontend/   interface web publicada no GitHub Pages
backend/    API, autenticacao, regras de negocio e Prisma
render.yaml configuracao do backend para o Render
```

## Backend local

1. Entre em `backend`
2. Instale dependencias com `npm install`
3. Crie `backend/.env` com base em `backend/.env.example`
4. Rode `npm run dev`

## Variaveis de ambiente do backend

Use `backend/.env.example` como modelo.

Obrigatorias:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`

O backend tambem aceita:

- `PORT`
- `NODE_ENV`

## Publicar no GitHub

Antes de subir:

- mantenha `backend/.env` fora do repositório
- confira que `node_modules` e `dist` continuam ignorados
- mantenha `package-lock.json` versionado para deploy reproduzivel

Fluxo comum:

```bash
git init
git add .
git commit -m "Prepare backend for Render deploy"
git branch -M main
git remote add origin SEU_REPOSITORIO_GITHUB
git push -u origin main
```

## Deploy no Render

O projeto ja inclui `render.yaml` na raiz.

### Opcao 1: Blueprint

1. No Render, escolha `New +`
2. Selecione `Blueprint`
3. Conecte o repositório do GitHub
4. O Render vai ler `render.yaml`
5. Preencha as variaveis marcadas com `sync: false`

### Opcao 2: Web Service manual

Se preferir criar manualmente:

- Root Directory: `backend`
- Build Command: `npm install && npm run render-build`
- Start Command: `npm start`
- Health Check Path: `/health`

### Variaveis no Render

Cadastre no painel do serviço:

- `NODE_ENV=production`
- `PORT=10000`
- `FRONTEND_URL`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Prisma no deploy

O script `postinstall` roda `prisma generate` automaticamente.

O build do Render usa:

```bash
npm run render-build
```

Esse script faz:

1. `prisma generate`
2. `tsc`

Se depois voce quiser automatizar migracoes em deploy, a gente pode adicionar isso com cuidado. Por enquanto deixei sem `db push` automatico para nao correr risco no banco de producao.

## Frontend no GitHub Pages

O repositório ja inclui o workflow `.github/workflows/deploy-pages.yml`.

Esse workflow publica automaticamente o conteudo de `frontend/` no GitHub Pages a cada push na `main`.

### Como ativar

1. No GitHub, abra `Settings`
2. Entre em `Pages`
3. Em `Source`, deixe `GitHub Actions`
4. Faça um novo push na `main` se o deploy ainda nao tiver rodado

### URLs de producao

Quando o backend estiver publicado no Render, ajuste:

- `backend` no Render com `FRONTEND_URL` apontando para a URL do GitHub Pages
- `frontend/common.js` com a URL final do backend do Render se o nome do servico for diferente de `https://grimorio-backend.onrender.com`

### Reset de senha em producao

No painel do Supabase, adicione a URL do GitHub Pages em:

- `Authentication`
- `URL Configuration`

Inclua pelo menos:

- a URL raiz do Pages
- `reset-password.html`
