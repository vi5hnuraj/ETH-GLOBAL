// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './src/routes/auth.js';
import bankRoutes from './src/routes/bank.js';
import flashLoanRoutes from './src/routes/flashLoan.js';
import moneyTransferRoutes from './src/routes/moneyTransferRoutes.js';
import payRoutes from './src/routes/pay.js'; // ✅ Import new pay route
import paymentRoutes from './src/routes/payment.js';
import aiAgentRoutes from './src/routes/aiAgentRoutes.js'; // ✅ AI Tool Calling Agent
import agentsRoutes from './src/routes/agents.js'; // ✅ AI Agent Platform (Bank for Bots)
import developerRoutes from './src/routes/developer.js'; // ✅ Developer Platform API
import platformRoutes from './src/routes/platform.js'; // ✅ Operational platform endpoints
import adminRoutes from './src/routes/admin.js'; // ✅ Admin Console API
import serviceGatewayRoutes from './src/routes/serviceGateway.js'; // ✅ Service Gateway (invoke, access, metering)
import arcRoutes from './src/routes/arc.js'; // ✅ Arc L1 & Circle Developer Tools

import rateLimit from 'express-rate-limit';
import { fileURLToPath, pathToFileURL } from 'url';
import { idempotencyMiddleware } from './src/middleware/idempotencyMiddleware.js';
import usageMiddleware from './src/middleware/usageMiddleware.js';
import maintenanceModeMiddleware from './src/middleware/maintenanceModeMiddleware.js';
import { openapiSpec } from './src/utils/openapiSpec.js';
import { requestLogger } from './src/utils/logger.js';
import { startBroadcastRecoveryWorker } from './src/workers/broadcastRecoveryWorker.js';
import { startScheduledPaymentWorker } from './src/workers/scheduledPaymentWorker.js';
import { startWebhookRetryWorker } from './src/workers/webhookRetryWorker.js';
import { startAgentTransactionRecoveryWorker } from './src/workers/agentTransactionRecoveryWorker.js';
import { startTrustScoreWorker } from './src/workers/trustScoreWorker.js';
import { metricsMiddleware, register } from './src/utils/metrics.js';
import { initErrorTracker, expressErrorHandler } from './src/utils/errorTracker.js';
import logger from './src/utils/logger.js';import { assertMpcProductionConfiguration } from './src/mpc/mpcRuntime.js';

// Load environment variables
dotenv.config();
// Fail closed before listening. A production process must never quietly fall
// back to a local/single-node MPC configuration.
assertMpcProductionConfiguration();

// Initialize express
const app = express();

// The developer API is a live dashboard: browsers must never serve a stale
// cached body (a degraded-read "empty" response from earlier in the day was
// being revalidated via ETag/304 and kept the UI on "0 keys/0 agents" even
// after the backend started returning the real rows). Disable conditional
// responses and force no-store so every poll hits the server fresh.
app.disable('etag');
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ✅ Trust proxy: required so req.ip (used by rate limiters and IP allowlists)
// reflects the real client IP behind a reverse proxy, and so spoofed
// X-Forwarded-For headers cannot bypass them. Set TRUST_PROXY to the number of
// hops (or a proxy IP list); defaults to 1 (single reverse proxy).
app.set('trust proxy', (() => {
  if (process.env.TRUST_PROXY) {
    const n = Number(process.env.TRUST_PROXY);
    if (Number.isFinite(n) && n >= 0) return n;
    return process.env.TRUST_PROXY;
  }
  return 1;
})());

// ✅ Security headers via Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://rpc.testnet.arc.io", "https://rpc.blockdaemon.testnet.arc.io", "https://rpc.drpc.testnet.arc.io", "https://rpc.quicknode.testnet.arc.io", "https://testnet.arcscan.app", "https://faucet.circle.com", "https://api.coinbase.com", "https://api.coingecko.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// ✅ CORS Middleware — origins from environment
const allowedOrigins = (() => {
  const origins = new Set(['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']);
  if (process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS.split(',').forEach(o => origins.add(o.trim()));
  }
  if (process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL.split(',').forEach(o => origins.add(o.trim()));
  }
  return [...origins];
})();

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

// Rate Limiters
const shouldSkipLimit = (req) => {
  if (process.env.NODE_ENV === 'development') return true;
  return req.path === '/metrics' || req.path === '/api/health' || req.path === '/api/platform/health';
};

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  skip: shouldSkipLimit,
  message: { message: "Too many requests, please try again later." }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true,
  skip: shouldSkipLimit,
  message: { message: "Too many authentication attempts, please try again later." }
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  skip: shouldSkipLimit,
  message: { message: "Payment frequency limit exceeded. Please wait a minute." }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  skip: shouldSkipLimit,
  message: { message: "AI agent rate limit exceeded. Please wait a minute." }
});

app.use(metricsMiddleware);
app.use(globalLimiter);

// ✅ Body size limit to prevent large payload DoS attacks
app.use(express.json({ limit: '1mb' }));

// ✅ Supabase Init (Workers Started)
logger.info('Supabase instance prepared successfully');
global.__workerStatus = {
  broadcastRecovery: { status: 'running', startedAt: new Date().toISOString() },
  scheduledPayment: { status: 'running', startedAt: new Date().toISOString() }
};
if (process.env.NODE_ENV !== 'test') {
  startBroadcastRecoveryWorker();
  startScheduledPaymentWorker();
  startWebhookRetryWorker();
  startAgentTransactionRecoveryWorker();
  startTrustScoreWorker(); // V3: objective trust score + relationship refresh
}

// ✅ Structured request logging with correlation ids (never logs bodies/secrets)
app.use(requestLogger);

// ✅ Maintenance mode gate (blocks writes while the flag is on; status stays up)
app.use(maintenanceModeMiddleware);

// ✅ Routes (legacy /api/* paths retained for backward compatibility)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/flashloan', flashLoanRoutes);
app.use('/api/money-transfer', paymentLimiter, idempotencyMiddleware, moneyTransferRoutes);
app.use('/api/pay', paymentLimiter, idempotencyMiddleware, payRoutes);
app.use('/api/payment', paymentLimiter, idempotencyMiddleware, paymentRoutes);
app.use('/api/agent', aiLimiter, idempotencyMiddleware, aiAgentRoutes); // ✅ AI Agent with dedicated rate limiter
app.use('/api/agents', aiLimiter, idempotencyMiddleware, usageMiddleware, agentsRoutes); // ✅ AI Agent Platform (Bank for Bots)
app.use('/api/developers', developerRoutes); // ✅ Developer Platform (dashboard, usage, billing, webhooks, settings)
app.use('/api/platform', platformRoutes); // ✅ Operational endpoints (health/flags/environment)
app.use('/api/admin', adminRoutes); // ✅ Admin Console (super_admin only)
app.use('/api/services', serviceGatewayRoutes); // ✅ Service Gateway (invoke, access, health, metering)
app.use('/api/arc', arcRoutes); // ✅ Arc L1 Network & Circle Agent Stack API

// ✅ API versioning — /api/v1 and /api/v2 alias the same routers so clients can
// pin an explicit version while the legacy /api/* paths keep working unchanged.
// The X-API-Version response header is set on every versioned response.
const tagVersion = (version) => (req, res, next) => {
  res.set('X-API-Version', version);
  next();
};

const versionedStack = [
  ['/api/v1/auth', tagVersion('v1'), authLimiter, authRoutes],
  ['/api/v1/bank', tagVersion('v1'), bankRoutes],
  ['/api/v1/flashloan', tagVersion('v1'), flashLoanRoutes],
  ['/api/v1/money-transfer', tagVersion('v1'), paymentLimiter, idempotencyMiddleware, moneyTransferRoutes],
  ['/api/v1/pay', tagVersion('v1'), paymentLimiter, idempotencyMiddleware, payRoutes],
  ['/api/v1/payment', tagVersion('v1'), paymentLimiter, idempotencyMiddleware, paymentRoutes],
  ['/api/v1/agent', tagVersion('v1'), aiLimiter, idempotencyMiddleware, aiAgentRoutes],
  ['/api/v1/agents', tagVersion('v1'), aiLimiter, idempotencyMiddleware, usageMiddleware, agentsRoutes],
  ['/api/v1/developers', tagVersion('v1'), developerRoutes],
  ['/api/v1/platform', tagVersion('v1'), platformRoutes],
  ['/api/v2/agents', tagVersion('v2'), aiLimiter, idempotencyMiddleware, usageMiddleware, agentsRoutes],
  ['/api/v2/developers', tagVersion('v2'), developerRoutes],
  ['/api/v2/platform', tagVersion('v2'), platformRoutes]
];
versionedStack.forEach(([path, ...handlers]) => app.use(path, ...handlers));

// ✅ Default route
app.get('/', (req, res) => {
  res.send('Server is running 🚀');
});

// ✅ Health check (always available, even during maintenance)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// ✅ Prometheus Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// ✅ OpenAPI spec — behind auth in production, public in development
app.get('/api/openapi.json', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.authorization || '';
    const apiKey = req.headers['x-api-key'] || req.headers['x-developer-key'] || '';
    if (!authHeader.startsWith('Bearer ') && !apiKey) {
      return res.status(401).json({ message: 'Authentication required in production.' });
    }
  }
  res.json(openapiSpec);
});

// ✅ Global error handler using centralized error tracker
app.use(expressErrorHandler);

// ✅ Start server (only when run directly, not when imported by tests)
// Works with: node, pm2, tsx, and other process managers.
const isDirectRun = (() => {
  // Already matched the classic way
  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  // pm2 / tsx / nodemon: process.argv[1] ends with server.js
  if (process.argv[1] && process.argv[1].endsWith('server.js')) return true;
  // pm2 via npx bash wrapper — PM2_HOME is set
  if (process.env.PM2_HOME) return true;
  // Fallback: not a child_module import (no __filename weirdness)
  return !process.env.__cjsModule;
})();
const PORT = process.env.PORT || 5550;
if (isDirectRun) {
  const server = app.listen(PORT, () => logger.info('Server started', { port: PORT }));
  initErrorTracker(server);
}

export default app;
