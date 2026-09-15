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
