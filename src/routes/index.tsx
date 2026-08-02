import { createFileRoute, Link } from "@tanstack/react-router";
import markAsset from "@/assets/aurumbot-mark.png.asset.json";
import { Bot, GitBranch, Users, CreditCard, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AURUMBOT - Bots do Telegram que vendem sozinhos" },
      {
        name: "description",
        content:
          "Cadastre bots do Telegram, monte fluxos por etapas, capture leads, receba via PIX e entregue o produto automaticamente.",
      },
      { property: "og:title", content: "AURUMBOT - Bots do Telegram que vendem sozinhos" },
      {
        property: "og:description",
        content:
          "Cadastre bots do Telegram, monte fluxos por etapas, capture leads, receba via PIX e entregue o produto automaticamente.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Bot, title: "Bots gerenciados", desc: "Cadastre, valide o token e ligue ou desligue em um clique." },
  { icon: GitBranch, title: "Fluxos por etapas", desc: "Mensagem, imagem, botão, espera, pagamento e entrega — sem arrastar nada." },
  { icon: Users, title: "Leads centralizados", desc: "Todo contato que fala com o bot vira um lead filtrável." },
  { icon: CreditCard, title: "Pagamentos PIX", desc: "Estrutura pronta para acompanhar cobranças e receita." },
  { icon: Zap, title: "Entrega automática", desc: "O produto sai assim que o pagamento é aprovado." },
  { icon: ShieldCheck, title: "Acesso isolado", desc: "Cada conta enxerga somente os próprios dados." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
          <img
            src={markAsset.url}
            alt="Logo AURUMBOT"
            className="size-9 rounded-xl border border-border object-cover"
          />
          AURUM<span className="text-primary">BOT</span>
        </span>
        <Button asChild size="sm">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <section className="aurora-bg border-y border-border">
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            Plataforma de automação para Telegram
          </p>
          <h1 className="text-balance text-5xl font-bold leading-[1.05] md:text-6xl">
            Bots do Telegram que <span className="text-gradient-neon">vendem sozinhos</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-base text-muted-foreground">
            Cadastre seu bot, monte o fluxo por etapas, capture leads, receba via PIX e entregue o
            produto automaticamente. Tudo em um painel só.
          </p>
          <div className="mt-9">
            <Button asChild size="lg">
              <Link to="/auth">Criar conta grátis</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="bg-card p-7">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} AURUMBOT
        </div>
      </footer>
    </div>
  );
}
