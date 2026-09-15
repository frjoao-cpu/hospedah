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

Modelos alternativos, tentados
automaticamente (em ordem) quando o
modelo principal está indisponível
para a chave (erro 404):

GEMINI_FALLBACK_MODELS
(padrão: gemini-2.0-flash,
gemini-2.0-flash-lite,
gemini-1.5-flash)

Crie uma chave da API do Google Gemini.

NÃO coloque essa chave no index.html.

---

# 5. SECRETS

Na configuração da Edge Function
configure:

GEMINI_API_KEY

Opcional:

GEMINI_MODEL
(padrão: gemini-2.0-flash)

GEMINI_FALLBACK_MODELS
(tentados em ordem se o modelo
principal retornar 404; padrão:
gemini-2.0-flash,
gemini-2.0-flash-lite,
gemini-1.5-flash)

A chave de acesso ao banco é
injetada automaticamente pelo
runtime do Supabase:

SUPABASE_SECRET_KEYS
(JSON com as Secret Keys
sb_secret_… emitidas via
JWT Signing Keys)

A chave legada

SUPABASE_SERVICE_ROLE_KEY

está descontinuada — a função
ainda aceita essa variável como
fallback, mas o Supabase a removerá
no fim de 2026.

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
(sb_publishable_…)

do seu projeto Supabase
(a Anon Key legada está
descontinuada).

A Publishable Key pode ficar no frontend.

NÃO coloque:

SUPABASE_SECRET_KEYS

SUPABASE_SERVICE_ROLE_KEY
(legada/descontinuada)

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

SUPABASE_SECRET_KEYS
(chaves sb_secret_…)

SUPABASE_SERVICE_ROLE_KEY
(legada/descontinuada)

Nunca colocar essas chaves
diretamente no HTML.

Apenas a Publishable Key
(sb_publishable_…) deve ser
utilizada no frontend.

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

   No GitHub, confira o job
   "Deploy Edge Functions (Supabase)"
   do workflow CI na aba Actions:
   se estiver vermelho, abra os logs —
   a causa exata (token inválido,
   função com erro, etc.) aparece lá.

1.1 TOKEN DO CI SEM PRIVILÉGIO

   Se os logs do CI mostrarem
   "Unauthorized" (401) ou
   "Your account does not have the
   necessary privileges", o
   SUPABASE_ACCESS_TOKEN está
   inválido, expirado ou sem
   permissão no projeto.

   Gere um novo Personal Access Token
   (formato sbp_…) em:

   https://supabase.com/dashboard/account/tokens

   com uma conta que seja OWNER/ADMIN
   da organização do projeto, e
   atualize o GitHub Secret
   SUPABASE_ACCESS_TOKEN em
   Settings → Secrets and variables
   → Actions.

   O secret GEMINI_API_KEY também
   pode ser configurado manualmente:
   Supabase Dashboard →
   Edge Functions → Secrets.

2. SECRETS

   No Supabase, em
   Edge Functions → Secrets,
   confirme:

   GEMINI_API_KEY

   A chave de acesso ao banco
   (SUPABASE_SECRET_KEYS) é
   injetada automaticamente
   pelo runtime — a legada
   SUPABASE_SERVICE_ROLE_KEY
   serve como fallback.

   Opcional:

   GEMINI_MODEL
   (padrão: gemini-2.0-flash)

3. MODELO GEMINI

   Se o log da função mostrar
   erro 404 ou "model not found",
   a função tenta automaticamente
   os modelos de
   GEMINI_FALLBACK_MODELS antes
   de falhar. Se todos falharem,
   defina:

   GEMINI_MODEL=gemini-1.5-flash

   ou ajuste GEMINI_FALLBACK_MODELS
   com um modelo disponível para
   a sua chave.

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
