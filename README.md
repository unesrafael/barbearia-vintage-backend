# Barbearia Vintage — API

Backend do sistema interno de agendamentos da Barbearia Vintage.
Node + Express + PostgreSQL, com automação de e-mail no n8n.

Frontend: [`barbearia-vintage-web`](../barbearia-vintage-web) · React + Vite.

---

## O que o sistema faz

O Marcelo controlava a agenda num caderno físico, dividido com um funcionário.
Isso gerava horários duplicados, esquecimentos e nenhuma visão de quantos
atendimentos foram feitos. Este sistema resolve exatamente esses três pontos:

| Dor da carta | Como está resolvido |
| --- | --- |
| Acesso precisa ser restrito | Login com senha em `bcrypt` + JWT. Nenhuma rota de dados responde sem token. |
| Cadastro de clientes | CRUD completo com nome, e-mail, telefone e observações gerais. |
| Agendamentos com status | CRUD completo + troca de status em um clique (`PATCH /appointments/:id/status`). |
| Agenda por data e horário | `GET /appointments?date=` devolve o dia ordenado por horário. |
| **Horários duplicados** | Índice único parcial no Postgres. O banco recusa, a API devolve `409` com mensagem em português. |
| "Quantos atendimentos e quais serviços" | `GET /appointments/summary` com totais por status, faturamento e ranking de serviços. |
| Confirmação por e-mail | O `POST /appointments` dispara um webhook para o n8n, que analisa o agendamento e envia o e-mail. |

---

## Rodando em 5 comandos

Pré-requisitos: **Node 18+** e **Docker** (ou um Postgres 14+ já disponível).

```bash
git clone <url-deste-repositorio> barbearia-vintage-api
cd barbearia-vintage-api
cp .env.example .env          # os valores padrão já funcionam com o docker-compose
docker compose up -d          # sobe o Postgres na porta 5432
npm install
npm run setup                 # aplica as migrations e popula o banco
npm run dev                   # http://localhost:3333
```

Confira com:

```bash
curl http://localhost:3333/health
```

### Acesso de teste

Criado pelo `npm run seed`:

```
e-mail: marcelo@barbeariavintage.com
senha:  vintage123
```

(o segundo funcionário é `douglas@barbeariavintage.com`, mesma senha)

O seed cria 2 funcionários, 5 serviços, 8 clientes e 20 agendamentos
distribuídos de três dias atrás até três dias à frente — a agenda já abre com
conteúdo real, incluindo atendimentos concluídos, um cancelado e um "não compareceu".

### Sem Docker

Crie o banco na mão e ajuste o `DATABASE_URL` no `.env`:

```bash
createdb barbearia
# DATABASE_URL=postgresql://usuario:senha@localhost:5432/barbearia
npm run setup
```

---

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe a API com recarga automática (nodemon). |
| `npm start` | Sobe a API em modo produção. |
| `npm run migrate` | Aplica as migrations SQL pendentes de `db/migrations`. |
| `npm run seed` | Limpa e repopula o banco com os dados de demonstração. |
| `npm run setup` | `migrate` + `seed`. |
| `npm run test:api` | Teste de integração de ponta a ponta contra o Postgres real. |

---

## Testes

`npm run test:api` sobe a API numa porta livre, sobe um **n8n falso** e exercita
o fluxo inteiro — incluindo a prova de que o webhook da automação dispara com o
payload correto:

```
✔ rota protegida recusa acesso sem token
✔ login com senha errada não vaza informação
✔ login válido devolve token e usuário
✔ /auth/me confirma a sessão
✔ cadastro de cliente valida o e-mail
✔ cria, busca, edita e lista cliente
✔ cria serviço
✔ cria agendamento e dispara a automação
✔ horário duplicado é recusado com 409
✔ a agenda do dia vem ordenada por horário
✔ troca de status em um clique
✔ status inválido é recusado
✔ cancelar libera o horário para um novo agendamento
✔ cliente com horário futuro não pode ser removido
✔ resumo do período conta atendimentos e ranking de serviços
✔ id inexistente devolve 404 e id malformado devolve 422
```

O teste limpa o que cria. Rode `npm run seed` depois se quiser o banco no estado original.

---

## Modelo de dados

Quatro tabelas cobrem todo o escopo. O DDL comentado está em
[`db/migrations/001_init.sql`](db/migrations/001_init.sql).

```
users                clients              services
├ id (uuid)          ├ id (uuid)          ├ id (uuid)
├ name               ├ name               ├ name
├ email (unique)     ├ email              ├ duration_min
├ password_hash      ├ phone              ├ price_cents
└ created_at         ├ notes              └ active
                     └ created/updated_at

                 appointments
                 ├ id (uuid)
                 ├ starts_at (timestamptz, SEMPRE UTC)
                 ├ status (enum: AGENDADO | CONCLUIDO | CANCELADO | NAO_COMPARECEU)
                 ├ notes
                 ├ client_id      ──→ clients
                 ├ service_id     ──→ services
                 ├ created_by_id  ──→ users
                 └ created/updated_at
```

### A regra que resolve a dor principal

Horário duplicado não é validado só no código — é impossível no banco:

```sql
CREATE UNIQUE INDEX uniq_horario_ativo
  ON appointments (starts_at)
  WHERE status IN ('AGENDADO', 'CONCLUIDO');
```

O `WHERE` é o detalhe que importa: um horário **cancelado** ou **não comparecido**
volta a ficar livre automaticamente. A API traduz a violação `23505` em
`409 HORARIO_OCUPADO`, e o frontend mostra a mensagem colada no campo de horário.

### Fuso horário

O banco guarda tudo em **UTC** (`timestamptz`). A conversão para
`America/Sao_Paulo` acontece apenas na borda:

- ao **receber** `date` + `time` do formulário (`zonedToUtc` em `src/lib/datetime.js`);
- ao **exibir**, no campo `when` de cada agendamento;
- ao **formatar** o e-mail, no nó de análise do n8n.

Nenhuma parte do sistema depende do fuso do servidor ou do navegador — é por isso
que o frontend também lê `VITE_TIMEZONE` em vez de usar o relógio da máquina.

---

## Endpoints

Base: `http://localhost:3333`. Tudo abaixo de `/auth` exige `Authorization: Bearer <token>`.

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | Status da API (não exige token). |
| `POST` | `/auth/login` | `{ email, password }` → `{ token, user }`. |
| `GET` | `/auth/me` | Valida o token guardado no navegador. |
| `GET` | `/clients` | Lista clientes. `?q=` busca por nome, e-mail ou telefone. |
| `POST` | `/clients` | Cadastra cliente. |
| `GET` | `/clients/:id` | Ficha do cliente + histórico de agendamentos. |
| `PUT` | `/clients/:id` | Edita cliente. |
| `DELETE` | `/clients/:id` | Remove. Recusa com `409` se houver horário futuro marcado. |
| `GET` | `/services` | Serviços ativos. `?includeInactive=true` traz todos. |
| `POST` | `/services` | Cadastra serviço. |
| `GET` | `/services/:id` | Detalhe. |
| `PUT` | `/services/:id` | Edita ou ativa/desativa. |
| `DELETE` | `/services/:id` | Remove; se já tiver histórico, apenas desativa (`200`). |
| `GET` | `/appointments` | Agenda. `?date=` (um dia), `?from=&to=` (intervalo), `?status=`, `?clientId=`. |
| `GET` | `/appointments/summary` | `?from=&to=` — totais por status, faturamento e ranking de serviços. |
| `POST` | `/appointments` | Cria **e dispara a automação do n8n**. |
| `GET` | `/appointments/:id` | Detalhe. |
| `PUT` | `/appointments/:id` | Edita data, horário, serviço, cliente ou status. |
| `PATCH` | `/appointments/:id/status` | Troca só o status. |
| `DELETE` | `/appointments/:id` | Remove. |

Exemplos prontos para executar estão em [`requests.http`](requests.http)
(REST Client do VS Code, ou copie os `curl` do arquivo).

### Formato dos erros

Sempre o mesmo envelope — o frontend só repassa `message` para a tela:

```json
{
  "error": {
    "code": "HORARIO_OCUPADO",
    "message": "Já existe um agendamento neste horário. Escolha outro.",
    "details": []
  }
}
```

| Código HTTP | Quando |
| --- | --- |
| `401` | Sem token, token inválido ou senha errada. |
| `404` | Id válido que não existe. |
| `409` | Horário ocupado, cliente com agendamento futuro, registro em uso. |
| `422` | Corpo ou parâmetro inválido — `details` traz `field` + `message` por campo. |

---

## A automação (n8n)

Os workflows exportados estão em [`n8n/`](n8n/) — importe os dois JSONs no seu n8n.
O passo a passo completo, incluindo a configuração do SMTP, está em
[`n8n/README.md`](n8n/README.md).

```
POST /appointments
      │
      ├─ grava no banco, responde 201 ao usuário   ← nunca espera o n8n
      │
      └─ POST no webhook do n8n (assíncrono, timeout 5s)
             │
             ├─ [IF] o header X-Webhook-Secret confere?
             │        └─ não → descarta
             │
             ├─ [Code] analisa: data por extenso, preço, antecedência, assunto
             │
             ├─ [IF] é a primeira visita do cliente?
             │        ├─ sim → e-mail de boas-vindas (endereço, orientações)
             │        └─ não → e-mail de confirmação
             │
             └─ [Error Trigger] em outro workflow: avisa o Marcelo se o envio falhar
```

Se `N8N_WEBHOOK_URL` estiver vazio no `.env`, o sistema roda normalmente e o
disparo aparece apenas no log — o agendamento nunca falha por causa da automação.

---

## Variáveis de ambiente

Todas documentadas em [`.env.example`](.env.example).

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `PORT` | não | Porta da API (padrão `3333`). |
| `DATABASE_URL` | **sim** | String de conexão do Postgres. |
| `JWT_SECRET` | **sim** | Chave de assinatura do token. Troque antes de subir para produção. |
| `JWT_EXPIRES_IN` | não | Validade do token (padrão `8h`). |
| `CORS_ORIGIN` | não | Origem do frontend; separe por vírgula para várias. |
| `TIMEZONE` | não | Fuso da barbearia (padrão `America/Sao_Paulo`). |
| `N8N_WEBHOOK_URL` | não | URL do webhook. Vazio desliga a automação sem quebrar nada. |
| `N8N_WEBHOOK_SECRET` | não | Header compartilhado com o nó IF do n8n. |
| `BUSINESS_WHATSAPP` / `BUSINESS_ADDRESS` | não | Aparecem no rodapé do e-mail ao cliente. |

Gere uma chave decente com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Estrutura

```
src/
├── server.js              ponto de entrada, conexão e shutdown limpo
├── app.js                 montagem do Express e das rotas
├── config/env.js          leitura e validação das variáveis de ambiente
├── db/
│   ├── index.js           pool do Postgres e helper de transação
│   ├── migrate.js         runner de migrations
│   └── seed.js            dados de demonstração
├── lib/
│   ├── ApiError.js        erros de aplicação com código e mensagem
│   ├── datetime.js        toda a lógica de fuso horário
│   ├── n8n.js             disparo da automação
│   └── validate.js        middlewares de validação (zod)
├── middleware/
│   ├── auth.js            JWT
│   └── errorHandler.js    envelope único de erro
├── routes/                uma rota por recurso
└── services/              regras de negócio e acesso ao banco

db/migrations/             SQL versionado
n8n/                       workflows exportados
tests/api.test.js          teste de integração
```

Decisão consciente: **acesso ao banco em SQL puro com `pg`**, sem ORM. São quatro
tabelas, o índice único parcial é uma feature específica do Postgres, e ler o
`001_init.sql` mostra o modelo inteiro numa tela — sem camada de tradução no meio.

---

## Deploy

Roda em qualquer lugar com Node 18+ e um Postgres acessível.

- **Banco**: [Neon](https://neon.tech) ou [Supabase](https://supabase.com) no plano gratuito.
  Adicione `?sslmode=require` ao `DATABASE_URL` — o pool ativa TLS sozinho quando vê isso.
- **API**: [Render](https://render.com) ou [Railway](https://railway.app).
  Build `npm install`, start `npm start`, e rode `npm run migrate` uma vez.
- **CORS**: aponte `CORS_ORIGIN` para a URL do frontend publicado.
- **n8n**: n8n Cloud ou um container próprio; atualize `N8N_WEBHOOK_URL`.
