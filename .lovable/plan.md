## AURUMBOT — Arquitetura e Plano do MVP

### Observação sobre stack
Esta plataforma roda **TanStack Start (React 19 + TypeScript + Vite)**, não Next.js — o resultado é equivalente (SSR, rotas por arquivo, server functions) e a UI/Tailwind/shadcn é idêntica. Backend, banco e auth via **Lovable Cloud** (Postgres + Auth + Storage gerenciados, sem conta externa). Hospedagem pela própria plataforma (publicação em 1 clique).

---

### 1. Identidade visual
Dark por padrão, estilo Linear/Vercel: fundo quase-preto em camadas, superfícies com borda sutil, acento âmbar-dourado "aurum", tipografia geométrica (títulos) + sans neutra (corpo), raio 10px, sombras discretas, tabelas densas, sem gradientes decorativos. Tokens 100% em `src/styles.css` (oklch).

### 2. Rotas e navegação

```text
/                      landing + CTA (público)
/auth                  login / cadastro (público)
/app  (protegido)      shell com sidebar
  /app/dashboard       métricas + gráfico + eventos
  /app/bots            lista + criar/editar/excluir/ativar
  /app/flows           fluxos por bot
  /app/flows/$id       editor de etapas (lista ordenada, sem drag&drop)
  /app/leads           tabela + filtros (data, bot, status)
  /app/payments        tabela PIX + status
  /app/settings        perfil, email, senha, avatar
  /app/admin           só role=admin: usuários, bots, leads, pagamentos, logs
```

Sidebar colapsável, header com breadcrumb e menu de conta.

### 3. Banco de dados

```text
profiles(id→auth.users, full_name, email, avatar_url, created_at)
user_roles(id, user_id, role: app_role enum[admin,user])   -- tabela separada, has_role() security definer
bots(id, user_id, name, token_encrypted, telegram_username, status[active|inactive],
     created_at, updated_at)
flows(id, user_id, bot_id, name, is_active, created_at)
flow_steps(id, flow_id, position, type[message|image|button|delay|payment|delivery],
           config jsonb, created_at)
leads(id, user_id, bot_id, telegram_id, telegram_username, name,
      status[new|engaged|converted], created_at)
payments(id, user_id, bot_id, lead_id, amount_cents, currency, method[pix],
         status[pending|approved|failed|refunded], external_id, paid_at, created_at)
deliveries(id, payment_id, flow_step_id, status, delivered_at)
activity_logs(id, user_id, entity, entity_id, action, metadata jsonb, created_at)
```

FKs com `on delete cascade`; índices em `user_id`, `bot_id`, `created_at desc`, `(flow_id, position)`, `status`.

### 4. Segurança
- RLS em todas as tabelas: dono acessa via `auth.uid() = user_id`; admin via `has_role(auth.uid(),'admin')`.
- GRANTs explícitos por tabela (authenticated/service_role).
- Papéis **nunca** no profile — só em `user_roles`.
- Rotas protegidas pelo layout `_authenticated`; admin com guarda extra de papel.
- Validação com zod em todos os formulários (client) e nas server functions.
- Token do Telegram nunca exposto ao browser: validado e usado apenas em server function (`getMe` na API do Telegram); UI mostra só os últimos dígitos.

### 5. Ordem de implementação (um módulo por vez)
1. Design system + shell/sidebar + landing + auth (cadastro, login, logout, sessão reativa)
2. Migração completa do banco + RLS + papéis
3. Bots (CRUD + validação real do token)
4. Fluxos (CRUD de fluxo + editor de etapas ordenadas com formulário por tipo)
5. Leads (tabela + filtros)
6. Pagamentos (estrutura PIX, sem gateway)
7. Configurações (perfil, email, senha, avatar no storage)
8. Admin (visões globais + logs)
9. Dashboard com dados reais + gráfico (Recharts) + últimos eventos
10. Checklist final do MVP

### Detalhes técnicos
Server functions (`createServerFn`) para toda leitura/escrita sensível, com middleware de auth; React Query para cache; Recharts para o gráfico; shadcn/ui como base de componentes, customizado pelos tokens. Sem gateway de pagamento, sem webhook do Telegram nesta fase — apenas a estrutura preparada.
