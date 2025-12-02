// src/api/client.ts
import axios from "axios";
import { supabase } from "../supabaseClient";

const api = axios.create({
  baseURL: '', // Uses Vite proxy to forward /api/* to backend
});

// Attach Supabase access token on every request to your backend
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
