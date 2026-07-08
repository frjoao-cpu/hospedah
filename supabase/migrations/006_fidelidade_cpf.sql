-- ============================================================
-- HOSPEDAH — Migration 006: Coluna cpf na tabela fidelidade
--
-- Adiciona a coluna cpf à tabela fidelidade para suporte à
-- nova funcionalidade de pontuação por CPF.
--
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql
-- ============================================================

ALTER TABLE fidelidade ADD COLUMN IF NOT EXISTS cpf text;
