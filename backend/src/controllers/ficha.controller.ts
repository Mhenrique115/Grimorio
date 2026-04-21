import { Response, NextFunction } from 'express';
import { TipoCampo } from '@prisma/client';
import { AuthenticatedRequest, assertOwnerOnly, assertOwnerOrMestre } from '../middlewares/auth.middleware';
import { recalcularFicha, recalcularFichaComValoresAtuais } from '../services/formula.service';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { garantirFichaDoUsuario } from '../services/ficha.service';

const patchValorSchema = z.object({
  templateId: z.string().uuid('templateId deve ser um UUID valido.'),
  valorBase: z
    .number({ invalid_type_error: 'valorBase deve ser um numero.' })
    .int('valorBase deve ser um inteiro.')
    .min(-10, 'valorBase nao pode ser menor que -10.')
    .max(100, 'valorBase nao pode exceder 100.'),
});

const patchTextoSchema = z.object({
  templateId: z.string().uuid(),
  valorTexto: z.string().max(5000, 'Texto muito longo (max 5000 caracteres).'),
});

const patchBoolSchema = z.object({
  templateId: z.string().uuid(),
  valorBooleano: z.boolean(),
});

const fichaSchema = z.object({
  userId: z.string().uuid().optional(),
  nomePersonagem: z.string().min(1).max(100),
  dataNascimento: z.string().optional(),
  idade: z.number().int().min(-10).max(100).optional(),
  residencia: z.string().max(200).optional(),
  classe: z.string().max(100).optional(),
  nomeJogador: z.string().max(100).optional(),
});

const fichaUpdateSchema = z.object({
  nomePersonagem: z.string().min(1).max(100).optional(),
  dataNascimento: z.string().nullable().optional(),
  idade: z.number().int().min(-10).max(100).nullable().optional(),
  residencia: z.string().max(200).nullable().optional(),
  classe: z.string().max(100).nullable().optional(),
  nomeJogador: z.string().max(100).nullable().optional(),
});

export async function getFicha(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const ficha = await prisma.ficha.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, role: true } },
        valoresCampo: {
          include: {
            template: {
              select: {
                id: true,
                nome: true,
                label: true,
                tipo: true,
                categoria: true,
                formulaLogica: true,
                descricao: true,
                ordem: true,
              },
            },
          },
          orderBy: { template: { ordem: 'asc' } },
        },
      },
    });

    if (!ficha) {
      res.status(404).json({ error: 'Ficha nao encontrada.' });
      return;
    }

    assertOwnerOrMestre(req, ficha.userId);
    await recalcularFichaComValoresAtuais(ficha.id);

    const templatesAtivos = await prisma.templateCampo.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        label: true,
        tipo: true,
        categoria: true,
        formulaLogica: true,
        descricao: true,
        ordem: true,
      },
      orderBy: { ordem: 'asc' },
    });

    const valoresPorTemplateId = new Map(
      ficha.valoresCampo.map((valor) => [valor.templateId, valor])
    );

    const valoresCampoCompletos = templatesAtivos.map((template) => {
      const valorExistente = valoresPorTemplateId.get(template.id);
      if (valorExistente) {
        return valorExistente;
      }

      return {
        id: `template-${template.id}`,
        fichaId: ficha.id,
        templateId: template.id,
        valorBase: template.tipo === TipoCampo.Fixo || template.tipo === TipoCampo.Calculado ? 0 : null,
        valorMetade: template.tipo === TipoCampo.Fixo || template.tipo === TipoCampo.Calculado ? 0 : null,
        valorQuinto: template.tipo === TipoCampo.Fixo || template.tipo === TipoCampo.Calculado ? 0 : null,
        valorTexto: null,
        valorBooleano: false,
        createdAt: null,
        updatedAt: null,
        template,
      };
    });

    res.json({
      data: {
        ...ficha,
        valoresCampo: valoresCampoCompletos,
      },
    });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
}

export async function getMinhaFicha(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ficha = await garantirFichaDoUsuario(req.user!.id, req.user!.email);

    res.json({ data: ficha });
  } catch (err) {
    next(err);
  }
}

export async function patchValorCampo(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: fichaId } = req.params;

    const ficha = await prisma.ficha.findUnique({
      where: { id: fichaId },
      select: { id: true, userId: true },
    });

    if (!ficha) {
      res.status(404).json({ error: 'Ficha nao encontrada.' });
      return;
    }

    assertOwnerOnly(req, ficha.userId);

    const { templateId } = req.body;

    if (!templateId) {
      res.status(400).json({ error: 'templateId e obrigatorio.' });
      return;
    }

    const template = await prisma.templateCampo.findUnique({
      where: { id: templateId },
    });

    if (!template || !template.ativo) {
      res.status(404).json({ error: 'Campo de template nao encontrado ou inativo.' });
      return;
    }

    if (template.tipo === TipoCampo.Calculado) {
      res.status(422).json({
        error: 'Campos calculados sao somente-leitura. Seu valor e determinado pelo servidor.',
      });
      return;
    }

    switch (template.tipo) {
      case TipoCampo.Fixo: {
        const parse = patchValorSchema.safeParse(req.body);
        if (!parse.success) {
          res.status(400).json({ error: parse.error.flatten() });
          return;
        }

        const { valorBase } = parse.data;
        const valoresAtualizados = await recalcularFicha(fichaId, templateId, valorBase);

        res.json({
          message: 'Campo atualizado e dependentes recalculados.',
          data: {
            fichaId,
            templateIdAtualizado: templateId,
            valoresAtualizados,
          },
        });
        break;
      }

      case TipoCampo.Textarea: {
        const parse = patchTextoSchema.safeParse(req.body);
        if (!parse.success) {
          res.status(400).json({ error: parse.error.flatten() });
          return;
        }

        const valorAtualizado = await prisma.valorCampo.upsert({
          where: {
            ficha_campo_unico: { fichaId, templateId },
          },
          create: { fichaId, templateId, valorTexto: parse.data.valorTexto },
          update: { valorTexto: parse.data.valorTexto },
        });

        res.json({ message: 'Campo de texto atualizado.', data: valorAtualizado });
        break;
      }

      case TipoCampo.Checkbox: {
        const parse = patchBoolSchema.safeParse(req.body);
        if (!parse.success) {
          res.status(400).json({ error: parse.error.flatten() });
          return;
        }

        const valorAtualizado = await prisma.valorCampo.upsert({
          where: {
            ficha_campo_unico: { fichaId, templateId },
          },
          create: { fichaId, templateId, valorBooleano: parse.data.valorBooleano },
          update: { valorBooleano: parse.data.valorBooleano },
        });

        res.json({ message: 'Checkbox atualizado.', data: valorAtualizado });
        break;
      }

      default:
        res.status(400).json({ error: 'Tipo de campo desconhecido.' });
    }
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
}

export async function criarFicha(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parse = fichaSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() });
      return;
    }

    const userIdAlvo = req.user!.role === 'Admin' && parse.data.userId
      ? parse.data.userId
      : req.user!.id;

    const fichaExistente = await prisma.ficha.findFirst({
      where: { userId: userIdAlvo },
      select: { id: true },
    });

    if (fichaExistente) {
      res.status(409).json({ error: 'Este usuario ja possui uma ficha cadastrada.' });
      return;
    }

    const ficha = await prisma.ficha.create({
      data: {
        userId: userIdAlvo,
        nomePersonagem: parse.data.nomePersonagem,
        idade: parse.data.idade,
        residencia: parse.data.residencia,
        classe: parse.data.classe,
        nomeJogador: parse.data.nomeJogador,
        dataNascimento: parse.data.dataNascimento
          ? new Date(parse.data.dataNascimento)
          : undefined,
      },
    });

    res.status(201).json({ message: 'Ficha criada com sucesso.', data: ficha });
  } catch (err) {
    next(err);
  }
}

export async function atualizarFicha(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const parse = fichaUpdateSchema.safeParse(req.body);

    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() });
      return;
    }

    const ficha = await prisma.ficha.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!ficha) {
      res.status(404).json({ error: 'Ficha nao encontrada.' });
      return;
    }

    assertOwnerOnly(req, ficha.userId);

    const data = {
      ...parse.data,
      dataNascimento: parse.data.dataNascimento === undefined
        ? undefined
        : parse.data.dataNascimento === null || parse.data.dataNascimento === ''
          ? null
          : new Date(parse.data.dataNascimento),
    };

    const fichaAtualizada = await prisma.ficha.update({
      where: { id },
      data,
    });

    res.json({ message: 'Ficha atualizada com sucesso.', data: fichaAtualizada });
  } catch (err) {
    next(err);
  }
}

export async function listarFichas(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const fichas = await prisma.ficha.findMany({
      select: {
        id: true,
        nomePersonagem: true,
        classe: true,
        nomeJogador: true,
        user: { select: { email: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ data: fichas });
  } catch (err) {
    next(err);
  }
}
