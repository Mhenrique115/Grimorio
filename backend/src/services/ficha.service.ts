import { prisma } from '../lib/prisma';

export async function garantirFichaDoUsuario(userId: string, email: string): Promise<{ id: string }> {
  const fichaExistente = await prisma.ficha.findFirst({
    where: { userId },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (fichaExistente) {
    return fichaExistente;
  }

  const nomeBase = email.split('@')[0]?.trim() || 'Aventureiro';

  try {
    return await prisma.ficha.create({
      data: {
        userId,
        nomePersonagem: nomeBase.slice(0, 100),
        nomeJogador: email.slice(0, 100),
      },
      select: { id: true },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      const fichaCriada = await prisma.ficha.findFirst({
        where: { userId },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (fichaCriada) {
        return fichaCriada;
      }
    }

    throw err;
  }
}
