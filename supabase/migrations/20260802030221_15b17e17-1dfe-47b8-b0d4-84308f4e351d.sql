REVOKE EXECUTE ON FUNCTION public.adjust_wallet(uuid,bigint,text,uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.credit_payment(uuid,text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_withdrawal(uuid, public.withdrawal_status, uuid, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(uuid,bigint,text,text,text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.adjust_wallet(uuid,bigint,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_payment(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_withdrawal(uuid, public.withdrawal_status, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid,bigint,text,text,text) TO service_role;