import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OfferKind = "order_bump" | "upsell" | "downsell";

export type FlowOffer = {
  id: string;
  flow_id: string;
  kind: OfferKind;
  name: string;
  description: string | null;
  pitch: string | null;
  amount_cents: number;
  position: number;
  is_active: boolean;
};

const offerSchema = z.object({
  flowId: z.string().uuid(),
  kind: z.enum(["order_bump", "upsell", "downsell"]),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  pitch: z.string().trim().max(500).optional(),
  amountCents: z.number().int().min(100).max(100000000),
});

/** Ofertas (order bump, upsell e downsell) de um fluxo. */
export const listOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ flowId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<FlowOffer[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("flow_offers")
      .select("id,flow_id,kind,name,description,pitch,amount_cents,position,is_active")
      .eq("flow_id", data.flowId)
      .eq("user_id", context.userId)
      .order("kind", { ascending: true })
      .order("position", { ascending: true });
    return (rows ?? []) as FlowOffer[];
  });

export const createOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => offerSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: flow } = await supabaseAdmin
      .from("flows")
      .select("id")
      .eq("id", data.flowId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!flow) return { ok: false, message: "Fluxo não encontrado" };

    const { count } = await supabaseAdmin
      .from("flow_offers")
      .select("id", { count: "exact", head: true })
      .eq("flow_id", data.flowId)
      .eq("kind", data.kind);

    const { error } = await supabaseAdmin.from("flow_offers").insert({
      user_id: context.userId,
      flow_id: data.flowId,
      kind: data.kind,
      name: data.name,
      description: data.description ?? null,
      pitch: data.pitch ?? null,
      amount_cents: data.amountCents,
      position: count ?? 0,
      is_active: true,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Oferta criada" };
  });

export const updateOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(80).optional(),
        description: z.string().trim().max(500).optional(),
        pitch: z.string().trim().max(500).optional(),
        amountCents: z.number().int().min(100).max(100000000).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      name?: string;
      description?: string;
      pitch?: string;
      amount_cents?: number;
      is_active?: boolean;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.pitch !== undefined) patch.pitch = data.pitch;
    if (data.amountCents !== undefined) patch.amount_cents = data.amountCents;
    if (data.isActive !== undefined) patch.is_active = data.isActive;

    const { error } = await supabaseAdmin
      .from("flow_offers")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Oferta atualizada" };
  });

export const deleteOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("flow_offers")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Oferta removida" };
  });

