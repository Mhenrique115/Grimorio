import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { supabasePublic } from '../lib/supabase';
import { construirRedirectReset } from '../utils/frontend-url';
import { garantirFichaDoUsuario } from '../services/ficha.service';

export async function login(req: Request, res: Response): Promise<void> {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email e senha sao obrigatorios.' });
    return;
  }

  const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    res.status(401).json({ error: 'Email ou senha incorretos.' });
    return;
  }

  let dbUser = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { id: true, email: true, role: true },
  });

  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        id: data.user.id,
        email: data.user.email!,
        role: 'Jogador',
      },
      select: { id: true, email: true, role: true },
    });
  }

  const ficha = await garantirFichaDoUsuario(dbUser.id, dbUser.email);

  res.json({
    token: data.session.access_token,
    user: dbUser,
    fichaId: ficha.id,
  });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!email) {
    res.status(400).json({ error: 'Informe o email para recuperar a senha.' });
    return;
  }

  const usuarioExistente = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!usuarioExistente) {
    res.status(404).json({ error: 'Email nao encontrado no sistema.' });
    return;
  }

  const { error } = await supabasePublic.auth.resetPasswordForEmail(email, {
    redirectTo: construirRedirectReset(req),
  });

  if (error) {
    res.status(400).json({
      error: error.message || 'Nao foi possivel enviar o email de recuperacao.',
    });
    return;
  }

  res.json({
    message: 'Email encontrado. Enviamos um link para redefinir a senha.',
  });
}
