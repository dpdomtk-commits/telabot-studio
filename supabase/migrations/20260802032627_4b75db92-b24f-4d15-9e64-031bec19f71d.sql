CREATE TYPE public.media_kind AS ENUM ('image','video','audio','document');
CREATE TYPE public.media_chat_type AS ENUM ('channel','group');

CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_file_id text NOT NULL,
  telegram_file_unique_id text,
  message_id bigint,
  file_name text NOT NULL,
  file_type public.media_kind NOT NULL,
  mime_type text,
  file_size bigint NOT NULL DEFAULT 0,
  thumbnail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_assets_user ON public.media_assets(user_id, created_at DESC);
CREATE INDEX idx_media_assets_type ON public.media_assets(user_id, file_type);

GRANT SELECT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_assets_select_own" ON public.media_assets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "media_assets_update_own" ON public.media_assets FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "media_assets_delete_own" ON public.media_assets FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.media_cache_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_type public.media_chat_type NOT NULL DEFAULT 'channel',
  chat_id text,
  chat_title text,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'disconnected',
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_cache_settings TO authenticated;
GRANT ALL ON public.media_cache_settings TO service_role;
ALTER TABLE public.media_cache_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_cache_own" ON public.media_cache_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER set_media_cache_updated_at BEFORE UPDATE ON public.media_cache_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();