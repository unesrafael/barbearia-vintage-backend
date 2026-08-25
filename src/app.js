import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import servicesRoutes from './routes/services.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
  app.use(express.json());

  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', timezone: env.timezone, now: new Date().toISOString() })
  );

  app.use('/auth', authRoutes);

  // Daqui para baixo, nada responde sem token: e um sistema interno.
  app.use('/clients', authenticate, clientsRoutes);
  app.use('/services', authenticate, servicesRoutes);
  app.use('/appointments', authenticate, appointmentsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
