# DropVault

DropVault is a production-oriented temporary file-sharing platform engineered with a decoupled monorepo architecture.

## Architecture

- **`apps/web`**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **`apps/api`**: Node.js, Express.js, TypeScript, Helmet, CORS, Centralized Error Handling, Zod validation
- **`apps/api/prisma`**: Prisma ORM configured for PostgreSQL
- **`packages`**: Reserved for shared types and schemas

---

## Prerequisites

- Node.js >= 18 (Tested on v26.7.0)
- npm >= 9 (Workspaces support)
- PostgreSQL database instance

---

## Getting Started

### 1. Install Dependencies
Run the install command from the root directory:
```bash
npm install
```

### 2. Configure Environment Variables

**Backend (`apps/api`):**
```bash
cp apps/api/.env.example apps/api/.env
```
Update `apps/api/.env`:
```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://dropvault_user:dropvault_password@localhost:5432/dropvault?schema=public
```

**Frontend (`apps/web`):**
```bash
cp apps/web/.env.example apps/web/.env.local
```
Update `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

> **Security Note:** Environment files containing credentials (`.env`, `.env.local`) are ignored by Git. Never commit production secrets.

### 3. Generate Prisma Client
```bash
npm run prisma:generate --workspace=apps/api
```

---

## Running in Development

### Run Backend API
```bash
npm run dev:api
```
The API starts on `http://localhost:4000`. Test the health endpoint:
```bash
curl http://localhost:4000/api/health
```

### Run Frontend Web App
```bash
npm run dev:web
```
The Next.js app starts on `http://localhost:3000`. Open your browser to view the DropVault landing page and live backend health monitor.

---

## Verification & Typechecks

Run strict TypeScript checks across the entire monorepo:
```bash
npm run typecheck
```

Build production artifacts:
```bash
npm run build:api
npm run build:web
```

---

## Project Status

- **Phase 1 (Complete)**: Monorepo setup, modular Express API with health check, request validation, CORS, graceful shutdown, Next.js frontend with live connectivity status, and baseline Prisma schema configuration.
- **Phase 2 (Upcoming)**: Database schema modeling, migrations, and storage abstraction.
