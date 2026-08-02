-- ============ FLOWS: modo simples/avançado ============
DO $$ BEGIN
  CREATE TYPE public.flow_mode AS ENUM ('simple','advanced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.flows
  ADD COLUMN IF NOT EXISTS mode public.flow_mode NOT NULL DEFAULT 'advanced',
  ADD COLUMN IF NOT EXISTS simple_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS share_code text;

CREATE UNIQUE INDEX IF NOT EXISTS flows_share_code_key ON public.flows (share_code) WHERE share_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_flow_code()
RETURNS text
LANGUAGE sql
SET search_path TO 'public'
AS $$
  SELECT 'FLOW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

-- ============ FLOW TEMPLATES ============
CREATE TABLE IF NOT EXISTS public.flow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  cover_url text,
  mode public.flow_mode NOT NULL DEFAULT 'advanced',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  install_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_templates TO authenticated;
GRANT ALL ON public.flow_templates TO service_role;
ALTER TABLE public.flow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_select_own_or_public" ON public.flow_templates FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_public);
CREATE POLICY "templates_insert_own" ON public.flow_templates FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "templates_update_own" ON public.flow_templates FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "templates_delete_own" ON public.flow_templates FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS flow_templates_user_idx ON public.flow_templates (user_id);
CREATE INDEX IF NOT EXISTS flow_templates_public_idx ON public.flow_templates (is_public);
CREATE TRIGGER flow_templates_updated_at BEFORE UPDATE ON public.flow_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ FLOW SHARES ============
CREATE TABLE IF NOT EXISTS public.flow_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.flows(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.flow_templates(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE DEFAULT public.generate_flow_code(),
  is_active boolean NOT NULL DEFAULT true,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_shares TO authenticated;
GRANT ALL ON public.flow_shares TO service_role;
ALTER TABLE public.flow_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shares_select_own" ON public.flow_shares FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "shares_insert_own" ON public.flow_shares FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "shares_update_own" ON public.flow_shares FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "shares_delete_own" ON public.flow_shares FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS flow_shares_code_idx ON public.flow_shares (code);
CREATE TRIGGER flow_shares_updated_at BEFORE UPDATE ON public.flow_shares FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ FLOW IMPORTS ============
CREATE TABLE IF NOT EXISTS public.flow_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.flow_templates(id) ON DELETE SET NULL,
  share_code text,
  created_flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'code',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.flow_imports TO authenticated;
GRANT ALL ON public.flow_imports TO service_role;
ALTER TABLE public.flow_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports_select_own" ON public.flow_imports FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS flow_imports_user_idx ON public.flow_imports (user_id);

-- ============ FLOW MARKETPLACE ============
CREATE TABLE IF NOT EXISTS public.flow_marketplace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.flow_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text,
  price_cents integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  rating numeric NOT NULL DEFAULT 0,
  installs integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_marketplace TO authenticated;
GRANT ALL ON public.flow_marketplace TO service_role;
ALTER TABLE public.flow_marketplace ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketplace_select_approved_or_own" ON public.flow_marketplace FOR SELECT TO authenticated
  USING (status = 'approved' OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "marketplace_insert_own" ON public.flow_marketplace FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "marketplace_update_own_or_admin" ON public.flow_marketplace FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "marketplace_delete_own_or_admin" ON public.flow_marketplace FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS flow_marketplace_status_idx ON public.flow_marketplace (status);
CREATE TRIGGER flow_marketplace_updated_at BEFORE UPDATE ON public.flow_marketplace FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();