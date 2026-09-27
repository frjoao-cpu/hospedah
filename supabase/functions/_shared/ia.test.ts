// ============================================================
// HOSPEDAH — Testes do retry da camada de IA
//
// Execução: deno test supabase/functions/_shared/
// ============================================================

import {
    assert,
    assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { erroTransitorio, esperaRetry, IAError } from './ia.ts';

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
