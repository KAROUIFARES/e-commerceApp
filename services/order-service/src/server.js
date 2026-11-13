const mongoose = require('mongoose');
const config = require('./config');
const app = require('./app');

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log('[mongo] connecté');

  const server = app.listen(config.port, () => {
    console.log(`order-service démarré sur http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Démarrage impossible :', err);
  process.exit(1);
});
