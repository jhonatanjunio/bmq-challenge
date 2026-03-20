import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { correlationIdMiddleware } from './middlewares/CorrelationId';
import { PaymentController } from './controllers/PaymentController';
import { LogController } from './controllers/LogController';
import { prisma } from './config/database';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Correlation-ID'],
  exposedHeaders: ['X-Idempotent-Replay', 'X-Correlation-ID']
}));
app.use(express.json({ limit: '10kb' }));
app.use(correlationIdMiddleware);

// Rotas versionadas
const paymentController = new PaymentController();
const logController = new LogController();

const v1Router = Router();
v1Router.post('/payments', (req, res) => paymentController.create(req, res));
v1Router.get('/logs', (req, res) => logController.list(req, res));

app.use('/api/v1', v1Router);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`[Server] ${signal} received. Shutting down gracefully...`);
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Inicia o servidor
app.listen(port, () => {
  console.log(`[Server] Payment Service running on port ${port}`);
});
