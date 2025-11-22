// src/api/client.ts
import axios from "axios";
import { supabase } from "../supabaseClient";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // your Node backend URL
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
