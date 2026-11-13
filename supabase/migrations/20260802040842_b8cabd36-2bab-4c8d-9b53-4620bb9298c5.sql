CREATE OR REPLACE FUNCTION public.credit_payment(_payment_id uuid, _ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.payments%ROWTYPE;
  s public.finance_settings%ROWTYPE;
  v_percent numeric;
  v_fee bigint;
  v_net bigint;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Cobrança não encontrada'); END IF;
  IF p.credited_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'message', 'Já creditado', 'duplicate', true); END IF;

  SELECT * INTO s FROM public.finance_settings WHERE id;

  IF p.platform_fee_percent IS NOT NULL THEN
    v_percent := p.platform_fee_percent;
    v_fee := FLOOR(p.amount_cents * v_percent / 100.0);
  ELSE
    v_percent := COALESCE(s.charge_percent_fee, 0);
    v_fee := COALESCE(s.charge_fixed_fee_cents, 0) + FLOOR(p.amount_cents * v_percent / 100.0);
  END IF;

  IF v_fee < 0 THEN v_fee := 0; END IF;
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

  INSERT INTO public.commissions (payment_id, user_id, gross_amount_cents, platform_fee_cents, seller_amount_cents, percent)
  VALUES (p.id, p.user_id, p.amount_cents, v_fee, v_net, v_percent)
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'fee_cents', v_fee, 'net_cents', v_net);
END; $function$;