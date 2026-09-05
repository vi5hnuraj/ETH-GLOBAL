/**
 * Resolves the platform API base URL for the running environment.
 *   - VITE_API_URL (env) wins when set — production deployments point here.
 *   - In production builds without an explicit override, a same-origin /api
 *     path is used (assumes a gateway/reverse proxy in front of the API).
 *   - In development the real local backend is used.
 * No hardcoded hosts appear in production code paths.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:5550/api')
).replace(/\/$/, '');

export default API_BASE_URL;
