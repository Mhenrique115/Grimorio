import { Response, NextFunction } from 'express';
import { TipoCampo, CategoriaCampo } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { recalcularFichaComValoresAtuais, validarFormula } from '../services/formula.service';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const NOMES_RESERVADOS_FORMULA = new Set(['SE', 'E', 'OU', 'round', 'if', 'and', 'or']);

const templateSchema = z.object({
  nome: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[\p{L}\p{N}_]+$/u, 'Nome deve ser alfanumerico (usado em formulas, sem espacos).'),
  label: z.string().min(1).max(100),
  tipo: z.nativeEnum(TipoCampo),
  categoria: z.nativeEnum(CategoriaCampo),
  formulaLogica: z.string().max(500).optional().nullable(),
  descricao: z.string().max(300).optional().nullable(),
  ordem: z.number().int().default(0),
});

function validarNomeReservado(nome: string | undefined): string | null {
  if (!nome) return null;
  return NOMES_RESERVADOS_FORMULA.has(nome)
    ? `O nome "${nome}" e reservado pelo construtor de formulas. Escolha outro identificador.`
    : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function substituirReferenciaFormula(
  formula: string,
  nomeAntigo: string,
  nomeNovo: string
): string {
  const regex = new RegExp(`\\b${escapeRegExp(nomeAntigo)}\\b`, 'g');
  return formula.replace(regex, nomeNovo);
}

function getValorInicialPorTipo(tipo: TipoCampo) {
  if (tipo === TipoCampo.Fixo || tipo === TipoCampo.Calculado) {
    return {
      valorBase: 0,
      valorMetade: 0,
      valorQuinto: 0,
      valorTexto: null,
      valorBooleano: null,
    };
  }

  if (tipo === TipoCampo.Checkbox) {
    return {
      valorBase: null,
      valorMetade: null,
      valorQuinto: null,
      valorTexto: null,
      valorBooleano: false,
    };
  }

  return {
    valorBase: null,
    valorMetade: null,
    valorQuinto: null,
    valorTexto: null,
    valorBooleano: null,
  };
}

async function propagarTemplateParaFichasExistentes(templateId: string, tipo: TipoCampo): Promise<void> {
  const fichas = await prisma.ficha.findMany({
    select: { id: true },
  });

  if (!fichas.length) return;

  const valorInicial = getValorInicialPorTipo(tipo);

  await prisma.valorCampo.createMany({
    data: fichas.map((ficha) => ({
      fichaId: ficha.id,
      templateId,
      ...valorInicial,
    })),
    skipDuplicates: true,
  });

  if (tipo === TipoCampo.Calculado) {
    await Promise.all(
      fichas.map((ficha) => recalcularFichaComValoresAtuais(ficha.id))
    );
  }
}

async function validarFormulaCalculada(
  formulaLogica: string | null | undefined,
  templateIdIgnorado?: string
): Promise<string | null> {
  if (!formulaLogica) {
    return 'Campos calculados exigem uma formulaLogica.';
  }

  const nomes = await prisma.templateCampo.findMany({
    where: {
      ativo: true,
      tipo: { in: [TipoCampo.Fixo, TipoCampo.Calculado] },
      ...(templateIdIgnorado ? { id: { not: templateIdIgnorado } } : {}),
    },
    select: { nome: true },
  });

  const { valida, erro } = validarFormula(
    formulaLogica,
    nomes.map((n) => n.nome)
  );

  return valida ? null : `Formula invalida: ${erro}`;
}

export async function listarTemplates(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const templates = await prisma.templateCampo.findMany({
      where: { ativo: true },
      orderBy: [{ categoria: 'asc' }, { ordem: 'asc' }],
    });
    res.json({ data: templates });
  } catch (err) {
    next(err);
  }
}

export async function criarTemplate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parse = templateSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() });
      return;
    }

    const dados = parse.data;
    const erroNomeReservado = validarNomeReservado(dados.nome);
    if (erroNomeReservado) {
      res.status(400).json({ error: erroNomeReservado });
      return;
    }

    if (dados.tipo === TipoCampo.Calculado) {
      const erroFormula = await validarFormulaCalculada(dados.formulaLogica);
      if (erroFormula) {
        res.status(400).json({ error: erroFormula });
        return;
      }
    }

    const template = await prisma.templateCampo.create({ data: dados });
    await propagarTemplateParaFichasExistentes(template.id, template.tipo);
    res.status(201).json({ message: 'Template criado.', data: template });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: `Nome de campo "${req.body.nome}" ja existe.` });
      return;
    }
    next(err);
  }
}

export async function atualizarTemplate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const parse = templateSchema.partial().safeParse(req.body);

    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() });
      return;
    }

    const atual = await prisma.templateCampo.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        tipo: true,
        formulaLogica: true,
      },
    });

    if (!atual) {
      res.status(404).json({ error: 'Template nao encontrado.' });
      return;
    }

    const dadosAtualizados = {
      ...parse.data,
      tipo: parse.data.tipo ?? atual.tipo,
      formulaLogica: parse.data.formulaLogica !== undefined
        ? parse.data.formulaLogica
        : atual.formulaLogica,
    };
    const erroNomeReservado = validarNomeReservado(parse.data.nome);
    if (erroNomeReservado) {
      res.status(400).json({ error: erroNomeReservado });
      return;
    }

    if (dadosAtualizados.tipo === TipoCampo.Calculado) {
      const erroFormula = await validarFormulaCalculada(dadosAtualizados.formulaLogica, id);
      if (erroFormula) {
        res.status(400).json({ error: erroFormula });
        return;
      }
    }

    const nomeMudou = !!parse.data.nome && parse.data.nome !== atual.nome;

    const template = await prisma.$transaction(async (tx) => {
      if (nomeMudou) {
        const dependentes = await tx.templateCampo.findMany({
          where: {
            ativo: true,
            tipo: TipoCampo.Calculado,
            id: { not: id },
            formulaLogica: { contains: atual.nome },
          },
          select: { id: true, formulaLogica: true },
        });

        for (const dependente of dependentes) {
          if (!dependente.formulaLogica) continue;

          const novaFormula = substituirReferenciaFormula(
            dependente.formulaLogica,
            atual.nome,
            parse.data.nome!
          );

          const erroFormulaDependente = await validarFormulaCalculada(novaFormula, dependente.id);
          if (erroFormulaDependente) {
            throw new Error('Nao foi possivel renomear o campo porque uma formula dependente ficaria invalida.');
          }

          await tx.templateCampo.update({
            where: { id: dependente.id },
            data: { formulaLogica: novaFormula },
          });
        }
      }

      return tx.templateCampo.update({
        where: { id },
        data: parse.data,
      });
    });

    res.json({ message: 'Template atualizado.', data: template });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Template nao encontrado.' });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: `Nome de campo "${req.body.nome}" ja existe.` });
      return;
    }
    if (err.message) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
}

export async function desativarTemplate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const template = await prisma.templateCampo.findUnique({
      where: { id },
      select: { id: true, nome: true },
    });

    if (!template) {
      res.status(404).json({ error: 'Template nao encontrado.' });
      return;
    }

    const dependente = await prisma.templateCampo.findFirst({
      where: {
        ativo: true,
        tipo: TipoCampo.Calculado,
        id: { not: id },
        formulaLogica: { contains: template.nome },
      },
      select: { label: true },
    });

    if (dependente) {
      res.status(409).json({
        error: `O campo esta sendo usado na formula de "${dependente.label}". Ajuste essa formula antes de excluir.`,
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.valorCampo.deleteMany({
        where: { templateId: id },
      });

      await tx.templateCampo.delete({
        where: { id },
      });
    });

    res.json({ message: 'Template excluido definitivamente do banco.' });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Template nao encontrado.' });
      return;
    }
    next(err);
  }
}
