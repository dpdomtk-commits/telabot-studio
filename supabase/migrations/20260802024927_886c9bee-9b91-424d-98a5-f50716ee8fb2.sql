-- 1) Novos tipos de nó do editor visual
CREATE TYPE public.flow_node_type AS ENUM (
  'start','message','image','video','audio','document','button','menu','question','condition',
  'delay','tag','untag','webhook','api','pix','payment','subscription','upsell','downsell',
  'order_bump','pack','release_channel','release_group','delivery','end'
);

ALTER TABLE public.flow_steps
  ALTER COLUMN type TYPE public.flow_node_type USING type::text::public.flow_node_type;

ALTER TABLE public.flow_steps
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS position_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_y double precision NOT NULL DEFAULT 0;

-- 2) Fluxos: descrição e situação
CREATE TYPE public.flow_status AS ENUM ('draft','active','archived');

ALTER TABLE public.flows
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status public.flow_status NOT NULL DEFAULT 'draft';

UPDATE public.flows SET status = 'active' WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_flows_user_status ON public.flows(user_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON public.flow_steps(flow_id, position);

-- 3) Conexões visuais entre etapas
CREATE TABLE public.flow_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  source_step_id uuid NOT NULL REFERENCES public.flow_steps(id) ON DELETE CASCADE,
  target_step_id uuid NOT NULL REFERENCES public.flow_steps(id) ON DELETE CASCADE,
  source_handle text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_step_id, target_step_id, source_handle)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_connections TO authenticated;
GRANT ALL ON public.flow_connections TO service_role;
ALTER TABLE public.flow_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_connections_select ON public.flow_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY flow_connections_insert ON public.flow_connections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY flow_connections_update ON public.flow_connections FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY flow_connections_delete ON public.flow_connections FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_flow_connections_flow ON public.flow_connections(flow_id);

-- 4) Execuções e logs de fluxo
CREATE TYPE public.execution_status AS ENUM ('running','waiting_payment','completed','failed','cancelled');

CREATE TABLE public.flow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  current_step_id uuid REFERENCES public.flow_steps(id) ON DELETE SET NULL,
  status public.execution_status NOT NULL DEFAULT 'running',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_executions TO authenticated;
GRANT ALL ON public.flow_executions TO service_role;
ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_executions_select ON public.flow_executions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY flow_executions_insert ON public.flow_executions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY flow_executions_update ON public.flow_executions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY flow_executions_delete ON public.flow_executions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_flow_executions_flow ON public.flow_executions(flow_id, created_at DESC);
CREATE TRIGGER trg_flow_executions_updated BEFORE UPDATE ON public.flow_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.flow_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.flows(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES public.flow_executions(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.flow_steps(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.flow_logs TO authenticated;
GRANT ALL ON public.flow_logs TO service_role;
ALTER TABLE public.flow_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_logs_select ON public.flow_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY flow_logs_insert ON public.flow_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_flow_logs_flow ON public.flow_logs(flow_id, created_at DESC);

-- 5) Assinaturas
CREATE TYPE public.subscription_status AS ENUM ('active','past_due','cancelled','expired');

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  plan_name text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  interval_days integer NOT NULL DEFAULT 30,
  status public.subscription_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  next_charge_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY subscriptions_insert ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY subscriptions_update ON public.subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY subscriptions_delete ON public.subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_subscriptions_user_status ON public.subscriptions(user_id, status);
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Cobranças: referência única e vínculo com o fluxo
CREATE OR REPLACE FUNCTION public.generate_transaction_reference()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'PAY_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9));
$$;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS transaction_reference text NOT NULL DEFAULT public.generate_transaction_reference(),
  ADD COLUMN IF NOT EXISTS qr_code text,
  ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flow_step_id uuid REFERENCES public.flow_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_reference
  ON public.payments(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_payments_flow ON public.payments(flow_id);