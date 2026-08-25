import { env } from '../config/env.js';
import { describeInstant, formatBRL } from './datetime.js';

/**
 * Disparo da automação.
 *
 * Regras de ouro:
 *  1. Nunca bloqueia a resposta ao usuário. O agendamento já foi gravado;
 *     se o n8n estiver fora do ar, o sistema continua funcionando.
 *  2. Timeout curto e erro apenas registrado no log.
 *  3. Header compartilhado para o webhook não ficar aberto ao mundo.
 */
export async function notifyAppointmentCreated(appointment, context = {}) {
  const when = describeInstant(new Date(appointment.startsAt));

  const payload = {
    event: 'appointment.created',
    sentAt: new Date().toISOString(),
    appointment: {
      id: appointment.id,
      status: appointment.status,
      notes: appointment.notes ?? null,
      startsAtUtc: when.utc,
      timeZone: when.timeZone,
      date: when.date,
      time: when.time,
      weekday: when.weekday,
      dateLong: when.dateLong,
    },
    client: {
      id: appointment.client.id,
      name: appointment.client.name,
      email: appointment.client.email,
      phone: appointment.client.phone ?? null,
    },
    service: {
      id: appointment.service.id,
      name: appointment.service.name,
      durationMin: appointment.service.durationMin,
      priceCents: appointment.service.priceCents,
      priceFormatted: formatBRL(appointment.service.priceCents),
    },
    // Material para o no de decisao do n8n analisar.
    analysis: {
      isFirstVisit: context.previousAppointments === 0,
      previousAppointments: context.previousAppointments ?? 0,
      hoursUntilAppointment: Math.round(
        (new Date(appointment.startsAt).getTime() - Date.now()) / 3_600_000
      ),
    },
    business: {
      name: 'Barbearia Vintage',
      whatsapp: process.env.BUSINESS_WHATSAPP ?? '(11) 90000-0000',
      address: process.env.BUSINESS_ADDRESS ?? 'Rua das Palmeiras, 120 - São Paulo/SP',
    },
  };

  if (!env.n8n.webhookUrl) {
    console.info(
      '[n8n] N8N_WEBHOOK_URL não configurada — disparo ignorado para o agendamento %s',
      appointment.id
    );
    return { delivered: false, reason: 'webhook_nao_configurado' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.n8n.timeoutMs);

  try {
    const response = await fetch(env.n8n.webhookUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': env.n8n.secret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn('[n8n] webhook respondeu %s para %s', response.status, appointment.id);
      return { delivered: false, reason: `http_${response.status}` };
    }

    console.info('[n8n] agendamento %s enviado para a automação', appointment.id);
    return { delivered: true };
  } catch (error) {
    console.warn('[n8n] automação indisponível (%s) — agendamento %s segue válido',
      error.name === 'AbortError' ? 'timeout' : error.message,
      appointment.id
    );
    return { delivered: false, reason: 'indisponível' };
  } finally {
    clearTimeout(timer);
  }
}
