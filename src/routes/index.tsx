import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, GitBranch, Users, CreditCard, ShieldCheck, Zap, Crown, Flame, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CASH BOT — O Mundo É Seu. Robôs de Venda no Telegram" },
      {
        name: "description",
        content:
          "O robô cobra no Telegram, o PIX confirma e o acesso sai na hora. Você só cuida do anúncio.",
      },
      { property: "og:title", content: "CASH BOT — Robôs de Venda no Telegram" },
      {
        property: "og:description",
        content:
          "O robô cobra no Telegram, o PIX confirma e o acesso sai na hora. Você só cuida do anúncio.",
      },
    ],
  }),
  component: CASHBOTLanding,
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

export function CASHBOTLanding() {
  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-[#60A5FA] selection:text-black">
      {/* Top Navbar Minimalista e Transparente */}
      <header className="relative z-50 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 border-b border-white/10 backdrop-blur-md bg-[#050508]/40">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-3 group">
            {/* Ícone geométrico da silhueta do dirigível em vetor minimalista */}
            <div className="size-10 rounded-xl bg-[#050507] border border-white/20 flex items-center justify-center shadow-[0_0_15px_rgba(96,165,250,0.3)] group-hover:border-[#60A5FA]/60 transition">
              <svg className="size-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="11" rx="9" ry="5" />
                <path d="M3 11c0 2.76 4.03 5 9 5s9-2.24 9-5" />
                <path d="M20 9l2 2-2 2" />
                <rect x="9" y="16" width="6" height="2" rx="1" fill="currentColor" />
              </svg>
            </div>
            <span className="font-display text-xl font-black tracking-wider text-white">
              CASH<span className="text-[#60A5FA]">BOT</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <a href="#recursos" className="hover:text-white transition">Recursos</a>
            <a href="#como-funciona" className="hover:text-white transition">Como funciona</a>
            <a href="#vantagens" className="hover:text-white transition">Vantagens</a>
            <a href="#duvidas" className="hover:text-white transition">Dúvidas</a>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm" className="text-sm font-medium text-slate-200 hover:text-white hover:bg-white/10">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-[#050507] hover:bg-[#0c0c14] text-white font-bold rounded-full border border-white/25 shadow-[0_0_20px_rgba(0,0,0,0.7)] hover:border-[#60A5FA]/50 transition px-5"
          >
            <Link to="/auth">Começar agora</Link>
          </Button>
        </div>
      </header>

      {/* Hero Section Split-Screen Assimétrico (Atmosfera Azul Cobalto Profundo + Dirigível The World Is Yours) */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#0B3B99]">
        {/* Camada de Gradiente Cobalto Profundo (#0B3B99 a #1049B8) com vinheta escura à esquerda e base */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050507] via-[#0B3B99]/85 to-[#1049B8]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(5,5,7,0.92)_0%,rgba(11,59,153,0.35)_55%,rgba(5,5,7,0.98)_100%)]" />

        {/* Textura sutil analógica / granulação */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Holofotes atmosféricos cortando o céu */}
        <div className="absolute -top-32 right-1/4 w-96 h-[600px] bg-gradient-to-b from-[#60A5FA]/15 via-[#60A5FA]/5 to-transparent rotate-12 blur-3xl pointer-events-none" />
        <div className="absolute -top-40 right-10 w-72 h-[500px] bg-gradient-to-b from-white/10 via-[#60A5FA]/5 to-transparent -rotate-12 blur-2xl pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24 grid lg:grid-cols-12 gap-12 items-center">
          {/* Coluna Esquerda: Bloco de Copywriting e Conversão (~55% da tela) */}
          <div className="lg:col-span-7 space-y-6 z-10">
            {/* Eyebrow Text em fonte pixelada / bitmap retrô (LED display style) */}
            <div className="inline-flex items-center gap-2.5 rounded-lg border border-white/20 bg-[#050507]/80 px-3.5 py-1.5 backdrop-blur shadow-lg">
              <span className="size-2 rounded-full bg-[#60A5FA] animate-pulse" />
              <span className="font-mono text-[11px] font-bold tracking-[0.25em] text-[#E0E7FF] uppercase">
                AUTOMAÇÃO & MONETIZAÇÃO TELEGRAM
              </span>
            </div>

            {/* Headline Principal: Sans-serif geométrica extra-bold com destaque em Preto Sólido */}
            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-white uppercase font-sans">
                Seu Telegram no <br />
                Piloto Automático.
              </h1>
              <div>
                <span className="inline-block bg-[#050507] text-white px-5 py-2.5 rounded-2xl border border-white/25 shadow-[0_15px_40px_rgba(5,5,7,0.85)] text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase">
                  O Mundo É Seu.
                </span>
              </div>
            </div>

            {/* Parágrafo de Apoio (2 a 3 linhas em branco suave para máxima legibilidade) */}
            <p className="max-w-xl text-base sm:text-lg text-[#F1F5F9] font-normal leading-relaxed">
              Gerencie, monetize e escale seus bots no Telegram com funis de conversão automáticos, pagamentos PIX instantâneos e suporte multimoeda internacional.
            </p>

            {/* Grupo de CTAs: Botão 1 Primário (Preto Sólido) + Botão 2 Secundário (Glassmorphism) */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button
                asChild
                size="lg"
                className="bg-[#050507] hover:bg-[#0e0e17] text-white text-base font-bold rounded-xl border border-white/25 shadow-[0_12px_30px_rgba(5,5,7,0.8)] hover:shadow-[#60A5FA]/20 hover:border-[#60A5FA]/50 px-8 py-6 h-auto transition"
              >
                <Link to="/auth">Criar Meu Bot Agora</Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/20 bg-white/10 hover:bg-white/20 text-white text-base font-semibold rounded-xl px-7 py-6 h-auto backdrop-blur-md transition"
              >
                <a href="#como-funciona">Ver Como Funciona</a>
              </Button>
            </div>

            {/* Barra de Micro-provas (Trust Badges) */}
            <div className="space-y-2 pt-3">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-white">
                <span className="flex items-center gap-1.5 rounded-lg bg-[#050507]/80 border border-white/15 px-3 py-1.5 backdrop-blur shadow">
                  <span className="font-mono text-[#60A5FA]">✓</span> ⚡ Ativação Imediata
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-[#050507]/80 border border-white/15 px-3 py-1.5 backdrop-blur shadow">
                  <span className="font-mono text-[#60A5FA]">✓</span> 💰 PIX & Moedas Globais (USD/EUR/GBP)
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-[#050507]/80 border border-white/15 px-3 py-1.5 backdrop-blur shadow">
                  <span className="font-mono text-[#60A5FA]">✓</span> 🔒 100% no seu controle
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-[#050507]/80 border border-white/15 px-3 py-1.5 backdrop-blur shadow">
                  <span className="font-mono text-[#60A5FA]">✓</span> 🚀 Zero Mensalidade Fixa
                </span>
              </div>

              {/* Linha final de micro-copy discreta */}
              <p className="text-xs text-slate-300 font-medium pt-1">
                Apenas <strong className="text-white">R$ 0,50 por venda aprovada</strong>. Sem necessidade de cartão de crédito para começar.
              </p>
            </div>
          </div>

          {/* Coluna Direita: Ilustração Central 3D do Dirigível "THE WORLD IS YOURS..." (~45% da tela) */}
          <div className="lg:col-span-5 relative flex justify-center items-center">
            {/* Efeito de rim lighting e halo volumétrico atrás do dirigível */}
            <div className="absolute inset-0 bg-[#60A5FA]/20 rounded-full blur-3xl transform scale-90 pointer-events-none" />

            <div className="relative w-full max-w-lg aspect-square rounded-3xl overflow-hidden border border-white/20 shadow-[0_20px_60px_rgba(5,5,7,0.9)] group">
              <img
                src="/cashbot-blimp-3d.jpg"
                alt="CASH BOT — The World Is Yours Zeppelin Blimp"
                className="w-full h-full object-cover object-center transform group-hover:scale-105 transition duration-700"
              />

              {/* Gradiente suave na base e bordas da imagem para fusão cinematográfica com a dobra */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-transparent to-transparent opacity-75" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050507]/60 via-transparent to-transparent" />

              {/* Badge retrô fixada com tipografia pixelada */}
              <div className="absolute bottom-5 left-5 right-5 p-3.5 rounded-2xl bg-[#050507]/85 backdrop-blur border border-white/15 shadow-xl flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#60A5FA] uppercase">
                    THE WORLD IS YOURS...
                  </p>
                  <p className="text-xs font-bold text-white">Domine o mercado de automação no Telegram.</p>
                </div>
                <div className="size-3 rounded-full bg-[#60A5FA] shadow-[0_0_8px_#60A5FA]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grid de Recursos */}
      <section id="recursos" className="mx-auto max-w-7xl px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold uppercase tracking-tight">
            Construído para quem quer <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">vender em escala</span>
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base">
            Elimine atendentes manuais e tenha um funil de conversão rodando 24 horas por dia no Telegram.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/5 bg-zinc-950/60 p-7 hover:border-cyan-500/40 hover:bg-zinc-900/40 transition duration-300 space-y-3"
            >
              <div className="size-11 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <f.icon className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-white">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Final */}
      <section className="border-t border-white/5 bg-gradient-to-t from-cyan-950/20 to-transparent py-20">
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
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold rounded-xl px-10 py-6 h-auto shadow-xl shadow-cyan-500/30 text-lg"
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
