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
        011_radar_saneamento.sql
        012_radar_diagnostico_views.sql
        013_radar_calibragem_selecao.sql

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

Calibragem do lote e do retry
(todos opcionais — os padrões
atuais continuam valendo):

RADAR_LOTE_MAXIMO
(padrão 30 — teto de capturas
analisadas por chamada)

RADAR_ORCAMENTO_LOTE_MS
(padrão 110000 — tempo máximo
gasto em um lote antes de
devolver o resto para a fila)

IA_RETRY_TENTATIVAS
(padrão 3, máximo 5 — quantas
vezes repetir uma chamada de IA
que falhou por sobrecarga ou
indisponibilidade do provedor,
com espera exponencial de
500ms a 8s)

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

Opcionais da inteligência avançada
(migration 014). Todos têm padrão
seguro — só defina para calibrar:

LUNA_EMBEDDING_MODEL
(padrão text-embedding-3-small)

GEMINI_EMBEDDING_MODEL
(padrão text-embedding-004,
usado só se a Luna falhar)

RADAR_DEDUPE_SEMANTICO
(0 desliga o dedupe por vetor e
volta a comparar só por palavras)

Limites da saúde operacional:

RADAR_SAUDE_FILA_MAXIMA      (200)
RADAR_SAUDE_DEAD_LETTER      (25)
RADAR_SAUDE_FALHAS_FONTE     (3)
RADAR_SAUDE_CUSTO_DIARIO     (5, em USD)
RADAR_SAUDE_HORAS_SEM_CAPTURA (6)

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

Com credencial EXPIRADA a varredura para
de insistir: a fonte é suspensa por 6
horas já na primeira falha (as demais
falhas só suspendem depois de 3 seguidas)
e, dentro da mesma varredura, as outras
fontes do mesmo tipo nem chegam a chamar
a Graph API — reaproveitam o mesmo erro.
Isso evita queimar cota e encher o
histórico com a mesma mensagem. Depois de
regravar o secret, clique em TESTAR na
fonte ou em VARRER AGORA: a varredura
manual ignora a suspensão de propósito,
para confirmar na hora que o token novo
funciona.

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

A resposta traz "detalhes" com uma
linha por captura: motivo, erro e
"estado_persistido". Quando
estado_persistido vem false, a análise
funcionou mas o UPDATE da captura não
(banco desatualizado ou RLS) — o painel
mostra a falha item a item no botão
ANALISAR PENDENTES. A mesma captura
nunca gera duas oportunidades: se ela
voltar à fila, a oportunidade já ligada
a ela é reaproveitada.

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

saude_operacional
(avalia fila, fontes, custo e ritmo de
captura, abre incidentes e alerta o
time uma única vez por problema;
previa:true só avalia, sem gravar)

limpar
(retenção do histórico; ver seção 8.3)

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
cria três jobs:

radar-captura-varredura
(a cada 30 minutos, acao "varrer")

radar-ia-processar-pendentes
(a cada 15 minutos, defasado da captura,
acao "processar_pendentes", limite 25)

radar-ia-saude
(de hora em hora, acao
"saude_operacional" — avalia o
pipeline e avisa sozinho quando algo
quebra; ver seção 8.4)

A cadência é o que define o custo de IA:
são até 4 lotes por hora. Se o consumo
pesar, reduza a frequência ou o "limite"
no próprio supabase_cron.sql.

Os três jobs passam pela função
public.radar_chamar(), que traz duas
proteções:

1. A URL vem de app.supabase_url. Antes
   o endereço do projeto estava escrito
   à mão em cada job e restaurar o banco
   em outro projeto disparava chamadas
   para o projeto errado.

2. Jitter: um atraso aleatório de até
   30-90 segundos espalha a carga, em
   vez de todos os jobs baterem na API
   no mesmo segundo.

Execute o supabase_cron.sql no SQL
Editor e garanta que
app.service_role_key e app.supabase_url
estejam definidos:

ALTER DATABASE postgres
  SET app.supabase_url =
  'https://<seu-projeto>.supabase.co';

Sem a chave de serviço, radar_chamar
apenas emite um WARNING e não chama
nada — nenhum job falha em silêncio.

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
Os botões ANALISAR PENDENTES e REAVALIAR
DESCARTADAS ficam nesta aba (e também na
de Capturas). O resumo do lote lista os
motivos de descarte agregados — veja a
seção 16.4 para calibrar a partir deles.

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
está vivo. Também traz o custo de IA,
a fila e o painel de LIMPEZA E RETENÇÃO
(seção 8.3).

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

# 8.3 LIMPEZA E RETENÇÃO

O Radar acumula depressa: texto bruto
das capturas, cache de análises, alertas
enviados, execuções e a medição de
tokens. Sem limpeza o painel fica lento
e o banco cresce sem necessidade.

Na aba SAÚDE DO ROBÔ, o bloco
"Limpeza e retenção" funciona em
dois passos:

1. CALCULAR LIMPEZA
   Conta, sem apagar nada, quantos
   registros antigos existem em cada
   categoria.

2. APAGAR
   Só fica disponível quando há algo a
   remover, mostra quantos dias serão
   preservados (editável) e pede
   confirmação. A remoção é definitiva.

Categorias e retenção padrão:

| Categoria | Padrão | Mínimo |
|---|---|---|
| Capturas já analisadas | 90 dias | 30 |
| Capturas descartadas | 60 dias | 15 |
| Capturas com erro / abandonadas | 30 dias | 7 |
| Oportunidades descartadas | 180 dias | 30 |
| Cache de análises da IA | 60 dias | 7 |
| Histórico de alertas | 90 dias | 7 |
| Histórico de execuções | 60 dias | 7 |
| Medição de tokens e custo | 180 dias | 30 |

Garantias de segurança:

- Oportunidades em VALIDAR ou APROVADA
  nunca são apagadas — apenas as
  DESCARTADA.
- O painel nunca envia nome de tabela ou
  de coluna: escolhe uma das políticas
  fixas definidas em
  supabase/functions/_shared/radar.ts.
- O número de dias é limitado ao mínimo
  de cada categoria, então não é possível
  apagar o histórico recente por engano.
- Limpar o cache de IA não perde dado:
  só faz a IA reanalisar textos antigos
  (e pagar por isso de novo).

Também dá para chamar a limpeza
diretamente na Edge Function:

```
POST /functions/v1/radar-ia
{ "acao": "limpar", "alvo": "todos", "previa": true }

POST /functions/v1/radar-ia
{ "acao": "limpar", "alvo": "cache_ia", "dias": 60 }
```

---

# 8.4 SAÚDE OPERACIONAL

Antes, um problema no pipeline só
aparecia se alguém abrisse o painel.
Agora o Radar se avalia de hora em
hora e reclama sozinho.

Aba SAÚDE → botão VERIFICAR AGORA,
ou o job horário radar-ia-saude.

O QUE É AVALIADO

FILA_TRAVADA
capturas PENDENTES acima do teto: a
análise não acompanha a captura.

DEAD_LETTER
capturas que esgotaram as tentativas.
Investigue a causa antes de usar o
reenfileiramento.

FONTE_FALHANDO
falhas consecutivas em uma fonte. O
incidente diz QUAL fonte e qual foi
o último erro.

CUSTO_ALTO
gasto de IA do dia acima do teto.

SEM_CAPTURA
nenhuma captura há X horas. Quase
sempre significa cron parado ou
credencial da fonte vencida.

COMO O ALERTA FUNCIONA

Cada problema vira uma linha em
radar_incidentes, com um incidente
ABERTO por tipo+alvo. Só o CRÍTICO
dispara WhatsApp/e-mail, e apenas na
primeira vez: as rodadas seguintes
atualizam os números sem repetir o
aviso. Quando o problema some, o
incidente é marcado RESOLVIDO.

Os canais são os mesmos do alerta de
oportunidade (Z-API e Resend).

---

# 8.5 COMPARATIVO DE MERCADO

A mesma cota costuma ser anunciada em
vários lugares por preços diferentes.
O Radar agrupa essas aparições por
empreendimento + tipo + semana (ou
mês, quando não há semana).

No detalhe da oportunidade aparece:

📊 Mesmo negócio no mercado:
4 anúncio(s) · 2 fonte(s) ·
menor pedido R$ 24.000 ·
50% de variação ·
18 dia(s) em mercado

Isso responde, sem planilha, "qual é
o menor preço pedido?" e "há quanto
tempo está encalhado?" — quanto mais
dias em mercado, maior o espaço para
negociar.

O bloco só aparece a partir do
segundo anúncio do mesmo negócio.

---

# 8.6 DEDUPE SEMÂNTICO
#      (MIGRATION 014)

A comparação por palavras não
reconhecia o mesmo anúncio reescrito:
"vendo cota no Golden" e "passo minha
fração no Golden" viravam duas
oportunidades.

Agora o texto também vira um vetor de
768 dimensões (pgvector) e a busca é
por significado. O vetor é guardado
por hash do texto, então o mesmo
texto nunca é pago duas vezes.

REQUISITOS

1. Aplicar
   supabase/migrations/014_radar_inteligencia_avancada.sql

2. A extensão vector precisa estar
   disponível no projeto. Se não
   estiver, a migration avisa e pula
   os passos de embedding — o Radar
   continua funcionando com a
   comparação por palavras.

A migration é idempotente: pode ser
reaplicada quantas vezes for preciso.
Cada passo roda isolado e avisa por
NOTICE se falhar, sem abortar o
restante.

A 014 também aperta o RLS: escrever
nas tabelas do Radar passa a exigir
papel admin ou proprietário em
profiles. Se a tabela profiles não
existir, a migration mantém o
comportamento antigo e emite um
NOTICE de ATENÇÃO.

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

RSS
(feed RSS/Atom público do portal;
identificador = URL https do feed —
veja a seção 13.2)

MANUAL
(texto colado pelo operador)

IMPORT
(importação de lote)

EMAIL e WHATSAPP existem no banco como
reserva de espaço, mas ainda NÃO têm
adaptador de captura: cadastrá-los criaria
fonte que nunca captura, então a função
recusa esses tipos de propósito.

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

## Que feeds cadastrar

O RSS é hoje o canal de maior cobertura
por esforço: não depende de token da Meta
e não esbarra em termo de uso.

Três famílias valem o cadastro:

1. Portais de classificados
   Muitos expõem a busca como feed. Faça
   a busca no site (ex.: "cota Gramado",
   "multipropriedade Olímpia") e procure
   o ícone de RSS ou tente acrescentar
   /rss ou ?format=rss à URL do resultado.
   Cadastre uma fonte por busca salva:
   assim cada fonte já vem pré-filtrada.

2. Sites de revenda de cotas
   Portais especializados em revenda de
   multipropriedade costumam publicar o
   feed de novos anúncios. É a fonte com
   a maior densidade de oportunidade real.

3. Blogs e agregadores do setor
   Feeds de notícias de resorts e de
   grupos hoteleiros antecipam abertura
   de vendas e liquidação de estoque.

Como validar antes de confiar na fonte:

- Abra a URL no navegador. Tem que vir
  XML com <item> ou <entry>. Se vier
  HTML, não é feed.
- Cadastre e clique em TESTAR FONTE. O
  teste faz a requisição de verdade e
  diz quantos itens o feed devolveu.
- Rode VARRER e confira na aba Capturas
  se os itens entraram como PENDENTE.

O que NÃO funciona por RSS: grupos do
Facebook e o Marketplace. Eles não
publicam feed, e raspar o HTML viola os
Termos da Meta. Cobertura desses espaços
só por ingestão em lote (copiar e colar o
texto do anúncio no painel).

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

# 16.3 SQL DE SANEAMENTO E
#      DIAGNÓSTICO (MIGRATION 011)

supabase/migrations/011_radar_saneamento.sql
roda no SQL Editor, é idempotente e:

1. Junta as oportunidades duplicadas
geradas pela MESMA captura (mantém a
mais antiga, soma as ocorrências e
marca as demais como DESCARTADA com
duplicada_de).

2. Cria o índice único parcial
radar_opp_captura_unica_idx: no banco,
uma captura passa a gerar no máximo
uma oportunidade.

3. Cria os índices que faltavam para o
dedupe (hash_texto, empreendimento +
criado_em, oportunidade_id).

4. Cria as visões de conferência:

select * from radar_capturas_estado;
-- PENDENTE / ANALISADO / DESCARTADO /
-- ERRO / ABANDONADO, com quantas têm
-- erro e quantas viraram oportunidade

select * from radar_capturas_falhas;
-- agrupa as falhas pela mensagem e
-- mostra até 5 ids de exemplo: é como
-- identificar exatamente quais e
-- quantas capturas falharam

select * from radar_capturas_travadas;
-- PENDENTES com mais de 2 horas, o
-- sintoma de quem não saiu da fila

select * from radar_fila;
-- visão da 010, com o retry pendente

5. Cria a função de manutenção:

select public.radar_reenfileirar();
-- devolve todas as ERRO/ABANDONADO
-- para PENDENTE, zerando tentativas

select public.radar_reenfileirar(
  array['<uuid>','<uuid>']::uuid[]
);
-- reenfileira só as escolhidas

Depois de reenfileirar, rode
ANALISAR PENDENTES no painel e confira
de novo radar_capturas_estado.

ERRO 42P01:
relation "public.radar_capturas_estado"
does not exist

Significa que a 011 ainda não foi
aplicada (ou foi interrompida no meio:
ela faz o saneamento ANTES de criar as
visões, então qualquer erro no caminho
deixa as visões sem nascer).

Solução rápida: abra o SQL Editor, cole
o conteúdo de
supabase/migrations/012_radar_diagnostico_views.sql
INTEIRO e execute. Essa migration cria
SÓ as visões, cada uma isolada, sem
depender do saneamento — se alguma não
puder ser criada, ela avisa o motivo
(NOTICE) em vez de abortar tudo.

Depois, para o saneamento completo
(duplicidade + índices + função de
reenfileirar), rode também
supabase/migrations/011_radar_saneamento.sql
INTEIRO e leia os NOTICE do resultado.
Só então rode as consultas acima.
Confira com:

select table_name
from information_schema.views
where table_schema = 'public'
  and table_name like 'radar_capturas_%';
-- precisa listar estado, falhas e
-- travadas

Observação: a 011 e a 012 criam as
visões com security_invoker só quando o
PostgreSQL é 15 ou superior; em bancos
14 a opção é omitida e o acesso do anon
é revogado no lugar. Os arquivos são
idempotentes e não abortam por papel
ausente nem por índice já criado.

Conferência rápida de duplicidade:

select captura_id, count(*)
from radar_oportunidades
where captura_id is not null
group by 1
having count(*) > 1;
-- depois da 011 precisa vir vazio

---

# 16.4 "SELECIONADAS: 0" —
#      CALIBRAR O FUNIL

Sintoma: o lote termina com
"Lidas: 8 · Analisadas: 8 ·
Selecionadas: 0 · Descartadas: 8".

A IA não reprova nada. Quem descarta é a
regra do alvo, aplicada depois da
extração. Para saber QUAL regra fechou o
funil, o resumo do botão ANALISAR
PENDENTES agora lista os motivos
agregados, por exemplo:

  Por que o lote terminou assim:
  Empreendimento fora do alvo: 6
  Score abaixo do mínimo do alvo: 2

O mesmo recorte, direto no banco:

select * from radar_descartes_por_motivo;
-- visão criada pela migration 013

Leitura de cada resultado:

- "Empreendimento fora do alvo"
  O anúncio cita um empreendimento que
  não está na lista do alvo. A seleção já
  resolve apelidos pelo cadastro, então
  o caminho é cadastrar o apelido usado
  no anúncio como alias do empreendimento
  (ou incluir o empreendimento no alvo).

- "Empreendimento não identificado"
  A IA não achou o nome NO texto e o
  texto também não cita nenhum termo do
  alvo. Quando o texto cita o alvo, a
  captura não é mais descartada: ela é
  aprovada com ressalva e cai na fila de
  validação manual, para o operador
  decidir. Nenhuma oportunidade se perde
  em silêncio.

- "Score abaixo do mínimo do alvo"
  Corte alto demais. O padrão de alvos
  novos caiu de 60 para 45 na migration
  013. Alvos JÁ cadastrados não são
  alterados automaticamente — reveja-os
  com o SQL documentado na seção 3 da
  013.

- "Duplicada"
  Funcionou como devia: a oportunidade
  já existia.

Depois de ajustar alias, alvo ou score,
devolva as capturas descartadas para a
fila com o botão REAVALIAR DESCARTADAS
(abas Monitoramento e Capturas), ou pela
ação da função:

{ "acao": "reenfileirar_descartadas" }

Aceita "alvo_id" para limitar a um alvo.
Capturas descartadas por duplicidade não
voltam. O cache por hash do texto evita
pagar a IA de novo pelo reprocessamento.

Se o lote parar antes de esvaziar a fila,
o painel avisa que o lote foi encerrado
no tempo limite: é só rodar de novo. O
lote para sozinho antes do timeout da
Edge Function para não perder o que já
foi analisado.

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
