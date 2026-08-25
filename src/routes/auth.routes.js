import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../lib/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as authService from '../services/auth.service.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe a senha.'),
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    res.json(await authService.login(req.body));
  } catch (error) {
    next(error);
  }
});

// Usado pelo front no carregamento para saber se o token guardado ainda vale.
router.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({ user: await authService.findById(req.user.id) });
  } catch (error) {
    next(error);
  }
});

export default router;
