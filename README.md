# BotFlow Pro

Você é um Arquiteto de Software Sênior, Product Manager, UX Designer e Desenvolvedor Full Stack especialista em SaaS.

Seu trabalho é construir um sistema web completo chamado SHARKBOT LITE.

IMPORTANTE:

Antes de gerar qualquer código, crie o planejamento completo do projeto.

Defina arquitetura, banco de dados, páginas, componentes, permissões e fluxo do usuário.

Utilize boas práticas de escalabilidade.

Não implemente funcionalidades desnecessárias.

Foque em um MVP funcional.

O sistema deve parecer um produto SaaS profissional.

Interface moderna estilo Stripe, Notion, Linear e Vercel.

Tema dark por padrão.

Design premium e responsivo.

OBJETIVO DO SISTEMA

Criar uma plataforma para gerenciamento de bots Telegram que permita:

Criar conta

Fazer login

Cadastrar bots Telegram

Criar fluxos simples

Capturar leads

Gerenciar pagamentos

Entregar produtos automaticamente após pagamento

TECNOLOGIAS

Frontend:

Next.js

TypeScript

Tailwind CSS

Shadcn/UI

Backend:

Supabase

Banco:

PostgreSQL

Autenticação:

Supabase Auth

Hospedagem:

Vercel

ESTRUTURA DO SISTEMA

MENU LATERAL:

Dashboard

Bots

Fluxos

Leads

Pagamentos

Configurações

Admin

MÓDULO DASHBOARD

Exibir:

Total de bots

Leads capturados hoje

Pagamentos aprovados

Receita total

Adicionar:

Gráfico de atividade

Últimos eventos

MÓDULO BOTS

Funções:

Criar bot

Editar bot

Excluir bot

Ativar bot

Desativar bot

Campos:

Nome

Token Telegram

Status

Data de criação

Validar token automaticamente.

MÓDULO FLUXOS

Não utilizar drag and drop.

Criar fluxo baseado em etapas.

Tipos de etapa:

Mensagem

Imagem

Botão

Delay

Pagamento

Entrega

Fluxo exemplo:

Mensagem Inicial

↓

Botão Comprar

↓

Pagamento

↓

Confirmação

↓

Entrega

MÓDULO LEADS

Exibir:

Nome

Telegram ID

Usuário Telegram

Bot origem

Data de entrada

Filtros:

Data

Bot

Status

MÓDULO PAGAMENTOS

Criar estrutura para:

PIX

Status do pagamento

Data

Valor

Usuário

Preparar para integração futura com gateway.

Não implementar gateway ainda.

Apenas estrutura.

MÓDULO CONFIGURAÇÕES

Permitir:

Alterar nome

Alterar email

Alterar senha

Foto de perfil

MÓDULO ADMIN

Apenas para administradores.

Visualizar:

Usuários

Bots

Leads

Pagamentos

Logs

BANCO DE DADOS

Crie todas as tabelas necessárias.

Forneça:

Estrutura SQL completa

Relacionamentos

Índices

Chaves estrangeiras

SEGURANÇA

Implementar:

Controle de acesso por usuário

Proteção de rotas

Validação de formulários

Boas práticas de autenticação

ENTREGA

Primeiro:

Arquitetura completa

Estrutura de pastas

Banco de dados

Fluxo das páginas

Somente depois iniciar a implementação.

Nunca avance para o próximo módulo sem finalizar corretamente o módulo atual.

Ao final, forneça um checklist completo do MVP.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://telabot-studio.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bc07337f-068d-4ee7-a47b-447c0c8aa62c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
