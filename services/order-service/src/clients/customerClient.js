const config = require('../config');

class CustomerServiceUnavailableError extends Error {}

/**
 * Récupère un client auprès du customer-service.
 * @returns {Promise<object|null>} le client, ou null s'il n'existe pas
 */
async function getCustomer(customerId) {
  let res;
  try {
    res = await fetch(
      `${config.customerServiceUrl}/api/customers/${encodeURIComponent(customerId)}`,
      { signal: AbortSignal.timeout(3000) },
    );
  } catch (err) {
    throw new CustomerServiceUnavailableError(`customer-service injoignable : ${err.message}`);
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new CustomerServiceUnavailableError(`customer-service a répondu ${res.status}`);
  }
  return res.json();
}

module.exports = { getCustomer, CustomerServiceUnavailableError };
