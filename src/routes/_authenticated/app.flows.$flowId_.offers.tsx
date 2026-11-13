import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Gift, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import {
  createOffer,
  deleteOffer,
  listOffers,
  updateOffer,
  type OfferKind,
} from "@/lib/offers.functions";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/flows/$flowId_/offers")({
  head: () => ({
    meta: [
      { title: "Ofertas do fluxo | Chef Bot" },
      {
        name: "description",
        content: "Configure order bump, upsell e downsell independentes para cada fluxo de vendas.",
      },
      { property: "og:title", content: "Ofertas do fluxo | Chef Bot" },
      { property: "og:description", content: "Order bump, upsell e downsell por fluxo." },
    ],
  }),
  component: OffersPage,
});

const kinds: { key: OfferKind; label: string; hint: string; icon: typeof Gift }[] = [
  {
    key: "order_bump",
    label: "Order Bump",
    hint: "Oferecido junto com o PIX principal, antes do pagamento.",
    icon: Gift,
  },
  {
    key: "upsell",
    label: "Upsell",
    hint: "Enviado logo após o pagamento aprovado.",
    icon: TrendingUp,
  },
  {
    key: "downsell",
    label: "Downsell",
    hint: "Enviado quando a cobrança expira sem pagamento.",
    icon: TrendingDown,
  },
];

function OffersPage() {
  const { flowId } = Route.useParams();
  const qc = useQueryClient();
  const fetchOffers = useServerFn(listOffers);
  const create = useServerFn(createOffer);
  const update = useServerFn(updateOffer);
  const remove = useServerFn(deleteOffer);

  const [form, setForm] = useState<Record<OfferKind, { name: string; pitch: string; amount: string }>>({
    order_bump: { name: "", pitch: "", amount: "" },
    upsell: { name: "", pitch: "", amount: "" },
    downsell: { name: "", pitch: "", amount: "" },
  });

  const { data: offers, isLoading } = useQuery({
    queryKey: ["flow-offers", flowId],
    queryFn: () => fetchOffers({ data: { flowId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["flow-offers", flowId] });

  const createMutation = useMutation({
    mutationFn: (kind: OfferKind) =>
      create({
        data: {
          flowId,
          kind,
          name: form[kind].name.trim(),
          pitch: form[kind].pitch.trim() || undefined,
          amountCents: Math.round(Number(form[kind].amount.replace(",", ".")) * 100),
        },
      }),
    onSuccess: (r, kind) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(r.message);
      setForm((prev) => ({ ...prev, [kind]: { name: "", pitch: "", amount: "" } }));
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
    onSuccess: () => {
      toast.success("Oferta removida");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Ofertas do fluxo"
        description="Order bump, upsell e downsell independentes, cada um com seu próprio PIX."
      />

      <Button variant="secondary" asChild className="mb-4">
        <Link to="/app/flows">
          <ArrowLeft /> Voltar aos fluxos
        </Link>
      </Button>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {kinds.map((kind) => {
            const list = (offers ?? []).filter((o) => o.kind === kind.key);
            const values = form[kind.key];
            return (
              <div key={kind.key} className="panel space-y-4 p-5">
                <div>
                  <p className="flex items-center gap-2 font-display text-lg font-semibold">
                    <kind.icon className="size-4 text-primary" /> {kind.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{kind.hint}</p>
                </div>

                <div className="space-y-2">
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma oferta configurada.</p>
                  ) : (
                    list.map((offer) => (
                      <div
                        key={offer.id}
                        className="rounded-lg border border-border bg-secondary/40 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{offer.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatBRL(offer.amount_cents)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={offer.is_active}
                              onCheckedChange={(v) =>
                                toggleMutation.mutate({ id: offer.id, isActive: v })
                              }
                            />
                            <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(offer.id)}>
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        {offer.pitch && (
                          <p className="mt-1 text-xs text-muted-foreground">{offer.pitch}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${kind.key}-name`}>Nome da oferta</Label>
                    <Input
                      id={`${kind.key}-name`}
                      value={values.name}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, [kind.key]: { ...p[kind.key], name: e.target.value } }))
                      }
                      placeholder="Pack extra"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${kind.key}-amount`}>Valor (R$)</Label>
                    <Input
                      id={`${kind.key}-amount`}
                      value={values.amount}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, [kind.key]: { ...p[kind.key], amount: e.target.value } }))
                      }
                      placeholder="19,90"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${kind.key}-pitch`}>Chamada</Label>
                    <Textarea
                      id={`${kind.key}-pitch`}
                      rows={2}
                      value={values.pitch}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, [kind.key]: { ...p[kind.key], pitch: e.target.value } }))
                      }
                      placeholder="Leve também o conteúdo bônus por apenas..."
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => createMutation.mutate(kind.key)}
                    disabled={
                      createMutation.isPending ||
                      values.name.trim().length < 2 ||
                      !(Number(values.amount.replace(",", ".")) >= 1)
                    }
                  >
                    <Plus /> Adicionar {kind.label}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

