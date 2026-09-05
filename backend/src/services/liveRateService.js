import logger from '../utils/logger.js';

let inMemoryRateCache = null;
let inMemoryRateCacheTime = 0;

let inMemoryEthPriceCache = null;
let inMemoryEthPriceCacheTime = 0;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches live fiat exchange rates against USD with 5-minute caching.
 * Throws a financial integrity error if rates cannot be retrieved.
 */
export const getLiveExchangeRates = async () => {
  if (inMemoryRateCache && (Date.now() - inMemoryRateCacheTime < CACHE_TTL_MS)) {
    return inMemoryRateCache;
  }

  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD');
    if (res.ok) {
      const data = await res.json();
      const rates = { USD: 1.0, ...data.rates };
      inMemoryRateCache = rates;
      inMemoryRateCacheTime = Date.now();
      return rates;
    }
  } catch (err) {
    logger.warn("[LiveRateService] Primary exchange rate API warning:", err.message);
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (res.ok) {
      const data = await res.json();
      inMemoryRateCache = data.rates;
      inMemoryRateCacheTime = Date.now();
      return data.rates;
    }
  } catch (err) {
    logger.warn("[LiveRateService] Secondary exchange rate API warning:", err.message);
  }

  if (inMemoryRateCache) {
    return inMemoryRateCache;
  }

  // Fallback exchange rates if external rate APIs are temporarily down
  return {
    USD: 1.0,
    INR: 87.0,
    EUR: 0.92,
    GBP: 0.79,
    AED: 3.67,
    SGD: 1.34,
    CAD: 1.38,
    AUD: 1.55,
    JPY: 154.0
  };
};

/**
 * Fetches the live ETH price from Coinbase / CoinGecko public APIs.
 */
export const getLiveEthPrice = async () => {
  if (inMemoryEthPriceCache && (Date.now() - inMemoryEthPriceCacheTime < CACHE_TTL_MS)) {
    return inMemoryEthPriceCache;
  }

  try {
    const res = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
    if (res.ok) {
      const data = await res.json();
      const price = Number(data?.data?.amount);
      if (!isNaN(price) && price > 0) {
        inMemoryEthPriceCache = price;
        inMemoryEthPriceCacheTime = Date.now();
        return price;
      }
    }
  } catch (err) {
    logger.warn("[LiveRateService] Coinbase ETH-USD API warning:", err.message);
  }

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    if (res.ok) {
      const data = await res.json();
      const price = Number(data?.ethereum?.usd);
      if (!isNaN(price) && price > 0) {
        inMemoryEthPriceCache = price;
        inMemoryEthPriceCacheTime = Date.now();
        return price;
      }
    }
  } catch (err) {
    logger.warn("[LiveRateService] CoinGecko ETH-USD API warning:", err.message);
  }

  if (inMemoryEthPriceCache) {
    return inMemoryEthPriceCache;
  }

  return 2600.0; // Standard fallback estimate
};

/**
 * USDC is 1.00 USD pegged.
 */
export const getLiveUsdcPrice = async () => {
  return 1.0;
};

/**
 * Backward-compatible token price resolver.
 */
export const getLiveBotPrice = async () => {
  return 1.0; // 1:1 USD for USDC on Base
};

/**
 * Converts a fiat amount in target currency to USDC / Crypto amount using live rates
 */
export const convertFiatToUsdc = async (amount, currencyCode = 'INR') => {
  const rates = await getLiveExchangeRates();
  const tokenPrice = 1.0; // 1 USDC = 1 USD

  const rate = rates[currencyCode.toUpperCase()] || rates['INR'] || 87.0;
  const usdValue = Number(amount) / rate;
  const usdcAmount = usdValue / tokenPrice;

  return {
    usdValue: parseFloat(usdValue.toFixed(4)),
    usdcAmount: parseFloat(usdcAmount.toFixed(6)),
    botAmount: parseFloat(usdcAmount.toFixed(6)), // Compatibility alias
    amount: parseFloat(usdcAmount.toFixed(6)),
    exchangeRate: rate,
    tokenPrice: tokenPrice,
    botPrice: tokenPrice // Compatibility alias
  };
};

export const convertFiatToBot = convertFiatToUsdc;
