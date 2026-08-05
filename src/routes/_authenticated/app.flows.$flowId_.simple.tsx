import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { saveSimpleFlow } from "@/lib/flow-share.functions";
import {
  defaultSimpleConfig,
  normalizeSimpleConfig,
  simplePages,
  type SimpleConfig,
  type SimpleOffer,
  type SimplePageKey,
} from "@/lib/flow-simple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaPicker } from "@/components/app/MediaPicker";

export const Route = createFileRoute("/_authenticated/app/flows/$flowId_/simple")({
  head: () => ({
    meta: [
      { title: "Fluxo simples | AURUMBOT" },
      {
        name: "description",
        content:
          "Configure seu funil por páginas: boas-vindas, planos, pagamentos, assinaturas, upsell, packs e grupo VIP.",
      },
      { property: "og:title", content: "Fluxo simples | AURUMBOT" },
      { property: "og:description", content: "Monte funis no Telegram sem editor visual, página por página." },
    ],
  }),
  component: SimpleFlowPage,
});

const rid = () => Math.random().toString(36).slice(2, 9);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function OfferEditor({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: SimpleOffer;
  onChange: (offer: SimpleOffer) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface/60 p-4">
        <div>
          <p className="font-display font-bold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
      </div>
      {value.enabled ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do produto">
            <Input
              value={value.productName}
              onChange={(e) => onChange({ ...value, productName: e.target.value })}
              placeholder="Pacote extra"
            />
          </Field>
          <Field label="Valor (R$)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={value.price}
              onChange={(e) => onChange({ ...value, price: Number(e.target.value) })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Oferta enviada ao lead">
              <Textarea
                rows={3}
                value={value.pitch}
                onChange={(e) => onChange({ ...value, pitch: e.target.value })}
                placeholder="Aproveite agora e leve também..."
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SimpleFlowPage() {
  const { flowId } = useParams({ from: "/_authenticated/app/flows/$flowId_/simple" });
  const [page, setPage] = useState<SimplePageKey>("welcome");
  const [config, setConfig] = useState<SimpleConfig>(defaultSimpleConfig());
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["flow-simple", flowId],
    queryFn: async () => {
      const { data: flow, error } = await supabase
        .from("flows")
        .select("id,name,mode,simple_config,bots(name)")
        .eq("id", flowId)
        .maybeSingle();
      if (error) throw error;
      return flow;
    },
  });

  useEffect(() => {
    if (data) setConfig(normalizeSimpleConfig(data.simple_config));
  }, [data]);

  const patch = <K extends keyof SimpleConfig>(key: K, value: Partial<SimpleConfig[K]>) =>
    setConfig((c) => ({ ...c, [key]: { ...(c[key] as object), ...value } as SimpleConfig[K] }));

  async function save() {
    setSaving(true);
    try {
      const result: { ok: boolean; message: string } = await saveSimpleFlow({ data: { flowId, config: config as unknown as Record<string, unknown> } });
      if (!result.ok) throw new Error(result.message);
      toast.success("Fluxo salvo e ativado — envie /start no bot para testar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="secondary" size="icon" aria-label="Voltar para fluxos">
            <Link to="/app/flows">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl font-bold">{data?.name ?? "Fluxo"}</h1>
            <p className="text-sm text-muted-foreground">
              Modo simples · {data?.bots?.name ?? "Bot"} — configure por páginas, sem editor visual.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar e ativar
          </Button>
        </div>

      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="panel h-fit p-2">
          {simplePages.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPage(p.key)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                page === p.key
                  ? "bg-primary/15 font-semibold text-primary shadow-[inset_2px_0_0_var(--color-primary)]"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <section className="panel space-y-6 p-6">
          {page === "welcome" ? (
            <>
              <Field label="Mensagem de boas-vindas">
                <Textarea
                  rows={4}
                  value={config.welcome.message}
                  onChange={(e) => patch("welcome", { message: e.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Imagem de capa (opcional)">
                  <MediaPicker
                    kind="image"
                    value={config.welcome.mediaKind === "image" ? config.welcome.mediaFileId : ""}
                    onSelect={(asset) =>
                      patch("welcome", { mediaFileId: asset.telegram_file_id, mediaKind: "image" })
                    }
                  />
                </Field>
                <Field label="Legenda da mídia">
                  <Input
                    value={config.welcome.caption}
                    onChange={(e) => patch("welcome", { caption: e.target.value })}
                  />
                </Field>
              </div>
              {config.welcome.mediaFileId ? (
                <Button variant="secondary" size="sm" onClick={() => patch("welcome", { mediaFileId: "", mediaKind: "" })}>
                  <Trash2 /> Remover mídia
                </Button>
              ) : null}
            </>
          ) : null}

          {page === "plans" ? (
            <>
              <Field label="Texto antes dos planos">
                <Textarea
                  rows={2}
                  value={config.plans.intro}
                  onChange={(e) => patch("plans", { intro: e.target.value })}
                />
              </Field>
              <div className="space-y-4">
                {config.plans.items.map((plan, i) => (
                  <div key={plan.id} className="rounded-xl border border-border bg-surface/60 p-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Nome do plano">
                        <Input
                          value={plan.name}
                          onChange={(e) =>
                            patch("plans", {
                              items: config.plans.items.map((p, idx) =>
                                idx === i ? { ...p, name: e.target.value } : p,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label="Valor (R$)">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={plan.price}
                          onChange={(e) =>
                            patch("plans", {
                              items: config.plans.items.map((p, idx) =>
                                idx === i ? { ...p, price: Number(e.target.value) } : p,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label="Dias de acesso">
                        <Input
                          type="number"
                          min={1}
                          value={plan.intervalDays}
                          onChange={(e) =>
                            patch("plans", {
                              items: config.plans.items.map((p, idx) =>
                                idx === i ? { ...p, intervalDays: Number(e.target.value) } : p,
                              ),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-4">
                      <Field label="Descrição">
                        <Input
                          value={plan.description}
                          onChange={(e) =>
                            patch("plans", {
                              items: config.plans.items.map((p, idx) =>
                                idx === i ? { ...p, description: e.target.value } : p,
                              ),
                            })
                          }
                        />
                      </Field>
                    </div>
                    {config.plans.items.length > 1 ? (
                      <Button
                        className="mt-4"
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          patch("plans", { items: config.plans.items.filter((_, idx) => idx !== i) })
                        }
                      >
                        <Trash2 /> Remover plano
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() =>
                    patch("plans", {
                      items: [
                        ...config.plans.items,
                        { id: rid(), name: "Novo plano", price: 0, intervalDays: 30, description: "" },
                      ],
                    })
                  }
                >
                  <Plus /> Adicionar plano
                </Button>
              </div>
            </>
          ) : null}

          {page === "payment" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Validade do PIX (minutos)">
                <Input
                  type="number"
                  min={1}
                  value={config.payment.expiresMinutes}
                  onChange={(e) => patch("payment", { expiresMinutes: Number(e.target.value) })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Instruções de pagamento">
                  <Textarea
                    rows={3}
                    value={config.payment.instructions}
                    onChange={(e) => patch("payment", { instructions: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Mensagem após aprovação">
                  <Textarea
                    rows={3}
                    value={config.payment.successMessage}
                    onChange={(e) => patch("payment", { successMessage: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {page === "subscription" ? (
            <>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface/60 p-4">
                <div>
                  <p className="font-display font-bold">Cobrança recorrente</p>
                  <p className="text-sm text-muted-foreground">
                    Substitui o PIX avulso por uma assinatura renovada automaticamente.
                  </p>
                </div>
                <Switch
                  checked={config.subscription.enabled}
                  onCheckedChange={(enabled) => patch("subscription", { enabled })}
                />
              </div>
              {config.subscription.enabled ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Nome do plano">
                    <Input
                      value={config.subscription.planName}
                      onChange={(e) => patch("subscription", { planName: e.target.value })}
                    />
                  </Field>
                  <Field label="Valor (R$)">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={config.subscription.price}
                      onChange={(e) => patch("subscription", { price: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Intervalo (dias)">
                    <Input
                      type="number"
                      min={1}
                      value={config.subscription.intervalDays}
                      onChange={(e) => patch("subscription", { intervalDays: Number(e.target.value) })}
                    />
                  </Field>
                  <div className="sm:col-span-3">
                    <Field label="Mensagem após ativação">
                      <Textarea
                        rows={3}
                        value={config.subscription.successMessage}
                        onChange={(e) => patch("subscription", { successMessage: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {page === "upsell" ? (
            <OfferEditor
              title="Upsell"
              description="Oferta enviada logo após o pagamento aprovado."
              value={config.upsell}
              onChange={(upsell) => setConfig((c) => ({ ...c, upsell }))}
            />
          ) : null}

          {page === "downsell" ? (
            <OfferEditor
              title="Downsell"
              description="Oferta alternativa quando o PIX expira sem pagamento."
              value={config.downsell}
              onChange={(downsell) => setConfig((c) => ({ ...c, downsell }))}
            />
          ) : null}

          {page === "orderBump" ? (
            <OfferEditor
              title="Order Bump"
              description="Produto adicional oferecido antes da cobrança principal."
              value={config.orderBump}
              onChange={(orderBump) => setConfig((c) => ({ ...c, orderBump }))}
            />
          ) : null}

          {page === "packs" ? (
            <div className="space-y-4">
              {config.packs.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum pack cadastrado. Packs são conteúdos extras entregues após a compra.
                </p>
              ) : null}
              {config.packs.items.map((pack, i) => (
                <div key={pack.id} className="rounded-xl border border-border bg-surface/60 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nome do pack">
                      <Input
                        value={pack.name}
                        onChange={(e) =>
                          patch("packs", {
                            items: config.packs.items.map((p, idx) =>
                              idx === i ? { ...p, name: e.target.value } : p,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Valor (R$)">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={pack.price}
                        onChange={(e) =>
                          patch("packs", {
                            items: config.packs.items.map((p, idx) =>
                              idx === i ? { ...p, price: Number(e.target.value) } : p,
                            ),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Conteúdo entregue">
                      <Textarea
                        rows={3}
                        value={pack.content}
                        onChange={(e) =>
                          patch("packs", {
                            items: config.packs.items.map((p, idx) =>
                              idx === i ? { ...p, content: e.target.value } : p,
                            ),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Button
                    className="mt-4"
                    size="sm"
                    variant="destructive"
                    onClick={() => patch("packs", { items: config.packs.items.filter((_, idx) => idx !== i) })}
                  >
                    <Trash2 /> Remover pack
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() =>
                  patch("packs", {
                    items: [...config.packs.items, { id: rid(), name: "Novo pack", price: 0, content: "" }],
                  })
                }
              >
                <Plus /> Adicionar pack
              </Button>
            </div>
          ) : null}

          {page === "vip" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID do canal VIP">
                <Input
                  value={config.vip.channelId}
                  onChange={(e) => patch("vip", { channelId: e.target.value })}
                  placeholder="-1001234567890"
                />
              </Field>
              <Field label="ID do grupo VIP">
                <Input
                  value={config.vip.groupId}
                  onChange={(e) => patch("vip", { groupId: e.target.value })}
                  placeholder="-1009876543210"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Mensagem de liberação">
                  <Textarea
                    rows={3}
                    value={config.vip.message}
                    onChange={(e) => patch("vip", { message: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {page === "conversions" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Etiqueta aplicada ao lead convertido">
                <Input
                  value={config.conversions.tag}
                  onChange={(e) => patch("conversions", { tag: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Mensagem final de agradecimento">
                  <Textarea
                    rows={3}
                    value={config.conversions.thankYouMessage}
                    onChange={(e) => patch("conversions", { thankYouMessage: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
