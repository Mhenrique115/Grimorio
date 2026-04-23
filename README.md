# Grimorio

Sistema de fichas de RPG com frontend estatico em HTML/CSS/JS e backend em Node.js + TypeScript + Express + Prisma.

## Estrutura

```text
frontend/    interface web publicada no GitHub Pages
  assets/    icones e arquivos visuais compartilhados
  styles/    estilos por pagina
  core/      configuracao, auth, http, storage e utilitarios compartilhados
  pages/     entradas por contexto: admin, mestre, ficha e auth
backend/     API, autenticacao, regras de negocio e Prisma
render.yaml  configuracao do backend para o Render
```

## O que o projeto entrega hoje

- login com Supabase Auth
- redefinicao de senha por email
- papeis `Jogador`, `Mestre` e `Admin`
- `1 ficha por usuario`
- criacao automatica da ficha quando o usuario ainda nao tem uma
- construtor de templates com campos fixos, texto, checkbox e calculados
- chat global de giro de dados
- frontend preparado para GitHub Pages
- backend preparado para Render

## Como clonar e rodar localmente

1. Clone o repositorio:

```bash
git clone https://github.com/Mhenrique115/Grimorio.git
cd Grimorio
```

2. Entre em `backend` e instale as dependencias:

```bash
cd backend
npm install
```

3. Crie `backend/.env` com base em `backend/.env.example`

4. Gere o Prisma Client:

```bash
npm run db:generate
```

5. Suba o backend:

```bash
npm run dev
```

6. Abra o frontend com Live Server na pasta `frontend`

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

### Observacao sobre `FRONTEND_URL`

Em producao, use a URL do GitHub Pages.

Exemplo:

```env
FRONTEND_URL=https://mhenrique115.github.io/Grimorio/
```

Se quiser liberar producao e localhost ao mesmo tempo no CORS, pode usar mais de uma origem separada por virgula:

```env
FRONTEND_URL=https://mhenrique115.github.io/Grimorio/,http://localhost:5500,http://127.0.0.1:5500
```

## Scripts uteis do backend

```bash
npm run dev
npm run build
npm run start
npm run db:generate
npm run db:push
npm run db:studio
```

## Deploy do backend no Render

O projeto ja inclui `render.yaml` na raiz.

### Opcao 1: Blueprint

1. No Render, escolha `New +`
2. Selecione `Blueprint`
3. Conecte o repositorio do GitHub
4. O Render vai ler `render.yaml`
5. Preencha as variaveis marcadas com `sync: false`

### Opcao 2: Web Service manual

Se preferir criar manualmente:

- Root Directory: `backend`
- Build Command: `npm install --include=dev && npm run render-build`
- Start Command: `npm start`
- Health Check Path: `/health`

### Variaveis no Render

Cadastre no painel do servico:

- `NODE_ENV=production`
- `PORT=10000`
- `FRONTEND_URL`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Build no Render

O deploy usa:

```bash
npm run render-build
```

Esse script faz:

1. `prisma generate`
2. `tsc`

Nao foi configurado `db push` automatico em deploy.

## Frontend no GitHub Pages

O repositorio inclui o workflow:

```text
.github/workflows/deploy-pages.yml
```

Esse workflow publica automaticamente o conteudo de `frontend/` no GitHub Pages a cada push na `main`.

### Como ativar

1. No GitHub, abra `Settings`
2. Entre em `Pages`
3. Em `Source`, escolha `GitHub Actions`
4. Aguarde o workflow rodar ou faca um novo push na `main`

## URL da API no frontend

O frontend usa `frontend/common.js` para decidir a API:

- `localhost` e `127.0.0.1` usam `http://localhost:3333`
- producao usa `https://grimorio-backend.onrender.com`

Se a URL publica do backend mudar, atualize `frontend/common.js`.

## Reset de senha em producao

No painel do Supabase, ajuste:

1. `Authentication`
2. `URL Configuration`

Configure:

- `Site URL`
- `Redirect URLs`

Inclua pelo menos:

- `https://mhenrique115.github.io/Grimorio/`
- `https://mhenrique115.github.io/Grimorio/login.html`
- `https://mhenrique115.github.io/Grimorio/reset-password.html`

## Observacoes

- o favicon SVG do projeto fica em `frontend/assets/icons/favicon.svg`
- `backend/.env` nao deve ir para o repositorio
- `node_modules` e `dist` continuam ignorados
