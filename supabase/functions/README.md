# HOSPEDAH — Supabase Edge Functions

## Estrutura

| Função | Acionamento | Descrição |
|--------|-------------|-----------|
| `weather` | HTTP GET | Proxy seguro para OpenWeatherMap (esconde a API key do front-end) |
| `notificacao-reserva` | Database Webhook (INSERT em `reservas_hospede`) | Envia WhatsApp + e-mail ao hóspede e ao admin |
| `lembrete-checkin` | pg_cron (diário 12:00 UTC) | Lembra hóspedes com check-in amanhã via WhatsApp |
| `recuperacao-abandono` | Database Webhook (INSERT em `abandono_reserva`) | Agenda push OneSignal 30min após abandono |

---

## Pré-requisitos

- [Supabase CLI](https://supabase.com/docs/guides/cli) instalado (`npm i -g supabase`)
- Login feito: `supabase login`
- Projeto linkado: `supabase link --project-ref ydrmjoppjxtmnwtvtinb`

---

## Como fazer deploy

```bash
# Deploy de todas as funções de uma vez
supabase functions deploy --project-ref ydrmjoppjxtmnwtvtinb

# Deploy de uma função específica
supabase functions deploy weather --project-ref ydrmjoppjxtmnwtvtinb
supabase functions deploy notificacao-reserva --project-ref ydrmjoppjxtmnwtvtinb
supabase functions deploy lembrete-checkin --project-ref ydrmjoppjxtmnwtvtinb
supabase functions deploy recuperacao-abandono --project-ref ydrmjoppjxtmnwtvtinb
```

---

## Configurar variáveis de ambiente

```bash
# Copie o template e preencha os valores
cp supabase/functions/.env.example supabase/functions/.env

# Suba as secrets para o Supabase
supabase secrets set --env-file supabase/functions/.env --project-ref ydrmjoppjxtmnwtvtinb

# Verificar secrets configuradas
supabase secrets list --project-ref ydrmjoppjxtmnwtvtinb
```

Ou via **Supabase Dashboard**: Settings → Edge Functions → Secrets.

---

## Configurar Database Webhooks

Acesse: **Supabase Dashboard → Database → Webhooks → Create a new hook**

### Webhook: `notificacao-reserva`
| Campo | Valor |
|-------|-------|
| Name | `nova-reserva` |
| Table | `reservas_hospede` |
| Events | INSERT |
| URL | `https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/notificacao-reserva` |
| HTTP Headers | `Authorization: Bearer <service_role_key>` |

### Webhook: `recuperacao-abandono`
| Campo | Valor |
|-------|-------|
| Name | `abandono-reserva` |
| Table | `abandono_reserva` |
| Events | INSERT |
| URL | `https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/recuperacao-abandono` |
| HTTP Headers | `Authorization: Bearer <service_role_key>` |

---

## Configurar pg_cron (lembrete-checkin)

Execute o SQL em `supabase_cron.sql` no SQL Editor do Supabase:
[https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql](https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql)

---

## Testar localmente

```bash
# Iniciar o servidor de Edge Functions local
supabase functions serve --env-file supabase/functions/.env

# Testar a função weather
curl "http://localhost:54321/functions/v1/weather?action=weather&lat=-23.5505&lon=-46.6333"

# Testar notificacao-reserva (mock de webhook)
curl -X POST "http://localhost:54321/functions/v1/notificacao-reserva" \
  -H "Content-Type: application/json" \
  -d '{"record":{"id":"test-123","nome_hospede":"João","email_hospede":"joao@teste.com","telefone":"17982006382","resort_nome":"Hot Beach Suites","data_entrada":"2026-07-01","data_saida":"2026-07-05","num_hospedes":4}}'
```
