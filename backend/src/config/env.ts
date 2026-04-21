import fs from 'fs';
import path from 'path';
import { z } from 'zod';

function carregarEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const rawEnv = fs.readFileSync(envPath, 'utf-8');
  const linhas = rawEnv.split(/\r?\n/);

  for (const linha of linhas) {
    const texto = linha.trim();

    if (!texto || texto.startsWith('#')) {
      continue;
    }

    const separadorIndex = texto.indexOf('=');
    if (separadorIndex <= 0) {
      continue;
    }

    const chave = texto.slice(0, separadorIndex).trim();
    const valorBruto = texto.slice(separadorIndex + 1).trim();
    const valorSemAspas = valorBruto.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    if (!process.env[chave]) {
      process.env[chave] = valorSemAspas;
    }
  }
}

carregarEnvLocal();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  FRONTEND_URL: z.string().optional(),
  SUPABASE_URL: z.string().url('SUPABASE_URL invalida.'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY obrigatoria.'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Falha ao validar variaveis de ambiente.', parsedEnv.error.flatten().fieldErrors);
  throw new Error('Variaveis de ambiente invalidas.');
}

function getFrontendOrigins(frontendUrl?: string): string[] {
  if (frontendUrl) {
    return frontendUrl
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return ['http://127.0.0.1:5500', 'http://localhost:5500'];
}

export const env = {
  ...parsedEnv.data,
  FRONTEND_ORIGINS: getFrontendOrigins(parsedEnv.data.FRONTEND_URL),
};
