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
    ajustarScore,
    asRisco,
    asUrgencia,
    descontoPercentual,
    hashTexto,
    impressaoDigital,
    MAX_TENTATIVAS,
    proximaTentativa,
    referenciaDePreco,
    similaridade,
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
