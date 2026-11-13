#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SISTEMA_PATH = path.resolve(__dirname, '..', 'sistema.html');
const MAX_INLINE_EVENT_ATTRIBUTES = 252;

const FORBIDDEN_INLINE_PATTERNS = [
  /onclick="tentarLogin\(\)"/,
  /onclick="enviarLinkMagico\(\)"/,
  /onclick="mostrarViewLogin\(\)"/,
  /onclick="enviarResetSenha\(\)"/,
  /onclick="definirNovaSenha\(\)"/,
  /onclick="toggleFloatCalc\(\)"/,
  /onclick="exportarBackup\(\)"/,
  /onclick="importarBackup\(\)"/,
  /onclick="fazerLogout\(\)"/,
  /onclick="toggleNavDropdown\('/,
  /onclick="fecharNavDropdown\('/,
  /onclick="toggleDashboard\(\)"/,
  /onclick="atualizarDashboard\(\)"/,
  /onclick="filtrarPeriodoDash\('/,
  /onclick="exportarDashboard\(\)"/,
  /onclick="salvarMeta\(\)"/,
  /onclick="toggleScoreDetalhe\(\)"/,
  /onclick="exportarCSVCaixa\(\)"/,
  /onclick="toggleCaixa\(\)"/,
  /onclick="toggleCaixaGrafico\(\)"/,
  /onclick="abrirCaixaMax\(\)"/,
  /onclick="setCaixaGraficoPeriodo\(/,
  /onclick="salvarSaldoMinimo\(\)"/,
  /onclick="adicionarLancamentoCaixa\(\)"/,
  /onclick="limparFormCaixa\(\)"/,
  /onclick="limparFiltrosCaixa\(\)"/,
  /onclick="exportarCSVFluxoCaixa\(\)"/,
  /onclick="toggleFluxoCaixa\(\)"/,
  /onclick="calcAction\('/,
  /onkeydown="if\(event\.key==='Enter'\)\s*tentarLogin\(\)"/,
  /onkeydown="if\(event\.key==='Enter'\)\s*enviarLinkMagico\(\)"/,
  /onkeydown="if\(event\.key==='Enter'\)\s*enviarResetSenha\(\)"/,
  /onkeydown="if\(event\.key==='Enter'\)\s*definirNovaSenha\(\)"/,
];

function findPatternLines(lines, pattern) {
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) found.push(i + 1);
  }
  return found;
}

if (!fs.existsSync(SISTEMA_PATH)) {
  console.error('❌ sistema.html não encontrado em:', SISTEMA_PATH);
  process.exit(1);
}

const html = fs.readFileSync(SISTEMA_PATH, 'utf8');
const lines = html.split('\n');

const violations = [];
for (const pattern of FORBIDDEN_INLINE_PATTERNS) {
  const hits = findPatternLines(lines, pattern);
  if (hits.length) {
    violations.push({
      pattern: String(pattern),
      lines: hits,
    });
  }
}

const inlineEvents = html.match(/\son(?:click|change|input|keydown|keyup|submit)="/g) || [];
const inlineCount = inlineEvents.length;

if (violations.length) {
  console.error('\n❌ Regressão detectada: handlers inline proibidos reapareceram em sistema.html.\n');
  violations.forEach((item) => {
    console.error(`- ${item.pattern}`);
    console.error(`  linhas: ${item.lines.join(', ')}`);
  });
}

if (inlineCount > MAX_INLINE_EVENT_ATTRIBUTES) {
  console.error('\n❌ Regressão detectada: total de atributos inline de eventos aumentou.\n');
  console.error(`- atual: ${inlineCount}`);
  console.error(`- máximo permitido: ${MAX_INLINE_EVENT_ATTRIBUTES}`);
}

if (violations.length || inlineCount > MAX_INLINE_EVENT_ATTRIBUTES) {
  process.exit(1);
}

console.log('✅ Guardas do sistema.html OK.');
console.log(`ℹ️ Atributos inline de evento atuais: ${inlineCount}/${MAX_INLINE_EVENT_ATTRIBUTES}.`);
