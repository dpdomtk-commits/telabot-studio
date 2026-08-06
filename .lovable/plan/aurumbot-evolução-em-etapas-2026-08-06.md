# AURUMBOT — Evolução em etapas

Escopo enorme: vou entregar em 7 etapas, cada uma funcional e testada, sem remover nada do que já existe (bots, fluxos, mídias, financeiro, gateways, marketplace, admin).

## Etapa 0 — Auditoria e correções
- Varredura de rotas, autenticação, permissões (RLS), integrações (Telegram/SyncPay) e erros de console.
- Correção dos bugs encontrados antes de qualquer feature nova.
- Ajustes de responsividade mobile no layout do app.
- Paleta atualizada: preto premium + rosa/roxo/azul neon (tokens semânticos, sem quebrar componentes).

## Etapa 1 — PIX sob demanda + Split fixo R$ 0,50
- PIX nunca automático: só gerado quando o lead clica no botão do plano.
- Plano com nome, valor, descrição e expiração.
- Envio de QR Code + copia e cola no Telegram.
- Retenção fixa de R$ 0,50 por venda aprovada (percentual removido da lógica de cobrança).
- Painéis: seller vê bruto/líquido/taxas; admin vê receita da plataforma e total de taxas.

## Etapa 2 — Dashboard e Eventos em tempo real
- Cards: Vendas Aprovadas, Taxa de Conversão, Receita Total, Ticket Médio.
- Filtros Hoje / Ontem / 7d / 30d / Tudo, sem refresh.
- Gráficos diários de receita, vendas e conversão.
- Métricas: leads, PIX gerados/pagos/expirados, receita, ticket médio.
- Painel "Últimos eventos" em tempo real, com scroll infinito e filtro por tipo.

## Etapa 3 — Gateway SyncPay por usuário
- Configurações → Gateway de Pagamento com Client ID e Client Secret próprios.
- Botão "Conectar SyncPay" valida credenciais e grava de forma protegida (só o servidor lê).
- Status visível: Conectado / Desconectado / Erro.
- Conta da plataforma continua como fallback.

## Etapa 4 — Fluxos: mídias, ofertas e remarketing
- Até 2 mídias por etapa (imagem, vídeo, GIF), com upload direto, preview, trocar e remover.
- Duplicar etapa e reordenar arrastando.
- Order Bump (até 10), Upsell (até 5, após aprovação), Downsell (até 20, após recusa) — por fluxo, independentes.
- Remarketing por fluxo: intervalos de 3h a 72h, sequência de mensagens, segmentação (não comprou, PIX expirado, abandono, tags) e estatísticas.

## Etapa 5 — Links de Redirect e Central de Conversas
- Redirects: até 10 por usuário, URL curta, registro de clique/data/origem/dispositivo, estatísticas e CRUD completo.
- Inbox: lista de conversas, janela de chat com histórico, envio de texto/imagem/vídeo/áudio/documento, tempo real nos dois sentidos.
- Filtros, busca, tags (inclusive personalizadas), perfil do lead e ações (gerar PIX, tag, bloquear, exportar).

## Etapa 6 — Seller Network e Painel Admin
- Chat da comunidade com canais (#geral, #estrategias, #telegram, #pagamentos, #divulgacao), emojis, menções, respostas e mídias.
- Ranking Top 10 sellers do mês.
- Admin restrito a dpz09@hotmail.com: botão oculto para os demais, bloqueio por URL e registro de tentativas.
- Dashboard admin (plataforma, sellers, bots), gestão de usuários (editar, suspender, reativar, excluir) e gestão financeira com filtros.

## Etapa 7 — Autenticação completa
- Recuperação de senha com link de uso único (30 min) e página de redefinição.
- Confirmação de e-mail, reenvio e bloqueio até confirmar.
- Revisão final: mobile, desktop, tempo real e relatório completo do que foi entregue.

## Notas técnicas
- Novas tabelas: conversas, mensagens, tags de lead, redirects e cliques, remarketing (campanhas, mensagens, envios), ofertas (bump/upsell/downsell), canais e mensagens da comunidade, credenciais de gateway por usuário, logs de acesso admin.
- Tempo real via canais do backend, com assinaturas limpas ao desmontar.
- Toda tabela nova nasce com RLS por dono + permissões de admin.
- Credenciais de gateway só são lidas no servidor; nunca vão para o navegador.
