import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import coachRoutes from './routes/coach';
import feedRoutes from './routes/feed';
import messagingRoutes from './routes/messaging';
import assessmentsRoutes from './routes/assessments';
import playerRoutes from './routes/player';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'BPOP Backend is running' });
});

app.use('/api/coaches', coachRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/assessments', assessmentsRoutes);
app.use('/api/players', playerRoutes);

app.listen(PORT, () => {
  console.log(`BPOP Backend server running on http://localhost:${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});
