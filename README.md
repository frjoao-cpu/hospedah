# HOSPEDAH — Resorts e Experiências Exclusivas

Site oficial da **HOSPEDAH**, agência especializada em hospedagem em resorts e experiências exclusivas.  
🌐 **https://hospedah.tur.br**

---

## Estrutura do projeto

```
hospedah/
├── index.html              # Homepage principal
├── busca.html              # Busca de acomodações
├── reservas.html           # Fluxo de reserva
├── avaliacoes.html         # Avaliações dos hóspedes
├── chat.html               # Chat com Concierge IA
├── cadastro.html           # Cadastro de imóveis
├── referral.html           # Programa de indicações
├── jornal.html             # Blog / Jornal HOSPEDAH
├── painel.html             # Painel administrativo (não indexado)
├── sistema.html            # Sistema interno (não indexado)
├── resorts/                # Páginas individuais de cada resort
│   ├── hotbeach.html       # Hot Beach Suites — Olímpia/SP
│   ├── saopedro.html       # São Pedro Thermas — São Pedro/SP
│   ├── olimpia.html        # Olimpia Park Resort — Olímpia/SP
│   ├── solar.html          # Solar das Águas — Olímpia/SP
│   ├── wyndham.html        # Wyndham Royal Resort — Olímpia/SP
│   ├── juquehy.html        # Praia de Juquehy — São Sebastião/SP
│   ├── ipioca.html         # Ipioca Beach Resort — Maceió/AL
│   └── portoi2.html        # Porto 2 Life
├── assets/
│   ├── mobile-first.css    # Tokens de design + estilos base (importar primeiro)
│   ├── index.css           # Estilos específicos da homepage
│   ├── style.css           # Componentes compartilhados (galeria, whatsapp, etc.)
│   ├── busca.css           # Estilos da página de busca
│   ├── reservas.css        # Estilos do fluxo de reserva
│   ├── tracking.js         # Inicialização GTM / Clarity / Meta Pixel / OneSignal
│   ├── supabase-config.js  # Config pública do Supabase (URL + anon key)
│   ├── ai-concierge.js     # Cliente do Concierge IA (via Edge Function)
│   ├── ai-config.js        # Placeholder de configuração da IA (chave no servidor)
│   └── auth-guard.js       # Guard de autenticação para páginas protegidas
├── scripts/
│   ├── navbar.js           # Navbar/footer compartilhados (injetados via JS)
│   └── generate-resorts.js # Gerador de páginas de resort a partir de data.json
├── supabase/
│   └── functions/          # Supabase Edge Functions (backend serverless)
├── sw.js                   # Service Worker (PWA)
├── manifest.json           # Web App Manifest (PWA)
├── sitemap.xml             # Sitemap para indexação
└── robots.txt              # Diretivas para crawlers
```

## Stack técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| IA | Google Gemini via Supabase Edge Function |
| Clima | OpenWeatherMap via Supabase Edge Function |
| Analytics | Google Tag Manager, Microsoft Clarity, Meta Pixel |
| Push | OneSignal |
| Deploy | GitHub Pages (CI/CD via GitHub Actions) |
| PWA | Service Worker + Web App Manifest |

## Convenções de CSS

A ordem correta de importação em **todas as páginas** é:

1. `/assets/mobile-first.css` — tokens de design (cores, espaçamentos, motion)
2. `/assets/style.css` — componentes compartilhados
3. CSS específico da página (arquivo próprio ou `<style>` inline)

## Segurança

- A **anon key do Supabase** é uma chave pública por design; a segurança dos dados é garantida pelas políticas de **Row Level Security (RLS)** no banco.
- A **chave Gemini** e a **chave OpenWeatherMap** ficam **exclusivamente no servidor** (Supabase Edge Functions), nunca expostas ao browser.
- O rastreamento (GTM, Clarity, Meta Pixel, OneSignal) só é inicializado **após consentimento LGPD** explícito do usuário.

## CI/CD

O pipeline de CI (`.github/workflows/ci.yml`) executa automaticamente:

1. **htmlhint** — validação de HTML
2. **ESLint** — validação de JavaScript
3. **Stylelint** — validação de CSS
4. **Lychee** — verificação de links quebrados
5. **Lighthouse CI** — auditoria de performance, acessibilidade, SEO e boas práticas
6. **TruffleHog** — varredura de segredos expostos
7. **Deploy** no GitHub Pages (somente na `main`)
8. **Deploy das Edge Functions** no Supabase (somente na `main`)
9. **Smoke tests** nas páginas críticas após o deploy

---

## Análise do layout e sugestões premium

### Diagnóstico prático encontrado no código/layout
- **Homepage robusta, porém monolítica**: o `index.html` concentra grande volume de CSS inline e scripts na mesma página (navbar, hero, galeria, FAQ, formulários), o que dificulta evolução visual com consistência.
- **Base mobile-first já existe** em `assets/mobile-first.css`, mas parte importante do visual continua acoplada ao `index.html`, criando duplicidade de regras e manutenção mais lenta.
- **Branding já tem direção premium** (paleta azul+dourado, hero com carrossel, glassmorphism leve), mas ainda falta um **design system formal** (tokens, escala tipográfica, espaçamentos, estados).
- **Automação/marketing parcialmente implantados** (LGPD, tracking condicional, WhatsApp, PWA), com oportunidades de elevar maturidade em CRM, funil e personalização.

### Melhorias de interface para padrão profissional e sofisticado
1. **Design System unificado**
   - Centralizar tokens (`cores`, `radius`, `shadow`, `spacing`, `motion`) em um arquivo base.
   - Definir componentes padronizados: botões, cards, inputs, badges, tabs, modais, toasts.
   - Criar variações por contexto (admin, proprietário, hóspede) mantendo a mesma identidade HOSPEDAH.

2. **Estrutura visual premium (web + mobile)**
   - Hero com proposta de valor mais objetiva e CTA principal único acima da dobra.
   - Cards de resorts com: selo ("mais reservado"), score, benefícios, política de cancelamento resumida e preço inicial.
   - Navegação mobile com "quick actions" (Reservar, Favoritos, Atendimento, Perfil) e desktop com menu orientado por jornada.

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
  - Framer Motion: mais recursos e ergonomia em aplicações React, com custo típico extra de bundle.
  - Web Animations API/CSS transitions: zero dependências e menor impacto de performance para site estático.
- **Formulários**: React Hook Form + Zod (boa performance em formulários grandes, validação tipada e melhor DX).
- **Dados/estado**: React Query + Zustand.
- **Backend/BFF**: consolidar o uso de Supabase (já presente em páginas de painel/chat) com Edge Functions para lógica sensível.
- **Observabilidade**: Sentry (erros), PostHog/GA4 (produto e conversão) e Microsoft Clarity (comportamento visual em sessão).
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
- **Fase 2**: unificar jornada em plataforma única (admin/proprietário/hóspede) com RBAC (Role-Based Access Control).
  - Aplicar ABAC (Attribute-Based Access Control) em cenários finos e manter isolamento multi-tenant entre proprietários.
  - Exemplo ABAC: proprietário só edita tarifas de unidades do próprio empreendimento em período permitido.
- **Fase 3**: automações de CRM/funil + concierge AI + recomendações inteligentes.
- **Fase 4**: otimização contínua com A/B test, métricas de conversão e retenção.

### Checklist de execução prática (prioridade alta → baixa)
- [ ] **Semana 1–2 (quick wins)**: limpar CSS inline crítico do `index.html`, destacar CTA principal no hero e implementar skeleton/lazy loading de imagens acima/abaixo da dobra.
- [ ] **Semana 2–4 (conversão)**: lançar busca inteligente com filtros salvos, comparação de resorts e régua automática de recuperação de leads (WhatsApp/e-mail).
- [ ] **Mês 2 (plataforma única)**: consolidar painel de **hóspede, proprietário e admin** com permissões por perfil, centro de notificações e histórico único de atendimento.
- [ ] **Mês 3 (automação premium)**: integrar CRM + funil com lead scoring, alertas operacionais e concierge AI com handoff para humano.
- [ ] **Contínuo (governança)**: acompanhar Lighthouse, tempo de resposta no atendimento, taxa de conversão por etapa e NPS pós-estadia.
