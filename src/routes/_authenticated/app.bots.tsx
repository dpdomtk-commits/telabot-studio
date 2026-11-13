import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { validateTelegramToken } from "@/lib/telegram.functions";
import { enableBotWebhook, disableBotWebhook } from "@/lib/bot.functions";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, maskToken } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/bots")({
  head: () => ({
    meta: [
      { title: "Bots | CASH BOT" },
      { name: "description", content: "Cadastre, valide e gerencie seus bots do Telegram." },
      { property: "og:title", content: "Bots | CASH BOT" },
      { property: "og:description", content: "Cadastre, valide e gerencie seus bots do Telegram." },
    ],
  }),
  component: BotsPage,
});

type BotRow = {
  id: string;
  name: string;
  token: string;
  telegram_username: string | null;
  status: "active" | "inactive";
  created_at: string;
};

const botSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome").max(80),
  token: z
    .string()
    .trim()
    .regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, "Formato de token inválido"),
});

export function useBots() {
  return useQuery({
    queryKey: ["bots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("id,name,token,telegram_username,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BotRow[];
    },
  });
}

async function logActivity(entity: string, action: string, entityId?: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("activity_logs").insert({
    user_id: data.user.id,
    entity,
    action,
    entity_id: entityId ?? null,
  });
}

function BotsPage() {
  const { data: bots, isLoading } = useBots();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BotRow | null>(null);
  const [removing, setRemoving] = useState<BotRow | null>(null);

  const toggle = useMutation({
    mutationFn: async (bot: BotRow) => {
      const activating = bot.status !== "active";
      const result = activating
        ? await enableBotWebhook({ data: { botId: bot.id } })
        : await disableBotWebhook({ data: { botId: bot.id } });
      if (!result.ok) throw new Error(result.message);
      return { activating };
    },
    onSuccess: ({ activating }) => {
      toast.success(activating ? "Bot ativado e conectado ao Telegram" : "Bot desativado");
      qc.invalidateQueries({ queryKey: ["bots"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível alterar a situação"),
  });

  const remove = useMutation({
    mutationFn: async (bot: BotRow) => {
      const { error } = await supabase.from("bots").delete().eq("id", bot.id);
      if (error) throw error;
      await logActivity("bot", "excluído", bot.id);
    },
    onSuccess: () => {
      toast.success("Bot excluído");
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["bots"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Não foi possível excluir"),
  });

  return (
    <div>
      <PageHeader
        title="Bots"
        description="Cada bot precisa de um token válido do @BotFather."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Novo bot
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (bots?.length ?? 0) === 0 ? (
        <EmptyState title="Nenhum bot cadastrado" description="Crie o primeiro bot para começar." />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bots?.map((bot) => (
                <TableRow key={bot.id}>
                  <TableCell className="font-medium">{bot.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {bot.telegram_username ? `@${bot.telegram_username}` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {maskToken(bot.token)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={bot.status === "active"}
                        onCheckedChange={() => toggle.mutate(bot)}
                        aria-label="Ativar bot"
                      />
                      <Badge variant={bot.status === "active" ? "default" : "secondary"}>
                        {bot.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(bot.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(bot);
                        setOpen(true);
                      }}
                      aria-label="Editar bot"
                    >
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setRemoving(bot)} aria-label="Excluir bot">
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <BotDialog open={open} onOpenChange={setOpen} bot={editing} />

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bot?</AlertDialogTitle>
            <AlertDialogDescription>
              Os fluxos vinculados a este bot também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BotDialog({
  open,
  onOpenChange,
  bot,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bot: BotRow | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const key = `${bot?.id ?? "new"}-${open}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = botSchema.safeParse({ name, token });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setSaving(true);
    const validation = await validateTelegramToken({ data: { token: parsed.data.token } });
    if (!validation.ok) {
      setSaving(false);
      toast.error(`Token recusado pelo Telegram: ${validation.error}`);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      toast.error("Sessão expirada");
      return;
    }

    const payload = {
      name: parsed.data.name,
      token: parsed.data.token,
      telegram_username: validation.username,
      telegram_bot_id: validation.botId,
    };

    const { error } = bot
      ? await supabase.from("bots").update(payload).eq("id", bot.id)
      : await supabase.from("bots").insert({ ...payload, user_id: userData.user.id });

    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o bot");
      return;
    }

    await logActivity("bot", bot ? "atualizado" : "criado", bot?.id);
    toast.success(bot ? "Bot atualizado" : `Bot conectado como @${validation.username ?? "bot"}`);
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["bots"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          setName(bot?.name ?? "");
          setToken(bot?.token ?? "");
        }
      }}
    >
      <DialogContent key={key}>
        <DialogHeader>
          <DialogTitle>{bot ? "Editar bot" : "Novo bot"}</DialogTitle>
          <DialogDescription>
            O token é validado direto na API do Telegram antes de salvar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bot-name">Nome</Label>
            <Input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bot-token">Token do Telegram</Label>
            <Input
              id="bot-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AA..."
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Validando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

