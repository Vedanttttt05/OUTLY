import axios from 'axios';
import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://outly.onrender.com/api';

// For use inside React components/hooks
export const useApi = () => {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const apiRef = useRef(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  if (!apiRef.current) {
    const instance = axios.create({ baseURL: BASE_URL, timeout: 10000 });

    instance.interceptors.request.use(async (config) => {
      const token = await getTokenRef.current?.();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    apiRef.current = instance;
  }

  return apiRef.current;
};

// For use outside React components (no auth)
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

export default api;