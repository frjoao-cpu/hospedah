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
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" sizes="180x180">
<link rel="icon" type="image/svg+xml" href="/assets/logo-favicon.svg" sizes="any">
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
<link rel="stylesheet" href="../assets/mobile-first.css">
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
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true" focusable="false"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg> Solicitar orçamento
</a>

<a href="https://www.instagram.com/julianasilvaoliveira.joao" class="instagram" target="_blank" rel="noopener noreferrer">
📸 Instagram Oficial
</a>

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

<!-- SECURITY SEAL -->
<div class="security-seal" aria-label="Site seguro">🔒 <strong>Site Seguro</strong> &nbsp;·&nbsp; SSL Criptografado &nbsp;·&nbsp; 🛡️ Dados Protegidos</div>

<script src="/scripts/navbar.js" data-page="resort"></script>
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
