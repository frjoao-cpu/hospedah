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

// Códigos estáveis da decisão de seleção. O motivo é texto
// para o operador ler; a regra é o que o painel agrupa para
// mostrar POR QUE um lote inteiro foi descartado.
export const REGRAS = {
    SEM_ALVO: 'SEM_ALVO',
    APROVADA: 'APROVADA',
    VALIDACAO_MANUAL: 'VALIDACAO_MANUAL',
    EMPREENDIMENTO_FORA: 'EMPREENDIMENTO_FORA',
    EMPREENDIMENTO_NAO_IDENTIFICADO: 'EMPREENDIMENTO_NAO_IDENTIFICADO',
    TIPO_FORA: 'TIPO_FORA',
    SCORE_BAIXO: 'SCORE_BAIXO',
    PERIODO_FORA: 'PERIODO_FORA',
    SEMANA_FORA: 'SEMANA_FORA',
    VALOR_FORA: 'VALOR_FORA',
    DORMITORIOS_ABAIXO: 'DORMITORIOS_ABAIXO',
    CAPACIDADE_ABAIXO: 'CAPACIDADE_ABAIXO',
    DUPLICADA: 'DUPLICADA',
} as const;

// Rótulo legível de cada regra: é o que o painel mostra ao
// agregar "por que o lote inteiro foi descartado".
export const ROTULOS_REGRA: Record<string, string> = {
    SEM_ALVO: 'Sem alvo vinculado — validação manual',
    APROVADA: 'Selecionada pelo alvo',
    VALIDACAO_MANUAL: 'Selecionada para conferência ' +
        '(empreendimento não identificado)',
    EMPREENDIMENTO_FORA: 'Empreendimento fora do alvo',
    EMPREENDIMENTO_NAO_IDENTIFICADO: 'Empreendimento não identificado ' +
        'e nenhum termo do alvo no texto',
    TIPO_FORA: 'Tipo de negócio fora do alvo',
    SCORE_BAIXO: 'Score abaixo do mínimo do alvo',
    PERIODO_FORA: 'Período fora da janela do alvo',
    SEMANA_FORA: 'Semana fora das semanas do alvo',
    VALOR_FORA: 'Valor fora da faixa do alvo',
    DORMITORIOS_ABAIXO: 'Dormitórios abaixo do mínimo do alvo',
    CAPACIDADE_ABAIXO: 'Capacidade abaixo do mínimo do alvo',
    DUPLICADA: 'Já registrada (duplicada)',
};

export function rotuloRegra(regra: unknown): string {
    const chave = asText(regra);

    if (!chave) return 'Não classificada';

    return ROTULOS_REGRA[chave] || chave;
}

export interface Selecao {
    aprovado: boolean;
    motivo: string;
    regra?: string;
    // Aprovada, mas com dado faltando: o operador precisa
    // conferir antes de abordar.
    revisar?: boolean;
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

// ── Empreendimentos: cadastro e aliases ─────────────────────

// Acha no cadastro a ficha do empreendimento citado, casando
// pelo nome oficial OU por qualquer alias. É o que permite
// "Golden Laghetto" bater com "Golden Laghetto Resort".
export function resolverEmpreendimento(
    nome: unknown,
    empreendimentos: Empreendimento[] = [],
): Empreendimento | null {
    const alvo = normalizar(nome);

    if (!alvo) return null;

    return empreendimentos.find((e) =>
        [e.nome, ...(e.aliases || [])]
            .filter(Boolean)
            .some((n) => normalizar(n) === alvo)
    ) ?? null;
}


// Dois nomes designam o mesmo empreendimento quando são iguais
// já normalizados ou quando resolvem para a mesma ficha do
// cadastro (um pelo nome oficial, outro por um alias).
export function mesmoEmpreendimento(
    a: unknown,
    b: unknown,
    empreendimentos: Empreendimento[] = [],
): boolean {
    const na = normalizar(a);
    const nb = normalizar(b);

    if (!na || !nb) return false;
    if (na === nb) return true;

    const fichaA = resolverEmpreendimento(a, empreendimentos);
    const fichaB = resolverEmpreendimento(b, empreendimentos);

    if (!fichaA || !fichaB) return false;

    return normalizar(fichaA.nome) === normalizar(fichaB.nome);
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

    // O alvo pode ter sido cadastrado com um apelido; resolver
    // pelo cadastro garante que os demais aliases da mesma
    // ficha também entrem no pré-filtro.
    const canonicos = new Set(
        escolhidos
            .map((n) =>
                resolverEmpreendimento(n, empreendimentos)?.nome ?? n
            )
            .map(normalizar),
    );

    const termos: string[] = [];

    for (const e of empreendimentos) {
        const nomes = [e.nome, ...(e.aliases || [])]
            .filter(Boolean) as string[];

        if (
            alvos.length &&
            !canonicos.has(normalizar(e.nome)) &&
            !nomes.some((n) => canonicos.has(normalizar(n)))
        ) {
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

// Contexto opcional da seleção. Sem ele o comportamento é o
// mesmo de antes; com ele a decisão passa a enxergar o nome
// já canonizado pelo cadastro e o texto original.
export interface ContextoSelecao {
    // Empreendimento já resolvido pelo cadastro/aliases. Tem
    // prioridade sobre o texto cru devolvido pela IA.
    empreendimento?: string | null;
    // Cadastro completo, para comparar alvo e anúncio mesmo
    // quando cada um usa um apelido diferente.
    empreendimentos?: Empreendimento[];
    // Texto original da captura: quando a IA não identifica o
    // empreendimento, é ele que diz se o anúncio ao menos cita
    // um termo do alvo.
    texto?: string | null;
}

// Compara o resultado da IA com os critérios do alvo.
// Sem alvo, mantém o comportamento legado (tudo entra
// para validação manual).
export function selecionar(
    ai: Record<string, unknown>,
    alvo: Alvo | null,
    contexto: ContextoSelecao = {},
): Selecao {
    const tipo = asText(ai.tipo_oportunidade) || 'OUTRO';
    const score = asScore(ai.score_oportunidade) ?? 0;

    const cadastro = contexto.empreendimentos || [];

    // O nome canonizado pelo cadastro vence o texto cru da IA:
    // é a diferença entre "Golden Laghetto" ser reconhecido ou
    // descartado por não bater com "Golden Laghetto Resort".
    const emp = asText(contexto.empreendimento) ??
        asText(ai.empreendimento);

    if (!alvo) {
        return {
            aprovado: true,
            regra: REGRAS.SEM_ALVO,
            motivo:
                'Sem alvo vinculado — enviada para validação manual ' +
                '(score ' + score + ').',
        };
    }

    const nomeAlvo = asText(alvo.nome) || 'alvo';

    const empreendimentos = asLista(alvo.empreendimentos);

    // Aprovada, mas com o empreendimento em aberto: segue o
    // funil marcada para conferência humana.
    let revisar = false;
    let ressalva = '';

    if (empreendimentos.length) {
        if (emp) {
            const ok = empreendimentos.some(
                (n) => mesmoEmpreendimento(n, emp, cadastro),
            );

            if (!ok) {
                return {
                    aprovado: false,
                    regra: REGRAS.EMPREENDIMENTO_FORA,
                    motivo:
                        'Empreendimento "' + emp +
                        '" fora do alvo ' + nomeAlvo + '.',
                };
            }
        } else {
            // A IA não identificou o empreendimento. Descartar
            // aqui perde oportunidade em silêncio: se o texto
            // cita um termo do alvo, quem decide é o operador.
            const pre = preFiltrar(
                contexto.texto || '',
                alvo,
                cadastro,
            );

            if (!pre.aprovado) {
                return {
                    aprovado: false,
                    regra: REGRAS.EMPREENDIMENTO_NAO_IDENTIFICADO,
                    motivo:
                        'Empreendimento não identificado e nenhum termo ' +
                        'do alvo ' + nomeAlvo + ' no texto.',
                };
            }

            revisar = true;

            ressalva = ' Empreendimento não identificado pela IA, ' +
                'mas o texto cita termo do alvo (' + pre.motivo +
                ') — confira antes de abordar.';
        }
    }

    const tipos = asLista(alvo.tipos_negocio);

    if (tipos.length && !tipos.includes(tipo)) {
        return {
            aprovado: false,
            regra: REGRAS.TIPO_FORA,
            motivo:
                'Tipo de negócio ' + tipo +
                ' fora do alvo ' + nomeAlvo + '.',
        };
    }

    const minimo = asInt(alvo.score_minimo);

    if (minimo !== null && score < minimo) {
        return {
            aprovado: false,
            regra: REGRAS.SCORE_BAIXO,
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
                regra: REGRAS.PERIODO_FORA,
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
            regra: REGRAS.SEMANA_FORA,
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
                regra: REGRAS.VALOR_FORA,
                motivo:
                    'Valor abaixo da faixa do alvo ' + nomeAlvo + '.',
            };
        }

        if (max !== null && valor > max) {
            return {
                aprovado: false,
                regra: REGRAS.VALOR_FORA,
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
            regra: REGRAS.DORMITORIOS_ABAIXO,
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
                regra: REGRAS.CAPACIDADE_ABAIXO,
                motivo:
                    'Capacidade (' + total + ') abaixo do mínimo ' +
                    capMin + ' do alvo ' + nomeAlvo + '.',
            };
        }
    }

    return {
        aprovado: true,
        revisar,
        regra: revisar ? REGRAS.VALIDACAO_MANUAL : REGRAS.APROVADA,
        motivo:
            'Selecionada pelo alvo ' + nomeAlvo + ': ' + tipo +
            ', score ' + score +
            (minimo !== null ? ' (mínimo ' + minimo + ')' : '') +
            (emp ? ', ' + emp : '') + '.' + ressalva,
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


// ── Limpeza / retenção ──────────────────────────────────────
//
// O Radar acumula histórico depressa: capturas brutas, cache
// de IA, alertas e execuções. Sem uma política de retenção o
// painel fica lento e o banco cresce sem necessidade.
//
// Cada política é declarativa de propósito: a Edge Function só
// monta o DELETE a partir daqui, nunca a partir de nomes de
// tabela ou coluna vindos do cliente.

export type AlvoLimpeza =
    | 'capturas_analisadas'
    | 'capturas_descartadas'
    | 'capturas_abandonadas'
    | 'oportunidades_descartadas'
    | 'cache_ia'
    | 'alertas'
    | 'execucoes'
    | 'uso_ia';

export interface PoliticaLimpeza {
    alvo: AlvoLimpeza;
    rotulo: string;
    tabela: string;
    // Coluna de data usada no corte por idade.
    colunaData: string;
    // Filtro de estado/status, quando a limpeza é restrita.
    colunaEstado?: string;
    estados?: string[];
    // Nunca apagar nada mais novo que isto.
    diasMinimo: number;
    diasPadrao: number;
    descricao: string;
}

// Teto de idade: acima disso o pedido vira "não apague nada",
// evitando datas absurdas vindas do cliente.
export const DIAS_LIMPEZA_MAXIMO = 3650;

export const LIMPEZAS: Record<AlvoLimpeza, PoliticaLimpeza> = {
    capturas_analisadas: {
        alvo: 'capturas_analisadas',
        rotulo: 'Capturas já analisadas',
        tabela: 'radar_capturas',
        colunaData: 'capturado_em',
        colunaEstado: 'estado',
        estados: ['ANALISADO'],
        diasMinimo: 30,
        diasPadrao: 90,
        descricao: 'Texto bruto de capturas que já viraram ' +
            'oportunidade ou já foram avaliadas. A oportunidade ' +
            'gerada permanece intacta.',
    },

    capturas_descartadas: {
        alvo: 'capturas_descartadas',
        rotulo: 'Capturas descartadas',
        tabela: 'radar_capturas',
        colunaData: 'capturado_em',
        colunaEstado: 'estado',
        estados: ['DESCARTADO'],
        diasMinimo: 15,
        diasPadrao: 60,
        descricao: 'Capturas que não passaram nos critérios do ' +
            'alvo. Depois de apagadas não podem ser reenfileiradas.',
    },

    capturas_abandonadas: {
        alvo: 'capturas_abandonadas',
        rotulo: 'Capturas com erro / abandonadas',
        tabela: 'radar_capturas',
        colunaData: 'capturado_em',
        colunaEstado: 'estado',
        estados: ['ERRO', 'ABANDONADO'],
        diasMinimo: 7,
        diasPadrao: 30,
        descricao: 'Dead-letter da fila: capturas que estouraram ' +
            'as tentativas. Limpe só depois de investigar a causa.',
    },

    oportunidades_descartadas: {
        alvo: 'oportunidades_descartadas',
        rotulo: 'Oportunidades descartadas',
        tabela: 'radar_oportunidades',
        colunaData: 'criado_em',
        colunaEstado: 'status',
        estados: ['DESCARTADA'],
        diasMinimo: 30,
        diasPadrao: 180,
        descricao: 'Oportunidades reprovadas pelo time. ' +
            'VALIDAR e APROVADA nunca são apagadas.',
    },

    cache_ia: {
        alvo: 'cache_ia',
        rotulo: 'Cache de análises da IA',
        tabela: 'radar_analise_cache',
        colunaData: 'usado_em',
        diasMinimo: 7,
        diasPadrao: 60,
        descricao: 'Respostas reaproveitadas por hash do texto. ' +
            'Limpar só faz a IA reanalisar textos antigos.',
    },

    alertas: {
        alvo: 'alertas',
        rotulo: 'Histórico de alertas',
        tabela: 'radar_alertas',
        colunaData: 'criado_em',
        diasMinimo: 7,
        diasPadrao: 90,
        descricao: 'Trilha de WhatsApp/e-mail enviados ao time.',
    },

    execucoes: {
        alvo: 'execucoes',
        rotulo: 'Histórico de execuções',
        tabela: 'radar_execucoes',
        colunaData: 'iniciado_em',
        diasMinimo: 7,
        diasPadrao: 60,
        descricao: 'Varreduras do robô e lotes da IA já concluídos.',
    },

    uso_ia: {
        alvo: 'uso_ia',
        rotulo: 'Medição de tokens e custo',
        tabela: 'radar_ia_uso',
        colunaData: 'criado_em',
        diasMinimo: 30,
        diasPadrao: 180,
        descricao: 'Registro de tokens e custo por chamada. ' +
            'Apagar reduz o histórico do painel de custo.',
    },
};

export function politicaLimpeza(alvo: unknown): PoliticaLimpeza | null {
    const chave = typeof alvo === 'string' ? alvo.trim().toLowerCase() : '';

    return (LIMPEZAS as Record<string, PoliticaLimpeza>)[chave] ?? null;
}

// Normaliza os dias pedidos: nunca abaixo do mínimo da política
// e nunca acima do teto. Valor ausente ou inválido cai no padrão.
export function diasLimpeza(
    politica: PoliticaLimpeza,
    dias?: unknown,
): number {
    const n = typeof dias === 'number' ? dias : Number(dias);

    if (!Number.isFinite(n)) return politica.diasPadrao;

    const inteiro = Math.floor(n);

    if (inteiro < politica.diasMinimo) return politica.diasMinimo;

    if (inteiro > DIAS_LIMPEZA_MAXIMO) return DIAS_LIMPEZA_MAXIMO;

    return inteiro;
}

// Data de corte em ISO: tudo mais antigo que isto é elegível.
export function corteLimpeza(
    dias: number,
    agora: Date = new Date(),
): string {
    return new Date(agora.getTime() - dias * 86400000).toISOString();
}


// ── Dedupe semântico (embeddings) ───────────────────────────
//
// A similaridade por palavras (Jaccard) não reconhece o mesmo
// anúncio reescrito. O vetor compara significado: "vendo cota
// no Golden" e "passo minha fração no Laghetto" ficam próximos
// mesmo sem compartilhar palavras.

// Acima disto dois textos são o mesmo negócio. É mais alto que
// o limiar de palavras porque cosseno de embeddings é sempre
// alto: textos do mesmo domínio já partem de ~0.7.
export const LIMIAR_SEMANTICO = 0.9;

// Similaridade do cosseno. Vetores de tamanhos diferentes ou
// nulos devolvem 0 em vez de quebrar o pipeline.
export function cosseno(a: number[], b: number[]): number {
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;

    if (a.length === 0 || a.length !== b.length) return 0;

    let produto = 0;
    let normaA = 0;
    let normaB = 0;

    for (let i = 0; i < a.length; i++) {
        const x = Number(a[i]);
        const y = Number(b[i]);

        if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;

        produto += x * y;
        normaA += x * x;
        normaB += y * y;
    }

    if (normaA === 0 || normaB === 0) return 0;

    const cos = produto / (Math.sqrt(normaA) * Math.sqrt(normaB));

    // Ruído de ponto flutuante pode passar de 1 por frações.
    return Math.min(1, Math.max(-1, cos));
}

export interface VizinhoSemantico {
    oportunidade_id?: string | null;
    oportunidadeId?: string | null;
    similaridade?: number | null;
}

// Escolhe o vizinho mais parecido que passe do limiar. Devolve
// null quando nada é próximo o bastante — o chamador então cai
// na comparação por palavras, que continua valendo.
export function duplicadaSemantica(
    vizinhos: VizinhoSemantico[] | null | undefined,
    limiar = LIMIAR_SEMANTICO,
): Duplicada | null {
    if (!Array.isArray(vizinhos)) return null;

    let melhor: Duplicada | null = null;

    for (const v of vizinhos) {
        const id = v?.oportunidade_id ?? v?.oportunidadeId ?? null;

        const sim = Number(v?.similaridade);

        if (!id || !Number.isFinite(sim) || sim < limiar) continue;

        if (!melhor || sim > melhor.similaridade) {
            melhor = {
                id: String(id),
                similaridade: Math.round(sim * 100) / 100,
                motivo: 'Mesmo anúncio já registrado, reescrito com ' +
                    'outras palavras (semelhança semântica ' +
                    Math.round(sim * 100) + '%).',
            };
        }
    }

    return melhor;
}


// ── Inteligência competitiva ────────────────────────────────
//
// A mesma cota costuma ser anunciada em vários lugares e por
// preços diferentes. Agrupar essas aparições responde a duas
// perguntas que o operador fazia na mão: "qual é o menor preço
// pedido?" e "há quanto tempo isto está encalhado?".

export interface ChaveGrupo {
    empreendimento?: string | null;
    tipo?: string | null;
    numeroSemana?: number | null;
    periodoInicio?: string | null;
}

// Assinatura estável do negócio. Sem empreendimento não há
// grupo: comparar preços de resorts diferentes não diz nada.
export function chaveGrupo(c: ChaveGrupo): string | null {
    const emp = normalizar(c.empreendimento ?? '');

    if (!emp) return null;

    const tipo = String(c.tipo || 'OUTRO').toUpperCase();

    const semana = Number.isFinite(Number(c.numeroSemana))
        ? 'S' + Number(c.numeroSemana)
        : '';

    // Sem semana, o mês do período separa negócios distintos
    // sem exigir que as datas batam exatamente.
    const mes = !semana && c.periodoInicio
        ? String(c.periodoInicio).slice(0, 7)
        : '';

    return [emp, tipo, semana || mes || 'SEMPERIODO'].join('|');
}

export function rotuloGrupo(c: ChaveGrupo): string {
    const partes: string[] = [];

    if (c.empreendimento) partes.push(String(c.empreendimento));

    if (c.tipo) partes.push(String(c.tipo));

    if (Number.isFinite(Number(c.numeroSemana))) {
        partes.push('sem. ' + Number(c.numeroSemana));
    } else if (c.periodoInicio) {
        partes.push(String(c.periodoInicio).slice(0, 7));
    }

    return partes.join(' · ') || 'Sem identificação';
}

export interface Grupo {
    anuncios?: number | null;
    fontes?: number | null;
    valor_minimo?: number | null;
    valor_maximo?: number | null;
    primeiro_em?: string | null;
    ultimo_em?: string | null;
}

export interface AtualizacaoGrupo {
    anuncios: number;
    fontes: number;
    valor_minimo: number | null;
    valor_maximo: number | null;
    ultimo_em: string;
}

// Incorpora um anúncio novo ao grupo. Valor ausente não apaga
// a faixa já conhecida; fonte repetida não infla a contagem de
// fontes distintas.
export function acumularGrupo(
    grupo: Grupo | null | undefined,
    anuncio: { valor?: number | null; fonteNova?: boolean },
    agora: Date = new Date(),
): AtualizacaoGrupo {
    const atual = grupo ?? {};

    const valor = Number(anuncio?.valor);

    const temValor = Number.isFinite(valor) && valor > 0;

    const minAtual = Number(atual.valor_minimo);
    const maxAtual = Number(atual.valor_maximo);

    const minimo = temValor
        ? (Number.isFinite(minAtual) ? Math.min(minAtual, valor) : valor)
        : (Number.isFinite(minAtual) ? minAtual : null);

    const maximo = temValor
        ? (Number.isFinite(maxAtual) ? Math.max(maxAtual, valor) : valor)
        : (Number.isFinite(maxAtual) ? maxAtual : null);

    return {
        anuncios: Math.max(1, Number(atual.anuncios) || 0) +
            (grupo ? 1 : 0),
        fontes: Math.max(1, Number(atual.fontes) || 1) +
            (grupo && anuncio?.fonteNova ? 1 : 0),
        valor_minimo: minimo,
        valor_maximo: maximo,
        ultimo_em: agora.toISOString(),
    };
}

export interface LeituraGrupo {
    anuncios: number;
    fontes: number;
    menorValor: number | null;
    variacaoPct: number | null;
    diasEmMercado: number;
    resumo: string;
}

// Traduz o grupo em uma frase para o painel. Só faz sentido a
// partir do segundo anúncio — antes disso não há comparação.
export function lerGrupo(
    grupo: Grupo | null | undefined,
    agora: Date = new Date(),
): LeituraGrupo | null {
    if (!grupo) return null;

    const anuncios = Number(grupo.anuncios) || 0;

    if (anuncios < 2) return null;

    const minimo = Number(grupo.valor_minimo);
    const maximo = Number(grupo.valor_maximo);

    const temFaixa = Number.isFinite(minimo) && minimo > 0 &&
        Number.isFinite(maximo);

    const variacao = temFaixa
        ? Math.round(((maximo - minimo) / minimo) * 100)
        : null;

    const primeiro = grupo.primeiro_em
        ? new Date(grupo.primeiro_em).getTime()
        : NaN;

    const ultimo = grupo.ultimo_em
        ? new Date(grupo.ultimo_em).getTime()
        : agora.getTime();

    const dias = Number.isFinite(primeiro)
        ? Math.max(0, Math.floor((ultimo - primeiro) / 86400000))
        : 0;

    const partes = [
        anuncios + ' anúncios',
        (Number(grupo.fontes) || 1) + ' fonte(s)',
    ];

    if (temFaixa && variacao !== null && variacao > 0) {
        partes.push('menor pedido R$ ' + Math.round(minimo) +
            ' (' + variacao + '% de variação)');
    } else if (temFaixa) {
        partes.push('pedido R$ ' + Math.round(minimo));
    }

    if (dias > 0) partes.push(dias + ' dia(s) em mercado');

    return {
        anuncios,
        fontes: Number(grupo.fontes) || 1,
        menorValor: temFaixa ? minimo : null,
        variacaoPct: variacao,
        diasEmMercado: dias,
        resumo: partes.join(' · '),
    };
}


// ── Saúde operacional ───────────────────────────────────────
//
// Os dados de fila, falha e custo já existiam; faltava alguém
// olhando. Estas regras transformam os números em incidentes
// que a função pode notificar uma única vez.

export type TipoIncidente =
    | 'FILA_TRAVADA'
    | 'DEAD_LETTER'
    | 'FONTE_FALHANDO'
    | 'CUSTO_ALTO'
    | 'SEM_CAPTURA';

export interface Incidente {
    tipo: TipoIncidente;
    alvo: string;
    severidade: 'AVISO' | 'CRITICO';
    mensagem: string;
    detalhes: Record<string, unknown>;
}

export interface LimitesSaude {
    filaMaxima: number;
    deadLetterMaximo: number;
    falhasPorFonte: number;
    custoDiarioUSD: number;
    horasSemCaptura: number;
}

export const LIMITES_SAUDE: LimitesSaude = {
    filaMaxima: 200,
    deadLetterMaximo: 25,
    falhasPorFonte: 3,
    custoDiarioUSD: 5,
    horasSemCaptura: 6,
};

export interface EstadoSaude {
    // Capturas por estado: { PENDENTE: 12, ERRO: 3, ... }
    fila?: Record<string, number> | null;
    fontes?: Array<{
        id?: string | null;
        nome?: string | null;
        ativo?: boolean | null;
        falhas_consecutivas?: number | null;
        ultimo_erro?: string | null;
    }> | null;
    custoHojeUSD?: number | null;
    ultimaCapturaEm?: string | null;
}

// Avalia o estado e devolve os incidentes abertos. Lista vazia
// significa pipeline saudável.
export function avaliarSaude(
    estado: EstadoSaude,
    limites: LimitesSaude = LIMITES_SAUDE,
    agora: Date = new Date(),
): Incidente[] {
    const incidentes: Incidente[] = [];

    const fila = estado?.fila ?? {};

    const pendentes = Number(fila.PENDENTE) || 0;

    if (pendentes > limites.filaMaxima) {
        incidentes.push({
            tipo: 'FILA_TRAVADA',
            alvo: 'global',
            severidade: pendentes > limites.filaMaxima * 2
                ? 'CRITICO'
                : 'AVISO',
            mensagem: pendentes + ' capturas pendentes na fila ' +
                '(limite ' + limites.filaMaxima + '). A análise ' +
                'não está acompanhando o ritmo da captura.',
            detalhes: { pendentes, limite: limites.filaMaxima },
        });
    }

    const mortas = (Number(fila.ABANDONADO) || 0) +
        (Number(fila.ERRO) || 0);

    if (mortas > limites.deadLetterMaximo) {
        incidentes.push({
            tipo: 'DEAD_LETTER',
            alvo: 'global',
            severidade: 'AVISO',
            mensagem: mortas + ' capturas esgotaram as tentativas ' +
                '(limite ' + limites.deadLetterMaximo + '). ' +
                'Investigue antes de reenfileirar.',
            detalhes: { mortas, limite: limites.deadLetterMaximo },
        });
    }

    for (const fonte of estado?.fontes ?? []) {
        const falhas = Number(fonte?.falhas_consecutivas) || 0;

        if (falhas < limites.falhasPorFonte) continue;

        incidentes.push({
            tipo: 'FONTE_FALHANDO',
            alvo: String(fonte?.id || fonte?.nome || 'desconhecida'),
            severidade: fonte?.ativo === false ? 'CRITICO' : 'AVISO',
            mensagem: 'A fonte "' +
                (fonte?.nome || fonte?.id || 'desconhecida') +
                '" falhou ' + falhas + ' vez(es) seguidas' +
                (fonte?.ativo === false ? ' e foi suspensa' : '') +
                '. Último erro: ' +
                (fonte?.ultimo_erro || 'não registrado') + '.',
            detalhes: {
                falhas,
                ativo: fonte?.ativo !== false,
                erro: fonte?.ultimo_erro ?? null,
            },
        });
    }

    const custo = Number(estado?.custoHojeUSD);

    if (Number.isFinite(custo) && custo > limites.custoDiarioUSD) {
        incidentes.push({
            tipo: 'CUSTO_ALTO',
            alvo: 'global',
            severidade: custo > limites.custoDiarioUSD * 3
                ? 'CRITICO'
                : 'AVISO',
            mensagem: 'Custo de IA hoje em US$ ' +
                custo.toFixed(2) + ' (teto US$ ' +
                limites.custoDiarioUSD.toFixed(2) + ').',
            detalhes: { custo, limite: limites.custoDiarioUSD },
        });
    }

    if (estado?.ultimaCapturaEm) {
        const ultima = new Date(estado.ultimaCapturaEm).getTime();

        if (Number.isFinite(ultima)) {
            const horas = (agora.getTime() - ultima) / 3600000;

            if (horas > limites.horasSemCaptura) {
                incidentes.push({
                    tipo: 'SEM_CAPTURA',
                    alvo: 'global',
                    severidade: 'CRITICO',
                    mensagem: 'Nenhuma captura há ' +
                        Math.floor(horas) + ' hora(s). ' +
                        'O robô pode estar parado — confira o ' +
                        'agendamento (pg_cron) e as credenciais ' +
                        'das fontes.',
                    detalhes: {
                        horas: Math.floor(horas),
                        limite: limites.horasSemCaptura,
                    },
                });
            }
        }
    }

    return incidentes;
}

// Lê os limites de variáveis de ambiente, mantendo os padrões
// quando ausentes — calibrar não deve exigir novo deploy.
export function limitesDeAmbiente(
    ler: (nome: string) => string | undefined,
): LimitesSaude {
    const num = (nome: string, padrao: number, minimo: number) => {
        const n = Number(ler(nome));

        return Number.isFinite(n) && n >= minimo ? n : padrao;
    };

    return {
        filaMaxima: num('RADAR_SAUDE_FILA_MAXIMA', 200, 1),
        deadLetterMaximo: num('RADAR_SAUDE_DEAD_LETTER', 25, 1),
        falhasPorFonte: num('RADAR_SAUDE_FALHAS_FONTE', 3, 1),
        custoDiarioUSD: num('RADAR_SAUDE_CUSTO_DIARIO', 5, 0),
        horasSemCaptura: num('RADAR_SAUDE_HORAS_SEM_CAPTURA', 6, 1),
    };
}
