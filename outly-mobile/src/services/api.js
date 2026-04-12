import axios from 'axios';
import { useAuth } from '@clerk/clerk-expo';

const BASE_URL = 'https://outly.onrender.com/api';

// For use inside React components/hooks
export const useApi = () => {
  const { getToken } = useAuth();

  const api = axios.create({ baseURL: BASE_URL, timeout: 10000 });

  api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  return api;
};

// For use outside React components (no auth)
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

export default api;