# Migração de Imagens: Imgur → Supabase Storage

Este guia descreve como migrar as fotos dos resorts do Imgur para o
Supabase Storage, eliminando a dependência de um serviço externo sem SLA.

## Por que migrar?

- **Controle**: imagens gerenciadas pela própria equipe
- **CDN automático**: Supabase entrega via CDN global
- **Transformações**: resize, WebP automático via Supabase Image Transformations
- **SLA**: sem risco de links quebrados por remoção no Imgur

## Pré-requisitos

1. Executar a migration `003_storage_buckets.sql` no Supabase SQL Editor
2. Ter acesso admin ao painel do Supabase

## Passos

### 1. Upload das imagens

Acesse o **Storage** no dashboard do Supabase e faça upload das imagens no bucket `resort-images`, organizado por pasta de resort:

```
resort-images/
  hotbeach/    → imagens do Hot Beach Suites
  saopedro/    → imagens do São Pedro Thermas
  olimpia/     → imagens do Olimpia Park Resort
  solar/       → imagens do Solar das Águas
  wyndham/     → imagens do Wyndham Royal
  juquehy/     → imagens da Praia de Juquehy
  ipioca/      → imagens do Ipioca Beach Resort
  portoi2/     → imagens do Porto 2 Life
```

Nomeie os arquivos como `foto1.jpg`, `foto2.jpg`, etc.

### 2. Atualizar `resorts/data.json`

Substitua as URLs do Imgur pela URL base do Supabase Storage:

**Antes (Imgur):**
```json
{ "id": "AmFSwwd", "ext": "jpeg" }
```

**Depois (Supabase Storage):**
```json
{ "url": "https://ydrmjoppjxtmnwtvtinb.supabase.co/storage/v1/object/public/resort-images/hotbeach/foto1.jpg" }
```

> O gerador `scripts/generate-resorts.js` usa `img.id` e `img.ext` para
> construir a URL do Imgur. Ao migrar, adicione o campo `img.url` diretamente
> e atualize a função `gallery()` em `generate-resorts.js` para preferir `img.url`
> quando disponível.

### 3. Regenerar páginas de resort

```bash
node scripts/generate-resorts.js
```

### 4. URL com transformação (WebP automático)

Para usar o Supabase Image Transformations (redimensionamento, WebP):

```
https://ydrmjoppjxtmnwtvtinb.supabase.co/storage/v1/render/image/public/resort-images/hotbeach/foto1.jpg?width=800&quality=80
```

Isso converte automaticamente para WebP quando o browser suportar.

## Mapeamento atual Imgur → Supabase

| Resort | ID Imgur atual | Pasta Supabase |
|--------|---------------|----------------|
| Hot Beach Suites | `AmFSwwd` | `resort-images/hotbeach/` |
| São Pedro Thermas | `pyEKOtQ` | `resort-images/saopedro/` |
| Olimpia Park | `AseZPzL` | `resort-images/olimpia/` |
| Wyndham Royal | `iDMQ2XA` | `resort-images/wyndham/` |
| Solar das Águas | `S4tSUzG` | `resort-images/solar/` |
| Praia de Juquehy | `SxlktwS` | `resort-images/juquehy/` |
| Ipioca Beach | `o4Esa54` | `resort-images/ipioca/` |
| Porto 2 Life | `x23SHdy` | `resort-images/portoi2/` |
