import { create, all, MathJsInstance, MathNode } from 'mathjs';
import { Prisma, TipoCampo, TemplateCampo } from '@prisma/client';
import { prisma } from '../lib/prisma';

const math: MathJsInstance = create(all);
const LIMITE_MAXIMO_CAMPO = 100;
const LIMITE_MINIMO_CAMPO = -10;

const FUNCOES_BLOQUEADAS = new Set(['import', 'createUnit', 'evaluate']);

interface ValorResolvido {
  templateId: string;
  nome: string;
  valorBase: number;
  valorMetade: number;
  valorQuinto: number;
}

function normalizarResultadoNumerico(resultado: unknown): number | null {
  if (typeof resultado === 'number') {
    return Number.isFinite(resultado) ? resultado : null;
  }

  if (
    resultado &&
    typeof resultado === 'object' &&
    'toNumber' in resultado &&
    typeof (resultado as { toNumber: () => number }).toNumber === 'function'
  ) {
    const convertido = (resultado as { toNumber: () => number }).toNumber();
    return Number.isFinite(convertido) ? convertido : null;
  }

  if (
    resultado &&
    typeof resultado === 'object' &&
    'valueOf' in resultado &&
    typeof (resultado as { valueOf: () => unknown }).valueOf === 'function'
  ) {
    const convertido = Number((resultado as { valueOf: () => unknown }).valueOf());
    return Number.isFinite(convertido) ? convertido : null;
  }

  return null;
}

function validarAstSegura(formula: string): { valida: boolean; erro?: string } {
  try {
    const ast = math.parse(formula) as MathNode;

    ast.traverse((node: any) => {
      if (node?.isFunctionNode) {
        const fnName = node.fn?.name || node.name;
        if (fnName && FUNCOES_BLOQUEADAS.has(fnName)) {
          throw new Error(`Funcao bloqueada: ${fnName}`);
        }
      }
    });

    return { valida: true };
  } catch (err: any) {
    return { valida: false, erro: err.message };
  }
}

function executarFormula(formula: string, escopo: Record<string, number>): number {
  const { valida, erro } = validarAstSegura(formula);
  if (!valida) {
    throw new Error(erro || 'Formula invalida.');
  }

  const ast = math.parse(formula) as MathNode;
  const resultado = ast.compile().evaluate(escopo);
  const numeroNormalizado = normalizarResultadoNumerico(resultado);

  if (numeroNormalizado === null) {
    throw new Error('A formula gerou um resultado invalido. Verifique divisao por zero ou valores nao numericos.');
  }

  return numeroNormalizado;
}

export function calcularSubmultiplos(valorBase: number): {
  valorMetade: number;
  valorQuinto: number;
} {
  return {
    valorMetade: Math.floor(valorBase * 0.5),
    valorQuinto: Math.floor(valorBase * 0.2),
  };
}

function limitarValorCampo(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  if (valor < LIMITE_MINIMO_CAMPO) return LIMITE_MINIMO_CAMPO;
  return Math.min(LIMITE_MAXIMO_CAMPO, valor);
}

function avaliarFormula(formula: string, escopo: Record<string, number>): number {
  try {
    const resultado = executarFormula(formula, escopo);
    return limitarValorCampo(Math.floor(resultado));
  } catch (err: any) {
    console.warn(`[FormulaService] Formula ignorada temporariamente: "${formula}". Motivo: ${err.message}`);
    return 0;
  }
}

async function recalcularFichaInterno(
  fichaId: string,
  sobrescritas: Map<string, number> = new Map()
): Promise<ValorResolvido[]> {
  const [todosTemplates, todosValores] = await Promise.all([
    prisma.templateCampo.findMany({
      where: { ativo: true },
      orderBy: { ordem: 'asc' },
    }),
    prisma.valorCampo.findMany({
      where: { fichaId },
      include: { template: true },
    }),
  ]);

  const mapaValores = new Map<string, number>();

  for (const valor of todosValores) {
    if (valor.template.tipo === TipoCampo.Fixo || valor.template.tipo === TipoCampo.Calculado) {
      mapaValores.set(valor.templateId, valor.valorBase ?? 0);
    }
  }

  for (const [templateId, valor] of sobrescritas) {
    mapaValores.set(templateId, limitarValorCampo(valor));
  }

  const mapaTemplates = new Map<string, TemplateCampo>(
    todosTemplates.map((t) => [t.id, t])
  );

  const escopo: Record<string, number> = {};
  for (const [templateId, valor] of mapaValores) {
    const template = mapaTemplates.get(templateId);
    if (template) {
      escopo[template.nome] = valor;
    }
  }

  const calculados = todosTemplates.filter(
    (t) => t.tipo === TipoCampo.Calculado && t.formulaLogica
  );

  for (let pass = 0; pass < 10; pass++) {
    let algumaMudanca = false;

    for (const template of calculados) {
      const valorAnterior = escopo[template.nome] ?? 0;
      const novoValor = avaliarFormula(template.formulaLogica!, escopo);

      if (novoValor !== valorAnterior) {
        escopo[template.nome] = novoValor;
        algumaMudanca = true;
      }
    }

    if (!algumaMudanca) break;
  }

  const operacoes: Prisma.PrismaPromise<unknown>[] = [];

  for (const template of todosTemplates) {
    if (template.tipo !== TipoCampo.Fixo && template.tipo !== TipoCampo.Calculado) {
      continue;
    }

    const valorBase = limitarValorCampo(escopo[template.nome] ?? 0);
    const { valorMetade, valorQuinto } = calcularSubmultiplos(valorBase);

    operacoes.push(
      prisma.valorCampo.upsert({
        where: {
          ficha_campo_unico: { fichaId, templateId: template.id },
        },
        create: {
          fichaId,
          templateId: template.id,
          valorBase,
          valorMetade,
          valorQuinto,
        },
        update: {
          valorBase,
          valorMetade,
          valorQuinto,
        },
      })
    );
  }

  await prisma.$transaction(operacoes);

  return todosTemplates
    .filter((t) => t.tipo === TipoCampo.Fixo || t.tipo === TipoCampo.Calculado)
    .map((t) => {
      const valorBase = limitarValorCampo(escopo[t.nome] ?? 0);
      const { valorMetade, valorQuinto } = calcularSubmultiplos(valorBase);
      return {
        templateId: t.id,
        nome: t.nome,
        valorBase,
        valorMetade,
        valorQuinto,
      };
    });
}

export async function recalcularFicha(
  fichaId: string,
  templateIdAtualizado: string,
  novoValorBase: number
): Promise<ValorResolvido[]> {
  return recalcularFichaInterno(
    fichaId,
    new Map([[templateIdAtualizado, novoValorBase]])
  );
}

export async function recalcularFichaComValoresAtuais(
  fichaId: string
): Promise<ValorResolvido[]> {
  return recalcularFichaInterno(fichaId);
}

export function validarFormula(
  formula: string,
  nomesDisponiveis: string[]
): { valida: boolean; erro?: string } {
  const escopoTeste: Record<string, number> = {};
  for (const nome of nomesDisponiveis) {
    escopoTeste[nome] = 10;
  }

  const astSegura = validarAstSegura(formula);
  if (!astSegura.valida) {
    return astSegura;
  }

  try {
    const resultado = executarFormula(formula, escopoTeste);
    if (typeof resultado !== 'number') {
      return { valida: false, erro: 'A formula deve retornar um numero.' };
    }
    return { valida: true };
  } catch (err: any) {
    return { valida: false, erro: err.message };
  }
}
