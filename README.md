<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HOSPEDAH</title>
<style>
body {
    font-family: Arial, sans-serif;
    background: #fff;
    color: #111;
    margin: 0;
    padding: 40px;
}
.container {
    max-width: 800px;
    margin: auto;
}
h1 {
    font-size: 40px;
    margin-bottom: 5px;
}
h2 {
    margin-top: 40px;
}
input {
    width: 100%;
    padding: 12px;
    margin: 10px 0;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
}
button {
    padding: 12px 20px;
    background: black;
    color: white;
    border: none;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.3s;
}
button:hover {
    background: #444;
}
.card {
    margin-top: 30px;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.error {
    color: red;
    font-size: 14px;
    margin-top: 5px;
}
</style>
</head>
<body>
<div class="container">
<h1>HOSPEDAH</h1>
<p>Sua experiência começa aqui.</p>
<h2>Monte sua proposta</h2>
<input id="nome" placeholder="Nome do cliente" required>
<div id="nomeError" class="error"></div>
<input id="destino" placeholder="Destino" required>
<div id="destinoError" class="error"></div>
<input id="data" placeholder="Data da viagem" type="date" required>
<div id="dataError" class="error"></div>
<input id="pessoas" placeholder="Quantidade de pessoas" type="number" min="1" required>
<div id="pessoasError" class="error"></div>
<button onclick="gerar()">Gerar proposta</button>
<div id="resultado"></div>
</div>
<script>
function gerar() {
    // Clear previous errors
    document.getElementById("nomeError").innerText = "";
    document.getElementById("destinoError").innerText = "";
    document.getElementById("dataError").innerText = "";
    document.getElementById("pessoasError").innerText = "";
    let nome = document.getElementById("nome").value.trim();
    let destino = document.getElementById("destino").value.trim();
    let data = document.getElementById("data").value;
    let pessoas = document.getElementById("pessoas").value;
    let hasErrors = false;
    if (!nome) {
        document.getElementById("nomeError").innerText = "Nome do cliente é obrigatório.";
        hasErrors = true;
    }
    if (!destino) {
        document.getElementById("destinoError").innerText = "Destino é obrigatório.";
        hasErrors = true;
    }
    if (!data) {
        document.getElementById("dataError").innerText = "Data da viagem é obrigatória.";
        hasErrors = true;
    }
    if (!pessoas || pessoas < 1) {
        document.getElementById("pessoasError").innerText = "Quantidade de pessoas deve ser pelo menos 1.";
        hasErrors = true;
    }
    if (hasErrors) return;
    // Format date
    let formattedData = new Date(data).toLocaleDateString('pt-BR');
    document.getElementById("resultado").innerHTML = `
    <div class="card">
        <h2>Proposta para ${nome}</h2>
        <p><strong>Destino:</strong> ${destino}</p>
        <p><strong>Data:</strong> ${formattedData}</p>
        <p><strong>Pessoas:</strong> ${pessoas}</p>
        <h3>Inclui:</h3>
        <ul>
            <li>Planejamento completo</li>
            <li>Hospedagem selecionada</li>
            <li>Suporte durante a viagem</li>
        </ul>
        <h3>Experiência HOSPEDAH</h3>
        <p>Conforto, organização e tranquilidade em cada etapa da sua viagem.</p>
        <a href="https://wa.me/5517982006382" target="_blank">
            <button>Falar com especialista</button>
        </a>
    </div>
    `;
}
</script>
</body>
</html>

## Análise do layout atual (ramo de hospedagem) e sugestões premium

### Diagnóstico prático encontrado no código/layout
- **Homepage robusta, porém monolítica**: o `index.html` concentra grande volume de CSS inline e scripts na mesma página (navbar, hero, galeria, FAQ, formulários), o que dificulta evolução visual com consistência.
- **Base mobile-first já existe** em `assets/mobile-first.css`, mas parte importante do visual continua acoplada ao `index.html`, criando duplicidade de regras e manutenção mais lenta.
- **Branding já tem direção premium** (paleta azul+dourado, hero com carrossel, glassmorphism leve), mas ainda falta um **design system formal** (tokens, escala tipográfica, espaçamentos, estados).
- **Automação/marketing parcialmente implantados** (LGPD, tracking condicional, WhatsApp, PWA), com oportunidades de elevar maturidade em CRM, funil e personalização.
- **Ponto técnico crítico**: `script.js` expõe `API_KEY` no front-end; isso pode gerar uso indevido, consumo de cota por terceiros e indisponibilidade. Priorizar migração de integrações sensíveis para backend/serverless.

### Melhorias de interface para padrão profissional e sofisticado
1. **Design System unificado**
   - Centralizar tokens (`cores`, `radius`, `shadow`, `spacing`, `motion`) em um arquivo base.
   - Definir componentes padronizados: botões, cards, inputs, badges, tabs, modais, toasts.
   - Criar variações por contexto (admin, proprietário, hóspede) mantendo a mesma identidade HOSPEDAH.

2. **Estrutura visual premium (web + mobile)**
   - Hero com proposta de valor mais objetiva e CTA principal único acima da dobra.
   - Cards de resorts com: selo (“mais reservado”), score, benefícios, política de cancelamento resumida e preço inicial.
   - Navegação mobile com “quick actions” (Reservar, Favoritos, Atendimento, Perfil) e desktop com menu orientado por jornada.

3. **Microinterações e animações modernas**
   - Transições curtas (120–240ms), feedback tátil/visual em botões, skeleton loading, animação de sucesso em envio de formulário.
   - Motion consistente com bibliotecas como **Framer Motion** (ou CSS transitions padronizadas).

4. **Aprimoramento UX por contexto**
   - Hóspede: fluxo de reserva em etapas (datas → hóspedes → opções → confirmação) com barra de progresso.
   - Proprietário: painel com disponibilidade, ocupação, receita e alertas de pendências.
   - Admin: visão consolidada de funil, SLA de atendimento, conversão por canal, inadimplência.

### Componentes de interface com padrão premium (exemplos)
- **Smart Search Bar** (datas flexíveis, número de hóspedes, filtros avançados em drawer).
- **Resort Comparison Drawer** (comparar até 3 opções com destaque de diferença de preço/benefício).
- **Pricing Calendar** com heatmap de tarifa por dia.
- **Card de reserva inteligente** com parcelamento, políticas, addons e upsell contextual.
- **Centro de notificações** (status de proposta, confirmação, documentos pendentes, follow-up pós-estadia).

### Automação e facilidades tecnológicas (usuário e operação)
- **Lead scoring automático** (origem, intenção, ticket estimado, urgência) para priorizar atendimento.
- **Disparo automatizado** (WhatsApp/e-mail) para carrinho abandonado, lembrete de proposta e pós-estadia.
- **Workflow de aprovação** para proprietário (alteração de tarifa, blackout dates, confirmação de disponibilidade).
- **Integração CRM** (HubSpot/RD/Kommo/Pipedrive) para pipeline completo do lead à reserva confirmada.
- **Dashboard operacional** com alertas automáticos (queda de conversão, pico de cancelamentos, atraso de resposta).

### Stack/frameworks/bibliotecas recomendados
- **Frontend**: Next.js + TypeScript + Tailwind CSS + shadcn/ui (consistência e velocidade de evolução).
- **Animações**:
  - Framer Motion: mais recursos e ergonomia em apps React, com custo típico extra de bundle.
  - Web Animations API/CSS transitions: zero dependências e menor impacto de performance para site estático.
- **Formulários**: React Hook Form + Zod (validação sólida).
- **Dados/estado**: React Query + Zustand.
- **Backend/BFF**: consolidar o uso de Supabase (já presente em páginas de painel/chat) com Edge Functions para lógica sensível.
- **Observabilidade**: Sentry + PostHog/GA4 + Microsoft Clarity.
- **Qualidade visual**: Storybook para catálogo de componentes premium.

### AI e integrações inteligentes
- **Concierge AI** no site/app:
  - responde dúvidas sobre políticas, datas e estrutura dos resorts;
  - recomenda opções com base em perfil/família/orçamento;
  - transfere para humano com contexto completo no CRM.
- **Resumo automático de conversas** para equipe comercial.
- **Precificação assistida por IA** (sugestão de tarifa por sazonalidade, antecedência e ocupação).
- **Classificação automática de mensagens** (pré-venda, alteração, cancelamento, suporte).

### Roadmap prático (incremental)
- **Fase 1 (rápida)**: padronizar tokens visuais, reduzir CSS inline no `index.html`, melhorar hierarchy de CTA e cards.
- **Fase 2**: unificar jornada em plataforma única (admin/proprietário/hóspede) com RBAC (Role-Based Access Control), regras ABAC para cenários finos e isolamento multi-tenant entre proprietários.
  - Exemplo ABAC: proprietário só edita tarifas de unidades do próprio empreendimento em período permitido.
- **Fase 3**: automações de CRM/funil + concierge AI + recomendações inteligentes.
- **Fase 4**: otimização contínua com A/B test, métricas de conversão e retenção.
