import { useState, useEffect } from "react";
import { Smartphone, Volume2, Check, Download, Share2, PlusSquare, Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { playCashRegisterSound, triggerSaleNotification, unlockAudio } from "@/lib/sound";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    // Verifica se já está instalado (standalone)
    if (
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as any).standalone === true)
    ) {
      setIsInstalled(true);
    }

    // Detecta iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIos(isIosDevice);

    // Verifica permissão de notificação
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
    }

    // Captura evento de instalação PWA no Android/Chrome
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    unlockAudio();

    if (isInstalled) {
      toast.success("O CASHBOT já está instalado no seu celular!");
      return;
    }

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        toast.success("CASHBOT adicionado à sua tela de início!");
      }
      setDeferredPrompt(null);
      return;
    }

    if (isIos) {
      setShowIosModal(true);
      return;
    }

    // Fallback genérico
    toast.info("Para instalar no celular, abra este site no Chrome/Safari e clique em 'Instalar Aplicativo'.");
  };

  const handleEnableNotifications = async () => {
    unlockAudio();
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Notificações não são suportadas neste navegador.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setNotificationsEnabled(true);
        toast.success("Notificações de vendas ativadas com sucesso!");
        triggerSaleNotification({
          type: "approved",
          amountFormatted: "R$ 49,90",
          productName: "Notificações CASHBOT Ativadas",
        });
      } else {
        toast.error("Permissão de notificação negada no navegador.");
      }
    } catch {
      toast.error("Erro ao solicitar permissão de notificações.");
    }
  };

  const handleTestSound = () => {
    unlockAudio();
    playCashRegisterSound();
    triggerSaleNotification({
      type: "approved",
      amountFormatted: "R$ 97,00",
      productName: "Plano Vitalício CASHBOT",
    });
    toast.success("Alerta sonoro testado com sucesso! (Ka-Ching!)");
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Botão de Testar Notificação & Som de Venda */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleTestSound}
          className="border-white/10 bg-black/80 hover:bg-[#0A34B2]/30 text-white hover:text-[#38BDF8] text-xs font-semibold gap-1.5 h-8 px-3 rounded-lg shadow-sm"
          title="Testar som de caixa registradora e notificação de venda"
        >
          <Volume2 className="size-3.5 text-[#38BDF8]" />
          <span className="hidden sm:inline">Testar Som</span>
        </Button>

        {/* Botão / Toggle de Notificações Push */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleEnableNotifications}
          className={`text-xs font-semibold gap-1.5 h-8 px-3 rounded-lg shadow-sm transition ${
            notificationsEnabled
              ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40"
              : "border-white/10 bg-black/80 hover:bg-amber-950/20 text-white hover:text-amber-300"
          }`}
          title={notificationsEnabled ? "Notificações de vendas ativas" : "Ativar notificações de vendas no celular"}
        >
          {notificationsEnabled ? (
            <BellRing className="size-3.5 text-emerald-400" />
          ) : (
            <Bell className="size-3.5 text-amber-400" />
          )}
          <span className="hidden sm:inline">
            {notificationsEnabled ? "Notificações Ativas" : "Ativar Notificações"}
          </span>
        </Button>

        {/* Botão Instalar App no Celular */}
        {!isInstalled && (
          <Button
            type="button"
            size="sm"
            onClick={handleInstallClick}
            className="bg-[#0A34B2] hover:bg-[#1049B8] text-white text-xs font-bold gap-1.5 h-8 px-3 rounded-lg border border-white/20 shadow-[0_0_15px_rgba(10,52,178,0.5)] transition"
          >
            <Smartphone className="size-3.5 text-[#38BDF8]" />
            <span>Instalar App</span>
          </Button>
        )}
      </div>

      {/* Modal de Instruções para iPhone (iOS Safari) */}
      <Dialog open={showIosModal} onOpenChange={setShowIosModal}>
        <DialogContent className="max-w-md bg-[#09090E] border-white/15 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <Smartphone className="size-5 text-[#38BDF8]" />
              Instalar o CASHBOT no iPhone
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              Instale o CASHBOT direto na sua tela de início para receber alertas em tela cheia e notificações sonoras de venda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm text-zinc-300">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/60 p-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0A34B2]/30 border border-[#38BDF8]/40 text-[#38BDF8] font-bold text-xs">
                1
              </div>
              <p className="text-xs leading-relaxed">
                No Safari do iPhone, toque no botão <strong>Compartilhar</strong>{" "}
                <Share2 className="inline size-4 text-[#38BDF8]" /> na barra inferior.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/60 p-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0A34B2]/30 border border-[#38BDF8]/40 text-[#38BDF8] font-bold text-xs">
                2
              </div>
              <p className="text-xs leading-relaxed">
                Role para baixo e selecione a opção <strong>"Adicionar à Tela de Início"</strong>{" "}
                <PlusSquare className="inline size-4 text-[#38BDF8]" />.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/60 p-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0A34B2]/30 border border-[#38BDF8]/40 text-[#38BDF8] font-bold text-xs">
                3
              </div>
              <p className="text-xs leading-relaxed">
                Toque em <strong>Adicionar</strong> no canto superior direito. O ícone do <strong>CASHBOT</strong> aparecerá junto com seus apps!
              </p>
            </div>
          </div>

          <Button
            type="button"
            className="w-full bg-[#0A34B2] hover:bg-[#1049B8] text-white font-bold"
            onClick={() => setShowIosModal(false)}
          >
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
