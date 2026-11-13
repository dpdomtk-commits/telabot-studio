import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar no CASH BOT" },
      { name: "description", content: "Acesse sua conta CASH BOT para gerenciar bots, fluxos e vendas." },
      { property: "og:title", content: "Entrar no CASH BOT" },
      { property: "og:description", content: "Acesse sua conta para gerenciar bots, fluxos e vendas." },
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: dest, replace: true });
    });
  }, [navigate, dest]);

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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Conta criada com sucesso! Verifique seu e-mail ou faça login.");
      navigate({ to: dest, replace: true });
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070709] px-4 py-12 text-white selection:bg-red-600 selection:text-white">
      {/* Background glow estilo Scarface */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,rgba(217,4,41,0.15),transparent_70%)]" />

      <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-300">
        <Link to="/" className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-red-500/40 bg-zinc-950 shadow-[0_0_25px_-5px_rgba(217,4,41,0.5)]">
            <span className="flex items-center gap-1 text-red-600 font-black text-2xl select-none">
              <span className="inline-block transform -skew-x-12 h-6 w-1 bg-red-600 rounded-sm"></span>
              <span className="inline-block transform -skew-x-12 h-7 w-1 bg-red-600 rounded-sm translate-y-[-2px]"></span>
              <span className="inline-block transform -skew-x-12 h-5 w-1 bg-red-600 rounded-sm"></span>
            </span>
          </div>
          <span className="font-serif text-2xl font-black tracking-tight text-[#f5f5f7]">
            CASH<span className="text-red-600">BOT</span>
          </span>
          <p className="text-xs text-zinc-400">Entre para gerenciar seu império de vendas</p>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-[#0e0e11]/90 p-6 shadow-2xl backdrop-blur">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-white/5 mb-6">
              <TabsTrigger value="signin" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="signup" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
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
                    className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-red-600"
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
                    className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-red-600"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-red-900/30 transition"
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
                    placeholder="Tony Montana"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-red-600"
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
                    className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-red-600"
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
                    className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-red-600"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-red-900/30 transition"
                >
                  {loading ? "Criando conta..." : "Criar Minha Conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-8 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} CASH BOT — Sistema de Automação Telegram
        </div>
      </div>
    </div>
  );
}
