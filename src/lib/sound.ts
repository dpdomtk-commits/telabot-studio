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
 * Toca o som real enviado pelo usuário para notificações de pedido gerado e venda.
 * Usa o arquivo de áudio /sounds/cash-register.mp3 como prioritário,
 * com fallback para síntese Web Audio API.
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

  // 1. Toca o arquivo de áudio real oficial
  try {
    const audio = new Audio("/sounds/cash-register.mp3");
    audio.volume = 1.0;
    await audio.play();
    return;
  } catch (err) {
    // Se o navegador bloquear por autoplay ou falha de rede, recorre à síntese
  }

  // 2. Fallback de alta fidelidade via Web Audio API
  try {
    const ctx = getAudioContext();
    if (ctx) {
      synthesizeCashRegister(ctx);
    }
  } catch {
    // ignora
  }
}

export const VAPID_PUBLIC_KEY =
  "BIYuPZOdFFIoRRXUPU-_MQf5wVw07DBxJ_X3tYm3LB75iBGz2CG0jRSCQ6PQjKHrXvkae8hrR4hme1otVC2Vdwo";

const notifiedIds = new Set<string>();

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Inscreve o dispositivo (iPhone PWA / Safari / Android / Desktop) no Web Push VAPID
 * e persiste a PushSubscription no servidor e Supabase.
 */
export async function subscribeDeviceToWebPush(
  userId?: string | undefined,
  test = false,
): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return false;
  }

  try {
    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const subJson = sub.toJSON();
    let targetUserId = userId;
    const { supabase } = await import("@/integrations/supabase/client");

    if (!targetUserId) {
      const { data } = await supabase.auth.getUser();
      targetUserId = data.user?.id;
    }
    if (!targetUserId) return false;

    let apiOk = false;
    try {
      const res = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, subscription: subJson, test }),
      });
      apiOk = res.ok;
    } catch {
      apiOk = false;
    }

    if (!apiOk) {
      await fetch("/api/confirm-stripe-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push_subscribe",
          userId: targetUserId,
          subscription: subJson,
          test,
        }),
      }).catch(() => undefined);
    }

    const storageKey = `cashbot_push_ep_${targetUserId}`;
    const savedEndpoint = window.localStorage?.getItem(storageKey);
    if (savedEndpoint !== subJson.endpoint) {
      const { error } = await supabase.from("activity_logs").insert({
        user_id: targetUserId,
        entity: "push_subscription",
        action: "subscribe",
        metadata: subJson as never,
      });
      if (!error) {
        window.localStorage?.setItem(storageKey, subJson.endpoint || "");
      }
    }

    return true;
  } catch (err) {
    console.warn("[subscribeDeviceToWebPush-warn]", err);
    return false;
  }
}

/**
 * Dispara o alerta completo de venda com deduplicação:
 * - Som de caixa registradora
 * - Vibração celular
 * - Notificação nativa compatível com iOS PWA / Service Worker
 */
export function triggerSaleNotification(params: {
  id?: string | undefined;
  type: "generated" | "approved";
  amountFormatted: string;
  productName?: string | undefined;
}): boolean {
  if (params.id) {
    const dedupKey = `${params.id}:${params.type}`;
    if (notifiedIds.has(dedupKey)) return false;
    notifiedIds.add(dedupKey);
    if (notifiedIds.size > 200) {
      const first = notifiedIds.values().next().value;
      if (first) notifiedIds.delete(first);
    }
  }

  playCashRegisterSound().catch(() => undefined);

  const isApproved = params.type === "approved";
  const title = isApproved ? "💸 Venda Aprovada!" : "⏳ Venda Gerada!";
  const body = isApproved
    ? `Você recebeu ${params.amountFormatted} no CASHBOT!${params.productName ? ` (${params.productName})` : ""}`
    : `Novo pedido de ${params.amountFormatted}${params.productName ? ` (${params.productName})` : ""} aguardando pagamento.`;
  const tag = params.id ? `cashbot-${params.type}-${params.id}` : `cashbot-${params.type}-${Date.now()}`;

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      const options: NotificationOptions = {
        body,
        icon: "/cashbot-icon-192.png",
        badge: "/cashbot-badge-72.png",
        tag,
        data: { url: "/app/payments" },
      };

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => registration.showNotification(title, options))
          .catch(() => {
            try {
              new Notification(title, options);
            } catch {}
          });
      } else {
        new Notification(title, options);
      }
    } catch {
      // fallback silencioso
    }
  }

  return true;
}
