import { Router } from 'express';
import { supabase } from '../supabaseClient';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ assessments: data });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({ assessment: data });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const assessmentData = req.body;

    const { data, error } = await supabase
      .from('assessments')
      .insert([{ ...assessmentData, user_id: userId }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ assessment: data });
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
});

export default router;
