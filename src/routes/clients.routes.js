import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, uuid } from '../lib/validate.js';
import * as clients from '../services/clients.service.js';

const router = Router();

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do cliente.'),
  email: z.string().trim().email('Informe um e-mail válido — e por ele que a confirmação e enviada.'),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

const listSchema = z.object({ q: z.string().optional() });
const paramsSchema = z.object({ id: uuid });

router.get('/', validateQuery(listSchema), async (req, res, next) => {
  try {
    res.json(await clients.list(req.validatedQuery));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    res.json(await clients.getWithHistory(id));
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(clientSchema), async (req, res, next) => {
  try {
    res.status(201).json(await clients.create(req.body));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', validateBody(clientSchema), async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    res.json(await clients.update(id, req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    await clients.remove(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
