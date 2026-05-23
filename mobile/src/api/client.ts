import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL } from '../utils/constants';

export function createApiClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}
