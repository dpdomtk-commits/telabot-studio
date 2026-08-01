import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBots } from "./app.bots";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/flows/")({
  head: () => ({
    meta: [
      { title: "Fluxos | AURUMBOT" },
      { name: "description", content: "Monte fluxos por etapas para cada bot: mensagem, botão, pagamento e entrega." },
      { property: "og:title", content: "Fluxos | AURUMBOT" },
      { property: "og:description", content: "Monte fluxos por etapas para cada bot." },
    ],
  }),
  component: FlowsPage,
});

export type FlowRow = {
  id: string;
  name: string;
  bot_id: string;
  is_active: boolean;
  created_at: string;
  bots: { name: string } | null;
};

function FlowsPage() {
  const qc = useQueryClient();
  const { data: bots } = useBots();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [botId, setBotId] = useState("");

  const { data: flows, isLoading } = useQuery({
    queryKey: ["flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("id,name,bot_id,is_active,created_at,bots(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FlowRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = z
        .object({ name: z.string().trim().min(2, "Informe um nome").max(80), botId: z.string().uuid("Escolha um bot") })
        .parse({ name, botId });
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada");
      const { error } = await supabase
        .from("flows")
        .insert({ name: parsed.name, bot_id: parsed.botId, user_id: userData.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fluxo criado");
      setOpen(false);
      setName("");
      setBotId("");
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
    onError: (e: Error) => toast.error(e instanceof z.ZodError ? "Dados inválidos" : e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fluxo excluído");
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Fluxos"
        description="Sequência de etapas que o bot executa com cada lead."
        action={
          <Button onClick={() => setOpen(true)} disabled={(bots?.length ?? 0) === 0}>
            <Plus /> Novo fluxo
          </Button>
        }
      />

      {(bots?.length ?? 0) === 0 ? (
        <EmptyState title="Cadastre um bot primeiro" description="Todo fluxo pertence a um bot." />
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (flows?.length ?? 0) === 0 ? (
        <EmptyState title="Nenhum fluxo criado" description="Crie um fluxo e adicione as etapas." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {flows?.map((flow) => (
            <div key={flow.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{flow.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {flow.bots?.name ?? "Bot removido"} · {formatDate(flow.created_at)}
                  </p>
                </div>
                <Badge variant={flow.is_active ? "default" : "secondary"}>
                  {flow.is_active ? "Ativo" : "Rascunho"}
                </Badge>
              </div>
              <div className="mt-5 flex items-center gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/app/flows/$flowId" params={{ flowId: flow.id }}>
                    Editar etapas <ArrowRight />
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(flow.id)} aria-label="Excluir fluxo">
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo fluxo</DialogTitle>
            <DialogDescription>Escolha o bot que vai executar este fluxo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="flow-name">Nome</Label>
              <Input id="flow-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label>Bot</Label>
              <Select value={botId} onValueChange={setBotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {bots?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Criar fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
