/**
 * Popula o banco com dados realistas para que quem abrir o sistema
 * pela primeira vez veja uma agenda de verdade, e não telas vazias.
 *
 *   npm run seed
 */
import bcrypt from 'bcryptjs';
import { pool, closePool } from './index.js';
import { zonedToUtc, todayInTz, addDays } from '../lib/datetime.js';

const USERS = [
  { name: 'Marcelo Andrade', email: 'marcelo@barbeariavintage.com', password: 'vintage123' },
  { name: 'Douglas Ferreira', email: 'douglas@barbeariavintage.com', password: 'vintage123' },
];

const SERVICES = [
  { name: 'Corte masculino', durationMin: 30, priceCents: 5000 },
  { name: 'Barba', durationMin: 30, priceCents: 3500 },
  { name: 'Corte + barba', durationMin: 60, priceCents: 7500 },
  { name: 'Acabamento (pezinho)', durationMin: 15, priceCents: 2000 },
  { name: 'Corte infantil', durationMin: 30, priceCents: 4000 },
];

const CLIENTS = [
  { name: 'Joao Pedro Silva',   email: 'joao.silva@exemplo.com',    phone: '(11) 98811-2233', notes: 'Prefere maquina 2 nas laterais.' },
  { name: 'Ricardo Nunes',      email: 'ricardo.nunes@exemplo.com', phone: '(11) 99722-8899', notes: 'Sempre pede barba alinhada.' },
  { name: 'Anderson Lima',      email: 'anderson.lima@exemplo.com', phone: '(11) 97654-1010', notes: null },
  { name: 'Felipe Tanaka',      email: 'felipe.tanaka@exemplo.com', phone: '(11) 96543-7788', notes: 'Alergico a pós-barba com alcool.' },
  { name: 'Bruno Cavalcanti',   email: 'bruno.cavalcanti@exemplo.com', phone: '(11) 95432-4455', notes: 'Costuma atrasar 10 minutos.' },
  { name: 'Vitor Hugo Ramos',   email: 'vitor.ramos@exemplo.com',   phone: '(11) 94321-6677', notes: null },
  { name: 'Sergio Matos',       email: 'sergio.matos@exemplo.com',  phone: '(11) 93210-9900', notes: 'Cliente desde a inauguracao.' },
  { name: 'Caio Bertolucci',    email: 'caio.bertolucci@exemplo.com', phone: '(11) 92109-3344', notes: null },
];

// dia relativo a hoje, horário, indice do cliente, indice do serviço, status
const AGENDA = [
  [-3, '09:00', 0, 0, 'CONCLUIDO'],
  [-3, '10:00', 1, 2, 'CONCLUIDO'],
  [-3, '14:30', 2, 1, 'NAO_COMPARECEU'],
  [-2, '09:30', 3, 0, 'CONCLUIDO'],
  [-2, '11:00', 4, 3, 'CONCLUIDO'],
  [-2, '16:00', 5, 2, 'CANCELADO'],
  [-1, '10:00', 6, 0, 'CONCLUIDO'],
  [-1, '11:30', 0, 1, 'CONCLUIDO'],
  [-1, '15:00', 7, 4, 'CONCLUIDO'],
  [ 0, '09:00', 1, 0, 'CONCLUIDO'],
  [ 0, '10:30', 2, 2, 'AGENDADO'],
  [ 0, '13:00', 3, 1, 'AGENDADO'],
  [ 0, '15:30', 4, 0, 'AGENDADO'],
  [ 0, '17:00', 5, 3, 'AGENDADO'],
  [ 1, '09:30', 6, 2, 'AGENDADO'],
  [ 1, '11:00', 7, 0, 'AGENDADO'],
  [ 1, '14:00', 0, 1, 'AGENDADO'],
  [ 2, '10:00', 2, 0, 'AGENDADO'],
  [ 2, '16:30', 3, 2, 'AGENDADO'],
  [ 3, '09:00', 5, 4, 'AGENDADO'],
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Recomeca do zero: o seed e idempotente.
    await client.query('TRUNCATE appointments, clients, services, users RESTART IDENTITY CASCADE');

    const userIds = [];
    for (const user of USERS) {
      const hash = await bcrypt.hash(user.password, 10);
      const { rows } = await client.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [user.name, user.email, hash]
      );
      userIds.push(rows[0].id);
    }

    const serviceIds = [];
    for (const service of SERVICES) {
      const { rows } = await client.query(
        `INSERT INTO services (name, duration_min, price_cents)
         VALUES ($1, $2, $3) RETURNING id`,
        [service.name, service.durationMin, service.priceCents]
      );
      serviceIds.push(rows[0].id);
    }

    const clientIds = [];
    for (const person of CLIENTS) {
      const { rows } = await client.query(
        `INSERT INTO clients (name, email, phone, notes)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [person.name, person.email, person.phone, person.notes]
      );
      clientIds.push(rows[0].id);
    }

    const today = todayInTz();
    for (const [offset, time, clientIdx, serviceIdx, status] of AGENDA) {
      const startsAt = zonedToUtc(addDays(today, offset), time);
      await client.query(
        `INSERT INTO appointments (starts_at, status, client_id, service_id, created_by_id)
         VALUES ($1, $2::appointment_status, $3, $4, $5)`,
        [startsAt, status, clientIds[clientIdx], serviceIds[serviceIdx], userIds[offset % 2 === 0 ? 0 : 1]]
      );
    }

    await client.query('COMMIT');

    console.log('\n  Banco populado com sucesso.');
    console.log(`    ${USERS.length} funcionários, ${SERVICES.length} serviços, ${CLIENTS.length} clientes, ${AGENDA.length} agendamentos`);
    console.log('\n  Acesso de teste:');
    console.log('    e-mail: marcelo@barbeariavintage.com');
    console.log('    senha:  vintage123\n');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .then(() => closePool())
  .catch(async (error) => {
    console.error('Falha no seed:', error.message);
    await closePool();
    process.exit(1);
  });
