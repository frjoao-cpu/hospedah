# HOSPEDAH RADAR IA

Sistema de inteligência artificial da HOSPEDAH
para identificação e organização de oportunidades
em multipropriedades.

O Radar é uma CENTRAL DE MONITORAMENTO:

o robô encontra
↓
a IA entende
↓
o Radar seleciona
↓
a HOSPEDAH negocia

Você define ALVOS (quais resorts, períodos,
tipos de negócio, faixa de valor e score mínimo
o robô deve procurar) e FONTES (onde procurar).
A camada de captura grava tudo em radar_capturas
e a IA processa a fila.

---

# 1. ESTRUTURA

O projeto possui:

radar-ia/
    index.html
    README-INSTALACAO.md

supabase/
    migrations/
        007_radar_ia.sql
        008_radar_central_monitoramento.sql
        009_radar_pipeline_robustez.sql
        010_radar_inteligencia.sql

    functions/
        _shared/
            ia.ts
            radar.ts
            radar.test.ts
        radar-ia/
            index.ts
        radar-captura/
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

Em seguida, na MESMA ORDEM, cole e
execute também:

supabase/migrations/008_radar_central_monitoramento.sql

A 008 é aditiva (não altera a 007) e cria:

radar_alvos
(o que monitorar: resorts, períodos,
tipos de negócio, faixa de valor,
capacidade, score mínimo, cadência)

radar_fontes
(onde procurar: INSTAGRAM_GRAPH,
FACEBOOK_GRAPH, MANUAL, IMPORT)

radar_alvo_fontes
(vínculo N:N entre alvos e fontes)

radar_capturas
(fila crua do que o robô encontrou,
com dedupe por external_id e estado
PENDENTE / ANALISADO / DESCARTADO / ERRO)

radar_execucoes
(log de cada varredura — base da aba
"Saúde do robô")

e as colunas aditivas de
radar_oportunidades:
alvo_id, captura_id, motivo_selecao,
negociacao_status e responsavel.

A ordem importa: 007 antes da 008.

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

# 4. IA — GPT LUNA

A IA do Radar é a GPT Luna, consumida
por API compatível com OpenAI.

Secret obrigatório:

LUNA_API_KEY

Opcionais:

LUNA_BASE_URL
(padrão https://api.openai.com/v1)

LUNA_MODEL
(padrão gpt-luna)

LUNA_MODEL_TRIAGEM
(modelo barato usado nas tarefas
de triagem em massa)

O Gemini continua disponível como
CONTINGÊNCIA: se a GPT Luna estiver
fora do ar, sem cota ou sem chave, a
análise segue pelo Gemini em vez de
parar o pipeline.

GEMINI_API_KEY
GEMINI_MODEL
(padrão gemini-2.5-flash)
GEMINI_FALLBACK_MODELS
(padrão: gemini-2.5-flash-lite,
gemini-2.0-flash,
gemini-1.5-flash)

NÃO coloque nenhuma dessas chaves
no index.html.

Preço por milhão de tokens (usado só
para estimar o custo no painel):

LUNA_PRECO_ENTRADA_MTOK
LUNA_PRECO_SAIDA_MTOK
GEMINI_PRECO_ENTRADA_MTOK
GEMINI_PRECO_SAIDA_MTOK

---

# 5. SECRETS

Na configuração da Edge Function
configure:

LUNA_API_KEY
(GPT Luna — IA principal)

Opcionais de IA:

LUNA_BASE_URL
LUNA_MODEL
LUNA_MODEL_TRIAGEM
GEMINI_API_KEY (contingência)
GEMINI_MODEL
GEMINI_FALLBACK_MODELS

Alertas automáticos das
oportunidades quentes:

RADAR_ALERTA_SCORE
(padrão 80)

RADAR_ALERTA_WHATSAPP
(número; usa WHATSAPP_ADMIN_NUMBER
quando ausente)

RADAR_ALERTA_EMAIL
(um ou mais e-mails separados
por vírgula)

Os alertas reaproveitam os secrets
já usados pelas outras funções:

ZAPI_INSTANCE_ID
ZAPI_TOKEN
ZAPI_CLIENT_TOKEN
RESEND_API_KEY
RESEND_FROM

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

# 5.1 SECRETS DA META (CAPTURA)

A função radar-captura usa APENAS as
APIs oficiais da Meta. Configure em
Edge Functions → Secrets:

INSTAGRAM_ACCESS_TOKEN
(token da Graph API do Instagram)

INSTAGRAM_USER_ID
(id da conta Instagram Business;
também pode ser definido por fonte,
no campo config → ig_user_id)

FACEBOOK_PAGE_ACCESS_TOKEN
(token da Página; se ausente, o
adaptador tenta INSTAGRAM_ACCESS_TOKEN)

Enquanto o token/permissão não estiver
liberado pela Meta, o adaptador devolve
"Fonte não configurada", registra o
motivo em radar_execucoes e NÃO derruba
o resto do pipeline — as fontes MANUAL
e IMPORT continuam funcionando.

## Renovar o FACEBOOK_PAGE_ACCESS_TOKEN

O token de usuário do Graph API Explorer
dura cerca de 1 a 2 horas. Use sempre um
token de Página de LONGA DURAÇÃO, que não
expira enquanto o app e as permissões
continuarem válidos:

1. Graph API Explorer → gere um token de
   usuário com as permissões
   pages_read_engagement e pages_show_list.

2. Troque-o por um token de usuário de
   longa duração (~60 dias):
   GET /oauth/access_token
   ?grant_type=fb_exchange_token
   &client_id=<APP_ID>
   &client_secret=<APP_SECRET>
   &fb_exchange_token=<TOKEN_CURTO>

3. Com o token longo, peça o token da
   Página:
   GET /me/accounts
   O campo access_token de cada página é o
   token de Página de longa duração.

4. Grave esse valor no secret
   FACEBOOK_PAGE_ACCESS_TOKEN
   (Edge Functions → Secrets) e clique em
   TESTAR no card da fonte, na aba
   "Saúde do robô".

Quando o token expira ou é revogado, a
Graph API responde com os códigos 190,
102, 463 ou 467. A radar-captura grava
credencial_status = EXPIRADA na fonte e
mostra no painel a instrução de renovação
— é o que diferencia "token vencido" de
"permissão faltando" (códigos 10 e 200-299)
e de "identificador errado" (100 e 803).

## Identificadores aceitos

O adaptador do Facebook consulta
/{page-id}/posts, que atende apenas
PÁGINAS:

FACEBOOK_GRAPH → id NUMÉRICO da Página.
URLs, @handles e ids de grupo ou de perfil
pessoal são rejeitados no cadastro.

INSTAGRAM_GRAPH (modo hashtag) → a hashtag
sem espaços (o # é opcional).

INSTAGRAM_GRAPH (modo conta) → id numérico
da conta Business/Creator. O ig_user_id
pode ser informado por fonte no campo
"IG user id" do painel, sobrescrevendo o
secret INSTAGRAM_USER_ID apenas quando
este não estiver definido.

---

# 6. EDGE FUNCTIONS

São duas funções:

radar-captura
(o robô encontra)
supabase/functions/radar-captura/index.ts

radar-ia
(a IA entende + o Radar seleciona)
supabase/functions/radar-ia/index.ts

Ambas compartilham
supabase/functions/_shared/radar.ts
(pré-filtro, coerções e a seleção pelos
critérios do alvo).

radar-captura aceita as ações:

varrer
(percorre as fontes ativas dos alvos
ativos e grava capturas PENDENTES)

capturar_manual
(um texto colado pelo operador)

importar_lote
(vários anúncios de uma vez)

descartar
(marca a captura como DESCARTADA)

testar_fonte
(consulta a fonte sem gravar nada e
atualiza o status da credencial)

salvar_fonte / remover_fonte
(cadastro das fontes)

radar-ia aceita as ações:

analisar_texto
(padrão — é o que acontece quando
"acao" não é informada, mantendo a
compatibilidade com a tela antiga)

processar_pendentes
(lê N capturas PENDENTES, roda a IA,
aplica a seleção pelos critérios do
alvo e cria a oportunidade ou marca a
captura como DESCARTADA com motivo)

reavaliar
(reprocessa uma oportunidade sem
reabrir o funil de negociação)

rascunho_abordagem
(a IA escreve a primeira mensagem
para o anunciante; quem envia é o
operador, depois de revisar)

registrar_desfecho
(grava GANHA/PERDIDA, valor fechado
e motivo — é o que alimenta o
aprendizado do Radar)

saude
(fila de capturas, custo de IA dos
últimos 30 dias e alertas enviados)

O deploy das Edge Functions é feito
automaticamente pelo CI
(.github/workflows/ci.yml)
a cada push na branch main.

Para fazer o deploy manual com
Supabase CLI:

supabase functions deploy radar-ia --no-verify-jwt
supabase functions deploy radar-captura --no-verify-jwt

Depois configure os Secrets.

# 6.1 AGENDAMENTO (CRON)

O arquivo supabase_cron.sql (seção 13)
cria dois jobs:

radar-captura-varredura
(de hora em hora, acao "varrer")

radar-ia-processar-pendentes
(10 minutos depois, acao
"processar_pendentes")

Execute o supabase_cron.sql no SQL
Editor e garanta que
app.service_role_key esteja definido,
como nos demais jobs do projeto.

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

O fluxo é:

Alvos e fontes cadastrados no painel
↓
radar-captura (APIs oficiais / manual)
↓
radar_capturas (PENDENTE)
↓
radar-ia (Gemini entende e extrai)
↓
Seleção pelos critérios do alvo
↓
radar_oportunidades (com motivo_selecao)
↓
Funil de negociação da HOSPEDAH

# 8.1 AS ABAS DO PAINEL

MONITORAMENTO
Cadastro dos alvos: nome, resorts
(multi-seleção vinda de
radar_empreendimentos), cidades/estados,
tipos de negócio aceitos, janela de
período (datas ou "próximos N dias") e
semanas, faixa de valor, dormitórios e
capacidade mínima, score mínimo,
prioridade, cadência e fontes vinculadas.
É aqui que você define o que o robô
deve procurar. Alvos podem ser
ativados/pausados.

CAPTURAS
A fila do que o robô encontrou, com
estado, permalink e as ações
"analisar agora" e "descartar".
A análise manual também entra por aqui:
ela cria uma captura de fonte MANUAL e
segue o mesmo caminho do robô.

OPORTUNIDADES
A lista de sempre, agora filtrável por
alvo, com o motivo_selecao visível e o
funil de negociação
NOVA → EM_NEGOCIACAO → GANHA/PERDIDA,
além do status existente
(VALIDAR / APROVADA / DESCARTADA).

SAÚDE DO ROBÔ
Últimas execuções, contadores
(capturado / analisado / aprovado),
status das fontes e credenciais e o
último erro — para saber se o pipeline
está vivo.

---

# 8.2 NEGOCIAÇÃO

Além do status da oportunidade, o campo
negociacao_status acompanha o trabalho
comercial:

NOVA

EM_NEGOCIACAO

GANHA

PERDIDA

O campo responsavel registra quem está
conduzindo.

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

As fontes ficam em radar_fontes e são
cadastradas na aba MONITORAMENTO
(bloco "Fontes"). Tipos suportados:

INSTAGRAM_GRAPH
(Graph API oficial do Instagram)

FACEBOOK_GRAPH
(Graph API oficial do Facebook;
identificador = id NUMÉRICO da Página —
grupos e perfis pessoais não são
atendidos por /{page-id}/posts)

MANUAL
(texto colado pelo operador)

IMPORT
(importação de lote)

A migration 008 já cria as fontes
"Manual" e "Importação em lote", então
o pipeline funciona desde o primeiro dia,
mesmo sem token da Meta. As fontes
automáticas (Instagram/Facebook) precisam
ser cadastradas na aba "Saúde do robô" e,
se o alvo tiver vínculos explícitos,
associadas ao alvo — sem nenhuma fonte
automática ativa a varredura devolve o
aviso "Nenhuma fonte automática cadastrada".

Depois de cadastrar, use o botão TESTAR do
card da fonte: ele consulta a API sem
gravar nada e devolve o status da
credencial, separando problema de token de
problema de identificador.

A migration 009 acrescenta a
radar_execucoes os contadores
encontrados / relevantes / duplicados, que
o painel usa para explicar uma varredura
com zero capturas: nada na fonte, corte do
pré-filtro ou conteúdo já capturado
(dedupe). Sem a 009 a captura continua
funcionando — a execução é apenas gravada
sem esses contadores.

Cada fonte guarda o status da credencial,
o último cursor de paginação e se está
ativa. A escrita em radar_fontes e
radar_capturas é feita apenas pelas Edge
Functions (service role); o painel só lê.

---

# 13.1 INTELIGÊNCIA (MIGRATION 010)

A migration 010_radar_inteligencia.sql
acrescenta a camada que transforma o
Radar em central de decisão:

CACHE DE ANÁLISE
radar_analise_cache guarda o resultado
por hash do texto. O mesmo anúncio não
é pago duas vezes à IA.

DEDUPE SEMÂNTICO
A mesma cota anunciada em três fontes
vira UMA oportunidade: as repetições só
incrementam o campo ocorrencias e a
captura é marcada como DESCARTADA com
o motivo.

PREÇO DE REFERÊNCIA
valor_referencia é a mediana já
praticada para o mesmo empreendimento e
tipo; desconto_pct mostra o quanto o
anúncio está abaixo (positivo) ou acima
(negativo) do praticado.

SINAIS DE NEGOCIAÇÃO
urgencia (BAIXA a IMEDIATA) e
risco_fraude (BAIXO a ALTO) ajustam o
score: score_base guarda a nota pura da
IA e score_oportunidade a nota final.

FILA COM RETRY
Capturas que falham voltam com espera
exponencial (2, 4, 8… até 60 minutos) e,
depois de 5 tentativas, viram ABANDONADO
para não travar a fila.

CIRCUIT BREAKER
Três falhas seguidas suspendem a fonte
por um tempo crescente, sem queimar cota
de API.

CUSTO E ALERTAS
radar_ia_uso registra tokens e custo por
chamada; radar_alertas guarda o que já
foi avisado por WhatsApp e e-mail. A aba
Saúde do painel lê os dois pela ação
"saude".

Sem a 010, tudo continua funcionando: as
funções regravam sem as colunas novas.

---

# 13.2 FONTES RSS/ATOM

Além de Instagram e Facebook, o robô lê
feeds RSS/Atom publicados oficialmente
pelos portais.

Cadastre a fonte com:

Tipo: RSS
Identificador: a URL https do feed

O adaptador só consome o feed público
oferecido pelo portal — continua valendo
a regra de NÃO fazer scraping.

---

# 14. INSTAGRAM E FACEBOOK

A captura automática é feita
EXCLUSIVAMENTE através das APIs
oficiais da Meta (Graph API) e/ou
Webhooks autorizados.

Não utilizar:

Scraping

Senha do Instagram

Senha do Facebook

Métodos para contornar permissões

Qualquer coleta fora dos termos da Meta
está fora do escopo deste projeto e não
deve ser adicionada ao radar-captura.

A arquitetura é:

Instagram/Facebook
↓
API oficial (radar-captura)
↓
radar_capturas
↓
radar-ia
↓
Gemini
↓
Seleção pelo alvo
↓
Supabase
↓
Central de Monitoramento

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

A captura correspondente aparece na aba
CAPTURAS (fonte MANUAL, estado
ANALISADO), provando que a análise
manual usa o mesmo pipeline do robô.

Para testar o fluxo completo:

1. Aba MONITORAMENTO → crie um alvo
   (ex.: resort "Ipioca Beach",
   tipo VENDA_COTA, score mínimo 40)
   e vincule a fonte Manual.

2. Aba CAPTURAS → cole o anúncio.

3. Clique em ANALISAR AGORA.

4. Aba OPORTUNIDADES → a oportunidade
   deve aparecer com o motivo_selecao
   preenchido. Se os critérios do alvo
   não baterem, a captura vira
   DESCARTADA com o motivo — de
   propósito, nada some.

5. Aba SAÚDE DO ROBÔ → confira a
   execução registrada.

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
   (padrão: gemini-2.5-flash)

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

# 16.2 ERRO INTERNO AO PROCESSAR A ANÁLISE

A função radar-ia agora devolve a
causa real do problema em vez da
mensagem genérica. Se ainda assim
aparecer:

Erro: Erro interno ao processar a
análise (ref. XXXXXXXX)...

o código "ref." é o trace_id do
erro: procure por ele em
Supabase → Edge Functions →
radar-ia → Logs para ver o stack
trace completo.

Mensagens agora tratadas
diretamente na tela:

1. "Tabela radar_oportunidades não
   encontrada no banco" →
   aplique a migration
   supabase/migrations/007_radar_ia.sql
   no SQL Editor do Supabase.
   Se a tabela ausente for
   radar_alvos, radar_fontes,
   radar_capturas ou radar_execucoes,
   aplique
   supabase/migrations/008_radar_central_monitoramento.sql
   (a mensagem da função já indica
   qual migration aplicar).

2. "Estrutura da tabela ...
   desatualizada (coluna ausente)" →
   reaplique a mesma migration
   (o schema está antigo).

3. "Sem permissão para gravar ...
   (RLS)" → confira as policies
   criadas pela migration 007 e o
   secret de chave secreta da
   Edge Function.

4. "Edge Function sem credenciais
   do Supabase" → defina
   SUPABASE_URL e
   SUPABASE_SECRET_KEY em
   Edge Functions → Secrets.

5. "GEMINI_API_KEY inválida",
   "Modelo ... indisponível",
   "Limite de uso da IA atingido",
   "timeout" → veja a seção 16.1,
   itens 2 e 3.

6. "A API do Gemini retornou uma
   resposta inesperada",
   "resposta truncada",
   "A IA bloqueou a análise" →
   instabilidade/limite do Gemini
   ou texto muito grande: tente
   novamente com um trecho menor.

IMPORTANTE: se a mensagem exibida
for a versão ANTIGA, sem o código
"(ref. ...)", a função implantada
está desatualizada. Verifique o job
"Deploy Edge Functions (Supabase)"
no GitHub Actions — se ele falhou
por SUPABASE_ACCESS_TOKEN inválido
ou expirado, gere um novo token em
https://supabase.com/dashboard/account/tokens
e atualize o GitHub Secret
SUPABASE_ACCESS_TOKEN. Alternativa
manual:

supabase functions deploy radar-ia \
  --project-ref ydrmjoppjxtmnwtvtinb \
  --no-verify-jwt

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
