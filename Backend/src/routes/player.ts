import { Router } from "express";
import { supabase } from "../supabaseClient";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("players")
      .select("*");

    if (error) throw error;

    res.json({ players: data });
  } catch (error) {
    console.error("Error fetching players:", error);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    res.json({ player: data });
  } catch (error) {
    console.error("Error fetching player:", error);
    res.status(500).json({ error: "Failed to fetch player" });
  }
});

router.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from("players")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ player: data });
  } catch (error) {
    console.error("Error updating player:", error);
    res.status(500).json({ error: "Failed to update player" });
  }
});

export default router;
