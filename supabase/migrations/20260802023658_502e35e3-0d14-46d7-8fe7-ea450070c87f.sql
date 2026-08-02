-- Enums
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'cancelled';

DO $$ BEGIN
  CREATE TYPE public.ledger_type AS ENUM ('payment_in','fee','withdrawal','withdrawal_fee','adjustment','refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ledger_status AS ENUM ('pending','completed','reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.withdrawal_status AS ENUM ('review','approved','paid','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cobranças: novos campos
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS success_message text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pix_code text,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credited_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_uidx
  ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_external_uidx
  ON public.payments (provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_user_created_idx ON public.payments (user_id, created_at DESC);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- Carteiras
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  available_cents bigint NOT NULL DEFAULT 0,
  pending_cents bigint NOT NULL DEFAULT 0,
  blocked_cents bigint NOT NULL DEFAULT 0,
  total_received_cents bigint NOT NULL DEFAULT 0,
  total_withdrawn_cents bigint NOT NULL DEFAULT 0,
  total_fees_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallets_select ON public.wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extrato financeiro
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.ledger_type NOT NULL,
  status public.ledger_status NOT NULL DEFAULT 'completed',
  amount_cents bigint NOT NULL,
  fee_cents bigint NOT NULL DEFAULT 0,
  net_cents bigint NOT NULL,
  description text,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  withdrawal_id uuid,
  ip_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_select ON public.ledger_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS ledger_user_created_idx ON public.ledger_entries (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_payment_credit_uidx
  ON public.ledger_entries (payment_id, type) WHERE payment_id IS NOT NULL;

-- Saques
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pix_key text NOT NULL,
  pix_key_type text NOT NULL DEFAULT 'random',
  amount_cents bigint NOT NULL,
  fee_cents bigint NOT NULL DEFAULT 0,
  net_cents bigint NOT NULL,
  status public.withdrawal_status NOT NULL DEFAULT 'review',
  reviewer_id uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY withdrawals_select ON public.withdrawals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER withdrawals_updated_at BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS withdrawals_user_created_idx ON public.withdrawals (user_id, created_at DESC);

-- Configurações financeiras globais
CREATE TABLE IF NOT EXISTS public.finance_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  charge_fixed_fee_cents integer NOT NULL DEFAULT 50,
  charge_percent_fee numeric(5,2) NOT NULL DEFAULT 0,
  withdrawal_fee_cents integer NOT NULL DEFAULT 500,
  min_withdrawal_cents integer NOT NULL DEFAULT 1000,
  provider text NOT NULL DEFAULT 'internal',
  pix_receiver_key text,
  pix_receiver_name text NOT NULL DEFAULT 'AURUMBOT',
  pix_receiver_city text NOT NULL DEFAULT 'SAO PAULO',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_settings TO authenticated;
GRANT ALL ON public.finance_settings TO service_role;
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_settings_select ON public.finance_settings FOR SELECT TO authenticated USING (true);
CREATE TRIGGER finance_settings_updated_at BEFORE UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.finance_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Carteira automática para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
          NEW.email,
          NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $function$;

INSERT INTO public.wallets (user_id)
SELECT id FROM auth.users ON CONFLICT (user_id) DO NOTHING;

-- Crédito atômico de pagamento (idempotente)
CREATE OR REPLACE FUNCTION public.credit_payment(_payment_id uuid, _ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p public.payments%ROWTYPE;
  s public.finance_settings%ROWTYPE;
  v_fee bigint;
  v_net bigint;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Cobrança não encontrada'); END IF;
  IF p.credited_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'message', 'Já creditado', 'duplicate', true); END IF;

  SELECT * INTO s FROM public.finance_settings WHERE id;
  v_fee := COALESCE(s.charge_fixed_fee_cents,0) + FLOOR(p.amount_cents * COALESCE(s.charge_percent_fee,0) / 100.0);
  IF v_fee > p.amount_cents THEN v_fee := p.amount_cents; END IF;
  v_net := p.amount_cents - v_fee;

  UPDATE public.payments
     SET status = 'approved', paid_at = COALESCE(paid_at, now()),
         fee_cents = v_fee, net_cents = v_net, credited_at = now()
   WHERE id = p.id;

  INSERT INTO public.wallets (user_id) VALUES (p.user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets
     SET available_cents = available_cents + v_net,
         total_received_cents = total_received_cents + p.amount_cents,
         total_fees_cents = total_fees_cents + v_fee
   WHERE user_id = p.user_id;

  INSERT INTO public.ledger_entries (user_id, type, status, amount_cents, fee_cents, net_cents, description, payment_id, ip_address)
  VALUES (p.user_id, 'payment_in', 'completed', p.amount_cents, v_fee, v_net,
          COALESCE(p.product_name, p.description, 'Recebimento PIX'), p.id, _ip)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'fee_cents', v_fee, 'net_cents', v_net);
END; $$;

REVOKE ALL ON FUNCTION public.credit_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_payment(uuid, text) TO service_role;

-- Solicitação de saque atômica
CREATE OR REPLACE FUNCTION public.request_withdrawal(_user_id uuid, _amount_cents bigint, _pix_key text, _pix_key_type text, _ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  w public.wallets%ROWTYPE;
  s public.finance_settings%ROWTYPE;
  v_net bigint;
  v_id uuid;
BEGIN
  SELECT * INTO s FROM public.finance_settings WHERE id;
  IF _amount_cents < s.min_withdrawal_cents THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Valor abaixo do mínimo permitido');
  END IF;
  IF _amount_cents <= s.withdrawal_fee_cents THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Valor precisa ser maior que a taxa de saque');
  END IF;

  SELECT * INTO w FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Carteira não encontrada'); END IF;
  IF w.available_cents < _amount_cents THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Saldo insuficiente');
  END IF;

  v_net := _amount_cents - s.withdrawal_fee_cents;

  UPDATE public.wallets
     SET available_cents = available_cents - _amount_cents,
         blocked_cents = blocked_cents + _amount_cents
   WHERE user_id = _user_id;

  INSERT INTO public.withdrawals (user_id, pix_key, pix_key_type, amount_cents, fee_cents, net_cents, ip_address)
  VALUES (_user_id, _pix_key, _pix_key_type, _amount_cents, s.withdrawal_fee_cents, v_net, _ip)
  RETURNING id INTO v_id;

  INSERT INTO public.ledger_entries (user_id, type, status, amount_cents, fee_cents, net_cents, description, withdrawal_id, ip_address)
  VALUES (_user_id, 'withdrawal', 'pending', _amount_cents, s.withdrawal_fee_cents, v_net, 'Solicitação de saque', v_id, _ip);

  RETURN jsonb_build_object('ok', true, 'withdrawal_id', v_id, 'net_cents', v_net);
END; $$;

REVOKE ALL ON FUNCTION public.request_withdrawal(uuid, bigint, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, bigint, text, text, text) TO service_role;

-- Decisão do administrador sobre o saque
CREATE OR REPLACE FUNCTION public.resolve_withdrawal(_withdrawal_id uuid, _status public.withdrawal_status, _reviewer uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  wd public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO wd FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Saque não encontrado'); END IF;
  IF wd.status IN ('paid','rejected') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Saque já finalizado');
  END IF;

  IF _status = 'rejected' THEN
    UPDATE public.wallets
       SET blocked_cents = blocked_cents - wd.amount_cents,
           available_cents = available_cents + wd.amount_cents
     WHERE user_id = wd.user_id;
    UPDATE public.ledger_entries SET status = 'reversed'
     WHERE withdrawal_id = wd.id AND type = 'withdrawal';
  ELSIF _status = 'paid' THEN
    UPDATE public.wallets
       SET blocked_cents = blocked_cents - wd.amount_cents,
           total_withdrawn_cents = total_withdrawn_cents + wd.amount_cents,
           total_fees_cents = total_fees_cents + wd.fee_cents
     WHERE user_id = wd.user_id;
    UPDATE public.ledger_entries SET status = 'completed'
     WHERE withdrawal_id = wd.id AND type = 'withdrawal';
  END IF;

  UPDATE public.withdrawals
     SET status = _status, reviewer_id = _reviewer, reviewed_at = now(), rejection_reason = _reason
   WHERE id = wd.id;

  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.resolve_withdrawal(uuid, public.withdrawal_status, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_withdrawal(uuid, public.withdrawal_status, uuid, text) TO service_role;

-- Ajuste manual de saldo pelo administrador
CREATE OR REPLACE FUNCTION public.adjust_wallet(_user_id uuid, _amount_cents bigint, _description text, _reviewer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET available_cents = available_cents + _amount_cents WHERE user_id = _user_id;
  INSERT INTO public.ledger_entries (user_id, type, status, amount_cents, fee_cents, net_cents, description, metadata)
  VALUES (_user_id, 'adjustment', 'completed', _amount_cents, 0, _amount_cents,
          COALESCE(_description, 'Ajuste manual'), jsonb_build_object('reviewer', _reviewer));
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.adjust_wallet(uuid, bigint, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_wallet(uuid, bigint, text, uuid) TO service_role;