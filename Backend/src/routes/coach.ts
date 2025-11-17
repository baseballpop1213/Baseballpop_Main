import { Router } from 'express';
import { supabase } from '../supabaseClient';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('coaches')
      .select('*');

    if (error) throw error;

    res.json({ coaches: data });
  } catch (error) {
    console.error('Error fetching coaches:', error);
    res.status(500).json({ error: 'Failed to fetch coaches' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('coaches')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({ coach: data });
  } catch (error) {
    console.error('Error fetching coach:', error);
    res.status(500).json({ error: 'Failed to fetch coach' });
  }
});

export default router;
