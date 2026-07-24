import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL } from '../utils/constants';

interface UserMeta { email?: string; firstName?: string; lastName?: string; }

export function createApiClient(
  token: string,
  onDeactivated?: () => void,
  onWorkspaceRevoked?: () => void,
  userMeta?: UserMeta,
): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(userMeta?.email     && { 'x-user-email':     userMeta.email }),
      ...(userMeta?.firstName && { 'x-user-firstname': userMeta.firstName }),
      ...(userMeta?.lastName  && { 'x-user-lastname':  userMeta.lastName }),
    },
    timeout: 15000,
  });

  if (onDeactivated) {
    client.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err?.response?.status === 403) {
          if (err?.response?.data?.code === 'ACCOUNT_DEACTIVATED') {
            if (onDeactivated) onDeactivated();
          } else {
            if (onWorkspaceRevoked) onWorkspaceRevoked();
          }
        }
        return Promise.reject(err);
      },
    );
  }

  return client;
}
