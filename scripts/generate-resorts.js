#!/usr/bin/env node
// ============================================================
// HOSPEDAH — Gerador automático de páginas de resort
//
// Lê  : resorts/data.json
// Gera: resorts/<slug>.html para cada resort definido
//
// Uso:
//   node scripts/generate-resorts.js
//   node scripts/generate-resorts.js --check   (só valida diff, não escreve)
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const DATA_FILE  = path.join(ROOT, 'resorts', 'data.json');
const RESORTS_DIR = path.join(ROOT, 'resorts');
const CHECK_MODE = process.argv.includes('--check');

const data   = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const RESORTS = data.resorts;

/** Gera a URL do WhatsApp com texto codificado */
function waUrl(phone, message) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Gera o bloco de schema.org para o resort */
function schema(resort) {
    const address = { '@type': 'PostalAddress', addressCountry: 'BR' };
    if (resort.city)  address.addressLocality = resort.city;
    if (resort.state) address.addressRegion   = resort.state;

    return JSON.stringify({
        '@context':   'https://schema.org',
        '@type':      'Resort',
        name:         resort.name,
        description:  resort.schemaDescription,
        url:          `https://hospedah.tur.br/resorts/${resort.slug}.html`,
        telephone:    '+5517982006382',
        address,
        sameAs:       ['https://wa.me/5517982006382'],
    });
}

/** Gera as tags <img> da galeria */
function gallery(resort) {
    return resort.images.map((img, i) => {
        const src = `https://i.imgur.com/${img.id}.${img.ext}`;
        const alt = `${resort.name} ${i + 1}`;
        // First image is the LCP candidate — load eagerly with high priority
        const loadAttr = i === 0
            ? `loading="eager" fetchpriority="high"`
            : `loading="lazy"`;
        return `<img src="${src}" alt="${alt}" ${loadAttr} width="800" height="600" onclick="openImg(this)">`;
    }).join('\n');
}

/** Gera o HTML completo da página do resort */
function generate(resort) {
    const canonicalUrl = `https://hospedah.tur.br/resorts/${resort.slug}.html`;
    const waLink = waUrl('5517982006382', resort.whatsappMessage);

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${resort.title}</title>
<meta name="description" content="${resort.description}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#D4AF37">
<!-- Open Graph -->
<meta property="og:type"        content="website">
<meta property="og:url"         content="${canonicalUrl}">
<meta property="og:site_name"   content="HOSPEDAH">
<meta property="og:title"       content="${resort.name} | HOSPEDAH">
<meta property="og:description" content="${resort.description}">
<meta property="og:image"       content="${resort.ogImage}">
<meta property="og:locale"      content="pt_BR">
<!-- Schema.org -->
<script type="application/ld+json">
${schema(resort)}
</script>
<link rel="stylesheet" href="../assets/style.css">
</head>

<body>

<h1>${resort.emoji} ${resort.name}</h1>

<div class="gallery">
${gallery(resort)}
</div>

<div id="lightbox" onclick="closeImg()">
<span class="close">✕</span>
<img id="lightbox-img" alt="Foto ampliada do resort">
</div>

<a href="${waLink}" class="whatsapp" target="_blank" rel="noopener noreferrer">
💬 Solicitar orçamento
</a>

<a href="https://www.instagram.com/julianasilvaoliveira.joao" class="instagram" target="_blank" rel="noopener noreferrer">
📸 Instagram Oficial
</a>

<a href="../index.html" style="position:fixed;top:20px;left:20px;background:#007AFF;color:white;padding:10px 15px;border-radius:8px;text-decoration:none;">← Voltar</a>

<a href="../chat.html?resort=${encodeURIComponent(resort.slug)}" class="chat-resort">🤖 Chat IA</a>

<script>
// Salvar contexto do resort para o Concierge IA
try {
  sessionStorage.setItem('hospedah_busca_ctx', JSON.stringify({ resort: '${resort.slug}' }));
} catch(e) {}

function openImg(img){
    document.getElementById("lightbox").style.display = "flex";
    document.getElementById("lightbox-img").src = img.src;
}

function closeImg(){
    document.getElementById("lightbox").style.display = "none";
}

document.getElementById("lightbox").style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:none;align-items:center;justify-content:center;z-index:9999;";
</script>
<script>if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function(){}); }</script>

</body>
</html>`;
}

let exitCode = 0;

for (const resort of RESORTS) {
    const outFile = path.join(RESORTS_DIR, `${resort.slug}.html`);
    const html    = generate(resort);

    if (CHECK_MODE) {
        // Modo de verificação: falha se o arquivo gerado difere do commitado
        if (!fs.existsSync(outFile)) {
            console.error(`❌ FALTANDO: resorts/${resort.slug}.html (execute generate-resorts.js para gerar)`);
            exitCode = 1;
        } else {
            const existing = fs.readFileSync(outFile, 'utf8');
            if (existing !== html) {
                console.error(`❌ DESATUALIZADO: resorts/${resort.slug}.html difere do data.json`);
                exitCode = 1;
            } else {
                console.log(`✅ OK: resorts/${resort.slug}.html`);
            }
        }
    } else {
        fs.writeFileSync(outFile, html, 'utf8');
        console.log(`✅ Gerado: resorts/${resort.slug}.html`);
    }
}

if (CHECK_MODE && exitCode !== 0) {
    console.error('\nExecute `node scripts/generate-resorts.js` para regenerar as páginas.');
}

process.exit(exitCode);
