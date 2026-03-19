import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { correlationIdMiddleware } from './middlewares/CorrelationId';
import { PaymentController } from './controllers/PaymentController';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(correlationIdMiddleware);

// Rotas
const paymentController = new PaymentController();

app.post('/payments', (req, res) => paymentController.create(req, res));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`[Server] Payment Service running on port ${port}`);
});
