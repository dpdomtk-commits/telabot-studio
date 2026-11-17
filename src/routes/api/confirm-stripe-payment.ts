import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { approvePayment } from "@/lib/finance.server";

export const Route = createFileRoute("/api/confirm-stripe-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const { payment_id, lead_id, bot_id, plan_name, price, currency } = body;

          let targetPaymentId = payment_id;

          // Se payment_id não foi passado ou é temporário (começa com stripe-), tenta encontrar pelo lead e bot
          if (!targetPaymentId || targetPaymentId.startsWith("stripe-")) {
            if (lead_id) {
              const { data: found } = await supabaseAdmin
                .from("payments")
                .select("id")
                .eq("lead_id", lead_id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (found?.id) {
                targetPaymentId = found.id;
              }
            }
          }

          // Se ainda assim não encontrar, cria o registro imediatamente para aprovação
          if (!targetPaymentId || targetPaymentId.startsWith("stripe-")) {
            let userId = "00000000-0000-0000-0000-000000000000";
            if (bot_id) {
              const { data: bot } = await supabaseAdmin
                .from("bots")
                .select("user_id")
                .eq("id", bot_id)
                .maybeSingle();
              if (bot?.user_id) userId = bot.user_id;
            }

            const amountCents = price ? Math.round(Number(price) * 100) : 2990;
            const { data: created } = await supabaseAdmin
              .from("payments")
              .insert({
                user_id: userId,
                bot_id: bot_id || null,
                lead_id: lead_id || null,
                amount_cents: amountCents,
                currency: (currency || "USD").toUpperCase(),
                method: "card",
                provider: "stripe",
                status: "pending",
                product_name: plan_name || "Acesso VIP",
                description: `Plano Internacional ${plan_name || "VIP"}`,
              })
              .select("id")
              .maybeSingle();

            if (created?.id) {
              targetPaymentId = created.id;
            }
          }

          if (!targetPaymentId) {
            return Response.json({ error: "Identificador de pagamento não localizado" }, { status: 400 });
          }

          // Executa a aprovação completa do pagamento
          // (credita saldo, atualiza payments para approved, envia VIP no Telegram e cancela downsells)
          const result = await approvePayment(targetPaymentId);

          return Response.json({
            ok: true,
            payment_id: targetPaymentId,
            result,
          });
        } catch (error: any) {
          console.error("[confirm-stripe-payment-error]", error);
          return Response.json(
            { error: error?.message || "Falha ao confirmar pagamento Stripe" },
            { status: 500 }
          );
        }
      },
    },
  },
});
