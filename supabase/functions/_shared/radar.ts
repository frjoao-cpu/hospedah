// ============================================================
// HOSPEDAH — Núcleo compartilhado do Radar IA
//
// Usado pelas Edge Functions radar-captura (o robô encontra)
// e radar-ia (a IA entende / o Radar seleciona).
//
// Mantém em um único lugar: normalização de texto, coerção
// de campos vindos da IA, pré-filtro barato das capturas e
// a seleção das oportunidades pelos critérios do alvo.
// ============================================================

export const TIPOS = [
    'VENDA_COTA',
    'VENDA_PERIODO',
    'ALUGUEL',
    'CESSAO',
    'TROCA',
    'PERMUTA',
    'DISPONIBILIDADE',
    'OUTRO',
];

export const NEGOCIACAO_STATUS = [
    'NOVA',
    'EM_NEGOCIACAO',
    'GANHA',
    'PERDIDA',
];

export interface Empreendimento {
    nome: string;
    cidade?: string | null;
    estado?: string | null;
    aliases?: string[] | null;
}

export interface Alvo {
    id?: string;
    nome?: string;
    empreendimentos?: string[] | null;
    cidades?: string[] | null;
    estados?: string[] | null;
    tipos_negocio?: string[] | null;
    periodo_inicio?: string | null;
    periodo_fim?: string | null;
    janela_dias?: number | null;
    semanas?: number[] | null;
    valor_min?: number | null;
    valor_max?: number | null;
    dormitorios_min?: number | null;
    capacidade_min?: number | null;
    score_minimo?: number | null;
}

export interface Selecao {
    aprovado: boolean;
    motivo: string;
}

// ── Coerções ────────────────────────────────────────────────

export function normalizar(s: unknown): string {
    return String(s ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export function asText(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t : null;
}

export function asInt(v: unknown): number | null {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
}

export function asNum(v: unknown): number | null {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
}

export function asScore(v: unknown): number | null {
    const n = asInt(v);
    if (n === null) return null;
    return Math.min(100, Math.max(0, n));
}

export function asDate(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    if (isNaN(Date.parse(t + 'T00:00:00Z'))) return null;
    return t;
}

export function asLista(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) => asText(x))
        .filter((x): x is string => !!x);
}

// ── Período ─────────────────────────────────────────────────

// Janela efetiva do alvo: datas fixas têm prioridade;
// janela_dias vira "de hoje até hoje + N dias".
export function janelaDoAlvo(
    alvo: Alvo,
    hoje = new Date(),
): { inicio: string | null; fim: string | null } {
    const inicio = asDate(alvo.periodo_inicio);
    const fim = asDate(alvo.periodo_fim);

    if (inicio || fim) return { inicio, fim };

    const dias = asInt(alvo.janela_dias);
    if (dias && dias > 0) {
        const ate = new Date(hoje.getTime());
        ate.setUTCDate(ate.getUTCDate() + dias);
        return {
            inicio: hoje.toISOString().slice(0, 10),
            fim: ate.toISOString().slice(0, 10),
        };
    }

    return { inicio: null, fim: null };
}

// Sobreposição inclusiva; limites nulos = aberto.
export function periodosSobrepostos(
    aIni: string | null,
    aFim: string | null,
    bIni: string | null,
    bFim: string | null,
): boolean {
    const ini1 = aIni || aFim;
    const fim1 = aFim || aIni;
    const ini2 = bIni || bFim;
    const fim2 = bFim || bIni;

    if (!ini1 || !ini2) return true;
    if (fim1 && fim1 < ini2) return false;
    if (fim2 && fim2 < ini1) return false;
    return true;
}

// ── Termos de busca do alvo ─────────────────────────────────

// Nomes + aliases dos empreendimentos do alvo (ou de todo o
// cadastro, quando o alvo não restringe empreendimentos),
// mais cidades e estados declarados no alvo.
export function termosDoAlvo(
    alvo: Alvo,
    empreendimentos: Empreendimento[],
): string[] {
    const escolhidos = asLista(alvo.empreendimentos);
    const alvos = escolhidos.map(normalizar);

    const termos: string[] = [];

    for (const e of empreendimentos) {
        const nomes = [e.nome, ...(e.aliases || [])]
            .filter(Boolean) as string[];

        if (alvos.length && !alvos.includes(normalizar(e.nome))) {
            continue;
        }

        termos.push(...nomes);
    }

    // Empreendimento citado no alvo mas ausente do cadastro.
    for (const nome of escolhidos) {
        if (!termos.some((t) => normalizar(t) === normalizar(nome))) {
            termos.push(nome);
        }
    }

    termos.push(...asLista(alvo.cidades));

    return [...new Set(termos.filter(Boolean))];
}

// Pré-filtro barato: evita gastar token de IA com textos que
// não citam nenhum termo do alvo.
export function preFiltrar(
    texto: string,
    alvo: Alvo,
    empreendimentos: Empreendimento[],
): Selecao {
    const termos = termosDoAlvo(alvo, empreendimentos);

    if (!termos.length) {
        return {
            aprovado: true,
            motivo: 'Alvo sem termos definidos — segue para a IA.',
        };
    }

    const alvoTexto = normalizar(texto);

    const encontrado = termos.find(
        (t) => normalizar(t) && alvoTexto.includes(normalizar(t)),
    );

    if (encontrado) {
        return {
            aprovado: true,
            motivo: 'Termo do alvo encontrado: ' + encontrado,
        };
    }

    return {
        aprovado: false,
        motivo:
            'Nenhum termo do alvo encontrado no texto (' +
            termos.slice(0, 6).join(', ') +
            ').',
    };
}

// ── Seleção: "o Radar seleciona" ────────────────────────────

// Compara o resultado da IA com os critérios do alvo.
// Sem alvo, mantém o comportamento legado (tudo entra
// para validação manual).
export function selecionar(
    ai: Record<string, unknown>,
    alvo: Alvo | null,
): Selecao {
    const tipo = asText(ai.tipo_oportunidade) || 'OUTRO';
    const score = asScore(ai.score_oportunidade) ?? 0;
    const emp = asText(ai.empreendimento);

    if (!alvo) {
        return {
            aprovado: true,
            motivo:
                'Sem alvo vinculado — enviada para validação manual ' +
                '(score ' + score + ').',
        };
    }

    const nomeAlvo = asText(alvo.nome) || 'alvo';

    const empreendimentos = asLista(alvo.empreendimentos);

    if (empreendimentos.length) {
        const ok = emp &&
            empreendimentos.some(
                (n) => normalizar(n) === normalizar(emp),
            );

        if (!ok) {
            return {
                aprovado: false,
                motivo:
                    'Empreendimento "' + (emp || 'não identificado') +
                    '" fora do alvo ' + nomeAlvo + '.',
            };
        }
    }

    const tipos = asLista(alvo.tipos_negocio);

    if (tipos.length && !tipos.includes(tipo)) {
        return {
            aprovado: false,
            motivo:
                'Tipo de negócio ' + tipo +
                ' fora do alvo ' + nomeAlvo + '.',
        };
    }

    const minimo = asInt(alvo.score_minimo);

    if (minimo !== null && score < minimo) {
        return {
            aprovado: false,
            motivo:
                'Score ' + score + ' abaixo do mínimo ' +
                minimo + ' do alvo ' + nomeAlvo + '.',
        };
    }

    const janela = janelaDoAlvo(alvo);

    if (janela.inicio || janela.fim) {
        const ini = asDate(ai.periodo_inicio);
        const fim = asDate(ai.periodo_fim);

        if (
            (ini || fim) &&
            !periodosSobrepostos(ini, fim, janela.inicio, janela.fim)
        ) {
            return {
                aprovado: false,
                motivo:
                    'Período fora da janela do alvo ' + nomeAlvo +
                    ' (' + (janela.inicio || '…') + ' → ' +
                    (janela.fim || '…') + ').',
            };
        }
    }

    const semanas = Array.isArray(alvo.semanas)
        ? alvo.semanas.map((s) => asInt(s)).filter((s) => s !== null)
        : [];

    const semana = asInt(ai.numero_semana);

    if (semanas.length && semana !== null && !semanas.includes(semana)) {
        return {
            aprovado: false,
            motivo:
                'Semana ' + semana + ' fora das semanas do alvo ' +
                nomeAlvo + '.',
        };
    }

    const valor = asNum(ai.valor_anunciado);

    if (valor !== null) {
        const min = asNum(alvo.valor_min);
        const max = asNum(alvo.valor_max);

        if (min !== null && valor < min) {
            return {
                aprovado: false,
                motivo:
                    'Valor abaixo da faixa do alvo ' + nomeAlvo + '.',
            };
        }

        if (max !== null && valor > max) {
            return {
                aprovado: false,
                motivo:
                    'Valor acima da faixa do alvo ' + nomeAlvo + '.',
            };
        }
    }

    const dormMin = asInt(alvo.dormitorios_min);
    const dorm = asInt(ai.dormitorios);

    if (dormMin !== null && dorm !== null && dorm < dormMin) {
        return {
            aprovado: false,
            motivo:
                'Dormitórios (' + dorm + ') abaixo do mínimo ' +
                dormMin + ' do alvo ' + nomeAlvo + '.',
        };
    }

    const capMin = asInt(alvo.capacidade_min);
    const adultos = asInt(ai.capacidade_adultos);
    const criancas = asInt(ai.capacidade_criancas);

    if (capMin !== null && (adultos !== null || criancas !== null)) {
        const total = (adultos ?? 0) + (criancas ?? 0);

        if (total < capMin) {
            return {
                aprovado: false,
                motivo:
                    'Capacidade (' + total + ') abaixo do mínimo ' +
                    capMin + ' do alvo ' + nomeAlvo + '.',
            };
        }
    }

    return {
        aprovado: true,
        motivo:
            'Selecionada pelo alvo ' + nomeAlvo + ': ' + tipo +
            ', score ' + score +
            (minimo !== null ? ' (mínimo ' + minimo + ')' : '') +
            (emp ? ', ' + emp : '') + '.',
    };
}

// ── Sinais de negociação ────────────────────────────────────

export const URGENCIAS = ['BAIXA', 'MEDIA', 'ALTA', 'IMEDIATA'];

export const RISCOS_FRAUDE = ['BAIXO', 'MEDIO', 'ALTO'];

export function asUrgencia(v: unknown): string | null {
    const t = asText(v)?.toUpperCase().replace('É', 'E') ?? null;
    if (!t) return null;
    return URGENCIAS.includes(t) ? t : null;
}

export function asRisco(v: unknown): string | null {
    const t = asText(v)?.toUpperCase() ?? null;
    if (!t) return null;
    return RISCOS_FRAUDE.includes(t) ? t : null;
}

// ── Cache e dedupe ──────────────────────────────────────────

// Hash estável do conteúdo analisado. Mesmo texto (ignorando
// acentos, caixa e pontuação) → mesma chave de cache, evitando
// pagar duas vezes pela mesma análise de IA.
export async function hashTexto(texto: string): Promise<string> {
    const base = normalizar(texto);

    const buffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(base),
    );

    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// Palavras significativas do texto (sem ruído curto), usadas
// como "impressão digital" para o dedupe por similaridade.
export function tokensRelevantes(texto: string): string[] {
    return [
        ...new Set(
            normalizar(texto)
                .split(' ')
                .filter((t) => t.length >= 4),
        ),
    ];
}

// Impressão digital compacta e determinística: os 40 tokens
// mais informativos, em ordem alfabética. Guardada na
// oportunidade para comparar candidatos sem reprocessar texto.
export function impressaoDigital(texto: string): string {
    return tokensRelevantes(texto).sort().slice(0, 40).join(' ');
}

// Similaridade de Jaccard entre duas impressões digitais.
// 1 = idêntico, 0 = nada em comum.
export function similaridade(a: string, b: string): number {
    const A = new Set(tokensRelevantes(a));
    const B = new Set(tokensRelevantes(b));

    if (!A.size || !B.size) return 0;

    let comuns = 0;
    for (const t of A) if (B.has(t)) comuns++;

    return comuns / (A.size + B.size - comuns);
}

// Limite a partir do qual dois anúncios são considerados o
// mesmo negócio anunciado em fontes diferentes.
export const LIMIAR_DUPLICADA = 0.62;

export interface Candidata {
    id: string;
    impressao_digital?: string | null;
    texto_original?: string | null;
    contato?: string | null;
    empreendimento?: string | null;
    valor_anunciado?: number | null;
}

export interface Duplicada {
    id: string;
    similaridade: number;
    motivo: string;
}

// Procura, entre oportunidades recentes, uma que já represente
// o mesmo negócio. Contato idêntico + mesmo empreendimento é
// prova forte; o restante decide por similaridade textual.
export function acharDuplicada(
    novo: {
        texto: string;
        contato?: string | null;
        empreendimento?: string | null;
    },
    candidatas: Candidata[],
): Duplicada | null {
    const contato = normalizar(novo.contato ?? '').replace(/ /g, '');
    const emp = normalizar(novo.empreendimento ?? '');

    let melhor: Duplicada | null = null;

    for (const c of candidatas) {
        const impressao = c.impressao_digital ||
            impressaoDigital(String(c.texto_original || ''));

        const sim = similaridade(novo.texto, impressao);

        const mesmoContato = !!contato &&
            normalizar(c.contato ?? '').replace(/ /g, '') === contato;

        const mesmoEmp = !!emp &&
            normalizar(c.empreendimento ?? '') === emp;

        const duplicada = (mesmoContato && (mesmoEmp || sim >= 0.35)) ||
            sim >= LIMIAR_DUPLICADA;

        if (!duplicada) continue;

        if (!melhor || sim > melhor.similaridade) {
            melhor = {
                id: c.id,
                similaridade: Math.round(sim * 100) / 100,
                motivo: mesmoContato
                    ? 'Mesmo contato do anunciante' +
                        (mesmoEmp ? ' e mesmo empreendimento' : '') +
                        ' (similaridade ' + Math.round(sim * 100) + '%).'
                    : 'Conteúdo equivalente a uma oportunidade já ' +
                        'registrada (similaridade ' +
                        Math.round(sim * 100) + '%).',
            };
        }
    }

    return melhor;
}

// ── Preço de referência (RAG sobre a base própria) ──────────

export interface Referencia {
    valor: number;
    amostras: number;
}

// Mediana dos valores já praticados para o mesmo
// empreendimento/tipo. Mediana (e não média) para que um
// anúncio absurdo não contamine a referência.
export function referenciaDePreco(
    historico: { valor_anunciado?: number | null }[],
): Referencia | null {
    const valores = historico
        .map((h) => asNum(h.valor_anunciado))
        .filter((v): v is number => v !== null && v > 0)
        .sort((a, b) => a - b);

    if (valores.length < 3) return null;

    const meio = Math.floor(valores.length / 2);

    const valor = valores.length % 2
        ? valores[meio]
        : (valores[meio - 1] + valores[meio]) / 2;

    return { valor, amostras: valores.length };
}

// Desconto (%) do valor anunciado em relação à referência.
// Positivo = mais barato que o praticado.
export function descontoPercentual(
    valor: number | null,
    referencia: Referencia | null,
): number | null {
    if (valor === null || !referencia || referencia.valor <= 0) return null;

    const pct = (1 - valor / referencia.valor) * 100;

    return Math.round(pct * 10) / 10;
}

// Ajuste do score comercial pelo que a HOSPEDAH já praticou e
// pelos sinais de urgência/fraude — o score deixa de depender
// só da opinião da IA sobre o texto isolado.
export function ajustarScore(
    score: number,
    ctx: {
        desconto?: number | null;
        urgencia?: string | null;
        risco?: string | null;
    },
): { score: number; motivos: string[] } {
    let ajustado = score;
    const motivos: string[] = [];

    const desconto = ctx.desconto ?? null;

    if (desconto !== null) {
        if (desconto >= 25) {
            ajustado += 12;
            motivos.push(
                'preço ' + Math.round(desconto) +
                    '% abaixo do praticado',
            );
        } else if (desconto >= 10) {
            ajustado += 6;
            motivos.push(
                'preço ' + Math.round(desconto) +
                    '% abaixo do praticado',
            );
        } else if (desconto <= -15) {
            ajustado -= 8;
            motivos.push(
                'preço ' + Math.round(Math.abs(desconto)) +
                    '% acima do praticado',
            );
        }
    }

    if (ctx.urgencia === 'IMEDIATA') {
        ajustado += 8;
        motivos.push('vendedor com urgência imediata');
    } else if (ctx.urgencia === 'ALTA') {
        ajustado += 4;
        motivos.push('vendedor com urgência alta');
    }

    if (ctx.risco === 'ALTO') {
        ajustado -= 25;
        motivos.push('sinais de fraude');
    } else if (ctx.risco === 'MEDIO') {
        ajustado -= 10;
        motivos.push('sinais de risco a confirmar');
    }

    return {
        score: Math.min(100, Math.max(0, Math.round(ajustado))),
        motivos,
    };
}

// ── Backoff da fila ─────────────────────────────────────────

// Espera exponencial com teto de 1 hora: 2, 4, 8, 16, 32, 60 min.
export function proximaTentativa(
    tentativas: number,
    agora = new Date(),
): string {
    const minutos = Math.min(60, Math.pow(2, Math.max(1, tentativas)));

    return new Date(agora.getTime() + minutos * 60000).toISOString();
}

// Depois disso a captura vira dead-letter (estado ERRO fixo) e
// para de consumir a fila.
export const MAX_TENTATIVAS = 5;
