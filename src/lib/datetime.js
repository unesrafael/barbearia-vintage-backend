/**
 * Regra do projeto: o banco guarda SEMPRE em UTC (timestamptz).
 * A conversao para o fuso da barbearia acontece apenas na borda —
 * ao receber "data + horário" do formulario e ao formatar para exibicao.
 *
 * Sem dependencia externa: Intl resolve o fuso corretamente, inclusive
 * se um dia o horário de verao voltar.
 */
import { env } from '../config/env.js';

const TZ = env.timezone;

/** Deslocamento (ms) do fuso em relacao ao UTC para um instante especifico. */
function offsetMsAt(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(
    dtf.formatToParts(instant).map(({ type, value }) => [type, value])
  );
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  );
  return asUtc - instant.getTime();
}

/**
 * "2026-08-27" + "14:30" (hora da barbearia) -> Date em UTC.
 */
export function zonedToUtc(dateStr, timeStr, timeZone = TZ) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Duas passadas resolvem corretamente as bordas de horário de verao.
  let utcMs = naive - offsetMsAt(new Date(naive), timeZone);
  utcMs = naive - offsetMsAt(new Date(utcMs), timeZone);
  return new Date(utcMs);
}

/** Soma dias a uma data no formato YYYY-MM-DD, sem envolver fuso. */
export function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/** Intervalo [inicio, fim) em UTC que cobre um dia inteiro no fuso local. */
export function dayRangeUtc(dateStr, timeZone = TZ) {
  return {
    start: zonedToUtc(dateStr, '00:00', timeZone),
    end: zonedToUtc(addDays(dateStr, 1), '00:00', timeZone),
  };
}

/** Intervalo [inicio, fim) cobrindo de `from` ate o fim de `to`, inclusive. */
export function rangeUtc(from, to, timeZone = TZ) {
  return {
    start: zonedToUtc(from, '00:00', timeZone),
    end: zonedToUtc(addDays(to, 1), '00:00', timeZone),
  };
}

const partsOf = (date, timeZone) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value])
  );

/**
 * Tudo que a interface e o e-mail precisam saber sobre um horário,
 * já no fuso da barbearia.
 */
export function describeInstant(date, timeZone = TZ) {
  const p = partsOf(date, timeZone);
  const fmt = (options) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone, ...options }).format(date);

  return {
    utc: date.toISOString(),
    date: `${p.year}-${p.month}-${p.day}`,          // 2026-08-27
    time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, // 14:30
    weekday: fmt({ weekday: 'long' }),               // quinta-feira
    weekdayShort: fmt({ weekday: 'short' }),         // qui.
    dateShort: fmt({ day: '2-digit', month: '2-digit' }), // 27/08
    dateLong: fmt({ day: 'numeric', month: 'long', year: 'numeric' }), // 27 de agosto de 2026
    timeZone,
  };
}

/** Data de hoje (YYYY-MM-DD) no fuso da barbearia. */
export function todayInTz(timeZone = TZ) {
  const p = partsOf(new Date(), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
