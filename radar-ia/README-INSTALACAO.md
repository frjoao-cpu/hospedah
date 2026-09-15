# HOSPEDAH RADAR IA

Sistema de inteligência artificial da HOSPEDAH
para identificação e organização de oportunidades
em multipropriedades.

---

# 1. ESTRUTURA

O projeto possui:

radar-ia/
    index.html
    README-INSTALACAO.md

supabase/
    migrations/
        007_radar_ia.sql

    functions/
        radar-ia/
            index.ts

A interface fica publicada pelo GitHub Pages em:

https://hospedah.tur.br/radar-ia/

O SQL e o index.ts NÃO passam pelo GitHub Pages:
eles são usados na configuração do Supabase
(SQL Editor e deploy da Edge Function).

---

# 2. SUPABASE

Projeto:

ydrmjoppjxtmnwtvtinb

URL:

https://ydrmjoppjxtmnwtvtinb.supabase.co

Entre no Supabase.

Abra:

SQL Editor

Crie uma nova consulta.

Cole todo o conteúdo:

supabase/migrations/007_radar_ia.sql

Execute:

RUN

Isso cria as tabelas
radar_oportunidades, radar_analises
e radar_empreendimentos,
com índices, RLS e o trigger
que mantém atualizado_em atualizado.

---

# 3. USUÁRIO ADMINISTRADOR

No Supabase abra:

Authentication

Users

Add user

Crie o e-mail e senha
que serão utilizados para acessar
o HOSPEDAH Radar IA.

Não coloque essa senha no código.

---

# 4. GEMINI

A Edge Function utiliza por padrão:

gemini-2.0-flash

O modelo pode ser alterado pelo secret:

GEMINI_MODEL

Crie uma chave da API do Google Gemini.

NÃO coloque essa chave no index.html.

---

# 5. SECRETS

Na configuração da Edge Function
configure:

GEMINI_API_KEY

SUPABASE_SERVICE_ROLE_KEY

Opcional:

GEMINI_MODEL
(padrão: gemini-2.0-flash)

Essas informações são secretas.

Nunca coloque essas chaves
em um repositório público.

---

# 6. EDGE FUNCTION

Nome da função:

radar-ia

Arquivo:

supabase/functions/radar-ia/index.ts

A função valida o token do usuário
antes de chamar a IA, normaliza o
empreendimento usando o cadastro de
aliases e grava o histórico de cada
análise em radar_analises.

O deploy da Edge Function é feito
automaticamente pelo CI
(.github/workflows/ci.yml)
a cada push na branch main.

Para fazer o deploy manual com
Supabase CLI:

supabase functions deploy radar-ia --no-verify-jwt

Depois configure os Secrets.

---

# 7. INDEX.HTML

Abra:

radar-ia/index.html

Procure:

supabaseAnonKey

Você encontrará:

COLE_AQUI_SUA_PUBLISHABLE_OU_ANON_KEY

Substitua pela:

Publishable Key

ou

Anon Key

do seu projeto Supabase.

A Publishable/Anon Key pode ficar no frontend.

NÃO coloque:

SUPABASE_SERVICE_ROLE_KEY

ou:

GEMINI_API_KEY

no HTML.

---

# 8. FUNCIONAMENTO

O fluxo será:

Usuário
↓
HOSPEDAH Radar IA
↓
Supabase Auth
↓
Edge Function
↓
Gemini
↓
Extração dos dados
↓
Score
↓
Supabase
↓
Dashboard

---

# 9. DADOS IDENTIFICADOS

A IA procura:

Empreendimento

Cidade

Estado

Tipo de oportunidade

Período inicial

Período final

Número da semana

Dormitórios

Capacidade de adultos

Capacidade de crianças

Valor

Situação da cota

Propriedade

Anunciante

Contato

Resumo

Score de confiança

Score comercial

---

# 10. TIPOS

VENDA_COTA

VENDA_PERIODO

ALUGUEL

CESSAO

TROCA

PERMUTA

DISPONIBILIDADE

OUTRO

---

# 11. SCORE

0 a 39:

Baixa oportunidade

40 a 69:

Oportunidade moderada

70 a 89:

Alta oportunidade

90 a 100:

Oportunidade excepcional

---

# 12. STATUS

VALIDAR (padrão inicial)

APROVADA

DESCARTADA

A validação é feita no próprio painel,
com os botões APROVAR / DESCARTAR
exibidos nos detalhes da oportunidade.

---

# 13. FONTES

O sistema aceita:

Manual

Instagram

Facebook

Site

WhatsApp

Indicação

---

# 14. INSTAGRAM E FACEBOOK

A interface está preparada para receber
conteúdo de Instagram e Facebook.

A captura automática deve ser feita
através das APIs oficiais da Meta
e/ou Webhooks autorizados.

Não utilizar:

Scraping

Senha do Instagram

Senha do Facebook

Métodos para contornar permissões

A arquitetura futura será:

Instagram/Facebook
↓
API oficial
↓
Webhook
↓
Edge Function
↓
Radar IA
↓
Gemini
↓
Supabase
↓
Dashboard

---

# 15. SEGURANÇA

Nunca publicar:

GEMINI_API_KEY

SUPABASE_SERVICE_ROLE_KEY

Nunca colocar essas chaves
diretamente no HTML.

Apenas a Publishable/Anon Key
deve ser utilizada no frontend.

---

# 16. TESTE

Depois de instalar tudo,
acesse o Radar e faça login.

Cole um anúncio como:

"Ipioca Beach Maceió.
01 dormitório.
02 semanas.
Acomoda 04 adultos e 01 criança.
Cota quitada.
Propriedade hereditária.
Valor R$ 42.000."

Clique:

ANALISAR COM IA

A IA deverá estruturar
as informações e salvar
a oportunidade no Supabase.

---

# 16.1 ERRO DE CONEXÃO COM O SERVIDOR

Se aparecer:

Erro: Sem conexão com o servidor
(rede, CORS ou função radar-ia
indisponível)...

(ou "Falhou em buscar" /
"Failed to fetch")
ao clicar em ANALISAR COM IA,
o navegador não conseguiu
concluir a chamada à Edge Function.
Verifique nesta ordem:

1. DEPLOY DA FUNÇÃO

   Confirme que a função radar-ia
   foi publicada
   (o CI faz o deploy automaticamente
   a cada push na main):

   supabase functions deploy radar-ia --no-verify-jwt

2. SECRETS

   No Supabase, em
   Edge Functions → Secrets,
   confirme:

   GEMINI_API_KEY
   SUPABASE_SERVICE_ROLE_KEY

   Opcional:

   GEMINI_MODEL
   (padrão: gemini-2.0-flash)

3. MODELO GEMINI

   Se o log da função mostrar
   erro 404 ou "model not found",
   defina:

   GEMINI_MODEL=gemini-2.0-flash

   O código usa gemini-2.0-flash
   por padrão, que está disponível
   no nível gratuito da API.

4. LOGS DA FUNÇÃO

   Supabase → Edge Functions →
   radar-ia → Logs mostram a causa
   exata (chave inválida, modelo
   indisponível, timeout, etc.).

5. CONEXÃO

   Teste a URL da função:

   https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/radar-ia

   Ela deve responder um JSON
   de erro de autenticação (401),
   o que confirma que a função
   está no ar.

---

# 17. PRÓXIMA EVOLUÇÃO

A arquitetura pode posteriormente receber:

Instagram automático

Facebook automático

WhatsApp automático

Captura de anúncios

Classificação automática

Detecção de períodos

Detecção de semanas

Comparação de preços

Score comercial

Alertas

CRM

Distribuição para equipe comercial

Integração com WhatsApp

Radar de oportunidades em tempo real
