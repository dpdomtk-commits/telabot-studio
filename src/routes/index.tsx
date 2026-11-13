import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, GitBranch, Users, CreditCard, ShieldCheck, Zap, Crown, Flame, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chef Bot — O Mundo É Seu. Robôs de Venda no Telegram" },
      {
        name: "description",
        content:
          "O robô cobra no Telegram, o PIX confirma e o acesso sai na hora. Você só cuida do anúncio.",
      },
      { property: "og:title", content: "Chef Bot — Robôs de Venda no Telegram" },
      {
        property: "og:description",
        content:
          "O robô cobra no Telegram, o PIX confirma e o acesso sai na hora. Você só cuida do anúncio.",
      },
    ],
  }),
  component: ChefBotLanding,
});

const features = [
  {
    icon: Zap,
    title: "PIX na Hora e Automático",
    desc: "Cobrança rápida via PIX Copia e Cola e QR Code sob demanda com confirmação instantânea.",
  },
  {
    icon: Crown,
    title: "Entrega Automática de VIP",
    desc: "O cliente pagou, o bot libera o link de convite ou arquivos do pack imediatamente.",
  },
  {
    icon: Flame,
    title: "Upsell, Downsell & Order Bump",
    desc: "Multiplique seu faturamento oferecendo novas ofertas pós-compra e recuperação inteligente.",
  },
  {
    icon: Bot,
    title: "Múltiplos Bots Vinculados",
    desc: "Rode a mesma operação em vários bots ao mesmo tempo com proteção contra bloqueios.",
  },
  {
    icon: Users,
    title: "Remarketing Programado",
    desc: "Envie mensagens automáticas para quem gerou PIX e não pagou ou quem abandonou o bot.",
  },
  {
    icon: ShieldCheck,
    title: "Sem Mensalidade",
    desc: "Apenas R$ 0,50 fixo por venda aprovada. Sem surpresas ou mensalidades abusivas.",
  },
];

export function ChefBotLanding() {
  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-cyan-500 selection:text-black">
      {/* Top Navbar */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="size-10 overflow-hidden rounded-xl border border-cyan-500/40 shadow-[0_0_20px_-3px_rgba(6,182,212,0.5)]">
            <img src="/chefbot-emblem.jpg" alt="Logo Chef Bot" className="size-full object-cover" />
          </div>
          <span className="font-display text-xl font-black tracking-wider text-white">
            CHEF<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">BOT</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-400 font-medium">
          <a href="#recursos" className="hover:text-cyan-300 transition">Recursos</a>
          <a href="#como-funciona" className="hover:text-cyan-300 transition">Como funciona</a>
          <a href="#vantagens" className="hover:text-cyan-300 transition">Vantagens</a>
          <a href="#duvidas" className="hover:text-cyan-300 transition">Dúvidas</a>
        </nav>

        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm" className="text-zinc-300 hover:text-white hover:bg-white/5">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/30 px-5"
          >
            <Link to="/auth">Começar agora</Link>
          </Button>
        </div>
      </header>

      {/* Hero Section estilo Scarface / The World Is Yours */}
      <section className="relative overflow-hidden border-b border-white/5 bg-gradient-to-b from-[#090912] to-[#050508]">
        <div className="mx-auto max-w-7xl px-6 py-16 md:py-24 grid lg:grid-cols-12 gap-12 items-center">
          {/* Lado Esquerdo: Copywriting */}
          <div className="lg:col-span-7 space-y-6 z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/20 px-3.5 py-1 text-xs font-semibold text-cyan-400 tracking-wider uppercase">
              <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Robôs de Venda no Telegram
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] uppercase">
              O Mundo <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
                é seu.
              </span>
            </h1>

            <p className="max-w-xl text-lg sm:text-xl text-zinc-400 font-normal leading-relaxed">
              O robô cobra no Telegram, o PIX confirma e o acesso sai na hora. Você só cuida do anúncio.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button
                asChild
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white text-base font-bold rounded-xl shadow-xl shadow-cyan-500/40 px-8 py-6 h-auto"
              >
                <Link to="/auth">Começar meu império</Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-zinc-800 bg-white/5 hover:bg-white/10 text-zinc-200 text-base font-semibold rounded-xl px-7 py-6 h-auto"
              >
                <a href="#como-funciona">Ver como funciona</a>
              </Button>
            </div>

            {/* Badges / Selos */}
            <div className="flex flex-wrap items-center gap-3 pt-4 text-xs font-medium text-zinc-300">
              <span className="flex items-center gap-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 px-3 py-1.5">
                <CheckCircle2 className="size-3.5 text-cyan-400" /> PIX na hora
              </span>
              <span className="flex items-center gap-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 px-3 py-1.5">
                <CheckCircle2 className="size-3.5 text-cyan-400" /> Aprovação automática
              </span>
              <span className="flex items-center gap-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 px-3 py-1.5">
                <CheckCircle2 className="size-3.5 text-cyan-400" /> Meta + Utmify
              </span>
              <span className="flex items-center gap-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 px-3 py-1.5">
                <CheckCircle2 className="size-3.5 text-cyan-400" /> Sem mensalidade
              </span>
            </div>

            <p className="text-xs text-zinc-500 pt-1">
              Taxa: <strong className="text-zinc-300">R$ 0,50 por venda aprovada</strong>. Sem necessidade de cartão para abrir a conta.
            </p>
          </div>

          {/* Lado Direito: Imagem Hero The World Is Yours */}
          <div className="lg:col-span-5 relative flex justify-center">
            <div className="relative w-full max-w-md aspect-[4/5] rounded-3xl overflow-hidden border border-cyan-500/30 shadow-[0_0_50px_-10px_rgba(6,182,212,0.4)]">
              <img
                src="/chefbot-hero.jpg"
                alt="Chef Bot - The World Is Yours"
                className="w-full h-full object-cover object-center transform hover:scale-105 transition duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-transparent to-transparent opacity-80" />
              <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-black/80 backdrop-blur border border-white/10">
                <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">CHEF BOT AUTOMATION</p>
                <p className="text-sm font-bold text-white">Domine o mercado com bots de alta conversão.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grid de Recursos */}
      <section id="recursos" className="mx-auto max-w-7xl px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold uppercase tracking-tight">
            Construído para quem quer <span className="text-red-500">vender em escala</span>
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base">
            Elimine atendentes manuais e tenha um funil de conversão rodando 24 horas por dia no Telegram.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/5 bg-zinc-950/60 p-7 hover:border-red-500/40 hover:bg-zinc-900/40 transition duration-300 space-y-3"
            >
              <div className="size-11 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-500">
                <f.icon className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-white">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Final */}
      <section className="border-t border-white/5 bg-gradient-to-t from-red-950/20 to-transparent py-20">
        <div className="mx-auto max-w-4xl px-6 text-center space-y-6">
          <h2 className="text-3xl sm:text-5xl font-black uppercase">
            Pronto para colocar seus bots no piloto automático?
          </h2>
          <p className="text-zinc-400 text-base max-w-xl mx-auto">
            Crie sua conta agora no CASH BOT e suba seus primeiros fluxos em poucos minutos.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl px-10 py-6 h-auto shadow-xl shadow-red-600/30 text-lg"
          >
            <Link to="/auth">Criar conta no CASH BOT</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} CASH BOT — Todos os direitos reservados.
      </footer>
    </div>
  );
}
