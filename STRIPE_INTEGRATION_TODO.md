# Stripe Integration Guide & Next Steps

This document serves as the single source of truth for completing and managing the Stripe Checkout integration on CASH BOT.

---

## 🚀 Status da Integração

A integração do Stripe Checkout agora conta com gerenciamento completo e automatizado diretamente pelo **Painel CASH BOT**, permitindo configurar credenciais, adicionar planos com preços internacionais e aceitar pagamentos com cartão via Telegram.

### Parâmetros Obrigatórios (Fixed by UI)
Configurados e validados no backend conforme as especificações de Checkout:

| Parâmetro | Valor Configurado |
|-----------|-------------------|
| `ui_mode` | `form` |
| `billing_address_collection` | `auto` |
| `phone_number_collection` | `{"enabled": false}` |
| `automatic_tax` | `{"enabled": false}` |
| `submit_type` | `auto` |
| `integration_identifier` | `custom_embedded_web_0001` |
| `payment_method_collection` | `always` (incluído dinamicamente quando `mode === "subscription"`) |

---

## 🛠️ Como Utilizar pelo Painel CASH BOT (Passo a Passo)

### 1. Conectar suas Chaves no Painel de Gateways
1. Acesse o painel web em **Gateways** (`/app/gateways`).
2. Localize o novo card **Stripe Payments**.
3. Insira suas credenciais da Stripe:
   - **Publishable Key**: `pk_live_...` (ou `pk_test_...` para testes).
   - **Secret Key**: `sk_live_...` (ou `sk_test_...`).
   - **Webhook Secret** *(opcional)*: `whsec_...`.
4. Clique em **Salvar Credenciais Stripe**. O sistema testará a chave em tempo real contra a API da Stripe e exibirá a confirmação.
5. Copie a **URL do Webhook** exibida no card:
   `https://telabot-studio.vercel.app/api/webhook`
6. No Stripe Dashboard, acesse **Workbench > Webhooks**, adicione essa URL e selecione o evento `checkout.session.completed`.

---

### 2. Configurar e Adicionar Planos no Editor de Fluxo
1. Acesse **Fluxos** e abra seu fluxo no modo simples (`/app/flows/[id]/simple`).
2. Clique na aba **Planos**.
3. Em qualquer plano existente ou ao clicar em **Adicionar Plano**, você verá os novos campos:
   - **Preço em Dólares ($ USD)**
   - **Preço em Euros (€ EUR)**
   - **Preço em Libras (£ GBP)**
   - **Tipo de Cobrança Stripe**: *Pagamento Único* (`payment`) ou *Assinatura Recorrente* (`subscription`).
   - **Price ID Stripe (Opcional)**: caso queira usar um preço existente cadastrado no Stripe Dashboard (`price_...`). Se deixar em branco, o valor é gerado dinamicamente de forma 100% automática!
4. No lado direito, utilize o novo seletor de moedas do **Live Preview** (`🇧🇷 BRL`, `🇺🇸 USD`, `🇪🇺 EUR`, `🇬🇧 GBP`) para ver exatamente como os botões aparecerão para o lead no Telegram.
5. Clique em **Salvar Fluxo**.

---

### 3. Experiência do Lead no Telegram
1. O lead entra no bot e seleciona o idioma **English** ou a moeda **USD / EUR / GBP**.
2. Os botões de planos são atualizados instantaneamente na mensagem com os valores em dólar, euro ou libra configurados no plano.
3. Ao tocar no plano, o bot envia a mensagem de checkout com o botão:
   `💳 Pay $ XX.XX with Card (Stripe) ↗`
4. O link abre a tela segura `/checkout` com o formulário embutido Dahlia da Stripe no tema escuro do CASH BOT.
5. Ao pagar com cartão de crédito, Apple Pay ou Google Pay, a Stripe confirma a transação.
6. O webhook `/api/webhook` processa a confirmação, registra a venda paga, toca o som de caixa registradora no painel, envia notificação Push e entrega o acesso ao canal VIP no Telegram!

---

## 💳 Cartões de Teste Oficiais (Modo Teste)

Quando estiver utilizando chaves de teste (`pk_test_...` e `sk_test_...`):

| Cartão | Número | Validade | CVC |
|--------|--------|----------|-----|
| Visa (Aprovado) | `4242 4242 4242 4242` | Qualquer data futura | 123 |
| Mastercard (Aprovado) | `5555 5555 5555 4444` | Qualquer data futura | 123 |
| Requer 3D Secure | `4000 0027 6000 3184` | Qualquer data futura | 123 |
| Cartão Recusado | `4000 0000 0000 0002` | Qualquer data futura | 123 |

---

## 📁 Arquivos da Integração
- [`src/lib/stripe.server.ts`](src/lib/stripe.server.ts): SDK Stripe versão `2026-03-25.dahlia` com suporte a chaves por usuário e globais.
- [`src/routes/api/create-checkout-session.ts`](src/routes/api/create-checkout-session.ts): Endpoint que cria a sessão com todos os parâmetros do Field Intents e preços dinâmicos.
- [`src/routes/api/webhook.ts`](src/routes/api/webhook.ts): Endpoint de Webhook que confirma pagamentos e entrega o acesso Telegram via `approvePayment`.
- [`src/lib/user-gateway.functions.ts`](src/lib/user-gateway.functions.ts): Funções de servidor para gerenciar e testar as credenciais Stripe do usuário.
- [`src/components/app/UserStripeCard.tsx`](src/components/app/UserStripeCard.tsx): Card no painel de gateways para salvar, testar e desconectar a Stripe.
- [`src/routes/_authenticated/app.gateways.tsx`](src/routes/_authenticated/app.gateways.tsx): Página de gateways exibindo a configuração da Stripe.
- [`src/routes/_authenticated/app.flows.$flowId_.simple.tsx`](src/routes/_authenticated/app.flows.$flowId_.simple.tsx): Aba Planos com campos internacionais, Stripe Mode, Price ID e Live Preview multimoeda.
- [`src/routes/checkout.tsx`](src/routes/checkout.tsx): Rota de checkout embutida para os leads.
- [`src/components/checkout/StripeEmbeddedForm.tsx`](src/components/checkout/StripeEmbeddedForm.tsx): Formulário oficial Dahlia integrado com confirmação automática.
