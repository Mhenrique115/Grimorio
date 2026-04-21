import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { supabaseVerifier } from '../lib/supabase';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
  };
}

function hasRole(req: AuthenticatedRequest, ...roles: Role[]): boolean {
  return !!req.user && roles.includes(req.user.role);
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Token de autenticacao ausente ou malformado.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data, error } = await supabaseVerifier.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token invalido ou expirado.',
      });
      return;
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: data.user.id },
      select: { id: true, email: true, role: true },
    });

    if (!dbUser) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Usuario nao encontrado no sistema. Contate o Administrador.',
      });
      return;
    }

    req.user = dbUser;
    next();
  } catch (err) {
    console.error('[authenticate] Erro inesperado:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!hasRole(req, Role.Admin)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Esta acao requer permissao de Administrador.',
    });
    return;
  }

  next();
}

export function requireMestre(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!hasRole(req, Role.Admin, Role.Mestre)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Esta acao requer permissao de Mestre ou superior.',
    });
    return;
  }

  next();
}

export function requireJogador(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Autenticacao necessaria.',
    });
    return;
  }

  next();
}

export function requireAdminOrJogador(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!hasRole(req, Role.Admin, Role.Jogador)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Esta acao requer permissao de Jogador ou Administrador.',
    });
    return;
  }

  next();
}

export function assertOwnerOrMestre(
  req: AuthenticatedRequest,
  resourceOwnerId: string
): void {
  const user = req.user!;
  const isElevated = user.role === Role.Admin || user.role === Role.Mestre;
  const isOwner = user.id === resourceOwnerId;

  if (!isElevated && !isOwner) {
    const err = new Error('Acesso negado: voce nao e o dono deste recurso.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
}

export function assertOwnerOnly(
  req: AuthenticatedRequest,
  resourceOwnerId: string
): void {
  const user = req.user!;
  const isAdmin = user.role === Role.Admin;
  const isOwner = user.id === resourceOwnerId;

  if (!isAdmin && !isOwner) {
    const err = new Error('Acesso negado: apenas o dono pode modificar este recurso.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
}
