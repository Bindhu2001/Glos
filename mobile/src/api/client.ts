import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL } from '../utils/constants';

interface UserMeta { email?: string; firstName?: string; lastName?: string; photoUrl?: string; }

export function createApiClient(
  token: string,
  onDeactivated?: () => void,
  onWorkspaceRevoked?: () => void,
  userMeta?: UserMeta,
  getFreshToken?: () => Promise<string>,
): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(userMeta?.email     && { 'x-user-email':     userMeta.email }),
      ...(userMeta?.firstName && { 'x-user-firstname': userMeta.firstName }),
      ...(userMeta?.lastName  && { 'x-user-lastname':  userMeta.lastName }),
      ...(userMeta?.photoUrl  && { 'x-user-photo':     userMeta.photoUrl }),
    },
    timeout: 15000,
  });

  // The token handed to createApiClient can go stale (Clerk session tokens are
  // short-lived) between when it was fetched and when this request actually
  // reaches the server — that surfaced as a raw "Invalid token" alert. Retry
  // once with a freshly-fetched token before giving up.
  if (getFreshToken) {
    client.interceptors.response.use(
      (res) => res,
      async (err) => {
        const status = err?.response?.status;
        const isAuthError = status === 401 && !err.config?.__retriedAuth;
        if (!isAuthError) return Promise.reject(err);
        try {
          const fresh = await getFreshToken();
          if (!fresh) return Promise.reject(err);
          err.config.__retriedAuth = true;
          err.config.headers = { ...err.config.headers, Authorization: `Bearer ${fresh}` };
          return client.request(err.config);
        } catch {
          return Promise.reject(err);
        }
      },
    );
  }

  if (onDeactivated) {
    client.interceptors.response.use(
      (res) => res,
      (err) => {
        // Only a handful of 403 codes actually mean "your access to this
        // workspace is gone" — most 403s are ordinary permission checks
        // (e.g. an admin-only report hit by a regular member) and must NOT
        // trigger this full-screen alert, or every "admins only" action in
        // the app would look like the user got kicked out.
        const code = err?.response?.data?.code;
        if (err?.response?.status === 403) {
          if (code === 'APP_DEACTIVATED' || code === 'MEMBER_DEACTIVATED') {
            if (onDeactivated) onDeactivated();
          } else if (code === 'NOT_A_MEMBER') {
            if (onWorkspaceRevoked) onWorkspaceRevoked();
          }
          // INSUFFICIENT_ROLE and anything uncoded: fall through — the
          // calling screen's own error handling (apiErrorMessage/showAlert
          // or a silent .catch fallback) is responsible for that.
        }
        return Promise.reject(err);
      },
    );
  }

  return client;
}
