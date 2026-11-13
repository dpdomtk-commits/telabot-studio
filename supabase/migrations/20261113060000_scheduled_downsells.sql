-- Tabela opcional dedicada para fila de downsells agendados
CREATE TABLE IF NOT EXISTS public.scheduled_downsells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.flows(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES public.bots(id) ON DELETE CASCADE,
  lead_id text NOT NULL,
  chat_id bigint NOT NULL,
  trigger_type text NOT NULL, -- 'start' | 'pix'
  order_id text,
  sequence_id text,
  sequence_title text,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'cancelled' | 'failed'
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_downsells_worker ON public.scheduled_downsells (status, scheduled_for);
