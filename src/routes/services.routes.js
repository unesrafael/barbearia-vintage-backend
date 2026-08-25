import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, uuid } from '../lib/validate.js';
import * as services from '../services/services.service.js';

const router = Router();

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do serviço.'),
  durationMin: z.coerce.number().int().positive('A duração deve ser maior que zero.'),
  priceCents: z.coerce.number().int().min(0, 'O preço não pode ser negativo.'),
  active: z.boolean().optional().default(true),
});

const listSchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const paramsSchema = z.object({ id: uuid });

router.get('/', validateQuery(listSchema), async (req, res, next) => {
  try {
    res.json(await services.list(req.validatedQuery));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    res.json(await services.getById(id));
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(serviceSchema), async (req, res, next) => {
  try {
    res.status(201).json(await services.create(req.body));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', validateBody(serviceSchema), async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    res.json(await services.update(id, req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = paramsSchema.parse(req.params);
    const result = await services.remove(id);
    if (result.deactivated) return res.json(result.service);
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
