/**
 * Sistema de Áudio e Alerta de Venda CASHBOT
 * Reproduz o som nítido de caixa registradora (Ka-Ching!) via Web Audio API
 * e arquivo de áudio, com desbloqueio automático de autoplay.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => undefined);
  }
  return audioCtx;
}

/** Desbloqueia o contexto de áudio em interações do usuário */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => undefined);
  }
}

/**
 * Sintetiza o clássico som de caixa registradora (Ka-Ching!)
 * com sino metálico duplo (987 Hz / 1318 Hz) e ressonância de moedas.
 */
export function synthesizeCashRegister(ctx: AudioContext) {
  const now = ctx.currentTime;

  // 1. Sino Agudo Principal (B5: 987.77 Hz e E6: 1318.51 Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(987.77, now);
  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.95);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1318.51, now + 0.015);
  gain2.gain.setValueAtTime(0.001, now + 0.015);
  gain2.gain.exponentialRampToValueAtTime(0.35, now + 0.035);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.015);
  osc2.stop(now + 1.15);

  // 2. Harmônico cristalino (2637 Hz)
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = "triangle";
  osc3.frequency.setValueAtTime(2637.02, now + 0.02);
  gain3.gain.setValueAtTime(0.001, now + 0.02);
  gain3.gain.exponentialRampToValueAtTime(0.2, now + 0.04);
  gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  osc3.connect(gain3);
  gain3.connect(ctx.destination);
  osc3.start(now + 0.02);
  osc3.stop(now + 0.55);

  // 3. Efeito mecânico de gaveta/moedas abrindo
  const oscClick = ctx.createOscillator();
  const gainClick = ctx.createGain();
  oscClick.type = "square";
  oscClick.frequency.setValueAtTime(450, now);
  oscClick.frequency.exponentialRampToValueAtTime(120, now + 0.04);
  gainClick.gain.setValueAtTime(0.15, now);
  gainClick.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  oscClick.connect(gainClick);
  gainClick.connect(ctx.destination);
  oscClick.start(now);
  oscClick.stop(now + 0.045);
}

/**
 * Toca o som de caixa registradora usando Web Audio API ou arquivo de áudio.
 */
export async function playCashRegisterSound(): Promise<void> {
  if (typeof window === "undefined") return;

  // Vibração tátil no celular se suportado
  if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {
      // ignore
    }
  }

  // Tenta sintetizar instantaneamente via Web Audio API (sem dependência de rede)
  try {
    const ctx = getAudioContext();
    if (ctx) {
      synthesizeCashRegister(ctx);
      return;
    }
  } catch {
    // continua para fallback de áudio HTML5
  }

  // Fallback para arquivo de áudio
  try {
    const audio = new Audio("/sounds/cash-register.mp3");
    audio.volume = 0.8;
    await audio.play();
  } catch {
    // Ignora erro de autoplay
  }
}

/**
 * Dispara o alerta completo de venda:
 * - Som de caixa registradora
 * - Vibração celular
 * - Notificação push/desktop se permitido
 */
export function triggerSaleNotification(params: {
  type: "generated" | "approved";
  amountFormatted: string;
  productName?: string;
}) {
  playCashRegisterSound();

  const isApproved = params.type === "approved";
  const title = isApproved ? "💸 Venda Aprovada!" : "⏳ Venda Gerada!";
  const body = isApproved
    ? `Você recebeu ${params.amountFormatted} no CASHBOT!${params.productName ? ` (${params.productName})` : ""}`
    : `Novo pedido de ${params.amountFormatted} aguardando pagamento.`;

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "TRIGGER_LOCAL_NOTIFICATION",
          payload: {
            title,
            body,
            icon: "/cashbot-icon-192.png",
            badge: "/cashbot-badge-72.png",
            vibrate: [200, 100, 200],
            data: { url: "/app/payments" },
          },
        });
      } else {
        new Notification(title, {
          body,
          icon: "/cashbot-icon-192.png",
          badge: "/cashbot-badge-72.png",
        });
      }
    } catch {
      // fallback
    }
  }
}
