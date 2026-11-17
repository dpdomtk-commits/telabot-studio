import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";

export const VAPID_PUBLIC_KEY =
  "BIYuPZOdFFIoRRXUPU-_MQf5wVw07DBxJ_X3tYm3LB75iBGz2CG0jRSCQ6PQjKHrXvkae8hrR4hme1otVC2Vdwo";

const VAPID_JWK = {
  kty: "EC" as const,
  crv: "P-256" as const,
  x: "hi49k50UUihFFdQ9T78xB_nBXDTsMHEn9fe1ibcsHvk",
  y: "iBGz2CG0jRSCQ6PQjKHrXvkae8hrR4hme1otVC2Vdwo",
  d: "b1fFQqJCNyaGwBg8LVyH0juk_zJZjV7erIf0gATtwhE",
};

export interface StoredPushSubscription {
  endpoint: string;
  expirationTime?: number | null | undefined;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Cache em memória das assinaturas por userId para disparo em milissegundos
const subscriptionCache = new Map<string, StoredPushSubscription[]>();

function toBase64Url(input: Buffer | Uint8Array | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str: string): Buffer {
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4 !== 0) padded += "=";
  return Buffer.from(padded, "base64");
}

function createVapidJwt(endpointUrl: string): string {
  const url = new URL(endpointUrl);
  const audience = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = toBase64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = toBase64Url(
    JSON.stringify({
      aud: audience,
      exp,
      sub: "mailto:contato@cashbot.app",
    }),
  );

  const unsigned = `${header}.${payload}`;
  const privateKey = createPrivateKey({ key: VAPID_JWK, format: "jwk" });
  const sig = sign("sha256", Buffer.from(unsigned, "utf8"), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${unsigned}.${toBase64Url(sig)}`;
}

function encryptAes128GcmPayload(
  sub: StoredPushSubscription,
  payloadStr: string,
): Buffer {
  const uaPublic = fromBase64Url(sub.keys.p256dh);
  const authSecret = fromBase64Url(sub.keys.auth);

  const asECDH = createECDH("prime256v1");
  asECDH.generateKeys();
  const asPublic = asECDH.getPublicKey();
  const sharedSecret = asECDH.computeSecret(uaPublic);

  const salt = randomBytes(16);

  // RFC 8291 Seção 3.3 & 3.4 (Content Encoding: aes128gcm)
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));

  const cek = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12),
  );

  const padded = Buffer.concat([Buffer.from(payloadStr, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const rsBuf = Buffer.alloc(4);
  rsBuf.writeUInt32BE(4096, 0);
  const idlenBuf = Buffer.from([asPublic.length]);

  return Buffer.concat([salt, rsBuf, idlenBuf, asPublic, encrypted]);
}

function isValidPushSubscription(sub: unknown): sub is StoredPushSubscription {
  if (!sub || typeof sub !== "object") return false;
  const s = sub as Record<string, any>;
  return (
    typeof s.endpoint === "string" &&
    s.endpoint.startsWith("https://") &&
    s.keys &&
    typeof s.keys.p256dh === "string" &&
    typeof s.keys.auth === "string"
  );
}

function mergeSubscription(list: StoredPushSubscription[], sub: StoredPushSubscription): StoredPushSubscription[] {
  const filtered = list.filter((item) => item.endpoint !== sub.endpoint);
  filtered.push(sub);
  return filtered.slice(-10);
}

export async function savePushSubscription(userId: string, sub: unknown): Promise<boolean> {
  if (!userId || !isValidPushSubscription(sub)) return false;

  const existing = subscriptionCache.get(userId) ?? [];
  subscriptionCache.set(userId, mergeSubscription(existing, sub));

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Evita duplicar exatamente o mesmo endpoint recentemente no log
    const { data: recent } = await supabaseAdmin
      .from("activity_logs")
      .select("id,metadata")
      .eq("user_id", userId)
      .eq("entity", "push_subscription")
      .order("created_at", { ascending: false })
      .limit(10);

    const alreadyStored = (recent ?? []).some(
      (r) => (r.metadata as any)?.endpoint === sub.endpoint,
    );
    if (!alreadyStored) {
      await supabaseAdmin.from("activity_logs").insert({
        user_id: userId,
        entity: "push_subscription",
        action: "subscribe",
        metadata: sub as never,
      });
    }
    return true;
  } catch (err) {
    console.warn("[savePushSubscription-warn]", err);
    return true;
  }
}

async function loadSubscriptionsForUser(userId: string): Promise<StoredPushSubscription[]> {
  let list = [...(subscriptionCache.get(userId) ?? [])];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("activity_logs")
      .select("metadata")
      .eq("user_id", userId)
      .eq("entity", "push_subscription")
      .order("created_at", { ascending: false })
      .limit(15);

    for (const row of data ?? []) {
      if (isValidPushSubscription(row.metadata)) {
        list = mergeSubscription(list, row.metadata);
      }
    }
    if (list.length > 0) {
      subscriptionCache.set(userId, list);
    }
  } catch (err) {
    console.warn("[loadSubscriptionsForUser-warn]", err);
  }
  return list;
}

export async function sendWebPushToUser(
  userId: string,
  payload: { title: string; body: string; tag?: string | undefined; url?: string | undefined },
): Promise<void> {
  if (!userId) return;
  try {
    const subs = await loadSubscriptionsForUser(userId);
    if (subs.length === 0) return;

    const jsonBody = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: "/cashbot-icon-192.png",
      badge: "/cashbot-badge-72.png",
      tag: payload.tag || `cashbot-${Date.now()}`,
      data: { url: payload.url || "/app/payments" },
    });

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          const encrypted = encryptAes128GcmPayload(sub, jsonBody);
          const jwt = createVapidJwt(sub.endpoint);

          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
              Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
              "Content-Encoding": "aes128gcm",
              "Content-Type": "application/octet-stream",
              TTL: "86400",
              Urgency: "high",
            },
            body: new Uint8Array(encrypted),
          });

          if (res.status === 404 || res.status === 410) {
            const current = subscriptionCache.get(userId) ?? [];
            subscriptionCache.set(
              userId,
              current.filter((item) => item.endpoint !== sub.endpoint),
            );
          } else if (!res.ok) {
            console.warn("[webpush-send-status]", res.status, await res.text().catch(() => ""));
          }
        } catch (err) {
          console.warn("[webpush-send-err]", err);
        }
      }),
    );
  } catch (err) {
    console.warn("[sendWebPushToUser-err]", err);
  }
}
