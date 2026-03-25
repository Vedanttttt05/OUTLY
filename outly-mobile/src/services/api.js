import axios from 'axios';

const api = axios.create({
  baseURL: 'https://outly.onrender.com/api',
  timeout: 10000,
});

export default api;