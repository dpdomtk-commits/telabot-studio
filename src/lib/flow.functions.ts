import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FlowActionResult = { ok: boolean; message: string; flowId?: string };

const idSchema = z.object({ flowId: z.string().uuid() });

/** Duplica um fluxo com todas as etapas, posições do canvas e conexões. */
export const duplicateFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<FlowActionResult> => {
    const { supabase, userId } = context;

    const { data: flow } = await supabase
      .from("flows")
      .select("id,name,description,bot_id,user_id")
      .eq("id", data.flowId)
      .maybeSingle();
    if (!flow || flow.user_id !== userId) return { ok: false, message: "Fluxo não encontrado" };

    const { data: copy, error: copyError } = await supabase
      .from("flows")
      .insert({
        user_id: userId,
        bot_id: flow.bot_id,
        name: `${flow.name} (cópia)`,
        description: flow.description,
        status: "draft",
        is_active: false,
      })
      .select("id")
      .maybeSingle();
    if (copyError || !copy) return { ok: false, message: copyError?.message ?? "Falha ao duplicar" };

    const { data: steps } = await supabase
      .from("flow_steps")
      .select("id,type,title,config,position,position_x,position_y")
      .eq("flow_id", flow.id)
      .order("position", { ascending: true });

    const idMap = new Map<string, string>();
    for (const step of steps ?? []) {
      const { data: created } = await supabase
        .from("flow_steps")
        .insert({
          flow_id: copy.id,
          user_id: userId,
          type: step.type,
          title: step.title,
          config: step.config,
          position: step.position,
          position_x: step.position_x,
          position_y: step.position_y,
        })
        .select("id")
        .maybeSingle();
      if (created) idMap.set(step.id, created.id);
    }

    const { data: connections } = await supabase
      .from("flow_connections")
      .select("source_step_id,target_step_id,source_handle,label")
      .eq("flow_id", flow.id);

    const rows = (connections ?? [])
      .map((c) => ({
        user_id: userId,
        flow_id: copy.id,
        source_step_id: idMap.get(c.source_step_id) ?? null,
        target_step_id: idMap.get(c.target_step_id) ?? null,
        source_handle: c.source_handle,
        label: c.label,
      }))
      .filter((c): c is typeof c & { source_step_id: string; target_step_id: string } =>
        Boolean(c.source_step_id && c.target_step_id),
      );

    if (rows.length > 0) await supabase.from("flow_connections").insert(rows);

    return { ok: true, message: "Fluxo duplicado", flowId: copy.id };
  });
