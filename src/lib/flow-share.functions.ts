import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { compileSimpleConfig, normalizeSimpleConfig } from "@/lib/flow-simple";

export type ShareResult = {
  ok: boolean;
  message: string;
  code?: string;
  flowId?: string;
  payload?: FlowExportPayload;
};

/** Chaves sensíveis que nunca são exportadas/importadas. */
const BLOCKED_CONFIG_KEYS = /token|pix[_-]?key|chave[_-]?pix|api[_-]?key|secret|credential|access|webhook_secret|gateway/i;

function sanitizeConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (BLOCKED_CONFIG_KEYS.test(key)) continue;
    out[key] = value;
  }
  return out;
}

export type FlowExportPayload = {
  version: 1;
  name: string;
  description: string | null;
  mode: "simple" | "advanced";
  simple_config: Record<string, unknown>;
  steps: Array<{
    key: string;
    type: string;
    title: string | null;
    config: Record<string, unknown>;
    position: number;
    position_x: number;
    position_y: number;
  }>;
  connections: Array<{ source: string; target: string; sourceHandle: string | null; label: string | null }>;
};

async function buildExport(
  supabase: { from: (table: string) => any },
  flowId: string,
  userId: string,
): Promise<FlowExportPayload | null> {
  const { data: flow } = await supabase
    .from("flows")
    .select("id,name,description,mode,simple_config,user_id")
    .eq("id", flowId)
    .maybeSingle();
  if (!flow || flow.user_id !== userId) return null;

  const { data: steps } = await supabase
    .from("flow_steps")
    .select("id,type,title,config,position,position_x,position_y")
    .eq("flow_id", flowId)
    .order("position", { ascending: true });
  const { data: connections } = await supabase
    .from("flow_connections")
    .select("source_step_id,target_step_id,source_handle,label")
    .eq("flow_id", flowId);

  return {
    version: 1,
    name: flow.name,
    description: flow.description,
    mode: (flow.mode ?? "advanced") as "simple" | "advanced",
    simple_config: sanitizeConfig(flow.simple_config),
    steps: (steps ?? []).map((s: any) => ({
      key: s.id,
      type: s.type,
      title: s.title,
      config: sanitizeConfig(s.config),
      position: s.position,
      position_x: s.position_x,
      position_y: s.position_y,
    })),
    connections: (connections ?? []).map((c: any) => ({
      source: c.source_step_id,
      target: c.target_step_id,
      sourceHandle: c.source_handle,
      label: c.label,
    })),
  };
}

const payloadSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  mode: z.enum(["simple", "advanced"]).default("advanced"),
  simple_config: z.record(z.string(), z.unknown()).default({}),
  steps: z
    .array(
      z.object({
        key: z.string(),
        type: z.string(),
        title: z.string().nullable().optional(),
        config: z.record(z.string(), z.unknown()).default({}),
        position: z.number().default(0),
        position_x: z.number().default(120),
        position_y: z.number().default(80),
      }),
    )
    .max(200),
  connections: z
    .array(
      z.object({
        source: z.string(),
        target: z.string(),
        sourceHandle: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
      }),
    )
    .max(400)
    .default([]),
});

/** Grava o grafo importado/compilado em um novo fluxo do usuário. */
async function writeGraph(
  supabase: { from: (table: string) => any },
  userId: string,
  flowId: string,
  payload: z.infer<typeof payloadSchema>,
) {
  const idMap = new Map<string, string>();
  for (const step of payload.steps) {
    const { data: created } = await supabase
      .from("flow_steps")
      .insert({
        flow_id: flowId,
        user_id: userId,
        type: step.type,
        title: step.title ?? null,
        config: sanitizeConfig(step.config),
        position: step.position,
        position_x: step.position_x,
        position_y: step.position_y,
      })
      .select("id")
      .maybeSingle();
    if (created) idMap.set(step.key, created.id);
  }

  const rows = payload.connections
    .map((c) => ({
      user_id: userId,
      flow_id: flowId,
      source_step_id: idMap.get(c.source) ?? null,
      target_step_id: idMap.get(c.target) ?? null,
      source_handle: c.sourceHandle ?? null,
      label: c.label ?? null,
    }))
    .filter((c) => c.source_step_id && c.target_step_id);
  if (rows.length > 0) await supabase.from("flow_connections").insert(rows);
}

/** Exporta um fluxo como JSON, sem tokens, chaves PIX ou dados financeiros. */
export const exportFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ flowId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ShareResult> => {
    const payload = await buildExport(context.supabase as never, data.flowId, context.userId);
    if (!payload) return { ok: false, message: "Fluxo não encontrado" };
    return { ok: true, message: "Fluxo exportado", payload };
  });

/** Gera (ou reaproveita) o código público FLOW-XXXXXX de um fluxo. */
export const shareFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ flowId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ShareResult> => {
    const { supabase, userId } = context;
    const payload = await buildExport(supabase as never, data.flowId, userId);
    if (!payload) return { ok: false, message: "Fluxo não encontrado" };

    const { data: existing } = await supabase
      .from("flow_shares")
      .select("id,code,template_id")
      .eq("flow_id", data.flowId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.template_id) {
      await supabase
        .from("flow_templates")
        .update({ payload: payload as never, name: payload.name, description: payload.description, mode: payload.mode })
        .eq("id", existing.template_id);
      await supabase.from("flow_shares").update({ is_active: true }).eq("id", existing.id);
      return { ok: true, message: "Código atualizado", code: existing.code };
    }

    const { data: template, error: templateError } = await supabase
      .from("flow_templates")
      .insert({
        user_id: userId,
        source_flow_id: data.flowId,
        name: payload.name,
        description: payload.description ?? null,
        mode: payload.mode,
        payload: payload as never,
        is_public: true,
      })
      .select("id")
      .maybeSingle();
    if (templateError || !template) return { ok: false, message: templateError?.message ?? "Falha ao compartilhar" };

    const { data: share, error: shareError } = await supabase
      .from("flow_shares")
      .insert({ user_id: userId, flow_id: data.flowId, template_id: template.id })
      .select("code")
      .maybeSingle();
    if (shareError || !share) return { ok: false, message: shareError?.message ?? "Falha ao gerar código" };

    await supabase.from("flows").update({ share_code: share.code }).eq("id", data.flowId);
    return { ok: true, message: "Código gerado", code: share.code };
  });

const importSchema = z.object({
  botId: z.string().uuid("Escolha um bot"),
  code: z.string().trim().max(40).optional(),
  templateId: z.string().uuid().optional(),
  payload: z.unknown().optional(),
});

/** Importa um fluxo por código FLOW-XXXXXX, por modelo do marketplace ou por JSON. */
export const importFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importSchema.parse(data))
  .handler(async ({ data, context }): Promise<ShareResult> => {
    const { supabase, userId } = context;

    const { data: bot } = await supabase.from("bots").select("id").eq("id", data.botId).maybeSingle();
    if (!bot) return { ok: false, message: "Bot inválido" };

    let raw: unknown = data.payload;
    let templateId: string | null = data.templateId ?? null;
    let source = "json";

    if (data.code) {
      const code = data.code.toUpperCase();
      const { data: share } = await supabase
        .from("flow_shares")
        .select("id,template_id,is_active,max_uses,uses")
        .eq("code", code)
        .maybeSingle();

      let template: { id: string; payload: unknown } | null = null;
      if (share?.template_id && share.is_active !== false) {
        if (share.max_uses !== null && share.uses >= share.max_uses) {
          return { ok: false, message: "Este código atingiu o limite de usos" };
        }
        const { data: found } = await supabase
          .from("flow_templates")
          .select("id,payload")
          .eq("id", share.template_id)
          .maybeSingle();
        template = found ?? null;
        if (template) await supabase.from("flow_shares").update({ uses: share.uses + 1 }).eq("id", share.id);
      }
      if (!template) return { ok: false, message: "Código inválido ou desativado" };
      raw = template.payload;
      templateId = template.id;
      source = "code";
    } else if (templateId) {
      const { data: template } = await supabase
        .from("flow_templates")
        .select("id,payload,install_count")
        .eq("id", templateId)
        .maybeSingle();
      if (!template) return { ok: false, message: "Modelo não encontrado" };
      raw = template.payload;
      source = "template";
      await supabase
        .from("flow_templates")
        .update({ install_count: (template.install_count ?? 0) + 1 })
        .eq("id", templateId);
    }

    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: "Conteúdo do fluxo inválido" };

    const { data: flow, error } = await supabase
      .from("flows")
      .insert({
        user_id: userId,
        bot_id: data.botId,
        name: `${parsed.data.name} (importado)`,
        description: parsed.data.description ?? null,
        status: "draft",
        is_active: false,
        mode: parsed.data.mode,
        simple_config: parsed.data.simple_config as never,
      })
      .select("id")
      .maybeSingle();
    if (error || !flow) return { ok: false, message: error?.message ?? "Falha ao importar" };

    await writeGraph(supabase as never, userId, flow.id, parsed.data);

    await supabase.from("flow_imports").insert({
      user_id: userId,
      template_id: templateId,
      share_code: data.code?.toUpperCase() ?? null,
      created_flow_id: flow.id,
      source,
    });

    return { ok: true, message: "Fluxo importado", flowId: flow.id };
  });

/** Salva a configuração do Modo Simples e recompila o grafo do fluxo. */
export const saveSimpleFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ flowId: z.string().uuid(), config: z.record(z.string(), z.unknown()) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ShareResult> => {
    const { supabase, userId } = context;
    const { data: flow } = await supabase.from("flows").select("id,user_id").eq("id", data.flowId).maybeSingle();
    if (!flow || flow.user_id !== userId) return { ok: false, message: "Fluxo não encontrado" };

    const config = normalizeSimpleConfig(data.config);
    const compiled = compileSimpleConfig(config);

    await supabase.from("flow_connections").delete().eq("flow_id", data.flowId);
    await supabase.from("flow_steps").delete().eq("flow_id", data.flowId);

    await writeGraph(supabase as never, userId, data.flowId, {
      version: 1,
      name: "",
      mode: "simple",
      simple_config: {},
      steps: compiled.steps.map((s) => ({
        key: s.key,
        type: s.type,
        title: s.title,
        config: s.config,
        position: s.position,
        position_x: s.position_x,
        position_y: s.position_y,
      })),
      connections: compiled.connections,
    });

    await supabase
      .from("flows")
      .update({ mode: "simple", simple_config: config as never })
      .eq("id", data.flowId);

    return { ok: true, message: "Fluxo simples salvo", flowId: data.flowId };
  });

/** Publica um fluxo como modelo do marketplace (aguarda aprovação). */
export const publishToMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        flowId: z.string().uuid(),
        title: z.string().trim().min(3).max(80),
        summary: z.string().trim().max(280).optional(),
        category: z.string().trim().max(40).default("geral"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ShareResult> => {
    const { supabase, userId } = context;
    const payload = await buildExport(supabase as never, data.flowId, userId);
    if (!payload) return { ok: false, message: "Fluxo não encontrado" };

    const { data: template, error } = await supabase
      .from("flow_templates")
      .insert({
        user_id: userId,
        source_flow_id: data.flowId,
        name: data.title,
        description: data.summary ?? payload.description ?? null,
        category: data.category,
        mode: payload.mode,
        payload: payload as never,
        is_public: true,
      })
      .select("id")
      .maybeSingle();
    if (error || !template) return { ok: false, message: error?.message ?? "Falha ao publicar" };

    const { error: marketError } = await supabase.from("flow_marketplace").insert({
      user_id: userId,
      template_id: template.id,
      title: data.title,
      summary: data.summary ?? null,
      status: "pending",
    });
    if (marketError) return { ok: false, message: marketError.message };

    return { ok: true, message: "Enviado para o marketplace" };
  });
