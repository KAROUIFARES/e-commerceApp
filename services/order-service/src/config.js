// Charge un éventuel fichier .env (Node >= 20.12) sans dépendance externe.
try {
  process.loadEnvFile();
} catch {
  // pas de .env : on garde les valeurs par défaut
}

module.exports = {
  port: Number(process.env.PORT ?? 3100),
  mongoUri:
    process.env.MONGO_URI ??
    'mongodb://admin:admin123@localhost:27017/orderdb?authSource=admin',
  rabbitUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  exchange: process.env.RABBITMQ_EXCHANGE ?? 'ecommerce.events',
  customerServiceUrl: process.env.CUSTOMER_SERVICE_URL ?? 'http://localhost:5157',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
};
