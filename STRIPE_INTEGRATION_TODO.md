# Stripe Integration Guide & Next Steps

This document serves as the single source of truth for completing the Stripe Checkout integration on CASH BOT.

---

## Values to Replace

The following values are placeholders and must be updated before going live.

**Files containing placeholders:**
- [src/routes/api/create-checkout-session.ts](src/routes/api/create-checkout-session.ts)
- [.env](.env)

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| `mode` | `payment` | Set to `"payment"` for one-time charges or `"subscription"` for recurring billing. |
| `line_items[].price` | `price_...` | Your actual Stripe Price ID from the Dashboard (https://dashboard.stripe.com/prices) or created via the Stripe API. |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_placeholder` | Your publishable API key from Stripe Dashboard (https://dashboard.stripe.com/test/apikeys). |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_placeholder` | Same publishable API key, accessible by the browser via Vite for embedded forms. |
| `STRIPE_SECRET_KEY` | `sk_test_placeholder` | Your secret API key from Stripe Dashboard (https://dashboard.stripe.com/test/apikeys). |
| `STRIPE_WEBHOOK_SECRET` | `whsec_placeholder` | Your webhook signing secret from Stripe Workbench / Webhooks (https://dashboard.stripe.com/workbench/webhooks). |

---

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**
- [src/routes/api/create-checkout-session.ts](src/routes/api/create-checkout-session.ts)

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `form` |
| `billing_address_collection` | `auto` |
| `phone_number_collection` | `{"enabled": false}` |
| `automatic_tax` | `{"enabled": false}` |
| `submit_type` | `auto` |
| `integration_identifier` | `custom_embedded_web_0001` |
| `payment_method_collection` | `always` (included when `mode` is `"subscription"`) |

---

## Setup and Next Steps

### 1. Environment Variables Configuration
Ensure the following variables are defined in your `.env` file (local development) and in your **Vercel Project Settings > Environment Variables** (production):

```bash
# Stripe API Keys (Dashboard -> https://dashboard.stripe.com/test/apikeys)
STRIPE_PUBLISHABLE_KEY=pk_test_51...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51...
STRIPE_SECRET_KEY=sk_test_51...

# Stripe Webhook Secret (Dashboard -> https://dashboard.stripe.com/workbench/webhooks)
STRIPE_WEBHOOK_SECRET=whsec_...

# Application Domain
DOMAIN=https://telabot-studio.vercel.app
```

### 2. Project Structure of Created Files
- [`src/lib/stripe.server.ts`](src/lib/stripe.server.ts): Instanciação segura do SDK do Stripe com a versão de API `2026-03-25.dahlia`.
- [`src/routes/api/create-checkout-session.ts`](src/routes/api/create-checkout-session.ts): Endpoint de servidor que cria a Sessão de Checkout e retorna `{ client_secret: session.client_secret }`.
- [`src/routes/api/webhook.ts`](src/routes/api/webhook.ts): Endpoint de Webhook para processar eventos como `checkout.session.completed` e liberar o acesso automático do lead.
- [`src/components/checkout/StripeEmbeddedForm.tsx`](src/components/checkout/StripeEmbeddedForm.tsx): Componente React cliente que inicializa o Checkout Form SDK (`stripe.initCheckoutFormSdk`) e renderiza o formulário embutido em `<div id="checkout-form"></div>`.
- [`src/routes/checkout.tsx`](src/routes/checkout.tsx): Página de checkout segura acessada pelos leads para pagamento via cartão / Apple Pay / Google Pay.
- [`src/routes/__root.tsx`](src/routes/__root.tsx): Injeção do script Dahlia (`https://js.stripe.com/dahlia/stripe.js`) diretamente no `<head>`.

### 3. How the Integration Works (Flow Overview)
1. **Lead Seleciona Plano no Telegram:** Quando o lead clica em um plano em moeda internacional (USD, EUR, GBP) no Telegram, o bot gera a mensagem com o botão direto de pagamento com cartão via Stripe.
2. **Página de Checkout Embutida:** O link direciona para `https://telabot-studio.vercel.app/checkout`, carregando o script oficial Dahlia e o formulário embutido da Stripe.
3. **Criação da Sessão:** O frontend requisita `/api/create-checkout-session`, que cria a sessão com `ui_mode: "form"`, `integration_identifier: "custom_embedded_web_0001"` e os parâmetros configurados.
4. **Confirmação e Webhook:** Quando o pagamento é confirmado, a Stripe dispara `checkout.session.completed` para `/api/webhook`, confirmando o pagamento e entregando o acesso VIP instantaneamente.

### 4. Testing Credit Card Numbers (Test Mode)
Use the official Stripe test cards in test mode (`pk_test_...` / `sk_test_...`):

| Card Brand | Card Number | Expiration | CVC |
|------------|-------------|------------|-----|
| Visa (Success) | `4242 4242 4242 4242` | Any future date | Any 3 digits |
| Mastercard (Success) | `5555 5555 5555 4444` | Any future date | Any 3 digits |
| Requires 3D Secure | `4000 0027 6000 3184` | Any future date | Any 3 digits |
| Card Declined | `4000 0000 0000 0002` | Any future date | Any 3 digits |

### 5. Next Steps
1. Adicione seus Price IDs reais do Stripe Dashboard em `src/routes/api/create-checkout-session.ts`.
2. Configure o Webhook no Stripe Workbench apontando para:
   `https://telabot-studio.vercel.app/api/webhook`
   e selecione o evento `checkout.session.completed`.
3. Obtenha o `whsec_...` gerado e adicione na variável `STRIPE_WEBHOOK_SECRET` na Vercel.

### 6. Official Resources
- Stripe Documentation & Support: https://support.stripe.com
- Stripe Developer MCP Tools: https://docs.stripe.com/mcp
