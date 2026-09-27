// ============================================================
// HOSPEDAH — Testes dos motores genéricos de fonte
//
// Garante que qualquer fonte cadastrada (página pública, feed
// RSS/Atom, API JSON) produza o MESMO formato de captura, e que
// a URL venha da configuração do banco — nunca do código.
//
// Execução: deno test supabase/functions/_shared/
// ============================================================

import {
    assert,
    assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
    feedParaItens,
    itensDoJson,
    jsonParaItens,
    limiteDaFonte,
    limparMarcacao,
    listaParaItens,
    montarUrl,
    motorDaFonte,
    paginacaoDaFonte,
    paginaParaItem,
    proximaPaginaJson,
    queryDaPagina,
    requisicaoDaFonte,
    selecionarBlocos,
    TIPOS_FONTE,
    urlDaFonte,
    urlsDaFonte,
    validarUrlFonte,
} from './radar-fontes.ts';

Deno.test('motorDaFonte cobre as famílias de fonte', () => {
    assertEquals(motorDaFonte('INSTAGRAM_GRAPH'), 'INSTAGRAM');
    assertEquals(motorDaFonte('FACEBOOK_GRAPH'), 'FACEBOOK');
    assertEquals(motorDaFonte('WEB_PUBLICA'), 'WEB');
    assertEquals(motorDaFonte('SITE'), 'WEB');
    assertEquals(motorDaFonte('HTML'), 'WEB');
    assertEquals(motorDaFonte('RSS'), 'FEED');
    assertEquals(motorDaFonte('ATOM'), 'FEED');
    assertEquals(motorDaFonte('JSON_API'), 'API');
    assertEquals(motorDaFonte('MANUAL'), null);
    assertEquals(motorDaFonte('IMPORT'), null);
});

Deno.test('TIPOS_FONTE aceita os tipos genéricos', () => {
    for (
        const t of [
            'INSTAGRAM_GRAPH',
            'FACEBOOK_GRAPH',
            'WEB_PUBLICA',
            'RSS',
            'API',
            'MANUAL',
            'IMPORT',
        ]
    ) {
        assert(TIPOS_FONTE.includes(t), t + ' deveria ser aceito');
    }

    assert(!TIPOS_FONTE.includes('EMAIL'));
});

Deno.test('urlDaFonte lê config.url e cai no identificador', () => {
    assertEquals(
        urlDaFonte({ config: { url: 'https://exemplo.com/a' } }),
        'https://exemplo.com/a',
    );

    assertEquals(
        urlDaFonte({ identificador_externo: 'https://exemplo.com/b' }),
        'https://exemplo.com/b',
    );

    assertEquals(urlDaFonte({ config: {} }), null);
});

Deno.test('validarUrlFonte barra vazio, esquema e rede interna', () => {
    assertEquals(validarUrlFonte('https://exemplo.com/pagina'), null);
    assert(validarUrlFonte(null));
    assert(validarUrlFonte('ftp://exemplo.com'));
    assert(validarUrlFonte('http://localhost:8000'));
    assert(validarUrlFonte('http://169.254.169.254/latest/meta-data'));
    assert(validarUrlFonte('não é url'));
});

Deno.test('limparMarcacao remove script, estilo e comentários', () => {
    const texto = limparMarcacao(
        '<div><script>var a=1;</script><style>.a{}</style>' +
            '<!-- oculto -->Cota <b>Hot Beach</b> &amp; spa</div>',
    );

    assertEquals(texto, 'Cota Hot Beach & spa');
});

Deno.test('paginaParaItem normaliza a página pública', () => {
    const html = '<html><head><title>Cotas à venda</title>' +
        '<meta property="og:image" content="/img/capa.jpg">' +
        '</head><body><script>x()</script>' +
        '<p>Vendo cota Hot Beach Suítes</p></body></html>';

    const item = paginaParaItem(html, 'https://portal.com.br/cotas', 'Portal');

    assert(item);
    assertEquals(item?.permalink, 'https://portal.com.br/cotas');
    assert(item?.texto.includes('Cotas à venda'));
    assert(item?.texto.includes('Hot Beach Suítes'));
    assert(!item?.texto.includes('x()'));
    assertEquals(item?.midia_url, 'https://portal.com.br/img/capa.jpg');
    assertEquals(item?.autor, 'Portal');
    assert(item?.external_id?.startsWith('https://portal.com.br/cotas#'));

    // Mesmo conteúdo → mesmo external_id: a dedupe por
    // (fonte_id, external_id) impede regravar a cada varredura.
    const repetida = paginaParaItem(
        html,
        'https://portal.com.br/cotas',
        'Portal',
    );

    assertEquals(item?.external_id, repetida?.external_id);

    assertEquals(paginaParaItem('<html></html>', 'https://x.com/a'), null);
});

Deno.test('feedParaItens lê RSS e Atom', () => {
    const rss = `<rss><channel>
      <item>
        <title>Cota Solar das Águas</title>
        <description><![CDATA[<p>Semana 30 &agrave; venda</p>]]></description>
        <link>https://portal.com.br/1</link>
        <guid>abc-1</guid>
        <pubDate>Tue, 03 Jun 2025 10:00:00 GMT</pubDate>
        <enclosure url="https://portal.com.br/1.jpg"/>
        <author>Corretor</author>
      </item>
    </channel></rss>`;

    const itens = feedParaItens(rss, 'https://portal.com.br/feed', 25);

    assertEquals(itens.length, 1);
    assertEquals(itens[0].external_id, 'abc-1');
    assertEquals(itens[0].permalink, 'https://portal.com.br/1');
    assertEquals(itens[0].autor, 'Corretor');
    assertEquals(itens[0].midia_url, 'https://portal.com.br/1.jpg');
    assert(itens[0].texto.includes('Solar das Águas'));
    assert(itens[0].texto.includes('Semana 30 à venda'));
    assertEquals(itens[0].publicado_em, '2025-06-03T10:00:00.000Z');

    const atom = `<feed><entry>
      <title>São Pedro Thermas</title>
      <summary>Cessão de período</summary>
      <link href="https://portal.com.br/2"/>
      <id>tag:2</id>
      <updated>2025-06-04T08:00:00Z</updated>
    </entry></feed>`;

    const deAtom = feedParaItens(atom, 'https://portal.com.br/atom', 25);

    assertEquals(deAtom.length, 1);
    assertEquals(deAtom[0].permalink, 'https://portal.com.br/2');
    assertEquals(deAtom[0].external_id, 'tag:2');
    assertEquals(deAtom[0].publicado_em, '2025-06-04T08:00:00.000Z');
});

Deno.test('feedParaItens respeita o limite por fonte', () => {
    const xml = '<rss>' +
        Array.from(
            { length: 10 },
            (_, i) => '<item><title>Item ' + i + '</title></item>',
        ).join('') +
        '</rss>';

    assertEquals(feedParaItens(xml, 'https://x.com.br/feed', 3).length, 3);
});

Deno.test('itensDoJson acha as coleções comuns e o items_path', () => {
    assertEquals(itensDoJson({ data: [{ a: 1 }] }).length, 1);
    assertEquals(itensDoJson({ items: [{ a: 1 }, { b: 2 }] }).length, 2);
    assertEquals(itensDoJson({ results: [{ a: 1 }] }).length, 1);
    assertEquals(itensDoJson([{ a: 1 }]).length, 1);
    assertEquals(itensDoJson({ data: { items: [{ a: 1 }] } }).length, 1);
    assertEquals(
        itensDoJson({ retorno: { anuncios: [{ a: 1 }] } }, 'retorno.anuncios')
            .length,
        1,
    );
    assertEquals(itensDoJson({ x: 1 }).length, 0);
});

Deno.test('jsonParaItens normaliza registros de API', () => {
    const itens = jsonParaItens(
        {
            data: [
                {
                    id: 77,
                    titulo: 'Cota Olímpia Park',
                    descricao: 'Vendo semana fixa',
                    url: 'https://api.com.br/anuncio/77',
                    autor: 'Maria',
                    created_at: '2025-06-01T12:00:00Z',
                    imagem: 'https://api.com.br/77.jpg',
                },
                { id: 78 },
            ],
        },
        'https://api.com.br/posts',
        25,
        null,
        'Portal API',
    );

    // O registro sem texto é descartado: mesmo contrato das
    // demais fontes.
    assertEquals(itens.length, 1);
    assertEquals(itens[0].external_id, '77');
    assertEquals(itens[0].permalink, 'https://api.com.br/anuncio/77');
    assertEquals(itens[0].autor, 'Maria');
    assertEquals(itens[0].midia_url, 'https://api.com.br/77.jpg');
    assertEquals(itens[0].publicado_em, '2025-06-01T12:00:00.000Z');
    assert(itens[0].texto.includes('Olímpia Park'));
    assert(itens[0].texto.includes('Vendo semana fixa'));
});

Deno.test('toda fonte produz o mesmo formato de captura', () => {
    const campos = [
        'external_id',
        'autor',
        'permalink',
        'texto',
        'midia_url',
        'midia_tipo',
        'publicado_em',
        'payload',
    ];

    const amostras = [
        paginaParaItem(
            '<html><body>Cota à venda</body></html>',
            'https://x.com.br/a',
        ),
        feedParaItens(
            '<rss><item><title>Cota</title></item></rss>',
            'https://x.com.br/feed',
            5,
        )[0],
        jsonParaItens(
            { data: [{ title: 'Cota', url: 'https://x.com.br/1' }] },
            'https://x.com.br/api',
            5,
        )[0],
    ];

    for (const amostra of amostras) {
        assert(amostra);

        for (const campo of campos) {
            assert(
                campo in (amostra as unknown as Record<string, unknown>),
                'faltou ' + campo,
            );
        }
    }
});

// ── Configuração genérica: URLs, limite e requisição ────────

Deno.test('urlsDaFonte aceita uma URL ou uma lista', () => {
    assertEquals(
        urlsDaFonte({ config: { url: 'https://a.com.br/1' } }),
        ['https://a.com.br/1'],
    );

    assertEquals(
        urlsDaFonte({
            config: {
                urls: ['https://a.com.br/1', 'https://a.com.br/2'],
            },
        }),
        ['https://a.com.br/1', 'https://a.com.br/2'],
    );

    // Compatibilidade: fonte antiga só com identificador.
    assertEquals(
        urlsDaFonte({ identificador_externo: 'https://a.com.br/x' }),
        ['https://a.com.br/x'],
    );

    assertEquals(urlsDaFonte({ config: {} }), []);
});

Deno.test('limiteDaFonte respeita o teto do sistema', () => {
    assertEquals(limiteDaFonte({ limit: 5 }, 25), 5);
    assertEquals(limiteDaFonte({ limit: 500 }, 25), 25);
    assertEquals(limiteDaFonte({}, 25), 25);
    assertEquals(limiteDaFonte(null, 25), 25);
});

Deno.test('requisicaoDaFonte monta método, headers e query', () => {
    const r = requisicaoDaFonte({
        method: 'post',
        headers: { 'X-Api-Key': 'abc', Host: 'forjado' },
        query: { pagina: 2 },
        body: { q: 'cota' },
    });

    assertEquals(r.method, 'POST');
    assertEquals(r.headers['X-Api-Key'], 'abc');
    // Header de infraestrutura não é sobrescrito pela config.
    assertEquals(r.headers.Host, undefined);
    assertEquals(r.query.pagina, '2');
    assertEquals(r.body, '{"q":"cota"}');

    assertEquals(
        montarUrl('https://a.com.br/busca', r.query),
        'https://a.com.br/busca?pagina=2',
    );
});

// ── Paginação configurável ──────────────────────────────────

Deno.test('paginação só roda quando a config pede', () => {
    const desligada = paginacaoDaFonte({});

    assertEquals(desligada.ativa, false);
    assertEquals(queryDaPagina(desligada, 1), {});

    const porPagina = paginacaoDaFonte({
        pagination: { enabled: true, param: 'page', start: 1, pages: 3 },
    });

    assertEquals(porPagina.ativa, true);
    assertEquals(porPagina.paginas, 3);
    assertEquals(queryDaPagina(porPagina, 0), {});
    assertEquals(queryDaPagina(porPagina, 2), { page: '3' });

    const porOffset = paginacaoDaFonte({
        pagination: { enabled: true, mode: 'offset', step: 20 },
    });

    assertEquals(queryDaPagina(porOffset, 2), { offset: '40' });
});

Deno.test('paginação nunca passa do teto de páginas', () => {
    const p = paginacaoDaFonte({
        pagination: { enabled: true, pages: 9999 },
    });

    assert(p.paginas <= 5);
});

Deno.test('proximaPaginaJson lê cursor e next_url da config', () => {
    const porNext = paginacaoDaFonte({
        pagination: { enabled: true, mode: 'cursor', next_path: 'paging.next' },
    });

    assertEquals(
        proximaPaginaJson(
            { paging: { next: '/api?p=2' } },
            porNext,
            'https://a.com.br/api',
        ),
        { url: 'https://a.com.br/api?p=2' },
    );

    const porCursor = paginacaoDaFonte({
        pagination: {
            enabled: true,
            mode: 'cursor',
            cursor_path: 'paging.cursors.after',
        },
    });

    assertEquals(
        proximaPaginaJson(
            { paging: { cursors: { after: 'XYZ' } } },
            porCursor,
            'https://a.com.br/api',
        ),
        { cursor: 'XYZ' },
    );

    assertEquals(
        proximaPaginaJson({}, porCursor, 'https://a.com.br/api'),
        null,
    );
});

// ── Motor WEB com seletores vindos do config ────────────────

const HTML_LISTA = `
<html><body>
  <div class="anuncio" data-id="a-1">
    <h2>Cota Hot Beach</h2>
    <p class="txt">Semana disponível para locação</p>
    <a href="/anuncio/1">ver</a>
    <img src="/img/1.jpg">
    <time datetime="2026-01-05T10:00:00Z">05/01</time>
  </div>
  <div class="anuncio" data-id="a-2">
    <h2>Cota Olímpia</h2>
    <p class="txt">Vendo cota</p>
    <a href="https://outro.com.br/2">ver</a>
  </div>
  <div class="rodape">ignorar</div>
</body></html>`;

Deno.test('selecionarBlocos entende seletores simples', () => {
    assertEquals(selecionarBlocos(HTML_LISTA, '.anuncio').length, 2);
    assertEquals(selecionarBlocos(HTML_LISTA, 'div.anuncio').length, 2);
    assertEquals(selecionarBlocos(HTML_LISTA, '[data-id=a-2]').length, 1);
    assertEquals(selecionarBlocos(HTML_LISTA, '.inexistente').length, 0);
});

Deno.test('listaParaItens usa os campos configurados na fonte', () => {
    const itens = listaParaItens(
        HTML_LISTA,
        'https://portal.com.br/lista',
        {
            item_selector: '.anuncio',
            fields: {
                external_id: '@data-id',
                title: 'h2',
                text: '.txt',
                url: 'a@href',
                image: 'img@src',
                published_at: 'time@datetime',
            },
        },
        25,
        'Portal',
    );

    assertEquals(itens.length, 2);
    assertEquals(itens[0].external_id, 'a-1');
    assertEquals(itens[0].permalink, 'https://portal.com.br/anuncio/1');
    assertEquals(itens[0].midia_url, 'https://portal.com.br/img/1.jpg');
    assertEquals(itens[0].publicado_em, '2026-01-05T10:00:00.000Z');
    assert(itens[0].texto.includes('Semana disponível'));
    assertEquals(itens[1].permalink, 'https://outro.com.br/2');
});

Deno.test('listaParaItens respeita o limite e dispensa fields', () => {
    const itens = listaParaItens(
        HTML_LISTA,
        'https://portal.com.br/lista',
        { item_selector: '.anuncio' },
        1,
    );

    assertEquals(itens.length, 1);
    assert(itens[0].texto.includes('Cota Hot Beach'));
});

Deno.test('sem item_selector o motor WEB fica no modo genérico', () => {
    assertEquals(
        listaParaItens(HTML_LISTA, 'https://portal.com.br/lista', {}, 25),
        [],
    );
});

Deno.test('captura de lista não duplica entre varreduras', () => {
    const config = {
        item_selector: '.anuncio',
        fields: { title: 'h2', text: '.txt', url: 'a@href' },
    };

    const a = listaParaItens(HTML_LISTA, 'https://portal.com.br/l', config, 25);
    const b = listaParaItens(HTML_LISTA, 'https://portal.com.br/l', config, 25);

    assertEquals(
        a.map((i) => i.external_id),
        b.map((i) => i.external_id),
    );
});

// ── Motor API com mapeamento de campos ──────────────────────

Deno.test('jsonParaItens aceita fields da config', () => {
    const itens = jsonParaItens(
        {
            registros: [{
                codigo_interno: 'X1',
                assunto: 'Cota Hot Beach',
                corpo: 'Semana disponível',
                pagina: 'https://api.com.br/1',
                quando: '2026-02-01T00:00:00Z',
            }],
        },
        'https://api.com.br/posts',
        25,
        'registros',
        'API',
        {
            external_id: 'codigo_interno',
            title: 'assunto',
            text: 'corpo',
            url: 'pagina',
            published_at: 'quando',
        },
    );

    assertEquals(itens.length, 1);
    assertEquals(itens[0].external_id, 'X1');
    assertEquals(itens[0].permalink, 'https://api.com.br/1');
    assertEquals(itens[0].publicado_em, '2026-02-01T00:00:00.000Z');
    assert(itens[0].texto.includes('Semana disponível'));
});
