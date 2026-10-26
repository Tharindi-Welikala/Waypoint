
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { serve } from 'inngest/express';
import { inngest, functions } from './inngest/index.js';
import workspaceRouter from './routes/workspaceRoutes.js';
import { deleteWorkspace } from './controllers/workspaceController.js';
import { protect } from './middlewares/authMiddleware.js';
import { generalLimiter } from './middlewares/rateLimiter.js';
import projectRouter from './routes/projectRoutes.js';
import taskRouter from './routes/taskRoutes.js';
import commentRouter from './routes/commentRoutes.js';

const app = express();

app.use(express.json());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL || 'https://your-frontend-domain.com'
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true
}));
app.use(clerkMiddleware());
app.use('/api', generalLimiter);

app.get('/', (req, res) => {
  res.send('Waypoint Server is LIVE!');
});

app.get('/api', (req, res) => {
  res.json({
    message: 'Waypoint API is LIVE!',
    workspaceDeleteRoute: 'DELETE /api/workspaces/:workspaceId',
  });
});

app.use(
  '/api/inngest',
  serve({ client: inngest, functions })
);

//Routes
// Keep the destructive operation explicit at the API mount point so it is
// registered alongside the other protected workspace endpoints.
app.delete('/api/workspaces/:workspaceId', protect, deleteWorkspace);
app.use('/api/workspaces', protect, workspaceRouter);
app.use('/api/projects', protect, projectRouter);
app.use('/api/tasks', protect, taskRouter);
app.use('/api/comments', protect, commentRouter);

// Export the Express app for Vercel's serverless runtime.
export default app;

// Start the server locally; Vercel imports the app instead.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Waypoint Server running at http://localhost:${PORT}`);
  });
}
