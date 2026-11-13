import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  Zap,
  Crown,
  Flame,
  Users,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Globe,
  Sparkles,
  HelpCircle,
  Clock,
  Layers,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CASH BOT — O Mundo É Seu. Robôs de Venda no Telegram" },
      {
        name: "description",
        content:
          "O robô cobra no Telegram, o PIX confirma e o acesso sai na hora. Você só cuida do anúncio. The World Is Yours.",
      },
      { property: "og:title", content: "CASH BOT — Robôs de Venda no Telegram" },
      {
        property: "og:description",
        content:
          "O robô cobra no Telegram, o PIX confirma e o acesso sai na hora. Você só cuida do anúncio. The World Is Yours.",
      },
      { property: "og:image", content: "/the-world-is-yours-ref.jpg" },
      { name: "twitter:image", content: "/the-world-is-yours-ref.jpg" },
    ],
  }),
  component: CASHBOTLanding,
});

const features = [
  {
    icon: Zap,
    title: "PIX Instantâneo e Automático",
    desc: "Cobrança rápida via PIX Copia e Cola sob demanda com confirmação instantânea em milissegundos.",
  },
  {
    icon: Crown,
    title: "Entrega Automática de VIP & Arquivos",
    desc: "O cliente pagou, o bot libera o link de convite do grupo VIP ou envia os arquivos imediatamente.",
  },
  {
    icon: Globe,
    title: "Fluxo Bilíngue & Multimoeda",
    desc: "Jornada inteligente: PIX direto em Reais (BRL) para o Brasil, e Dólar (USD), Euro (EUR) ou Libra (GBP) internacional.",
  },
  {
    icon: Flame,
    title: "Upsell, Downsell & Order Bump",
    desc: "Multiplique seu faturamento oferecendo novas ofertas pós-compra e recuperação inteligente com 1 clique.",
  },
  {
    icon: Bot,
    title: "Múltiplos Bots Vinculados",
    desc: "Rode a mesma operação em vários bots ao mesmo tempo com proteção ativa contra bloqueios e contingência.",
  },
  {
    icon: Users,
    title: "Remarketing & Recuperação de Carrinho",
    desc: "Dispare mensagens automáticas e personalizadas para quem gerou PIX e não pagou ou quem abandonou o chat.",
  },
  {
    icon: ShieldCheck,
    title: "Sem Mensalidade Fixa",
    desc: "Apenas R$ 0,50 fixo por venda aprovada. Sem mensalidades abusivas, sem taxas surpresa e sem pegadinhas.",
  },
  {
    icon: Layers,
    title: "Funil Modular & Gate de Entrada",
    desc: "Mensagem universal de boas-vindas com limpeza de tela automática via Telegram deleteMessage.",
  },
  {
    icon: Lock,
    title: "100% no Seu Controle",
    desc: "Integração direta com o seu gateway de pagamento. Seu dinheiro cai diretamente na sua conta.",
  },
];

const steps = [
  {
    step: "01",
    title: "Conecte seu Bot no Telegram",
    desc: "Crie seu bot no @BotFather do Telegram em 30 segundos e cole o token no painel do CASH BOT.",
  },
  {
    step: "02",
    title: "Configure as Copys & Planos",
    desc: "Defina sua mensagem de boas-vindas universal, as copys em Português e Inglês e os valores dos planos.",
  },
  {
    step: "03",
    title: "Lucre no Piloto Automático",
    desc: "Direcione o tráfego. O robô atende, cobra via PIX ou moedas globais, aprova e entrega o acesso sozinho.",
  },
];

const faqs = [
  {
    q: "Quanto custa usar o CASH BOT?",
    a: "Não cobramos mensalidade fixa nem taxa percentual sobre o faturamento. O custo é apenas R$ 0,50 fixo por cada venda aprovada com sucesso. Você não paga nada para criar sua conta ou configurar seus robôs.",
  },
  {
    q: "Como funciona a jornada bilíngue?",
    a: "Ao dar /start, o lead vê a mensagem de boas-vindas e escolhe entre Português e Inglês. Em Português, o bot abre diretamente a copy e os planos em PIX. Em Inglês, o bot apresenta as opções de Dólar (USD), Euro (EUR) ou Libra (GBP) com conversão nominal direta.",
  },
  {
    q: "O bot remove as mensagens anteriores?",
    a: "Sim! Ao selecionar o idioma ou a moeda, o bot executa a limpeza de tela via deleteMessage na API do Telegram, mantendo o chat limpo, moderno e focado na conversão.",
  },
  {
    q: "Preciso ter conhecimento de programação?",
    a: "Nenhum. Nossa plataforma foi construída com um editor visual simplificado onde você apenas preenche os textos, valores e mídias. O sistema cuida de toda a automação do Telegram e pagamentos.",
  },
];

export function CASHBOTLanding() {
  return (
    <div className="min-h-screen bg-[#000000] text-white selection:bg-[#38BDF8] selection:text-black">
      {/* Top Navbar Minimalista e Translúcida */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-3 group">
              {/* Ícone geométrico da silhueta do dirigível "The World Is Yours" */}
              <div className="size-10 rounded-xl bg-black border border-white/20 flex items-center justify-center shadow-[0_0_15px_rgba(11,52,180,0.5)] group-hover:border-[#38BDF8]/60 transition">
                <svg
                  className="size-6 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <ellipse cx="12" cy="11" rx="9" ry="5" />
                  <path d="M3 11c0 2.76 4.03 5 9 5s9-2.24 9-5" />
                  <path d="M20 9l2 2-2 2" />
                  <rect x="9" y="16" width="6" height="2" rx="1" fill="currentColor" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-display text-xl font-black tracking-wider text-white">
                  CASH<span className="text-[#38BDF8]">BOT</span>
                </span>
                <span className="font-pixel text-[8px] tracking-[0.2em] text-blue-300 -mt-1 uppercase">
                  THE WORLD IS YOURS...
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-7 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <a href="#recursos" className="hover:text-white hover:text-[#38BDF8] transition">
                Recursos
              </a>
              <a href="#como-funciona" className="hover:text-white hover:text-[#38BDF8] transition">
                Como Funciona
              </a>
              <a href="#vantagens" className="hover:text-white hover:text-[#38BDF8] transition">
                Vantagens
              </a>
              <a href="#duvidas" className="hover:text-white hover:text-[#38BDF8] transition">
                Dúvidas
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-sm font-semibold text-slate-200 hover:text-white hover:bg-white/10"
            >
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-black hover:bg-[#0c0d14] text-white font-bold rounded-lg border border-white/30 shadow-[0_0_20px_rgba(11,52,180,0.6)] hover:border-white transition px-5"
            >
              <Link to="/auth">Começar Agora</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO SECTION — Inspirada rigorosamente na imagem "THE WORLD IS YOURS..." */}
      {/* Fundo Azul Cobalto Puro (#0B34B4 a #103488) com granulado analógico e dirigível em destaque */}
      <section className="relative overflow-hidden border-b border-white/15 bg-[#0A34B2]">
        {/* Camadas de cor, gradiente e vinheta fotográfica */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#001C9A] via-[#0A34B2] to-[#103488]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,0,0,0.75)_0%,rgba(10,52,178,0.2)_50%,rgba(0,0,0,0.85)_100%)]" />

        {/* Textura analógica de granulação / poster vintage */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Feixes de iluminação e reflexos sutis */}
        <div className="absolute -top-32 right-1/4 w-96 h-[650px] bg-gradient-to-b from-white/15 via-[#38BDF8]/10 to-transparent rotate-12 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 left-10 w-96 h-[500px] bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-6 py-14 lg:py-24 grid lg:grid-cols-12 gap-12 items-center">
          {/* Coluna Esquerda: Mensagem de Alto Impacto e Conversão */}
          <div className="lg:col-span-7 space-y-7 z-10">
            {/* Eyebrow em Fonte Pixelada Bitmap "THE WORLD IS YOURS..." */}
            <div className="inline-flex items-center gap-2.5 rounded-lg border border-white/25 bg-black/85 px-4 py-2 backdrop-blur shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
              <span className="size-2 rounded-full bg-[#38BDF8] animate-pulse shadow-[0_0_8px_#38BDF8]" />
              <span className="font-pixel text-[10px] sm:text-[11px] font-bold tracking-[0.25em] text-white uppercase">
                THE WORLD IS YOURS...
              </span>
            </div>

            {/* Headline com Bloco Preto Sólido e Tipografia de Máximo Contraste */}
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-white uppercase font-sans drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                Seu Telegram no <br />
                Piloto Automático.
              </h1>
              <div>
                <span className="inline-block bg-black text-white px-6 py-3 rounded-2xl border-2 border-white/30 shadow-[0_20px_50px_rgba(0,0,0,0.95)] text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase">
                  O Mundo É Seu.
                </span>
              </div>
            </div>

            {/* Subtítulo Claro e Elegante */}
            <p className="max-w-xl text-base sm:text-lg text-slate-100 font-normal leading-relaxed drop-shadow">
              Gerencie, monetize e escale seus robôs de venda no Telegram com funis bilíngues automáticos,
              PIX instantâneo com confirmação em tempo real e entrega imediata de VIPs e arquivos.
            </p>

            {/* Botões de Ação (Estética Preto Sólido & Vidro Cobalto) */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button
                asChild
                size="lg"
                className="bg-black hover:bg-[#0e0f17] text-white text-base font-extrabold uppercase tracking-wider rounded-xl border-2 border-white/30 hover:border-white shadow-[0_15px_40px_rgba(0,0,0,0.9)] hover:shadow-[0_0_35px_rgba(56,189,248,0.5)] px-8 py-6 h-auto transition duration-300"
              >
                <Link to="/auth" className="flex items-center gap-2">
                  <span>Criar Meu Bot Agora</span>
                  <ArrowRight className="size-5" />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/25 bg-white/10 hover:bg-white/20 text-white text-base font-bold uppercase tracking-wider rounded-xl px-7 py-6 h-auto backdrop-blur-md transition"
              >
                <a href="#como-funciona">Ver Como Funciona</a>
              </Button>
            </div>

            {/* Badges de Confiança em Preto Sólido com Rótulos Nítidos */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-white">
                <span className="flex items-center gap-1.5 rounded-lg bg-black/85 border border-white/20 px-3 py-1.5 backdrop-blur shadow">
                  <CheckCircle2 className="size-4 text-[#38BDF8]" />
                  <span>⚡ Ativação Imediata</span>
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-black/85 border border-white/20 px-3 py-1.5 backdrop-blur shadow">
                  <CheckCircle2 className="size-4 text-[#38BDF8]" />
                  <span>💰 PIX & Moedas Globais (USD/EUR/GBP)</span>
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-black/85 border border-white/20 px-3 py-1.5 backdrop-blur shadow">
                  <CheckCircle2 className="size-4 text-[#38BDF8]" />
                  <span>🔒 100% no seu controle</span>
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-black/85 border border-white/20 px-3 py-1.5 backdrop-blur shadow">
                  <CheckCircle2 className="size-4 text-[#38BDF8]" />
                  <span>🚀 Zero Mensalidade</span>
                </span>
              </div>

              <p className="text-xs text-blue-100 font-medium">
                Apenas <strong className="text-white underline decoration-[#38BDF8] decoration-2">R$ 0,50 fixo por venda aprovada</strong>. Sem surpresas ou mensalidades abusivas.
              </p>
            </div>
          </div>

          {/* Coluna Direita: O Dirigível / Zeppelin em Destaque Absoluto */}
          <div className="lg:col-span-5 relative flex justify-center items-center">
            {/* Halo de luz e brilho elétrico atrás da imagem */}
            <div className="absolute inset-0 bg-[#38BDF8]/25 rounded-3xl blur-3xl transform scale-95 pointer-events-none" />

            <div className="relative w-full max-w-lg aspect-square rounded-3xl overflow-hidden border-2 border-white/30 shadow-[0_25px_70px_rgba(0,0,0,0.95)] group bg-[#0A34B2]">
              {/* Imagem de Referência Fiel do Dirigível Scarface */}
              <img
                src="/the-world-is-yours-ref.jpg"
                alt="CASH BOT — The World Is Yours Zeppelin Dirigível"
                className="w-full h-full object-cover object-center transform group-hover:scale-105 transition duration-700"
              />

              {/* Vinhetas cinematográficas suaves nas bordas */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />

              {/* Placa Retrô em Pixel Art na base da imagem */}
              <div className="absolute bottom-5 left-5 right-5 p-4 rounded-2xl bg-black/90 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-between">
                <div>
                  <p className="font-pixel text-[11px] font-bold tracking-[0.25em] text-[#38BDF8] uppercase drop-shadow">
                    THE WORLD IS YOURS...
                  </p>
                  <p className="text-xs font-semibold text-slate-200 mt-0.5">
                    Domine o mercado de vendas automáticas no Telegram.
                  </p>
                </div>
                <div className="size-3.5 rounded-full bg-[#38BDF8] shadow-[0_0_12px_#38BDF8] animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BANNER RETRÔ PIXELADO DIVISOR */}
      <div className="border-y border-white/15 bg-black py-3 px-6 overflow-hidden">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-6 text-xs uppercase tracking-widest text-slate-400 font-pixel">
          <span className="flex items-center gap-2 text-white">
            <span className="size-1.5 rounded-full bg-[#38BDF8]" />
            AUTOMATION ENGINE 2.0
          </span>
          <span className="hidden sm:inline-block text-[#38BDF8]">
            ★ TELEGRAM BOT ECOSYSTEM ★
          </span>
          <span className="flex items-center gap-2 text-white">
            <span className="size-1.5 rounded-full bg-[#38BDF8]" />
            PIX + MULTICURRENCY USD/EUR/GBP
          </span>
        </div>
      </div>

      {/* SEÇÃO 1: RECURSOS DO SISTEMA */}
      <section id="recursos" className="mx-auto max-w-7xl px-6 py-24">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-lg border border-[#2563EB]/40 bg-[#0A34B2]/15 px-3.5 py-1.5 backdrop-blur">
            <span className="font-pixel text-[10px] font-bold tracking-[0.2em] text-[#38BDF8] uppercase">
              [ RECURSOS DE ESCALA ]
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight text-white">
            Construído para quem quer <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#38BDF8] via-blue-400 to-[#1049B8]">
              Vender Todos os Dias
            </span>
          </h2>

          <p className="text-zinc-400 text-base sm:text-lg">
            Elimine atendentes manuais e tenha um ecossistema de vendas rodando 24 horas por dia no Telegram com lucro na sua conta.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-black/90 p-7 hover:border-[#38BDF8]/50 hover:bg-[#070913] hover:shadow-[0_0_30px_rgba(11,52,180,0.3)] transition duration-300 space-y-4 group"
            >
              <div className="size-12 rounded-xl bg-[#0A34B2]/25 border border-[#2563EB]/40 flex items-center justify-center text-[#38BDF8] shadow-[0_0_15px_rgba(11,52,180,0.4)] group-hover:scale-110 transition duration-300">
                <f.icon className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SEÇÃO 2: COMO FUNCIONA (3 PASSOS) */}
      <section id="como-funciona" className="border-t border-white/10 bg-[#060814] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-lg border border-[#2563EB]/40 bg-[#0A34B2]/15 px-3.5 py-1.5">
              <span className="font-pixel text-[10px] font-bold tracking-[0.2em] text-[#38BDF8] uppercase">
                [ PASSO A PASSO ]
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
              Do Zero ao Piloto Automático em 3 Passos
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base">
              Sem configurações complexas. Tudo pronto para você rodar suas campanhas hoje mesmo.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.step}
                className="relative rounded-2xl border border-white/10 bg-black p-8 space-y-4 hover:border-[#38BDF8]/40 transition"
              >
                <span className="font-pixel text-3xl font-black text-[#38BDF8]">{s.step}</span>
                <h3 className="text-xl font-bold text-white">{s.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEÇÃO 3: VANTAGENS DO CASH BOT */}
      <section id="vantagens" className="mx-auto max-w-7xl px-6 py-24 border-t border-white/10">
        <div className="rounded-3xl border border-white/15 bg-gradient-to-r from-black via-[#0A34B2]/30 to-black p-8 sm:p-14 grid lg:grid-cols-12 gap-8 items-center shadow-2xl">
          <div className="lg:col-span-7 space-y-5">
            <span className="font-pixel text-xs text-[#38BDF8] uppercase tracking-widest">
              POR QUE O CASH BOT É DIFERENTE?
            </span>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
              Feito para Alta Conversão e Margem Real
            </h2>
            <p className="text-zinc-300 text-base leading-relaxed">
              Outras plataformas cobram mensalidades de R$ 200 a R$ 500 por mês ou abocanham 10% do seu faturamento.
              No <strong>CASH BOT</strong>, você paga apenas <strong>R$ 0,50 fixo</strong> por venda aprovada. Se não vendeu, não pagou.
            </p>
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-3 text-sm text-white">
                <CheckCircle2 className="size-5 text-[#38BDF8] shrink-0" />
                <span>Zero mensalidade fixa ou taxa percentual oculta.</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-white">
                <CheckCircle2 className="size-5 text-[#38BDF8] shrink-0" />
                <span>Limpeza de mensagens com deleteMessage para não poluir o chat.</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-white">
                <CheckCircle2 className="size-5 text-[#38BDF8] shrink-0" />
                <span>Bifurcação de idioma inteligente (Português/PIX ou Inglês/Moedas).</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col items-center justify-center p-8 rounded-2xl bg-black border border-white/15 text-center space-y-4">
            <span className="font-pixel text-xs text-zinc-400 uppercase">CUSTO POR VENDA</span>
            <div className="text-5xl sm:text-6xl font-black text-white">
              R$ 0<span className="text-[#38BDF8]">,50</span>
            </div>
            <p className="text-xs text-zinc-400">
              Taxa fixa por transação aprovada. Sem surpresas no fim do mês.
            </p>
            <Button
              asChild
              size="lg"
              className="w-full bg-[#0A34B2] hover:bg-[#1049B8] text-white font-bold rounded-xl border border-white/20 shadow-lg text-sm uppercase tracking-wider"
            >
              <Link to="/auth">Criar Conta Gratuita</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* SEÇÃO 4: DÚVIDAS FREQUENTES */}
      <section id="duvidas" className="border-t border-white/10 bg-[#060814] py-24">
        <div className="mx-auto max-w-4xl px-6 space-y-12">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-lg border border-[#2563EB]/40 bg-[#0A34B2]/15 px-3.5 py-1.5">
              <span className="font-pixel text-[10px] font-bold tracking-[0.2em] text-[#38BDF8] uppercase">
                [ FAQ ]
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black uppercase text-white">
              Perguntas Frequentes
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((f, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-black/80 p-6 space-y-2 hover:border-[#38BDF8]/30 transition"
              >
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <HelpCircle className="size-5 text-[#38BDF8] shrink-0" />
                  {f.q}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed pl-7">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL — Azul Cobalto Intenso + Dirigível "THE WORLD IS YOURS..." */}
      <section className="relative overflow-hidden border-t border-white/20 bg-[#0A34B2] py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center space-y-7">
          <p className="font-pixel text-xs sm:text-sm text-[#38BDF8] tracking-[0.3em] uppercase drop-shadow">
            ★ THE WORLD IS YOURS... ★
          </p>
          <h2 className="text-3xl sm:text-5xl font-black uppercase text-white tracking-tight drop-shadow-lg">
            Pronto para colocar seus bots no piloto automático?
          </h2>
          <p className="text-blue-100 text-base sm:text-lg max-w-xl mx-auto drop-shadow">
            Crie sua conta agora no CASH BOT e suba sua operação no Telegram em poucos minutos.
          </p>
          <div className="pt-2">
            <Button
              asChild
              size="lg"
              className="bg-black hover:bg-[#0c0d14] text-white text-lg font-extrabold uppercase tracking-wider rounded-xl border-2 border-white/30 hover:border-white shadow-[0_20px_50px_rgba(0,0,0,0.9)] hover:shadow-[0_0_35px_rgba(56,189,248,0.6)] px-10 py-6 h-auto transition"
            >
              <Link to="/auth">Criar Conta no CASH BOT</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-black py-8 text-center text-xs text-zinc-500">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-pixel text-[10px] text-zinc-400">
            CASH BOT — THE WORLD IS YOURS...
          </span>
          <span>© {new Date().getFullYear()} CASH BOT — Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}