// ============================================================
// HOSPEDAH — Testes do núcleo do Radar IA
//
// Cobre a lógica pura (sem rede e sem banco) que passou a
// decidir dinheiro: dedupe semântico, preço de referência,
// ajuste de score e backoff da fila.
//
// Execução: deno test supabase/functions/_shared/
// ============================================================

import {
    assert,
    assertAlmostEquals,
    assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
    acharDuplicada,
    acumularGrupo,
    ajustarScore,
    avaliarSaude,
    chaveGrupo,
    cosseno,
    duplicadaSemantica,
    extrairAnunciante,
    extrairTelefones,
    lerGrupo,
    limitesDeAmbiente,
    LIMIAR_SEMANTICO,
    rotuloGrupo,
    Alvo,
    corteLimpeza,
    DIAS_LIMPEZA_MAXIMO,
    diasLimpeza,
    LIMPEZAS,
    politicaLimpeza,
    asRisco,
    asUrgencia,
    descontoPercentual,
    Empreendimento,
    hashTexto,
    impressaoDigital,
    MAX_TENTATIVAS,
    mesmoEmpreendimento,
    preFiltrar,
    proximaTentativa,
    referenciaDePreco,
    REGRAS,
    resolverEmpreendimento,
    rotuloRegra,
    selecionar,
    similaridade,
    SUSPENSAO_CREDENCIAL_MIN,
    suspensaoDaFonte,
    SUSPENSAO_MAXIMA_MIN,
    termosDoAlvo,
} from './radar.ts';

const anuncio =
    'Vendo cota Olímpia Park Resort, semana 32, apartamento ' +
    'com 2 dormitórios para 6 pessoas. Valor R$ 48.000 ' +
    'aceito proposta. Contato 17 99999-0000.';

const mesmoAnuncioOutraFonte =
    'VENDO COTA no Olimpia Park Resort — semana 32, apto de 2 ' +
    'dormitórios, capacidade 6 pessoas. R$ 48.000,00, aceito ' +
    'proposta! Chama no 17 99999-0000';

const outroAnuncio =
    'Alugo período no Mavsa Resort em Cesário Lange, ' +
    'chalé para 4 pessoas no feriado de setembro. ' +
    'Diária R$ 900.';

Deno.test('hashTexto ignora acento, caixa e pontuação', async () => {
    const a = await hashTexto('Cota no Olímpia Park!');
    const b = await hashTexto('cota no olimpia park');

    assertEquals(a, b);

    const c = await hashTexto('Cota no Mavsa');
    assert(a !== c);
});

Deno.test('similaridade separa o mesmo anúncio de outro', () => {
    const igual = similaridade(anuncio, mesmoAnuncioOutraFonte);
    const diferente = similaridade(anuncio, outroAnuncio);

    assert(igual > 0.6, 'esperado alto, obtido ' + igual);
    assert(diferente < 0.2, 'esperado baixo, obtido ' + diferente);
});

Deno.test('impressaoDigital é estável e compacta', () => {
    const a = impressaoDigital(anuncio);
    const b = impressaoDigital(anuncio);

    assertEquals(a, b);
    assert(a.split(' ').length <= 40);
});

Deno.test('acharDuplicada funde o mesmo negócio', () => {
    const achada = acharDuplicada({
        texto: mesmoAnuncioOutraFonte,
        contato: '17 99999-0000',
        empreendimento: 'Olímpia Park Resort',
    }, [
        {
            id: 'op-1',
            impressao_digital: impressaoDigital(anuncio),
            contato: '17 99999-0000',
            empreendimento: 'Olímpia Park Resort',
        },
    ]);

    assertEquals(achada?.id, 'op-1');
});

Deno.test('acharDuplicada não funde negócios distintos', () => {
    const achada = acharDuplicada({
        texto: outroAnuncio,
        contato: '11 98888-0000',
        empreendimento: 'Mavsa Resort',
    }, [
        {
            id: 'op-1',
            impressao_digital: impressaoDigital(anuncio),
            contato: '17 99999-0000',
            empreendimento: 'Olímpia Park Resort',
        },
    ]);

    assertEquals(achada, null);
});

Deno.test('referenciaDePreco exige amostra e usa mediana', () => {
    assertEquals(
        referenciaDePreco([
            { valor_anunciado: 40000 },
            { valor_anunciado: 50000 },
        ]),
        null,
    );

    const r = referenciaDePreco([
        { valor_anunciado: 40000 },
        { valor_anunciado: 50000 },
        { valor_anunciado: 60000 },
        { valor_anunciado: 900000 },
        { valor_anunciado: null },
    ]);

    assertEquals(r?.valor, 55000);
    assertEquals(r?.amostras, 4);
});

Deno.test('descontoPercentual mede a diferença do praticado', () => {
    assertAlmostEquals(
        descontoPercentual(40000, { valor: 50000, amostras: 5 }) ?? 0,
        20,
        0.01,
    );

    assertEquals(descontoPercentual(null, { valor: 50000, amostras: 5 }), null);
    assertEquals(descontoPercentual(40000, null), null);
});

Deno.test('ajustarScore premia desconto e pune fraude', () => {
    const bom = ajustarScore(70, { desconto: 30, urgencia: 'IMEDIATA' });

    assert(bom.score > 70);
    assertEquals(bom.motivos.length, 2);

    const ruim = ajustarScore(70, { risco: 'ALTO' });

    assertEquals(ruim.score, 45);

    // Nunca sai da faixa 0-100.
    assertEquals(ajustarScore(98, { desconto: 40 }).score, 100);
    assertEquals(ajustarScore(5, { risco: 'ALTO' }).score, 0);
});

Deno.test('asUrgencia e asRisco só aceitam valores conhecidos', () => {
    assertEquals(asUrgencia('imediata'), 'IMEDIATA');
    assertEquals(asUrgencia('urgentíssima'), null);
    assertEquals(asRisco('alto'), 'ALTO');
    assertEquals(asRisco(''), null);
});

Deno.test('proximaTentativa cresce e tem teto de 1 hora', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');

    assertEquals(
        proximaTentativa(1, base),
        '2026-01-01T00:02:00.000Z',
    );

    assertEquals(
        proximaTentativa(3, base),
        '2026-01-01T00:08:00.000Z',
    );

    assertEquals(
        proximaTentativa(MAX_TENTATIVAS + 10, base),
        '2026-01-01T01:00:00.000Z',
    );
});

// ── Seleção pelos critérios do alvo ─────────────────────────
//
// O funil ficou fechado (8 lidas, 8 descartadas) porque a
// seleção comparava o texto cru da IA com o nome cadastrado
// no alvo. Os casos abaixo fixam o contrato novo.

const cadastro: Empreendimento[] = [
    {
        nome: 'Golden Laghetto Resort',
        cidade: 'Olímpia',
        estado: 'SP',
        aliases: ['Golden Laghetto', 'Laghetto Olímpia'],
    },
    {
        nome: 'Hot Beach Suítes',
        cidade: 'Olímpia',
        estado: 'SP',
        aliases: ['Hot Beach'],
    },
    {
        nome: 'Mavsa Resort',
        cidade: 'Cesário Lange',
        estado: 'SP',
        aliases: [],
    },
];

const alvoOlimpia: Alvo = {
    id: 'alvo-1',
    nome: 'Cotas em Olímpia',
    empreendimentos: ['Golden Laghetto Resort'],
    score_minimo: 60,
};

const anuncioGolden =
    'Vendo cota no Golden Laghetto, semana 32, 2 dormitórios. ' +
    'R$ 48.000.';

Deno.test('resolverEmpreendimento casa por nome e por alias', () => {
    assertEquals(
        resolverEmpreendimento('Golden Laghetto', cadastro)?.nome,
        'Golden Laghetto Resort',
    );

    assertEquals(
        resolverEmpreendimento('golden laghetto resort', cadastro)?.nome,
        'Golden Laghetto Resort',
    );

    assertEquals(resolverEmpreendimento('Pousada X', cadastro), null);
    assertEquals(resolverEmpreendimento(null, cadastro), null);
});

Deno.test('mesmoEmpreendimento liga apelido e nome oficial', () => {
    assert(
        mesmoEmpreendimento(
            'Golden Laghetto Resort',
            'Golden Laghetto',
            cadastro,
        ),
    );

    assert(
        mesmoEmpreendimento('Hot Beach', 'Hot Beach Suítes', cadastro),
    );

    assert(
        !mesmoEmpreendimento('Mavsa Resort', 'Hot Beach', cadastro),
    );

    // Sem cadastro só o nome idêntico (normalizado) casa.
    assert(mesmoEmpreendimento('Mavsa Resort', 'mavsa resort'));
    assert(!mesmoEmpreendimento('Golden Laghetto', 'Golden Laghetto Resort'));
});

Deno.test('selecionar aprova o apelido resolvido pelo cadastro', () => {
    const ai = {
        empreendimento: 'Golden Laghetto',
        tipo_oportunidade: 'VENDA_COTA',
        score_oportunidade: 80,
    };

    // Sem contexto: o texto cru não bate com o nome do alvo.
    const semContexto = selecionar(ai, alvoOlimpia);

    assertEquals(semContexto.aprovado, false);
    assertEquals(semContexto.regra, REGRAS.EMPREENDIMENTO_FORA);

    // Com o cadastro, o alias é reconhecido.
    const comContexto = selecionar(ai, alvoOlimpia, {
        empreendimento: 'Golden Laghetto Resort',
        empreendimentos: cadastro,
        texto: anuncioGolden,
    });

    assert(comContexto.aprovado, comContexto.motivo);
    assertEquals(comContexto.regra, REGRAS.APROVADA);
    assertEquals(comContexto.revisar, false);
});

Deno.test(
    'selecionar manda para validação manual quando o texto cita o alvo',
    () => {
        const ai = {
            empreendimento: null,
            tipo_oportunidade: 'VENDA_COTA',
            score_oportunidade: 70,
        };

        const r = selecionar(ai, alvoOlimpia, {
            empreendimento: null,
            empreendimentos: cadastro,
            texto: anuncioGolden,
        });

        assert(r.aprovado, r.motivo);
        assertEquals(r.regra, REGRAS.VALIDACAO_MANUAL);
        assertEquals(r.revisar, true);
        assert(r.motivo.includes('confira antes de abordar'));
    },
);

Deno.test(
    'selecionar descarta quando não há empreendimento nem termo do alvo',
    () => {
        const r = selecionar({
            empreendimento: null,
            tipo_oportunidade: 'VENDA_COTA',
            score_oportunidade: 90,
        }, alvoOlimpia, {
            empreendimentos: cadastro,
            texto: 'Alugo chalé na serra para o feriado.',
        });

        assertEquals(r.aprovado, false);
        assertEquals(r.regra, REGRAS.EMPREENDIMENTO_NAO_IDENTIFICADO);
    },
);

Deno.test('selecionar classifica cada regra de descarte', () => {
    const base = {
        empreendimento: 'Golden Laghetto Resort',
        tipo_oportunidade: 'VENDA_COTA',
        score_oportunidade: 90,
    };

    const ctx = {
        empreendimento: 'Golden Laghetto Resort',
        empreendimentos: cadastro,
        texto: anuncioGolden,
    };

    assertEquals(
        selecionar(
            { ...base, tipo_oportunidade: 'ALUGUEL' },
            { ...alvoOlimpia, tipos_negocio: ['VENDA_COTA'] },
            ctx,
        ).regra,
        REGRAS.TIPO_FORA,
    );

    assertEquals(
        selecionar({ ...base, score_oportunidade: 10 }, alvoOlimpia, ctx)
            .regra,
        REGRAS.SCORE_BAIXO,
    );

    assertEquals(
        selecionar(
            {
                ...base,
                periodo_inicio: '2026-01-10',
                periodo_fim: '2026-01-20',
            },
            {
                ...alvoOlimpia,
                periodo_inicio: '2026-07-01',
                periodo_fim: '2026-12-31',
            },
            ctx,
        ).regra,
        REGRAS.PERIODO_FORA,
    );

    assertEquals(
        selecionar(
            { ...base, numero_semana: 5 },
            { ...alvoOlimpia, semanas: [30, 31, 32] },
            ctx,
        ).regra,
        REGRAS.SEMANA_FORA,
    );

    assertEquals(
        selecionar(
            { ...base, valor_anunciado: 10_000 },
            { ...alvoOlimpia, valor_min: 30_000 },
            ctx,
        ).regra,
        REGRAS.VALOR_FORA,
    );

    assertEquals(
        selecionar(
            { ...base, dormitorios: 1 },
            { ...alvoOlimpia, dormitorios_min: 2 },
            ctx,
        ).regra,
        REGRAS.DORMITORIOS_ABAIXO,
    );

    assertEquals(
        selecionar(
            { ...base, capacidade_adultos: 2, capacidade_criancas: 0 },
            { ...alvoOlimpia, capacidade_min: 6 },
            ctx,
        ).regra,
        REGRAS.CAPACIDADE_ABAIXO,
    );

    assertEquals(selecionar(base, null).regra, REGRAS.SEM_ALVO);
});

Deno.test('termosDoAlvo expande o alvo cadastrado por apelido', () => {
    const termos = termosDoAlvo(
        { nome: 'alvo', empreendimentos: ['Golden Laghetto'] },
        cadastro,
    );

    // O alvo cita o apelido, mas o pré-filtro passa a conhecer
    // o nome oficial e os demais aliases da mesma ficha.
    assert(termos.includes('Golden Laghetto Resort'));
    assert(termos.includes('Laghetto Olímpia'));
    assert(!termos.includes('Mavsa Resort'));
});

Deno.test('preFiltrar reconhece o alvo cadastrado por apelido', () => {
    const r = preFiltrar(
        anuncioGolden,
        { nome: 'alvo', empreendimentos: ['Golden Laghetto Resort'] },
        cadastro,
    );

    assert(r.aprovado, r.motivo);
});

Deno.test('rotuloRegra traduz as regras conhecidas', () => {
    assertEquals(
        rotuloRegra(REGRAS.SCORE_BAIXO),
        'Score abaixo do mínimo do alvo',
    );

    assertEquals(rotuloRegra('INVENTADA'), 'INVENTADA');
    assertEquals(rotuloRegra(null), 'Não classificada');
});


// ── Limpeza / retenção ──────────────────────────────────────

Deno.test('limpeza — alvo desconhecido não vira DELETE', () => {
    assertEquals(politicaLimpeza('tabela_secreta'), null);
    assertEquals(politicaLimpeza(''), null);
    assertEquals(politicaLimpeza(null), null);
    assertEquals(politicaLimpeza(123), null);
});

Deno.test('limpeza — alvo válido aceita espaços e maiúsculas', () => {
    const p = politicaLimpeza('  Cache_IA ');

    assert(p);
    assertEquals(p?.tabela, 'radar_analise_cache');
});

Deno.test('limpeza — dias nunca descem abaixo do mínimo', () => {
    const p = politicaLimpeza('capturas_abandonadas')!;

    assertEquals(diasLimpeza(p, 0), p.diasMinimo);
    assertEquals(diasLimpeza(p, -500), p.diasMinimo);
    assertEquals(diasLimpeza(p, 1), p.diasMinimo);
});

Deno.test('limpeza — dias ausentes ou inválidos usam o padrão', () => {
    const p = politicaLimpeza('alertas')!;

    assertEquals(diasLimpeza(p, undefined), p.diasPadrao);
    assertEquals(diasLimpeza(p, 'abc'), p.diasPadrao);
    assertEquals(diasLimpeza(p, NaN), p.diasPadrao);
});

Deno.test('limpeza — dias têm teto e são inteiros', () => {
    const p = politicaLimpeza('alertas')!;

    assertEquals(diasLimpeza(p, 999999), DIAS_LIMPEZA_MAXIMO);
    assertEquals(diasLimpeza(p, 120.9), 120);
});

Deno.test('limpeza — corte é calculado para trás no tempo', () => {
    const agora = new Date('2026-03-10T12:00:00.000Z');

    assertEquals(
        corteLimpeza(10, agora),
        '2026-02-28T12:00:00.000Z',
    );
});

Deno.test('limpeza — oportunidades vivas ficam fora da política', () => {
    const p = politicaLimpeza('oportunidades_descartadas')!;

    assertEquals(p.estados, ['DESCARTADA']);
    assert(!p.estados?.includes('VALIDAR'));
    assert(!p.estados?.includes('APROVADA'));
});

Deno.test('limpeza — toda política aponta para tabela do Radar', () => {
    for (const p of Object.values(LIMPEZAS)) {
        assert(p.tabela.startsWith('radar_'));
        assert(p.colunaData.length > 0);
        assert(p.diasMinimo > 0);
        assert(p.diasPadrao >= p.diasMinimo);
    }
});


// ── Dedupe semântico ────────────────────────────────────────

Deno.test('cosseno — vetores idênticos valem 1', () => {
    assertAlmostEquals(cosseno([1, 2, 3], [1, 2, 3]), 1, 1e-9);
});

Deno.test('cosseno — vetores ortogonais valem 0', () => {
    assertEquals(cosseno([1, 0], [0, 1]), 0);
});

Deno.test('cosseno — entrada inválida devolve 0 sem quebrar', () => {
    assertEquals(cosseno([1, 2], [1]), 0);
    assertEquals(cosseno([], []), 0);
    assertEquals(cosseno([0, 0], [1, 1]), 0);
    assertEquals(cosseno([NaN, 1], [1, 1]), 0);
    // deno-lint-ignore no-explicit-any
    assertEquals(cosseno(null as any, [1]), 0);
});

Deno.test('semântico — escolhe o vizinho mais parecido', () => {
    const d = duplicadaSemantica([
        { oportunidade_id: 'a', similaridade: 0.91 },
        { oportunidade_id: 'b', similaridade: 0.97 },
    ]);

    assertEquals(d?.id, 'b');
    assertEquals(d?.similaridade, 0.97);
});

Deno.test('semântico — abaixo do limiar não é duplicata', () => {
    assertEquals(
        duplicadaSemantica([{ oportunidade_id: 'a', similaridade: 0.85 }]),
        null,
    );
    assertEquals(duplicadaSemantica([]), null);
    assertEquals(duplicadaSemantica(null), null);
    assert(LIMIAR_SEMANTICO > 0.8);
});

Deno.test('semântico — vizinho sem id é ignorado', () => {
    assertEquals(
        duplicadaSemantica([{ oportunidade_id: null, similaridade: 0.99 }]),
        null,
    );
});


// ── Inteligência competitiva ────────────────────────────────

Deno.test('grupo — mesma cota gera a mesma chave', () => {
    const a = chaveGrupo({
        empreendimento: 'Golden Gramado',
        tipo: 'COTA',
        numeroSemana: 12,
    });

    const b = chaveGrupo({
        empreendimento: 'golden  gramado',
        tipo: 'COTA',
        numeroSemana: 12,
    });

    assertEquals(a, b);
    assert(a !== null);
});

Deno.test('grupo — empreendimentos diferentes não se misturam', () => {
    assert(
        chaveGrupo({ empreendimento: 'Golden', tipo: 'COTA' }) !==
            chaveGrupo({ empreendimento: 'Laghetto', tipo: 'COTA' }),
    );
});

Deno.test('grupo — sem empreendimento não há comparação', () => {
    assertEquals(chaveGrupo({ empreendimento: '' }), null);
    assertEquals(chaveGrupo({ empreendimento: null }), null);
});

Deno.test('grupo — sem semana, o mês separa os períodos', () => {
    const jan = chaveGrupo({
        empreendimento: 'Golden',
        tipo: 'COTA',
        periodoInicio: '2026-01-10',
    });

    const fev = chaveGrupo({
        empreendimento: 'Golden',
        tipo: 'COTA',
        periodoInicio: '2026-02-10',
    });

    assert(jan !== fev);
});

Deno.test('grupo — rótulo é legível para o operador', () => {
    assertEquals(
        rotuloGrupo({
            empreendimento: 'Golden',
            tipo: 'COTA',
            numeroSemana: 7,
        }),
        'Golden · COTA · sem. 7',
    );
});

Deno.test('grupo — acumular amplia a faixa de preço', () => {
    const agora = new Date('2026-03-01T00:00:00.000Z');

    const g = acumularGrupo(
        {
            anuncios: 1,
            fontes: 1,
            valor_minimo: 40000,
            valor_maximo: 40000,
        },
        { valor: 25000, fonteNova: true },
        agora,
    );

    assertEquals(g.anuncios, 2);
    assertEquals(g.fontes, 2);
    assertEquals(g.valor_minimo, 25000);
    assertEquals(g.valor_maximo, 40000);
    assertEquals(g.ultimo_em, '2026-03-01T00:00:00.000Z');
});

Deno.test('grupo — anúncio sem valor preserva a faixa conhecida', () => {
    const g = acumularGrupo(
        { anuncios: 2, fontes: 1, valor_minimo: 30000, valor_maximo: 50000 },
        { valor: null },
    );

    assertEquals(g.valor_minimo, 30000);
    assertEquals(g.valor_maximo, 50000);
    assertEquals(g.fontes, 1);
});

Deno.test('grupo — primeiro anúncio começa o grupo', () => {
    const g = acumularGrupo(null, { valor: 10000, fonteNova: true });

    assertEquals(g.anuncios, 1);
    assertEquals(g.fontes, 1);
    assertEquals(g.valor_minimo, 10000);
});

Deno.test('grupo — leitura traz variação e dias em mercado', () => {
    const l = lerGrupo({
        anuncios: 4,
        fontes: 2,
        valor_minimo: 20000,
        valor_maximo: 30000,
        primeiro_em: '2026-01-01T00:00:00.000Z',
        ultimo_em: '2026-01-11T00:00:00.000Z',
    });

    assertEquals(l?.variacaoPct, 50);
    assertEquals(l?.diasEmMercado, 10);
    assertEquals(l?.menorValor, 20000);
    assert(l!.resumo.includes('4 anúncios'));
    assert(l!.resumo.includes('10 dia(s)'));
});

Deno.test('grupo — anúncio isolado não vira comparação', () => {
    assertEquals(lerGrupo({ anuncios: 1, fontes: 1 }), null);
    assertEquals(lerGrupo(null), null);
});


// ── Saúde operacional ───────────────────────────────────────

Deno.test('saúde — pipeline em ordem não gera incidente', () => {
    const agora = new Date('2026-03-01T12:00:00.000Z');

    assertEquals(
        avaliarSaude(
            {
                fila: { PENDENTE: 10, ERRO: 1 },
                fontes: [{ id: 'f1', nome: 'RSS', falhas_consecutivas: 0 }],
                custoHojeUSD: 0.4,
                ultimaCapturaEm: '2026-03-01T11:30:00.000Z',
            },
            undefined,
            agora,
        ),
        [],
    );
});

Deno.test('saúde — fila acima do teto vira incidente', () => {
    const i = avaliarSaude({ fila: { PENDENTE: 500 } });

    assertEquals(i.length, 1);
    assertEquals(i[0].tipo, 'FILA_TRAVADA');
    assertEquals(i[0].severidade, 'CRITICO');
    assertEquals(i[0].alvo, 'global');
});

Deno.test('saúde — fonte com falhas seguidas é apontada por id', () => {
    const i = avaliarSaude({
        fontes: [
            { id: 'f1', nome: 'Instagram', falhas_consecutivas: 5, ativo: false },
            { id: 'f2', nome: 'RSS', falhas_consecutivas: 1 },
        ],
    });

    assertEquals(i.length, 1);
    assertEquals(i[0].tipo, 'FONTE_FALHANDO');
    assertEquals(i[0].alvo, 'f1');
    assertEquals(i[0].severidade, 'CRITICO');
});

Deno.test('saúde — custo acima do teto é avisado', () => {
    const i = avaliarSaude({ custoHojeUSD: 7 });

    assertEquals(i[0].tipo, 'CUSTO_ALTO');
    assertEquals(i[0].severidade, 'AVISO');
});

Deno.test('saúde — robô parado é crítico', () => {
    const i = avaliarSaude(
        { ultimaCapturaEm: '2026-03-01T00:00:00.000Z' },
        undefined,
        new Date('2026-03-01T12:00:00.000Z'),
    );

    assertEquals(i[0].tipo, 'SEM_CAPTURA');
    assertEquals(i[0].severidade, 'CRITICO');
    assertEquals(i[0].detalhes.horas, 12);
});

Deno.test('saúde — dead letter acima do teto é avisado', () => {
    const i = avaliarSaude({ fila: { ABANDONADO: 30, ERRO: 5 } });

    assertEquals(i[0].tipo, 'DEAD_LETTER');
    assertEquals(i[0].detalhes.mortas, 35);
});

Deno.test('saúde — estado vazio não gera incidente', () => {
    assertEquals(avaliarSaude({}), []);
});

Deno.test('saúde — limites vêm do ambiente com padrão seguro', () => {
    const env: Record<string, string> = {
        RADAR_SAUDE_FILA_MAXIMA: '50',
        RADAR_SAUDE_CUSTO_DIARIO: 'abc',
    };

    const l = limitesDeAmbiente((n) => env[n]);

    assertEquals(l.filaMaxima, 50);
    assertEquals(l.custoDiarioUSD, 5);
    assertEquals(l.horasSemCaptura, 6);
});

// ── Quem está divulgando ────────────────────────────────────

Deno.test('anunciante — nome e telefone no meio do anúncio', () => {
    const a = extrairAnunciante(
        'Vendo cota no Olímpia Park, semana 32, R$ 48.000,00. ' +
            'Falar com Maria Silva no whats (17) 99999-0000.',
    );

    assertEquals(a.nome, 'Maria Silva');
    assertEquals(a.telefone, '(17) 99999-0000');
    assertEquals(a.contato, '(17) 99999-0000');
});

Deno.test('anunciante — telefone com +55 e pontos', () => {
    const a = extrairAnunciante('Contato: +55 17 3333.0000');

    assertEquals(a.telefone, '(17) 3333-0000');
});

Deno.test('anunciante — valor em reais não vira telefone', () => {
    const a = extrairAnunciante(
        'Repasse por R$ 45.000,00 ou 12x de 3.750,00. Sem contato.',
    );

    assertEquals(a.telefone, null);
    assertEquals(a.contato, null);
});

Deno.test('anunciante — número curto só vale com palavra de contato', () => {
    assertEquals(extrairTelefones('Chama no zap 99999-0000')[0], '99999-0000');
    assertEquals(extrairTelefones('Semana 3210 1234 do calendário'), []);
});

Deno.test('anunciante — e-mail e perfil quando não há telefone', () => {
    const a = extrairAnunciante(
        'Interessados chamar no direct ou joao.corretor@exemplo.com.br',
        '@joao.corretor',
    );

    assertEquals(a.email, 'joao.corretor@exemplo.com.br');
    assertEquals(a.perfil, '@joao.corretor');
    assertEquals(a.contato, 'joao.corretor@exemplo.com.br');
    assertEquals(a.nome, '@joao.corretor');
});

Deno.test('anunciante — autor da fonte é usado quando o texto não diz', () => {
    const a = extrairAnunciante('Vendo semana 32.', 'Carlos Andrade');

    assertEquals(a.nome, 'Carlos Andrade');
    assertEquals(a.telefone, null);
});

Deno.test('anunciante — "Whatsapp" não é lido como nome', () => {
    const a = extrairAnunciante('Contato: Whatsapp 17 98888-0000');

    assertEquals(a.nome, null);
    assertEquals(a.telefone, '(17) 98888-0000');
});


Deno.test('suspensaoDaFonte corta token expirado na 1ª falha', () => {
    assertEquals(suspensaoDaFonte('OK', 0), null);
    assertEquals(suspensaoDaFonte('ERRO', 1), null);
    assertEquals(suspensaoDaFonte('ERRO', 2), null);
    assertEquals(suspensaoDaFonte('ERRO', 3), 15);
    assertEquals(suspensaoDaFonte('ERRO', 5), 60);

    assertEquals(
        suspensaoDaFonte('ERRO', 20),
        SUSPENSAO_MAXIMA_MIN,
    );

    // Token vencido não se conserta sozinho: suspende já.
    assertEquals(
        suspensaoDaFonte('EXPIRADA', 1),
        SUSPENSAO_CREDENCIAL_MIN,
    );

    assertEquals(suspensaoDaFonte('EXPIRADA', 0), null);
});
