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
    limparMarcacao,
    motorDaFonte,
    paginaParaItem,
    TIPOS_FONTE,
    urlDaFonte,
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
