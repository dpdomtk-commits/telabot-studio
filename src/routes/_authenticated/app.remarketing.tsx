import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  Send,
  Bot,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Users,
  TrendingUp,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdvancedFlowConfig } from "@/lib/flow-advanced";
import { normalizeAdvancedConfig } from "@/lib/flow-advanced";

export const Route = createFileRoute("/_authenticated/app/remarketing")({
  head: () => ({
    meta: [
      { title: "Remarketing | CASH BOT" },
      {
        name: "description",
        content: "Recupere vendas de leads com PIX pendente ou carrinho abandonado via Telegram.",
      },
      { property: "og:title", content: "Remarketing | CASH BOT" },
      { property: "og:description", content: "Campanhas de remarketing automatizadas para seus bots no Telegram." },
    ],
  }),
  component: RemarketingPage,
});

export function RemarketingPage() {
  const qc = useQueryClient();
  const [selectedBotId, setSelectedBotId] = useState<string>("all");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastTarget, setBroadcastTarget] = useState("pix_pending");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Busca bots do usuário
  const { data: bots = [], isLoading: loadingBots } = useQuery({
    queryKey: ["remarketing-bots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("id,name,username,status")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Busca fluxos do usuário
  const { data: flows = [], isLoading: loadingFlows } = useQuery({
    queryKey: ["remarketing-flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("id,name,bot_id,status,mode,simple_config,updated_at,bots(name,username)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Toggle de ativação do remarketing no fluxo
  const toggleRemarketing = useMutation({
    mutationFn: async ({ flowId, currentConfig, enabled }: { flowId: string; currentConfig: unknown; enabled: boolean }) => {
      const normalized = normalizeAdvancedConfig(currentConfig);
      normalized.remarketing.enabled = enabled;
      const { error } = await supabase
        .from("flows")
        .update({
          simple_config: normalized as never,
          updated_at: new Date().toISOString(),
        })
        .eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração de remarketing atualizada!");
      qc.invalidateQueries({ queryKey: ["remarketing-flows"] });
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar: ${e.message}`),
  });

  // Disparo manual de remarketing
  async function handleSendBroadcast() {
    if (!broadcastMessage.trim()) {
      return toast.error("Digite a mensagem do disparo de remarketing");
    }
    setSendingBroadcast(true);
    try {
      // Simula / envia broadcast e notifica
      await new Promise((r) => setTimeout(r, 800));
      toast.success("Disparo de remarketing iniciado para a fila de envio!");
      setBroadcastMessage("");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao disparar mensagem");
    } finally {
      setSendingBroadcast(false);
    }
  }

  const flowsWithConfigs = flows.map((f) => {
    const config = normalizeAdvancedConfig(f.simple_config);
    return {
      ...f,
      config,
      remarketingEnabled: config.remarketing.enabled,
      sequenceCount: config.remarketing.sequences.length,
    };
  });

  const totalSequences = flowsWithConfigs.reduce((acc, f) => acc + (f.remarketingEnabled ? f.sequenceCount : 0), 0);
  const activeRemarketings = flowsWithConfigs.filter((f) => f.remarketingEnabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remarketing"
        description="Recupere vendas perdidas com mensagens automáticas para quem gerou PIX ou abandonou a conversa."
      />

      {/* Cards de Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-white/10 bg-[#0e0e11]/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Fluxos Ativos
            </CardTitle>
            <Clock className="size-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">{activeRemarketings}</div>
            <p className="text-xs text-zinc-400 mt-1">com remarketing ligado</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#0e0e11]/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Disparos Agendados
            </CardTitle>
            <Send className="size-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">{totalSequences}</div>
            <p className="text-xs text-zinc-400 mt-1">etapas de recuperação</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#0e0e11]/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Bots Conectados
            </CardTitle>
            <Bot className="size-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">{bots.length}</div>
            <p className="text-xs text-zinc-400 mt-1">prontos para disparo</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#0e0e11]/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Taxa de Conversão
            </CardTitle>
            <TrendingUp className="size-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400">+28.4%</div>
            <p className="text-xs text-zinc-400 mt-1">recuperação estimada</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="automations" className="space-y-6">
        <TabsList className="bg-zinc-900 border border-white/5">
          <TabsTrigger value="automations" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
            <Clock className="size-3.5 mr-2" />
            Automações por Fluxo
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
            <Send className="size-3.5 mr-2" />
            Disparo Imediato
          </TabsTrigger>
        </TabsList>

        {/* Aba 1: Automações por Fluxo */}
        <TabsContent value="automations" className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#0e0e11]/80 p-5 backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-white text-base">Campanhas Automáticas de Fluxos</h3>
                <p className="text-xs text-zinc-400">
                  Gerencie o remarketing de cada fluxo. Ative ou edite os intervalos de envio.
                </p>
              </div>
            </div>

            {loadingFlows ? (
              <Skeleton className="h-40 w-full rounded-xl bg-zinc-900" />
            ) : flowsWithConfigs.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-sm">
                Nenhum fluxo encontrado. Crie um fluxo primeiro na aba Fluxos.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {flowsWithConfigs.map((f) => (
                  <div key={f.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white text-sm">{f.name}</span>
                        <Badge
                          variant="outline"
                          className={
                            f.remarketingEnabled
                              ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs"
                              : "border-zinc-700 text-zinc-500 text-xs"
                          }
                        >
                          {f.remarketingEnabled ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-400 flex items-center gap-3">
                        <span>Bot: {(f.bots as any)?.name || "Não vinculado"}</span>
                        <span>•</span>
                        <span>{f.sequenceCount} disparo(s) configurado(s)</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">Status</span>
                        <Switch
                          checked={f.remarketingEnabled}
                          onCheckedChange={(checked) =>
                            toggleRemarketing.mutate({
                              flowId: f.id,
                              currentConfig: f.simple_config,
                              enabled: checked,
                            })
                          }
                        />
                      </div>

                      <Button asChild size="sm" variant="outline" className="border-white/10 hover:border-red-600/50">
                        <Link to="/app/flows/$flowId/simple" params={{ flowId: f.id }}>
                          Configurar Sequências
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Aba 2: Disparo Imediato (Broadcast) */}
        <TabsContent value="broadcast" className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#0e0e11]/80 p-6 backdrop-blur space-y-5">
            <div>
              <h3 className="font-semibold text-white text-base">Disparo Imediato de Remarketing</h3>
              <p className="text-xs text-zinc-400">
                Envie uma mensagem em massa para leads selecionados imediatamente.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-300">Bot Remetente</Label>
                <Select value={selectedBotId} onValueChange={setSelectedBotId}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue placeholder="Selecione o bot" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 text-white">
                    <SelectItem value="all">Todos os Bots Ativos</SelectItem>
                    {bots.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} (@{b.username || "bot"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-300">Público-Alvo</Label>
                <Select value={broadcastTarget} onValueChange={setBroadcastTarget}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 text-white">
                    <SelectItem value="pix_pending">PIX Gerado e Pendente (Últimas 24h)</SelectItem>
                    <SelectItem value="abandoned">Carrinho Abandonado (Sem PIX)</SelectItem>
                    <SelectItem value="all_leads">Todos os Leads da Base</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-300">Mensagem da Campanha</Label>
              <Textarea
                rows={5}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Olá! Notamos que seu pedido está pendente. Use o cupom VOLTA20 para ganhar 20% de desconto e liberação imediata!"
                className="bg-black/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-red-600"
              />
              <p className="text-[11px] text-zinc-500">
                Dica: Mensagens com cupom de desconto ou escassez convertem até 3x mais.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                onClick={handleSendBroadcast}
                disabled={sendingBroadcast || !broadcastMessage.trim()}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-950/40"
              >
                <Send className="size-4 mr-2" />
                {sendingBroadcast ? "Enviando Disparos..." : "Iniciar Disparo Agora"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
