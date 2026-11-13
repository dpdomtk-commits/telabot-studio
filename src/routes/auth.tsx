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
      { title: "Entrar no Chef Bot" },
      { name: "description", content: "Acesse sua conta Chef Bot para gerenciar bots, fluxos e vendas." },
      { property: "og:title", content: "Entrar no Chef Bot" },
      { property: "og:description", content: "Acesse sua conta Chef Bot para gerenciar bots, fluxos e vendas." },
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050508] px-4 py-12 text-white selection:bg-cyan-500 selection:text-black">
      {/* Background glow estilo Scarface Cyan & Purple */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,rgba(6,182,212,0.18),transparent_70%)]" />

      <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-300">
        <Link to="/" className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-cyan-500/40 bg-black shadow-[0_0_25px_rgba(6,182,212,0.4)]">
            <img src="/chefbot-emblem.jpg" alt="Logo Chef Bot" className="size-full object-cover" />
          </div>
          <span className="font-serif text-2xl font-black tracking-tight text-white flex items-center gap-1">
            CHEF<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">BOT</span>
          </span>
          <p className="text-xs text-zinc-400">Entre para gerenciar seu império de vendas</p>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-[#0c0d14]/90 p-6 shadow-2xl backdrop-blur">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-white/5 mb-6">
              <TabsTrigger value="signin" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-purple-500/30 data-[state=active]:text-cyan-300 data-[state=active]:border data-[state=active]:border-cyan-500/40">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="signup" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-purple-500/30 data-[state=active]:text-cyan-300 data-[state=active]:border data-[state=active]:border-cyan-500/40">
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
                    className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-cyan-500"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-cyan-900/40 transition"
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
                  className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-cyan-900/40 transition"
                >
                  {loading ? "Criando conta..." : "Criar Minha Conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-8 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} Chef Bot — Sistema de Automação Telegram
        </div>
      </div>
    </div>
  );
}
