CREATE TYPE public.gateway_provider AS ENUM ('internal','mercadopago','asaas','efi','pushinpay','openpix','pagarme','custom');

CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider public.gateway_provider NOT NULL DEFAULT 'internal',
  is_active boolean NOT NULL DEFAULT true,
  allow_fallback boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 1,
  pix_key text,
  receiver_name text NOT NULL DEFAULT 'AURUMBOT',
  receiver_city text NOT NULL DEFAULT 'SAO PAULO',
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_amount_cents bigint,
  min_amount_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_gateways_user ON public.payment_gateways(user_id, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gateways_select_own" ON public.payment_gateways FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "gateways_insert_own" ON public.payment_gateways FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "gateways_update_own" ON public.payment_gateways FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "gateways_delete_own" ON public.payment_gateways FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_payment_gateways_updated BEFORE UPDATE ON public.payment_gateways FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.gateway_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_label text NOT NULL,
  percent numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gateway_splits_gateway ON public.gateway_splits(gateway_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateway_splits TO authenticated;
GRANT ALL ON public.gateway_splits TO service_role;
ALTER TABLE public.gateway_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "splits_select_own" ON public.gateway_splits FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "splits_insert_own" ON public.gateway_splits FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "splits_update_own" ON public.gateway_splits FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "splits_delete_own" ON public.gateway_splits FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.gateway_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway_id uuid REFERENCES public.payment_gateways(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  provider public.gateway_provider NOT NULL DEFAULT 'internal',
  success boolean NOT NULL DEFAULT false,
  amount_cents bigint NOT NULL DEFAULT 0,
  latency_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gateway_attempts_gateway ON public.gateway_attempts(gateway_id, created_at DESC);
GRANT SELECT ON public.gateway_attempts TO authenticated;
GRANT ALL ON public.gateway_attempts TO service_role;
ALTER TABLE public.gateway_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts_select_own" ON public.gateway_attempts FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gateway_id uuid REFERENCES public.payment_gateways(id) ON DELETE SET NULL;
ALTER TABLE public.flows ADD COLUMN IF NOT EXISTS gateway_id uuid REFERENCES public.payment_gateways(id) ON DELETE SET NULL;