# Automação — n8n

Dois workflows, exportados como JSON e prontos para importar.

| Arquivo | O que faz |
| --- | --- |
| `01-agendamento-criado.json` | Recebe o webhook do backend, analisa o agendamento e envia o e-mail ao cliente. |
| `02-falha-na-automacao.json` | Workflow de erro: avisa o Marcelo se o envio falhar. |

---

## Instalação

### 1. Subir o n8n

Use o n8n Cloud (tem trial) ou um container local:

```bash
docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Acesse `http://localhost:5678`.

### 2. Importar os workflows

Em cada arquivo: **Workflows → ⋯ → Import from File**.

### 3. Configurar a credencial de SMTP

Em **Credentials → New → SMTP**, com o nome `SMTP Barbearia Vintage`.

Com Gmail (o caminho mais rápido para o case):

1. Ative a verificação em duas etapas na conta Google.
2. Gere uma **senha de app** em <https://myaccount.google.com/apppasswords>.
3. Preencha: host `smtp.gmail.com`, porta `465`, SSL/TLS ligado, usuário = seu
   e-mail, senha = a senha de app (16 caracteres, sem espaços).

Depois abra os nós **E-mail de boas-vindas**, **E-mail de confirmação** e
**Avisar o Marcelo**, e selecione a credencial em cada um. Ajuste também o campo
`From Email` — vários provedores recusam remetente diferente do usuário autenticado.

> Alternativa sem Gmail: [Resend](https://resend.com) ou [Brevo](https://brevo.com)
> dão SMTP gratuito e entregam melhor em caixa de entrada.

### 4. Acertar o segredo do webhook

O nó **Segredo confere?** compara o header `X-Webhook-Secret` com o texto
`TROQUE-ESTE-SEGREDO`. Troque nos dois lados pelo mesmo valor:

```bash
# .env do backend
N8N_WEBHOOK_SECRET=um-valor-longo-e-aleatorio
```

Sem isso, qualquer pessoa com a URL do webhook consegue disparar e-mails em nome
da barbearia.

### 5. Ligar o workflow de erro

No workflow principal: **Settings → Error Workflow → Barbearia Vintage — Falha na automação**.

### 6. Apontar o backend para o webhook

Ative o workflow (chave **Active** no topo), copie a **Production URL** do nó de
webhook e coloque no `.env` do backend:

```bash
N8N_WEBHOOK_URL=https://SEU-N8N/webhook/agendamento-criado
```

Reinicie a API. Ao subir, ela informa `n8n: configurado`.

---

## Testando

Crie um agendamento pela interface (ou pelo `curl` abaixo) usando um cliente com
um e-mail que você consiga abrir. O e-mail deve chegar em segundos.

```bash
TOKEN=$(curl -s localhost:3333/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"marcelo@barbeariavintage.com","password":"vintage123"}' | jq -r .token)

curl -s localhost:3333/appointments -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"<id>","serviceId":"<id>","date":"2026-09-10","time":"15:00"}'
```

Se não chegar, olhe em **Executions** no n8n: o erro quase sempre é credencial de
SMTP ou porta bloqueada.

---

## Como o workflow funciona

```
Webhook (POST /webhook/agendamento-criado)
   │  responde na hora — o backend não fica esperando
   ▼
Segredo confere?                      ── não ──▶  Recusar chamada
   │ sim
   ▼
Analisar agendamento  (nó Code)
   │  converte o horário para linguagem de gente:
   │  "quinta-feira, 12 de junho de 2031, às 16h00"
   │  monta preço em reais, antecedência e assunto do e-mail
   ▼
Cliente novo?
   ├── sim ──▶ E-mail de boas-vindas   (endereço, o que esperar da primeira visita)
   └── não ──▶ E-mail de confirmação   (resumo curto + como remarcar)
```

O nó **Analisar agendamento** é o que atende ao pedido da carta — "a automação
deverá analisar suas informações e enviar um e-mail" — literalmente: ele lê o
agendamento, deriva informação nova dele e é o que alimenta a decisão do IF
seguinte. Sem essa ramificação, seria só um disparo de e-mail.

---

## O payload que o backend envia

```json
{
  "event": "appointment.created",
  "sentAt": "2026-08-25T01:42:00.000Z",
  "appointment": {
    "id": "uuid",
    "status": "AGENDADO",
    "notes": null,
    "startsAtUtc": "2031-06-12T19:00:00.000Z",
    "timeZone": "America/Sao_Paulo",
    "date": "2031-06-12",
    "time": "16:00",
    "weekday": "quinta-feira",
    "dateLong": "12 de junho de 2031"
  },
  "client":  { "id": "uuid", "name": "Otávio Prado", "email": "otavio@exemplo.com", "phone": null },
  "service": { "id": "uuid", "name": "Corte + barba", "durationMin": 60,
               "priceCents": 7500, "priceFormatted": "R$ 75,00" },
  "analysis": {
    "isFirstVisit": true,
    "previousAppointments": 0,
    "hoursUntilAppointment": 42
  },
  "business": {
    "name": "Barbearia Vintage",
    "whatsapp": "(11) 90000-0000",
    "address": "Rua das Palmeiras, 120 - São Paulo/SP"
  }
}
```

O horário já vem convertido para o fuso da barbearia em `date`/`time`/`weekday`,
com o instante em UTC preservado em `startsAtUtc`. O nó Code não precisa fazer
nenhuma conta de fuso.

---

## Personalizando o e-mail

O HTML está dentro dos nós **E-mail de boas-vindas** e **E-mail de confirmação**,
com estilos inline (clientes de e-mail ignoram `<style>`). As expressões
`{{ $json.computed.* }}` vêm do nó de análise — abra-o para ver ou acrescentar
campos.

Endereço e WhatsApp não estão no HTML: vêm do payload, controlados por
`BUSINESS_ADDRESS` e `BUSINESS_WHATSAPP` no `.env` do backend.
