import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, MailCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registerCashBotAccount } from "@/lib/bot.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  redirect: z.string().optional(),
  verified: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar no CASH BOT" },
      { name: "description", content: "Acesse sua conta CASH BOT para gerenciar bots, fluxos e vendas." },
      { property: "og:title", content: "Entrar no CASH BOT" },
      { property: "og:description", content: "Acesse sua conta CASH BOT para gerenciar bots, fluxos e vendas." },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72);
const nameSchema = z.string().trim().min(2, "Informe seu nome").max(100);

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const dest = search.redirect ?? "/app/dashboard";

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hasVerifiedFlag =
      Boolean(search.verified) ||
      hash.includes("access_token") ||
      hash.includes("type=signup") ||
      hash.includes("type=recovery");

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (hasVerifiedFlag) {
          toast.success("Conta CASH BOT confirmada com sucesso! Bem-vindo ao painel.");
        }
        navigate({ to: dest, replace: true });
      } else if (hasVerifiedFlag && search.verified) {
        toast.success("E-mail confirmado no CASH BOT! Faça login para acessar seu painel.");
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        if (hasVerifiedFlag) {
          toast.success("Conta CASH BOT confirmada com sucesso! Bem-vindo ao painel.");
        }
        navigate({ to: dest, replace: true });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate, dest, search.verified]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) return toast.error(err.errors[0]?.message);
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : error.message);
    } else {
      toast.success("Login realizado com sucesso!");
      navigate({ to: dest, replace: true });
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    try {
      nameSchema.parse(name);
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) return toast.error(err.errors[0]?.message);
    }

    setLoading(true);
    try {
      const serverReg = await registerCashBotAccount({
        data: { name: name.trim(), email: email.trim(), password },
      }).catch(() => ({ autoConfirmed: false }));

      if (serverReg?.autoConfirmed) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!signInErr) {
          toast.success("Conta CASH BOT criada e ativada com sucesso!");
          navigate({ to: dest, replace: true });
          return;
        }
      }

      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth?verified=cashbot`
          : "https://telabot-studio.vercel.app/auth?verified=cashbot";

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            name: name.trim(),
            full_name: name.trim(),
            app_name: "CASH BOT",
            site_name: "CASH BOT",
            project_name: "CASH BOT",
            brand: "CASH BOT",
          },
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (signUpData?.session) {
        toast.success("Conta CASH BOT criada com sucesso!");
        navigate({ to: dest, replace: true });
        return;
      }

      setPendingConfirmationEmail(email.trim());
      toast.success("Cadastro iniciado! Verifique sua caixa de entrada para ativar sua conta CASH BOT.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCheck() {
    setLoading(true);
    try {
      if (pendingConfirmationEmail && password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: pendingConfirmationEmail,
          password,
        });
        if (!error && data?.session) {
          toast.success("Conta CASH BOT ativada com sucesso!");
          navigate({ to: dest, replace: true });
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        toast.success("Conta CASH BOT ativada com sucesso!");
        navigate({ to: dest, replace: true });
      } else {
        toast.info("Confirme o link no seu e-mail primeiro ou faça login na aba Entrar.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (!pendingConfirmationEmail) return;
    setResendingEmail(true);
    try {
      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth?verified=cashbot`
          : "https://telabot-studio.vercel.app/auth?verified=cashbot";
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingConfirmationEmail,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) toast.error(error.message);
      else toast.success("Novo link de ativação CASH BOT enviado para seu e-mail!");
    } finally {
      setResendingEmail(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050508] px-4 py-12 text-white selection:bg-cyan-500 selection:text-black">
      {/* Background glow estilo Scarface Cyan & Cobalt */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,rgba(6,182,212,0.18),transparent_70%)]" />

      <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-300">
        <Link to="/" className="mb-8 flex flex-col items-center gap-3">
          <img
            src="/cashbot-emblem.png?v=4"
            alt="Logo CASH BOT"
            className="size-20 rounded-full object-cover drop-shadow-[0_0_20px_rgba(6,182,212,0.35)]"
          />
          <span className="font-serif text-2xl font-black tracking-tight text-white flex items-center gap-1">
            CASH<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">BOT</span>
          </span>
          <p className="text-xs text-zinc-400">Entre para gerenciar seu império de vendas</p>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-[#0c0d14]/90 p-6 shadow-2xl backdrop-blur">
          {pendingConfirmationEmail ? (
            <div className="space-y-4 text-center">
              <div className="flex flex-col items-center gap-2">
                <img
                  src="/cashbot-emblem.png?v=4"
                  alt="CASH BOT"
                  className="size-14 rounded-full object-cover drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-3 py-1 text-[11px] font-bold text-cyan-300 uppercase tracking-wider">
                  <MailCheck className="size-3.5" /> Confirmação Oficial CASH BOT
                </span>
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-extrabold text-white">Ative sua conta CASH BOT</h2>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Enviamos um link de confirmação para <strong className="text-white">{pendingConfirmationEmail}</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-left text-[11px] text-amber-100/90 leading-relaxed">
                <strong>Nota:</strong> O disparo de segurança é processado pelo servidor legado da nuvem (que pode exibir o identificador técnico antigo no cabeçalho do e-mail), mas o link ativará diretamente o seu painel oficial <strong>CASH BOT</strong>.
              </div>

              <div className="space-y-2 pt-1">
                <Button
                  type="button"
                  disabled={loading}
                  onClick={handleConfirmCheck}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-cyan-900/40 transition"
                >
                  <CheckCircle2 className="size-4 mr-1.5" />
                  {loading ? "Verificando..." : "Já confirmei — Entrar no Painel"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={resendingEmail}
                  onClick={handleResendConfirmation}
                  className="w-full border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-semibold rounded-xl"
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${resendingEmail ? "animate-spin" : ""}`} />
                  {resendingEmail ? "Reenviando..." : "Reenviar e-mail de confirmação CASH BOT"}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setPendingConfirmationEmail(null);
                    setActiveTab("signin");
                  }}
                  className="text-xs text-zinc-400 hover:text-white transition pt-1"
                >
                  Voltar para tela de login
                </button>
              </div>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "signin" | "signup")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-white/5 mb-6">
                <TabsTrigger value="signin" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-blue-500/30 data-[state=active]:text-cyan-300 data-[state=active]:border data-[state=active]:border-cyan-500/40">
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-blue-500/30 data-[state=active]:text-cyan-300 data-[state=active]:border data-[state=active]:border-cyan-500/40">
                  Cadastrar
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-300">E-mail</Label>
                    <Input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-300">Senha</Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-cyan-900/40 transition"
                  >
                    {loading ? "Entrando..." : "Acessar Painel"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-300">Seu Nome</Label>
                    <Input
                      type="text"
                      placeholder="Seu nome completo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-300">E-mail</Label>
                    <Input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-300">Senha (mínimo 8 dígitos)</Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-cyan-900/40 transition"
                  >
                    {loading ? "Criando conta..." : "Criar Minha Conta"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} CASH BOT — Sistema de Automação Telegram
        </div>
      </div>
    </div>
  );
}
