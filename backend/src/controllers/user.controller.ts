import { randomBytes } from 'crypto';
import { Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../lib/prisma';
import { getSupabaseAdmin, supabasePublic } from '../lib/supabase';
import { construirRedirectReset } from '../utils/frontend-url';

const createUserSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role).default(Role.Jogador),
  sendPasswordReset: z.boolean().optional().default(true),
});

function gerarSenhaTemporaria(): string {
  return `Tmp!${randomBytes(12).toString('hex')}`;
}

async function enviarRecuperacaoSenha(email: string, req: AuthenticatedRequest): Promise<void> {
  const { error } = await supabasePublic.auth.resetPasswordForEmail(email, {
    redirectTo: construirRedirectReset(req),
  });

  if (error) {
    const err = new Error(error.message || 'Nao foi possivel enviar o email de recuperacao.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }
}

export async function listarUsuarios(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: users });
  } catch (err) {
    next(err);
  }
}

export async function criarUsuario(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parse = createUserSchema.safeParse(req.body);

    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() });
      return;
    }

    const email = parse.data.email.trim().toLowerCase();
    const role = parse.data.role;
    const sendPasswordReset = parse.data.sendPasswordReset;

    const usuarioExistente = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (usuarioExistente) {
      res.status(409).json({ error: 'Ja existe um usuario com este email.' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const senhaTemporaria = gerarSenhaTemporaria();

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senhaTemporaria,
      email_confirm: true,
      user_metadata: {
        criado_por_admin: true,
      },
    });

    if (error || !data.user) {
      res.status(400).json({
        error: error?.message || 'Nao foi possivel criar o usuario no Supabase.',
      });
      return;
    }

    try {
      const user = await prisma.user.create({
        data: {
          id: data.user.id,
          email,
          role,
        },
        select: { id: true, email: true, role: true, createdAt: true },
      });

      if (sendPasswordReset) {
        await enviarRecuperacaoSenha(email, req);
      }

      res.status(201).json({
        message: sendPasswordReset
          ? 'Usuario criado com sucesso e email de redefinicao enviado.'
          : 'Usuario criado com sucesso.',
        data: user,
      });
    } catch (dbErr) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
}

export async function atualizarRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const schema = z.object({ role: z.nativeEnum(Role) });
    const parse = schema.safeParse(req.body);

    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() });
      return;
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role: parse.data.role },
      select: { id: true, email: true, role: true },
    });

    res.json({ message: 'Cargo atualizado com sucesso.', data: user });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Usuario nao encontrado.' });
      return;
    }

    next(err);
  }
}

export async function enviarResetSenhaUsuario(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario nao encontrado.' });
      return;
    }

    await enviarRecuperacaoSenha(user.email, req);

    res.json({
      message: 'Email de redefinicao enviado com sucesso.',
      data: { id: user.id, email: user.email },
    });
  } catch (err) {
    next(err);
  }
}
