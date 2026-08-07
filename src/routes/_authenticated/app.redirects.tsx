import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BarChart3, Copy, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import {
  createRedirect,
  deleteRedirect,
  listRedirects,
  redirectStats,
  updateRedirect,
  MAX_REDIRECT_LINKS,
} from "@/lib/redirects.functions";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/redirects")({
  head: () => ({
    meta: [
      { title: "Links de redirect | AURUMBOT" },
      {
        name: "description",
        content: "Crie até 10 links rastreáveis para seus bots com estatísticas de origem e dispositivo.",
      },
      { property: "og:title", content: "Links de redirect | AURUMBOT" },
      { property: "og:description", content: "Links rastreáveis com estatísticas de cliques por origem." },
    ],
  }),
  component: RedirectsPage,
});

function RedirectsPage() {
  const qc = useQueryClient();
  const fetchLinks = useServerFn(listRedirects);
  const create = useServerFn(createRedirect);
  const update = useServerFn(updateRedirect);
  const remove = useServerFn(deleteRedirect);
  const stats = useServerFn(redirectStats);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [slug, setSlug] = useState("");
  const [statsFor, setStatsFor] = useState<string | null>(null);

  const { data: links, isLoading } = useQuery({ queryKey: ["redirects"], queryFn: () => fetchLinks() });
  const { data: statsData } = useQuery({
    queryKey: ["redirect-stats", statsFor],
    enabled: Boolean(statsFor),
    queryFn: () => stats({ data: { id: statsFor as string } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["redirects"] });

  const createMutation = useMutation({
    mutationFn: () =>
      create({ data: { name: name.trim(), destination: destination.trim(), slug: slug.trim() || undefined } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.message);
      toast.success(r.message);
      setOpen(false);
      setName("");
      setDestination("");
      setSlug("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => update({ data: v }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.message);
      setStatsFor(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
  const rows = links ?? [];

  return (
    <div>
      <PageHeader
        title="Links de redirect"
        description={`Até ${MAX_REDIRECT_LINKS} links rastreáveis com origem, dispositivo e histórico de cliques.`}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length}/{MAX_REDIRECT_LINKS} links criados
        </p>
        <Button onClick={() => setOpen(true)} disabled={rows.length >= MAX_REDIRECT_LINKS}>
          <Plus /> Novo link
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum link ainda"
          description="Crie um link rastreável para divulgar seu bot em anúncios e redes sociais."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((link) => {
            const shortUrl = `${baseUrl}/api/public/r/${link.slug}`;
            return (
              <div key={link.id} className="panel space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-display text-base font-semibold">
                      <Link2 className="size-4 text-primary" /> {link.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{link.destination}</p>
                  </div>
                  <Badge variant={link.is_active ? "default" : "secondary"}>
                    {link.is_active ? "Ativo" : "Pausado"}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Input readOnly value={shortUrl} className="font-mono text-xs" />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(shortUrl);
                      toast.success("Link copiado");
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button variant="secondary" asChild>
                    <a href={shortUrl} target="_blank" rel="noreferrer">
                      <ExternalLink />
                    </a>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {link.clicks_total} clique(s)
                    {link.last_click_at ? ` · último em ${formatDate(link.last_click_at)}` : ""}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2">
                      <Switch
                        checked={link.is_active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: link.id, isActive: v })}
                      />
                      Ativo
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setStatsFor(statsFor === link.id ? null : link.id)}
                    >
                      <BarChart3 /> Estatísticas
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(link.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {statsFor === link.id && statsData && (
                  <div className="grid gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Dispositivos</p>
                      {statsData.devices.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sem dados</p>
                      ) : (
                        statsData.devices.map((d) => (
                          <p key={d.device} className="text-sm">
                            {d.device} · {d.count}
                          </p>
                        ))
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Origens</p>
                      {statsData.referrers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sem dados</p>
                      ) : (
                        statsData.referrers.map((r) => (
                          <p key={r.referrer} className="truncate text-sm">
                            {r.referrer} · {r.count}
                          </p>
                        ))
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Últimos 7 dias</p>
                      {statsData.last7.map((d) => (
                        <p key={d.day} className="text-sm">
                          {d.day} · {d.count}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo link de redirect</DialogTitle>
            <DialogDescription>
              O visitante é redirecionado ao destino e o clique fica registrado com origem e dispositivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rl-name">Nome</Label>
              <Input id="rl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campanha Instagram" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rl-dest">Destino</Label>
              <Input
                id="rl-dest"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="https://t.me/seubot"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rl-slug">Slug (opcional)</Label>
              <Input id="rl-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="insta-vip" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || name.trim().length < 2 || destination.trim().length < 8}
            >
              Criar link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
