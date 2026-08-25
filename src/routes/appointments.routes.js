import { Router } from 'express';
import { z } from 'zod';
import {
  validateBody,
  validateQuery,
  uuid,
  dateString,
  timeString,
  APPOINTMENT_STATUS,
} from '../lib/validate.js';
import * as appointments from '../services/appointments.service.js';
import { countAppointments } from '../services/clients.service.js';
import { notifyAppointmentCreated } from '../lib/n8n.js';
import { todayInTz, addDays } from '../lib/datetime.js';

const router = Router();

const appointmentSchema = z.object({
  clientId: uuid,
  serviceId: uuid,
  date: dateString,
  time: timeString,
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  status: z.enum(APPOINTMENT_STATUS).optional(),
});

const listSchema = z.object({
  date: dateString.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  status: z.enum(APPOINTMENT_STATUS).optional(),
  clientId: uuid.optional(),
});

const statusSchema = z.object({ status: z.enum(APPOINTMENT_STATUS) });
const paramsSchema = z.object({ id: uuid });

router.get('/', validateQuery(listSchema), async (req, res, next) => {
  try {
    res.json(await appointments.list(req.validatedQuery));
  } catch (error) {
    next(error);
  }
});

// Os tres numeros do topo da agenda: atendimentos, faturamento e ranking.
router.get('/summary', async (req, res, next) => {
  try {
    const to = req.query.to ?? todayInTz();
    const from = req.query.from ?? addDays(to, -6);
    res.json(await appointments.summary({ from, to }));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    res.json(await appointments.getById(id));
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(appointmentSchema), async (req, res, next) => {
  try {
    const appointment = await appointments.create(req.body, req.user.id);

    // O agendamento já esta gravado. A automação roda depois da resposta,
    // sem poder derrubar a criacao se o n8n estiver fora do ar.
    const previous = await countAppointments(appointment.client.id, {
      excludeId: appointment.id,
    });

    res.status(201).json(appointment);

    notifyAppointmentCreated(appointment, { previousAppointments: previous }).catch(
      (error) => console.warn('[n8n] falha no disparo:', error.message)
    );
  } catch (error) {
    next(error);
  }
});

router.put('/:id', validateBody(appointmentSchema), async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    res.json(await appointments.update(id, req.body));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', validateBody(statusSchema), async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    res.json(await appointments.updateStatus(id, req.body.status));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    await appointments.remove(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
