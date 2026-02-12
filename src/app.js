const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');

const paymentRoutes = require('./routes/paymentRoutes');
const { handleHook, listWebhooks } = require('./controllers/paymentController');
const { errorHandler } = require('./utils/errorHandler');

const createApp = (overrides = {}) => {
  const envPath = overrides.envPath || process.env.ENV_PATH;
  dotenv.config(envPath ? { path: envPath } : undefined);

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan('tiny'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'mercado-pago-subscriptions' });
  });

  app.get('/success', (req, res) => {
    res.json({ status: 'success', message: 'Pago aprobado, gracias por confiar en Mercado Pago.' });
  });

  app.get('/failure', (req, res) => {
    res.json({ status: 'failure', message: 'El pago no se completó. Intenta de nuevo o usa otro método.' });
  });

  app.get('/pending', (req, res) => {
    res.json({ status: 'pending', message: 'El pago quedó pendiente de confirmación.' });
  });

  app.post('/webhooks', handleHook);
  app.get('/webhooks', listWebhooks);

  app.use('/api', paymentRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
};

module.exports = { createApp };
