import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import {
  authenticate,
  requireAdmin,
  requireAdminOrJogador,
  requireJogador,
  requireMestre,
} from './middlewares/auth.middleware';
import { login, forgotPassword } from './controllers/auth.controller';
import {
  listarUsuarios,
  criarUsuario,
  atualizarRole,
  enviarResetSenhaUsuario,
} from './controllers/user.controller';
import {
  getFicha,
  getMinhaFicha,
  patchValorCampo,
  criarFicha,
  atualizarFicha,
  listarFichas,
} from './controllers/ficha.controller';
import {
  listarDiceRolls,
  criarDiceRoll,
  limparDiceRolls,
  obterChatConfig,
  atualizarChatConfig,
} from './controllers/chat.controller';
import {
  listarTemplates,
  criarTemplate,
  atualizarTemplate,
  desativarTemplate,
} from './controllers/template.controller';

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (env.FRONTEND_ORIGINS.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('Origem nao permitida pelo CORS.'));
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/auth/login', login);
  app.post('/auth/forgot-password', forgotPassword);

  app.get('/users', authenticate, requireAdmin, listarUsuarios);
  app.post('/users', authenticate, requireAdmin, criarUsuario);
  app.patch('/users/:id/role', authenticate, requireAdmin, atualizarRole);
  app.post('/users/:id/send-reset', authenticate, requireAdmin, enviarResetSenhaUsuario);

  app.get('/templates', authenticate, requireMestre, listarTemplates);
  app.post('/templates', authenticate, requireAdmin, criarTemplate);
  app.patch('/templates/:id', authenticate, requireAdmin, atualizarTemplate);
  app.delete('/templates/:id', authenticate, requireAdmin, desativarTemplate);

  app.get('/fichas', authenticate, requireMestre, listarFichas);
  app.post('/fichas', authenticate, requireAdminOrJogador, criarFicha);
  app.get('/fichas/minha', authenticate, requireJogador, getMinhaFicha);
  app.get('/fichas/:id', authenticate, requireJogador, getFicha);
  app.patch('/fichas/:id', authenticate, requireJogador, atualizarFicha);
  app.patch('/fichas/:id/valores', authenticate, requireJogador, patchValorCampo);

  app.get('/chat/rolls', authenticate, requireJogador, listarDiceRolls);
  app.post('/chat/rolls', authenticate, requireJogador, criarDiceRoll);
  app.delete('/chat/rolls', authenticate, requireAdmin, limparDiceRolls);
  app.get('/chat/config', authenticate, requireJogador, obterChatConfig);
  app.patch('/chat/config', authenticate, requireAdmin, atualizarChatConfig);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[GlobalError]', err);
    const status = err.statusCode || err.status || 500;

    res.status(status).json({
      error: status >= 500 ? 'Erro interno do servidor.' : err.message,
    });
  });

  return app;
}

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`RPG Backend rodando na porta ${env.PORT}`);
});

export default app;
