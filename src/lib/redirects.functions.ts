import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MAX_REDIRECT_LINKS = 10;

export type RedirectLink = {
  id: string;
  name: string;
  slug: string;
  destination: string | null;
  bot_id: string | null;
  is_active: boolean;
  clicks_total: number;
  last_click_at: string | null;
  created_at: string;
};

export type RedirectStats = {
  linkId: string;
  total: number;
  devices: { device: string; count: number }[];
  referrers: { referrer: string; count: number }[];
  last7: { day: string; count: number }[];
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `link-${Math.random().toString(36).slice(2, 8)}`;

/** Lista os links de redirecionamento do usuário. */
export const listRedirects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RedirectLink[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("redirect_links")
      .select("id,name,slug,destination,bot_id,is_active,clicks_total,last_click_at,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return (data ?? []) as RedirectLink[];
  });

/** Cria um link (limite de 10 por usuário). */
export const createRedirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        destination: z.string().trim().url().max(500),
        slug: z.string().trim().max(40).optional(),
        botId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("redirect_links")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if ((count ?? 0) >= MAX_REDIRECT_LINKS) {
      return { ok: false, message: `Limite de ${MAX_REDIRECT_LINKS} links atingido` };
    }

    const base = slugify(data.slug || data.name);
    let slug = base;
    for (let i = 0; i < 5; i += 1) {
      const { data: taken } = await supabaseAdmin
        .from("redirect_links")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!taken) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
    }

    const { error } = await supabaseAdmin.from("redirect_links").insert({
      user_id: context.userId,
      bot_id: data.botId ?? null,
      name: data.name,
      slug,
      destination: data.destination,
      is_active: true,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Link criado" };
  });

/** Atualiza destino, nome ou status do link. */
export const updateRedirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(80).optional(),
        destination: z.string().trim().url().max(500).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { name?: string; destination?: string; is_active?: boolean } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.destination !== undefined) patch.destination = data.destination;
    if (data.isActive !== undefined) patch.is_active = data.isActive;


    const { error } = await supabaseAdmin
      .from("redirect_links")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Link atualizado" };
  });

export const deleteRedirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("redirect_clicks").delete().eq("link_id", data.id).eq("user_id", context.userId);
    const { error } = await supabaseAdmin
      .from("redirect_links")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Link removido" };
  });

/** Estatísticas de cliques por dispositivo, origem e dia. */
export const redirectStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<RedirectStats> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 86400000);
    since.setHours(0, 0, 0, 0);

    const { data: clicks } = await supabaseAdmin
      .from("redirect_clicks")
      .select("device,referrer,created_at")
      .eq("link_id", data.id)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1000);

    const rows = clicks ?? [];
    const tally = (key: "device" | "referrer") => {
      const map = new Map<string, number>();
      for (const row of rows) {
        const value = (row[key] ?? "").trim() || "desconhecido";
        map.set(value, (map.get(value) ?? 0) + 1);
      }
      return [...map.entries()]
        .map(([k, count]) => ({ [key]: k, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    };

    const last7: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      last7.push({
        day: key.slice(8, 10) + "/" + key.slice(5, 7),
        count: rows.filter((r) => r.created_at.slice(0, 10) === key).length,
      });
    }

    return {
      linkId: data.id,
      total: rows.length,
      devices: tally("device") as { device: string; count: number }[],
      referrers: tally("referrer") as { referrer: string; count: number }[],
      last7,
    };
  });

