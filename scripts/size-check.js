#!/usr/bin/env node
/**
 * HOSPEDAH — Verificação local de tamanho de assets
 *
 * Uso: npm run size-check
 *
 * Exibe o tamanho de cada asset crítica e avisa quando
 * ultrapassa o limite definido (em KB).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const LIMITS = {
  'script.js':              150,
  'sw.js':                   50,
  'assets/style.css':       120,
  'assets/index.css':        80,
  'assets/mobile-first.css': 60,
  'assets/admin.js':        500,
};

let failed = 0;
const rows = [];

for (const [file, limitKb] of Object.entries(LIMITS)) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    rows.push({ file, size: '—', limit: limitKb + ' KB', status: '⚠️  não encontrado' });
    continue;
  }
  const bytes = fs.statSync(abs).size;
  const sizeKb = Math.round(bytes / 1024);
  const ok = sizeKb <= limitKb;
  if (!ok) failed++;
  rows.push({
    file,
    size:   sizeKb + ' KB',
    limit:  limitKb + ' KB',
    status: ok ? '✅' : '❌ EXCEDEU',
  });
}

// Tabela
const colWidths = [32, 10, 10, 14];
const header = ['Arquivo', 'Tamanho', 'Limite', 'Status'];
const line = colWidths.map(w => '─'.repeat(w)).join('┼');

function row(cols) {
  return cols.map((c, i) => String(c).padEnd(colWidths[i])).join('│');
}

console.log('\n📦 Verificação de Tamanho de Assets — HOSPEDAH\n');
console.log(row(header));
console.log(line);
rows.forEach(r => console.log(row([r.file, r.size, r.limit, r.status])));

console.log('');
if (failed > 0) {
  console.error(`❌ ${failed} asset(s) excederam o limite. Comprima ou divida o arquivo.\n`);
  process.exit(1);
} else {
  console.log('✅ Todas as assets dentro do limite.\n');
}
