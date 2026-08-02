import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { testMediaCache } from "@/lib/media.functions";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Configurações | AURUMBOT" },
      { name: "description", content: "Atualize seu nome, e-mail, foto de perfil e senha de acesso." },
      { property: "og:title", content: "Configurações | AURUMBOT" },
      { property: "og:description", content: "Atualize seu nome, e-mail, foto e senha." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,avatar_url,email")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (error) throw error;
      return { ...data, authEmail: userData.user.email ?? "" };
    },
  });

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
    setEmail(profile.authEmail);
  }, [profile]);

  async function saveProfile(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const parsed = z
      .object({
        fullName: z.string().trim().min(2, "Informe seu nome").max(80),
        avatarUrl: z.string().trim().url("URL inválida").max(500).or(z.literal("")),
      })
      .safeParse({ fullName, avatarUrl });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos"); return; }

    setSavingProfile(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.fullName, avatar_url: parsed.data.avatarUrl || null })
      .eq("id", userData.user!.id);
    setSavingProfile(false);
    if (error) { toast.error("Não foi possível salvar o perfil"); return; }
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function saveEmail(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const parsed = z.string().trim().email("E-mail inválido").safeParse(email);
    if (!parsed.success) { toast.error("E-mail inválido"); return; }
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: parsed.data });
    setSavingEmail(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Confirme a alteração no link enviado para o novo e-mail");
  }

  async function savePassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (password.length < 8) { toast.error("A senha precisa ter ao menos 8 caracteres"); return; }
    if (password !== confirm) { toast.error("As senhas não coincidem"); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) { toast.error(error.message); return; }
    setPassword("");
    setConfirm("");
    toast.success("Senha alterada");
  }

  const mediaCache = <MediaCacheCard />;

  const initials = (fullName || email || "A").slice(0, 2).toUpperCase();

  return (
    <div className="max-w-2xl">
      <PageHeader title="Configurações" description="Dados da sua conta." />

      <form onSubmit={saveProfile} className="panel space-y-4 p-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="Foto de perfil" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Label htmlFor="avatar">Foto de perfil (URL)</Label>
            <Input id="avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} maxLength={500} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
        </div>
        <Button type="submit" disabled={savingProfile}>
          Salvar perfil
        </Button>
      </form>

      <Separator className="my-6" />

      {mediaCache}

      <Separator className="my-6" />

      <form onSubmit={saveEmail} className="panel space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" disabled={savingEmail}>
          Alterar e-mail
        </Button>
      </form>

      <Separator className="my-6" />

      <form onSubmit={savePassword} className="panel space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" disabled={savingPassword}>
          Alterar senha
        </Button>
      </form>
    </div>
  );
}

type CacheSettings = {
  chat_type: "channel" | "group";
  chat_id: string | null;
  chat_title: string | null;
  bot_id: string | null;
  status: string;
  last_error: string | null;
};

function MediaCacheCard() {
  const qc = useQueryClient();
  const runTest = useServerFn(testMediaCache);
  const [chatType, setChatType] = useState<"channel" | "group">("channel");
  const [chatId, setChatId] = useState("");
  const [botId, setBotId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: bots = [] } = useQuery({
    queryKey: ["bots-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bots").select("id,name").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["media-cache-settings"],
    queryFn: async (): Promise<CacheSettings | null> => {
      const { data, error } = await supabase
        .from("media_cache_settings")
        .select("chat_type,chat_id,chat_title,bot_id,status,last_error")
        .maybeSingle();
      if (error) throw error;
      return (data as CacheSettings | null) ?? null;
    },
  });

  useEffect(() => {
    if (!settings) return;
    setChatType(settings.chat_type);
    setChatId(settings.chat_id ?? "");
    setBotId(settings.bot_id ?? "");
  }, [settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!chatId.trim()) { toast.error("Informe o ID do canal ou grupo"); return; }
    if (!botId) { toast.error("Escolha o bot responsável pelo cache"); return; }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("media_cache_settings").upsert({
      user_id: userData.user!.id,
      chat_type: chatType,
      chat_id: chatId.trim(),
      bot_id: botId,
    });
    if (error) { setSaving(false); toast.error("Não foi possível salvar"); return; }
    const result = await runTest({ data: { chatId: chatId.trim(), botId } });
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["media-cache-settings"] });
    if (result.ok) toast.success(`Cache conectado${result.title ? `: ${result.title}` : ""}`);
    else toast.error(result.message);
  }

  const status = settings?.status ?? "disconnected";

  return (
    <form onSubmit={save} className="panel space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Cache de Mídia</h2>
          <p className="text-sm text-muted-foreground">
            Canal ou grupo privado do Telegram usado para armazenar os arquivos dos fluxos.
          </p>
        </div>
        <Badge variant={status === "connected" ? "default" : status === "error" ? "destructive" : "secondary"}>
          {status === "connected" ? "Conectado" : status === "error" ? "Erro" : "Desconectado"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={chatType} onValueChange={(v) => setChatType(v as "channel" | "group")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="channel">Canal Telegram</SelectItem>
              <SelectItem value="group">Grupo Telegram</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="chat-id">ID do Canal / Grupo</Label>
          <Input id="chat-id" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-1001234567890" maxLength={64} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Bot responsável</Label>
          <Select value={botId} onValueChange={setBotId}>
            <SelectTrigger><SelectValue placeholder="Selecione um bot" /></SelectTrigger>
            <SelectContent>
              {bots.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            O bot precisa ser administrador do canal/grupo para publicar e reutilizar os arquivos.
          </p>
        </div>
      </div>

      {settings?.last_error && status === "error" ? (
        <p className="text-xs text-destructive">{settings.last_error}</p>
      ) : null}

      <Button type="submit" disabled={saving}>{saving ? "Verificando…" : "Salvar e testar conexão"}</Button>
    </form>
  );
}
