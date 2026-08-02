import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot } from "lucide-react";

const particles = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 37) % 100,
  y: (i * 61) % 100,
  s: 2 + ((i * 7) % 4),
  d: (i % 9) * 0.7,
  t: 11 + ((i * 3) % 9),
}));

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar no AURUMBOT" },
      { name: "description", content: "Acesse sua conta AURUMBOT para gerenciar bots, fluxos e vendas." },
      { property: "og:title", content: "Entrar no AURUMBOT" },
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: dest, replace: true });
    });
  }, [navigate, dest]);

  return (
    <div className="aurora-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10">
        {particles.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-primary-glow/60 blur-[1px] animate-float-slow"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.s,
              height: p.s,
              animationDelay: `${p.d}s`,
              animationDuration: `${p.t}s`,
            }}
          />
        ))}
      </div>

      <div className="w-full max-w-sm animate-rise">
        <Link to="/" className="mb-8 flex flex-col items-center gap-3">
          <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface glow-ring animate-pulse-glow">
            <img src={markAsset.url} alt="Logo AURUMBOT" className="size-full object-cover" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">
            AURUM<span className="text-gradient-neon">BOT</span>
          </span>
        </Link>
        <div className="panel p-6">

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="pt-5">
              <SignInForm onDone={() => navigate({ to: dest, replace: true })} />
            </TabsContent>
            <TabsContent value="signup" className="pt-5">
              <SignUpForm />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.object({ email: emailSchema, password: z.string().min(1, "Informe a senha") }).safeParse({
      email,
      password,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error("E-mail ou senha incorretos");
      return;
    }
    toast.success("Bem-vindo de volta");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="si-email">E-mail</Label>
        <Input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="si-pass">Senha</Label>
        <Input
          id="si-pass"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z
      .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
      .safeParse({ name, email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app/dashboard`,
        data: { full_name: parsed.data.name },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Enviamos um e-mail de confirmação. Confirme seu endereço para acessar a conta.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="su-name">Nome</Label>
        <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-email">E-mail</Label>
        <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-pass">Senha</Label>
        <Input
          id="su-pass"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Criando..." : "Criar conta"}
      </Button>
    </form>
  );
}
