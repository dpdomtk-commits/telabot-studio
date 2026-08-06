REVOKE ALL ON FUNCTION public.credit_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_payment(uuid, text) TO service_role;