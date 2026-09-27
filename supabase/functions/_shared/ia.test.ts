// ============================================================
// HOSPEDAH — Testes do retry da camada de IA
//
// Execução: deno test supabase/functions/_shared/
// ============================================================

import {
    assert,
    assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
    ajustarDimensao,
    DIMENSAO_EMBEDDING,
    embutir,
    erroTransitorio,
    esperaRetry,
    IAError,
} from './ia.ts';

Deno.test('retry — 429/502/503/504 são transitórios', () => {
    for (const status of [429, 502, 503, 504]) {
        assert(erroTransitorio(new IAError('instável', status)));
    }
});

Deno.test('retry — erro de conteúdo ou credencial não repete', () => {
    assert(!erroTransitorio(new IAError('JSON inválido', 500)));
    assert(!erroTransitorio(new IAError('modelo ausente', 404)));
    assert(!erroTransitorio(new Error('qualquer outro')));
    assert(!erroTransitorio(null));
});

Deno.test('retry — espera cresce e tem teto', () => {
    assertEquals(esperaRetry(0), 500);
    assertEquals(esperaRetry(1), 1000);
    assertEquals(esperaRetry(2), 2000);
    assertEquals(esperaRetry(10), 8000);
    assertEquals(esperaRetry(-3), 500);
});


// ── Embeddings ──────────────────────────────────────────────

Deno.test('embedding — vetor maior é truncado à dimensão do banco', () => {
    const v = ajustarDimensao(new Array(1536).fill(1));

    assertEquals(v.length, DIMENSAO_EMBEDDING);
});

Deno.test('embedding — vetor menor é completado com zero', () => {
    const v = ajustarDimensao([3, 4]);

    assertEquals(v.length, DIMENSAO_EMBEDDING);
    assertEquals(v[DIMENSAO_EMBEDDING - 1], 0);
});

Deno.test('embedding — saída fica normalizada', () => {
    const v = ajustarDimensao([3, 4]);

    let norma = 0;

    for (const n of v) norma += n * n;

    assert(Math.abs(Math.sqrt(norma) - 1) < 1e-9);
});

Deno.test('embedding — valores inválidos viram zero', () => {
    const v = ajustarDimensao([NaN, 1]);

    assertEquals(v[0], 0);
    assertEquals(v[1], 1);
});

Deno.test('embedding — vetor nulo não quebra a normalização', () => {
    const v = ajustarDimensao([0, 0]);

    assertEquals(v[0], 0);
    assertEquals(v.length, DIMENSAO_EMBEDDING);
});

Deno.test('embedding — texto vazio não chama provedor', async () => {
    assertEquals(await embutir('   '), null);
});
