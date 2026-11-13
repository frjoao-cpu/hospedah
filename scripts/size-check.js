#!/usr/bin/env node
/**
 * HOSPEDAH — Verificação local de tamanho de assets
 *
 * Uso: npm run check:assets
 *
 * Verifica arquivos críticos usando limites em KiB (1 KiB = 1024 bytes).
 * Arquivos ausentes são avisados, mas não falham o check para manter
 * compatibilidade com instalações/variantes que não incluem todos os assets.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LIMITS_KIB = {
  'script.js': 150,
  'sw.js': 50,
  'assets/style.css': 120,
  'assets/index.css': 80,
  'assets/index-inline.css': 50,
  'assets/mobile-first.css': 60,
  'assets/portal.css': 80,
  'assets/admin.css': 120,
  'assets/admin.js': 500,
  'sistema.html': 740,
};

let failed = 0;
const rows = [];

for (const [file, limitKiB] of Object.entries(LIMITS_KIB)) {
  const absolutePath = path.join(ROOT, file);
  if (!fs.existsSync(absolutePath)) {
    rows.push({ file, size: '—', limit: `${limitKiB} KiB`, status: '⚠️ ausente' });
    continue;
  }

  const bytes = fs.statSync(absolutePath).size;
  const limitBytes = limitKiB * 1024;
  const passed = bytes <= limitBytes;
  if (!passed) failed += 1;

  rows.push({
    file,
    size: `${(bytes / 1024).toFixed(1)} KiB`,
    limit: `${limitKiB} KiB`,
    status: passed ? '✅' : '❌ excedeu',
  });
}

const columns = [34, 12, 12, 14];
const headings = ['Arquivo', 'Tamanho', 'Limite', 'Status'];
const separator = columns.map(width => '─'.repeat(width)).join('┼');
const formatRow = values => values
  .map((value, index) => String(value).padEnd(columns[index]))
  .join('│');

console.log('\n📦 Verificação de tamanho de assets — HOSPEDAH\n');
console.log(formatRow(headings));
console.log(separator);
for (const item of rows) {
  console.log(formatRow([item.file, item.size, item.limit, item.status]));
}

if (failed > 0) {
  console.error(`\n❌ ${failed} asset(s) excederam o limite. Comprima ou divida os arquivos.\n`);
  process.exitCode = 1;
} else {
  console.log('\n✅ Todos os assets encontrados estão dentro dos limites.\n');
}
