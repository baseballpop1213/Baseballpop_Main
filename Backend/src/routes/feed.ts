import { Router } from 'express';
import { supabase } from '../supabaseClient';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ feed: data });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { content, type } = req.body;
    const userId = req.user?.id;

    if (!content || !type) {
      return res.status(400).json({ error: 'Content and type are required' });
    }

    const { data, error } = await supabase
      .from('feed')
      .insert([{ content, type, user_id: userId }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ post: data });
  } catch (error) {
    console.error('Error creating feed post:', error);
    res.status(500).json({ error: 'Failed to create feed post' });
  }
});

export default router;
