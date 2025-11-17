import { Router } from 'express';
import { supabase } from '../supabaseClient';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/conversations', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.json({ conversations: data });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

router.get('/conversations/:id/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ messages: data });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { conversation_id, content } = req.body;
    const userId = req.user?.id;

    if (!conversation_id || !content) {
      return res.status(400).json({ error: 'Conversation ID and content are required' });
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{ conversation_id, content, sender_id: userId }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: data });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
