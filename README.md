# Mercado Pago Subscriptions Backend

Reusable Node.js backend package for Mercado Pago subscription flows. Configuration is provided only via `.env`.

## Install

```bash
npm i mercadopago-subscriptions
```

## Configure

Create a `.env` file in your project root (or wherever you run the process):

```dotenv
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_MODE=sandbox
PORT=5000
MERCADO_PAGO_DEFAULT_PAYER_EMAIL=
MERCADO_PAGO_BACK_URL=
MERCADO_PAGO_DEFAULT_CURRENCY=MXN
MERCADO_PAGO_API_BASE=https://api.mercadopago.com
```

## Run as CLI

```bash
npx mercadopago-subscriptions
```

## Use as library

```js
const { createApp, startServer } = require('mercadopago-subscriptions');

// Use express app in your own server
const app = createApp();

// Or start the built-in server
startServer();
```

## Routes

The API is mounted at `/api`. Health check is `/health`.