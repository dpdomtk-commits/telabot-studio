-- finance_settings: admin-only read
DROP POLICY IF EXISTS finance_settings_select ON public.finance_settings;
CREATE POLICY finance_settings_select_admin ON public.finance_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Revoke direct write privileges on sensitive/audit tables
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ledger_entries FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawals FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.gateway_attempts FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.finance_settings FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.activity_logs FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.flow_logs FROM authenticated, anon;

GRANT ALL ON public.wallets TO service_role;
GRANT ALL ON public.ledger_entries TO service_role;
GRANT ALL ON public.withdrawals TO service_role;
GRANT ALL ON public.gateway_attempts TO service_role;
GRANT ALL ON public.finance_settings TO service_role;
GRANT ALL ON public.activity_logs TO service_role;
GRANT ALL ON public.flow_logs TO service_role;

-- Explicit restrictive deny policies documenting immutability for clients
CREATE POLICY wallets_no_client_writes ON public.wallets
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (current_setting('request.method', true) IS NULL OR (SELECT false))
  WITH CHECK (false);
