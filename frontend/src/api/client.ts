// src/api/client.ts
import axios from "axios";
import { supabase } from "../supabaseClient";

const api = axios.create({
  // Point all frontend API calls through the Vite proxy to the backend.
  // Without this prefix, requests (e.g., /coach/my-teams) are served by Vite
  // and return the index HTML instead of JSON, causing runtime crashes.
  baseURL: "/api",
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
