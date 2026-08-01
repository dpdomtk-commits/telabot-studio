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

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z
      .object({
        fullName: z.string().trim().min(2, "Informe seu nome").max(80),
        avatarUrl: z.string().trim().url("URL inválida").max(500).or(z.literal("")),
      })
      .safeParse({ fullName, avatarUrl });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");

    setSavingProfile(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.fullName, avatar_url: parsed.data.avatarUrl || null })
      .eq("id", userData.user!.id);
    setSavingProfile(false);
    if (error) return toast.error("Não foi possível salvar o perfil");
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.string().trim().email("E-mail inválido").safeParse(email);
    if (!parsed.success) return toast.error("E-mail inválido");
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: parsed.data });
    setSavingEmail(false);
    if (error) return toast.error(error.message);
    toast.success("Confirme a alteração no link enviado para o novo e-mail");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa ter ao menos 8 caracteres");
    if (password !== confirm) return toast.error("As senhas não coincidem");
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) return toast.error(error.message);
    setPassword("");
    setConfirm("");
    toast.success("Senha alterada");
  }

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
