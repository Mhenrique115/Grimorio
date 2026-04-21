import { NextFunction, Response } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../lib/prisma';

const rollSchema = z.object({
  quantidade: z.number().int().min(1).max(10),
  faces: z.number().int().refine((value) => [4, 6, 8, 10, 12, 14, 16, 18, 20].includes(value), {
    message: 'Faces de dado invalida.',
  }),
});

const configSchema = z.object({
  chatRetentionDays: z.number().int().min(1).max(30),
});

const CHAT_LIST_LIMIT = 80;

async function getChatConfig() {
  return prisma.appConfig.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      chatRetentionDays: 2,
    },
  });
}

async function cleanupChat(): Promise<{ chatRetentionDays: number }> {
  const config = await getChatConfig();
  const cutoff = new Date(Date.now() - config.chatRetentionDays * 24 * 60 * 60 * 1000);

  await prisma.diceRoll.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });

  return { chatRetentionDays: config.chatRetentionDays };
}

function gerarResultados(quantidade: number, faces: number): number[] {
  return Array.from({ length: quantidade }, () => Math.floor(Math.random() * faces) + 1);
}

function formatarExpressao(quantidade: number, faces: number): string {
  return quantidade === 1 ? `D${faces}` : `${quantidade}xD${faces}`;
}

function mapRoll(roll: {
  id: string;
  quantidade: number;
  faces: number;
  resultados: number[];
  total: number;
  expressao: string;
  createdAt: Date;
  roleSnapshot: Role;
  user: { id: string; email: string; fichas?: { nomePersonagem: string }[] };
}) {
  const nomePersonagem = roll.user.fichas?.[0]?.nomePersonagem || null;

  return {
    id: roll.id,
    quantidade: roll.quantidade,
    faces: roll.faces,
    resultados: roll.resultados,
    total: roll.total,
    expressao: roll.expressao,
    createdAt: roll.createdAt,
    roleSnapshot: roll.roleSnapshot,
    user: {
      id: roll.user.id,
      email: roll.user.email,
      nomePersonagem,
    },
  };
}

export async function listarDiceRolls(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = await cleanupChat();

    const rolls = await prisma.diceRoll.findMany({
      orderBy: { createdAt: 'desc' },
      take: CHAT_LIST_LIMIT,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fichas: {
              select: {
                nomePersonagem: true,
              },
              take: 1,
              orderBy: {
                updatedAt: 'desc',
              },
            },
          },
        },
      },
    });

    res.json({
      data: {
        retentionDays: config.chatRetentionDays,
        rolls: rolls.reverse().map(mapRoll),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function criarDiceRoll(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parse = rollSchema.safeParse(req.body);

    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() });
      return;
    }

    const config = await cleanupChat();
    const { quantidade, faces } = parse.data;
    const resultados = gerarResultados(quantidade, faces);
    const total = resultados.reduce((sum, current) => sum + current, 0);
    const expressao = formatarExpressao(quantidade, faces);

    const roll = await prisma.diceRoll.create({
      data: {
        userId: req.user!.id,
        roleSnapshot: req.user!.role,
        quantidade,
        faces,
        resultados,
        total,
        expressao,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fichas: {
              select: {
                nomePersonagem: true,
              },
              take: 1,
              orderBy: {
                updatedAt: 'desc',
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      message: 'Dado girado com sucesso.',
      data: {
        retentionDays: config.chatRetentionDays,
        roll: mapRoll(roll),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function limparDiceRolls(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await prisma.diceRoll.deleteMany({});

    res.json({
      message: 'Historico do giro de dados limpo com sucesso.',
    });
  } catch (err) {
    next(err);
  }
}

export async function obterChatConfig(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = await getChatConfig();
    res.json({ data: config });
  } catch (err) {
    next(err);
  }
}

export async function atualizarChatConfig(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parse = configSchema.safeParse(req.body);

    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() });
      return;
    }

    const config = await prisma.appConfig.upsert({
      where: { id: 'global' },
      update: { chatRetentionDays: parse.data.chatRetentionDays },
      create: { id: 'global', chatRetentionDays: parse.data.chatRetentionDays },
    });

    res.json({
      message: 'Configuracao do chat atualizada com sucesso.',
      data: config,
    });
  } catch (err) {
    next(err);
  }
}
