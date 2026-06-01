# HOSPEDAH — Migrations do Supabase

Este diretório contém as migrations **incrementais** do banco de dados.

## Estrutura

| Arquivo | Descrição |
|---------|-----------|
| `001_instagram.sql` | Cache e configuração do feed do Instagram |
| `002_security_rls_fixes.sql` | Correções de RLS: reservas, mensagens, disponibilidade, preços |
| `003_storage_buckets.sql` | Buckets de armazenamento (Supabase Storage) para imagens dos resorts |

## Como aplicar

1. Acesse o **SQL Editor** do Supabase:  
   `https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql`

2. Execute as migrations **em ordem crescente** (001 → 002 → 003 → …).

3. Cada arquivo é idempotente (`IF NOT EXISTS`, `DROP IF EXISTS`, `OR REPLACE`),
   podendo ser re-executado sem efeito colateral caso já esteja aplicado.

## Schema base (instalação do zero)

Para um ambiente **novo** (ex.: staging, clone), execute primeiro o arquivo raiz:

```
supabase_migration.sql   ← schema completo + dados iniciais
```

Em seguida, aplique as migrations incrementais desta pasta na ordem.

## Convenção para novas mudanças

- Cada nova alteração de schema deve ir em um arquivo **`NNN_descricao.sql`** nesta pasta,  
  onde `NNN` é o próximo número disponível (ex.: `004_novo_recurso.sql`).
- Nunca edite migrations já aplicadas em produção — crie uma nova.
- Documente o propósito no cabeçalho do arquivo SQL.
