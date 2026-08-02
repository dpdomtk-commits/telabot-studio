import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Store, Sparkles, Package, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBots } from "./app.bots";
import { importFlow } from "@/lib/flow-share.functions";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace de fluxos | AURUMBOT" },
      {
        name: "description",
        content: "Instale funis prontos com um clique ou importe fluxos compartilhados pelo código FLOW-XXXXXX.",
      },
      { property: "og:title", content: "Marketplace de fluxos | AURUMBOT" },
      { property: "og:description", content: "Modelos de funis para bots do Telegram, prontos para instalar." },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: bots } = useBots();
  const [botId, setBotId] = useState("");
  const [code, setCode] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["marketplace"],
    queryFn: async () => {
      const [templates, market, imports] = await Promise.all([
        supabase
          .from("flow_templates")
          .select("id,name,description,category,mode,install_count,is_public,created_at")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("flow_marketplace")
          .select("id,template_id,title,summary,price_cents,featured,rating,installs,status")
          .eq("status", "approved"),
        supabase
          .from("flow_imports")
          .select("id,share_code,source,created_at,created_flow_id")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      return {
        templates: templates.data ?? [],
        market: market.data ?? [],
        imports: imports.data ?? [],
      };
    },
  });

  const install = useMutation({
    mutationFn: async (vars: { templateId?: string; code?: string }) => {
      if (!botId) throw new Error("Escolha o bot que vai executar o fluxo");
      const result: { ok: boolean; message: string; flowId?: string } = await importFlow({
        data: { botId, ...(vars.templateId ? { templateId: vars.templateId } : {}), ...(vars.code ? { code: vars.code } : {}) },
      });
      if (!result.ok) throw new Error(result.message);
      return result.flowId ?? null;
    },
    onSuccess: (flowId) => {
      toast.success("Fluxo instalado");
      setCode("");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["flows-overview"] });
      if (flowId) navigate({ to: "/app/flows/$flowId", params: { flowId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const marketByTemplate = new Map((data?.market ?? []).map((m) => [m.template_id, m]));

  return (
    <div>
      <PageHeader
        title="Marketplace de fluxos"
        description="Instale funis prontos com um clique ou importe um fluxo compartilhado pelo código."
      />

      <div className="panel space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Bot de destino</Label>
            <Select value={botId} onValueChange={setBotId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um bot" />
              </SelectTrigger>
              <SelectContent>
                {(bots ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-code">Código do fluxo</Label>
            <div className="flex gap-2">
              <Input
                id="import-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FLOW-A1B2C3"
                maxLength={20}
              />
              <Button
                disabled={install.isPending || code.trim().length < 6}
                onClick={() => install.mutate({ code: code.trim() })}
              >
                <Ticket /> Importar
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Tokens do Telegram, chaves PIX, dados financeiros e leads nunca são importados — apenas o conteúdo do funil.
        </p>
      </div>

      <h2 className="mt-8 flex items-center gap-2 font-display text-lg font-bold">
        <Store className="size-4 text-primary" /> Modelos disponíveis
      </h2>
      <div className="mt-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (data?.templates.length ?? 0) === 0 ? (
          <EmptyState
            title="Nenhum modelo ainda"
            description="Compartilhe um fluxo ou publique no marketplace para vê-lo aqui."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data?.templates ?? []).map((template) => {
              const listing = marketByTemplate.get(template.id);
              return (
                <div key={template.id} className="panel flex flex-col justify-between p-5">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-lg font-bold">{listing?.title ?? template.name}</p>
                      <Badge variant={template.mode === "simple" ? "secondary" : "default"}>
                        {template.mode === "simple" ? "Simples" : "Avançado"}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {listing?.summary ?? template.description ?? "Sem descrição."}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Package className="size-3" /> {template.category}
                      </span>
                      <span>· {template.install_count} instalações</span>
                      {listing?.featured ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Sparkles className="size-3" /> destaque
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    className="mt-4"
                    disabled={install.isPending || !botId}
                    onClick={() => install.mutate({ templateId: template.id })}
                  >
                    <Download /> Instalar com um clique
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(data?.imports.length ?? 0) > 0 ? (
        <>
          <h2 className="mt-8 font-display text-lg font-bold">Importações recentes</h2>
          <div className="panel mt-4 divide-y divide-border">
            {(data?.imports ?? []).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span>{item.share_code ?? `Modelo (${item.source})`}</span>
                <span className="text-muted-foreground">{formatDate(item.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
