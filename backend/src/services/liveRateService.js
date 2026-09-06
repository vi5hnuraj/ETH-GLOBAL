let inMemoryRateCache = null;
let inMemoryRateCacheTime = 0;

let inMemoryBotPriceCache = null;
let inMemoryBotPriceCacheTime = 0;

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

  throw new Error("FINANCIAL_ERROR: Live fiat exchange rates unavailable. Financial transaction rejected to prevent price slippage.");
};

/**
 * Returns USDC/USD price (1 USDC = 1 USD on Arc Testnet).
 */
export const getLiveBotPrice = async () => {
  return 1.0;
};

/**
 * Converts a fiat amount in target currency to USDC amount using live rates
 */
export const convertFiatToBot = async (amount, currencyCode = 'INR') => {
  const rates = await getLiveExchangeRates();
  const botPrice = 1.0;

  const rate = rates[currencyCode.toUpperCase()] || rates['INR'] || 83.5;
  const usdValue = Number(amount) / rate;
  const botAmount = usdValue / botPrice;

  return {
    usdValue: parseFloat(usdValue.toFixed(4)),
    botAmount: parseFloat(botAmount.toFixed(6)),
    exchangeRate: rate,
    botPrice: 1.0
  };
};
