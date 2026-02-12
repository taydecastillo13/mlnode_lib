const { createApp } = require('./app');

const startServer = (overrides = {}) => {
  const app = createApp(overrides);
  const port = overrides.port || process.env.PORT || 5000;
  const server = app.listen(port, () => {
    console.log(`Mercado Pago module running on port ${port}`);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection', reason);
    server.close(() => process.exit(1));
  });

  return server;
};

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
