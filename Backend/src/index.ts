import "dotenv/config";
import express from "express";
import cors from "cors";
import { supabase } from "./supabaseClient";
import { requireAuth, AuthedRequest } from "./middleware/auth";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/**
 * Health check
 */
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "BPOP backend" });
});

/**
 * Get current user's profile from the "profiles" table.
 * Requires Authorization: Bearer <Supabase access token>
 */
app.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ error: error.message });
  }

  return res.json(data);
});

app.listen(port, () => {
  console.log(`BPOP backend listening on port ${port}`);
});
