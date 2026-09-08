/**
 * Response helpers — consistent success/error shapes for the developer API.
 * A SetupRequiredError resolves to 503 { success:false, setupRequired:true }.
 */

import { isSetupRequiredError } from '../repositories/platformRepository.js';
import logger from '../utils/logger.js';
export const ok = (res, data, status = 200) => res.status(status).json({ success: true, ...data });

export const handleError = (res, err, context = 'request') => {
  if (isSetupRequiredError(err)) {
    return res.status(503).json({
      success: false,
      setupRequired: true,
      message: 'Platform tables are not provisioned yet. Run the setup migration first.'
    });
  }
  if (err.code === 'INVITATION_EXPIRED' || err.code === 'INVALID_INVITATION') {
    return res.status(400).json({ success: false, message: err.message, code: err.code });
  }
  if (err.code === 'GRAPH_UNAVAILABLE') {
    return res.status(503).json({ success: false, message: err.message, code: err.code });
  }
  if (err.code === 'ORG_HAS_RESOURCES' || err.code === 'SLUG_TAKEN' || err.code === 'DUPLICATE_INVITATION' || err.code === 'ALREADY_MEMBER' || err.code === 'OWNER_IMMUTABLE' || err.code === 'ORG_NOT_FOUND' || err.code === 'ORG_FORBIDDEN' || err.code === 'ROLE_FORBIDDEN' || err.code === 'SCOPE_FORBIDDEN') {
    return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code });
  }
  const status = err.status || 500;
  logger.error(`[${context.toUpperCase()}] error:`, err.message);
  return res.status(status).json({ success: false, message: err.message || 'An unexpected error occurred.' });
};
