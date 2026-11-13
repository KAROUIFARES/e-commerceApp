const crypto = require('node:crypto');
const amqp = require('amqplib');
const config = require('../config');

let channelPromise = null;

// Connexion paresseuse : ouverte au premier publish, réouverte si elle tombe.
function getChannel() {
  if (!channelPromise) {
    channelPromise = (async () => {
      const connection = await amqp.connect(config.rabbitUrl, {
        clientProperties: { connection_name: 'order-service' },
      });
      const reset = () => {
        channelPromise = null;
      };
      connection.on('close', reset);
      connection.on('error', (err) => console.warn('[rabbitmq] erreur connexion :', err.message));

      const channel = await connection.createConfirmChannel();
      channel.on('close', reset);
      await channel.assertExchange(config.exchange, 'topic', { durable: true });
      console.log(`[rabbitmq] connecté, exchange "${config.exchange}"`);
      return channel;
    })().catch((err) => {
      channelPromise = null;
      throw err;
    });
  }
  return channelPromise;
}

/**
 * Publie un événement de domaine (ex. "order.created") et attend l'accusé du broker.
 */
async function publish(routingKey, data) {
  const channel = await getChannel();
  const event = {
    eventId: crypto.randomUUID(),
    type: routingKey,
    occurredAt: new Date().toISOString(),
    data,
  };
  channel.publish(config.exchange, routingKey, Buffer.from(JSON.stringify(event)), {
    contentType: 'application/json',
    persistent: true,
    messageId: event.eventId,
  });
  await channel.waitForConfirms();
  return event;
}

/**
 * Comme publish, mais ne fait jamais échouer la requête HTTP : l'échec est journalisé.
 */
async function publishSafe(routingKey, data) {
  try {
    await publish(routingKey, data);
  } catch (err) {
    console.error(`[rabbitmq] échec publication ${routingKey} :`, err.message);
  }
}

async function isConnected() {
  try {
    await getChannel();
    return true;
  } catch {
    return false;
  }
}

module.exports = { publish, publishSafe, isConnected };
