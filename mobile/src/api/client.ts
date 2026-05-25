import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL } from '../utils/constants';

export function createApiClient(
  token: string,
  onDeactivated?: () => void,
  onWorkspaceRevoked?: () => void,
): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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
