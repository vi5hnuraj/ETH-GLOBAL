import logger from './logger.js';

/**
 * Initialize global unhandled error handlers.
 * Ensures the process shuts down gracefully and does not leave leaking resources,
 * while logging structured error data.
 */
export const initErrorTracker = (server) => {
  const handleFatal = (type, error) => {
    logger.fatal(`FATAL PROCESS ERROR: ${type}`, {
      error: error?.message || String(error),
      stack: error?.stack,
      timestamp: new Date().toISOString()
    });

    // In a Kubernetes environment, shutting down allows the pod to be restarted automatically
    if (server) {
      server.close(() => {
        logger.info('Server closed gracefully after fatal error. Exiting process.');
        process.exit(1);
      });
      // Force exit after timeout if graceful shutdown hangs
      setTimeout(() => {
        logger.warn('Force exiting process after server shutdown timeout.');
        process.exit(1);
      }, 5000);
    } else {
      process.exit(1);
    }
  };

  process.on('uncaughtException', (err) => {
    handleFatal('uncaughtException', err);
  });

  process.on('unhandledRejection', (reason) => {
    handleFatal('unhandledRejection', reason);
  });

  logger.info('🚨 Global error tracking hooks initialized.');
};

/**
 * Express error logger utility.
 * Formats errors for API responses without leaking stack details to users.
 */
export const expressErrorHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;

  // Don't leak internal details (stack traces, DB errors, paths) to users
  const safeMessage = statusCode >= 500
    ? 'An unexpected error occurred. Please try again later.'
    : (err.message || 'An unexpected error occurred.');

  const errorPayload = {
    message: safeMessage,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    requestId: req.id
  };

  // Structured logging for errors
  logger.error(`API Error: ${err.message}`, {
    requestId: req.id,
    method: req.method,
    url: req.url,
    statusCode,
    errorCode: err.code,
    details: err.details,
    hint: err.hint,
    stack: statusCode >= 500 ? err.stack : undefined
  });

  res.status(statusCode).json(errorPayload);
};
