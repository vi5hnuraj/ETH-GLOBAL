import axios from 'axios';
import Cookies from 'js-cookie'; // we’ll use the same token storage as your component

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5550/api', // 👈 notice /api added here
  headers: {
    'Content-Type': 'application/json',
  },
  // Hard timeout so a degraded backend can never leave the session
  // (fetchdetail, profile, payments) hanging in loading forever.
  timeout: 20000,
});

// Attach token from cookie for every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global response interceptor for JWT Expiry (401)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          console.log("Access token expired, attempting session refresh...");
          const refreshUrl = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/auth/refresh` : 'http://localhost:5550/api/auth/refresh';
          const res = await axios.post(refreshUrl, { refreshToken }, { timeout: 10000 });
          if (res.status === 200) {
            const newToken = res.data.token;
            const newRefreshToken = res.data.refreshToken;
            
            localStorage.setItem('token', newToken);
            localStorage.setItem('refreshToken', newRefreshToken);
            Cookies.set('token', newToken, { expires: 1 });
            Cookies.set('refreshToken', newRefreshToken, { expires: 30 });
            
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        } catch (refreshErr) {
          console.error("Session refresh failed, logging out...", refreshErr);
        }
      }
      
      // Logout if no refresh token or refresh failed
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userRole');
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      invalidateUserCache();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const USER_CACHE_KEY = 'globalpay_user_cache_v3';
export const USER_CACHE_STALE_MS = 5_000; // 5 seconds max

// Purge legacy cache keys from earlier sessions/databases
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('globalpay_user_cache');
    localStorage.removeItem('globalpay_user_cache_v2');
  } catch (e) {}
}

let inflightFetch = null;

export const getCachedUserDetailSync = () => {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const { data } = JSON.parse(raw);
    return data;
  } catch { return null; }
};

export const getCachedUserDetail = async () => {
  if (inflightFetch) return inflightFetch;

  inflightFetch = api.get('/auth/fetchdetail').then(res => {
    const user = res.data;
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ data: user, timestamp: Date.now() }));
    }
    inflightFetch = null;
    return user;
  }).catch(err => {
    inflightFetch = null;
    const sync = getCachedUserDetailSync();
    if (sync) return sync;
    throw err;
  });

  return inflightFetch;
};

export const refreshUserCache = async () => {
  try {
    const res = await api.get('/auth/fetchdetail');
    const user = res.data;
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ data: user, timestamp: Date.now() }));
    }
    return user;
  } catch { return null; }
};

export const invalidateUserCache = () => {
  try {
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem('globalpay_user_cache');
  } catch (e) {}
  inflightFetch = null;
};

/** Fetch live token price (USDC is pegged 1:1 with USD) */
export const fetchLiveBotPrice = async () => {
  return 1.0;
};

export default api;
