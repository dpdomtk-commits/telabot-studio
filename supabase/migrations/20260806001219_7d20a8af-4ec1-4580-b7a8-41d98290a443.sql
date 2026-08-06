-- ============ 1. Credenciais de gateway por usuário ============
CREATE TABLE public.user_gateway_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'syncpay',
  client_id text,
  client_secret text,
  status text NOT NULL DEFAULT 'disconnected',
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT (id, user_id, provider, client_id, status, last_error, last_checked_at, created_at, updated_at)
  ON public.user_gateway_credentials TO authenticated;
GRANT ALL ON public.user_gateway_credentials TO service_role;
ALTER TABLE public.user_gateway_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gateway credentials read" ON public.user_gateway_credentials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER user_gateway_credentials_updated_at BEFORE UPDATE ON public.user_gateway_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2. Links de redirect ============
CREATE TABLE public.redirect_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  destination text,
  is_active boolean NOT NULL DEFAULT true,
  clicks_total integer NOT NULL DEFAULT 0,
  last_click_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.redirect_links TO authenticated;
GRANT ALL ON public.redirect_links TO service_role;
ALTER TABLE public.redirect_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own redirect links" ON public.redirect_links
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read redirect links" ON public.redirect_links
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER redirect_links_updated_at BEFORE UPDATE ON public.redirect_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.redirect_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.redirect_links(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer text,
  device text,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_redirect_clicks_link ON public.redirect_clicks (link_id, created_at DESC);
GRANT SELECT ON public.redirect_clicks TO authenticated;
GRANT ALL ON public.redirect_clicks TO service_role;
ALTER TABLE public.redirect_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own redirect clicks" ON public.redirect_clicks
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ============ 3. Conversas e mensagens ============
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  is_blocked boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  last_inbound_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);
CREATE INDEX idx_conversations_user ON public.conversations (user_id, last_message_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conversations" ON public.conversations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read conversations" ON public.conversations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  kind text NOT NULL DEFAULT 'text',
  body text,
  file_id text,
  file_name text,
  telegram_message_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages read" ON public.messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, tag)
);
GRANT SELECT, INSERT, DELETE ON public.lead_tags TO authenticated;
GRANT ALL ON public.lead_tags TO service_role;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead tags" ON public.lead_tags
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ 4. Remarketing ============
CREATE TABLE public.remarketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Remarketing',
  segment text NOT NULL DEFAULT 'nao_comprou',
  tag_filter text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remarketing_campaigns TO authenticated;
GRANT ALL ON public.remarketing_campaigns TO service_role;
ALTER TABLE public.remarketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own remarketing campaigns" ON public.remarketing_campaigns
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER remarketing_campaigns_updated_at BEFORE UPDATE ON public.remarketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.remarketing_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.remarketing_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  delay_hours integer NOT NULL DEFAULT 3,
  text text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remarketing_messages TO authenticated;
GRANT ALL ON public.remarketing_messages TO service_role;
ALTER TABLE public.remarketing_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own remarketing messages" ON public.remarketing_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER remarketing_messages_updated_at BEFORE UPDATE ON public.remarketing_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.remarketing_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.remarketing_campaigns(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.remarketing_messages(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent',
  clicked_at timestamptz,
  converted_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  revenue_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, lead_id)
);
GRANT SELECT ON public.remarketing_sends TO authenticated;
GRANT ALL ON public.remarketing_sends TO service_role;
ALTER TABLE public.remarketing_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own remarketing sends" ON public.remarketing_sends
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ============ 5. Ofertas do fluxo (order bump / upsell / downsell) ============
CREATE TABLE public.flow_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('order_bump','upsell','downsell')),
  name text NOT NULL,
  description text,
  pitch text,
  amount_cents integer NOT NULL DEFAULT 0,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_flow_offers_flow ON public.flow_offers (flow_id, kind, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_offers TO authenticated;
GRANT ALL ON public.flow_offers TO service_role;
ALTER TABLE public.flow_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own flow offers" ON public.flow_offers
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER flow_offers_updated_at BEFORE UPDATE ON public.flow_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 6. Seller Network ============
CREATE TABLE public.community_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_channels TO authenticated;
GRANT ALL ON public.community_channels TO service_role;
ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels readable" ON public.community_channels
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to uuid REFERENCES public.community_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_messages_channel ON public.community_messages (channel_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.community_messages TO authenticated;
GRANT ALL ON public.community_messages TO service_role;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community messages readable" ON public.community_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "community messages insert own" ON public.community_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community messages delete own" ON public.community_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

INSERT INTO public.community_channels (slug, name, description, position) VALUES
  ('geral', 'geral', 'Conversa livre entre sellers', 1),
  ('estrategias', 'estrategias', 'Estratégias de venda e funis', 2),
  ('telegram', 'telegram', 'Dúvidas sobre bots e Telegram', 3),
  ('pagamentos', 'pagamentos', 'PIX, gateways e saques', 4),
  ('divulgacao', 'divulgacao', 'Divulgue seus canais e ofertas', 5);

-- ============ 7. Log de acesso admin ============
CREATE TABLE public.admin_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  path text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_access_logs TO authenticated;
GRANT ALL ON public.admin_access_logs TO service_role;
ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read access logs" ON public.admin_access_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ 8. Taxa fixa de R$ 0,50 ============
UPDATE public.finance_settings SET charge_fixed_fee_cents = 50, charge_percent_fee = 0;

CREATE OR REPLACE FUNCTION public.credit_payment(_payment_id uuid, _ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.payments%ROWTYPE;
  v_fee bigint;
  v_net bigint;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Cobrança não encontrada'); END IF;
  IF p.credited_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'message', 'Já creditado', 'duplicate', true); END IF;

  -- Taxa fixa obrigatória da plataforma: R$ 0,50 por venda aprovada.
  v_fee := 50;
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
  VALUES (p.id, p.user_id, p.amount_cents, v_fee, v_net, 0)
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'fee_cents', v_fee, 'net_cents', v_net);
END; $function$;

-- ============ 9. Tempo real ============
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.community_messages REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;