-- ============================================================
-- HOSPEDAH — Migration 003: Supabase Storage — Bucket de imagens
--
-- Cria o bucket público "resort-images" para hospedar fotos dos
-- resorts, eliminando a dependência do Imgur (sem SLA, sem CDN,
-- sem controle de qualidade).
--
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql
--
-- Após executar, siga os passos em docs/migrating-images.md para
-- migrar as fotos do Imgur para o Supabase Storage.
-- ============================================================

-- Criar o bucket público para imagens dos resorts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resort-images',
  'resort-images',
  true,
  10485760,                                          -- 10 MB por arquivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas do bucket: leitura pública, escrita somente admin
CREATE POLICY "resort_images_leitura_publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resort-images');

CREATE POLICY "resort_images_upload_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resort-images' AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'proprietario')
    )
  );

CREATE POLICY "resort_images_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'resort-images' AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'proprietario')
    )
  );

-- ============================================================
-- URL base das imagens após a migração:
-- https://ydrmjoppjxtmnwtvtinb.supabase.co/storage/v1/object/public/resort-images/<slug>/<nome>.jpg
--
-- Exemplo para Hot Beach Suites, foto 1:
-- https://ydrmjoppjxtmnwtvtinb.supabase.co/storage/v1/object/public/resort-images/hotbeach/foto1.jpg
-- ============================================================
