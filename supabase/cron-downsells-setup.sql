-- ============================================================================
-- AGENDADOR GRATUITO VIA SUPABASE (PG_CRON + PG_NET)
-- ============================================================================
-- Caso queira executar o processamento de downsells a cada 1 minuto diretamente
-- pelo banco de dados Supabase (sem custo e sem depender da Vercel Pro):
--
-- 1. Acesse seu projeto no Supabase > SQL Editor
-- 2. Cole e execute as linhas abaixo:

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior se existir
SELECT cron.unschedule('process-downsells-worker') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-downsells-worker'
);

-- Agenda o disparo a cada 1 minuto via requisição HTTP ao worker da Vercel
SELECT cron.schedule(
  'process-downsells-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://telabot-studio.vercel.app/api/cron/process-downsells',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
