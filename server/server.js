
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { serve } from 'inngest/express';
import { inngest, functions } from './inngest/index.js';

const app = express();

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());

app.get('/', (req, res) => {
  res.send('Waypoint Server is LIVE!');
});

app.use(
  '/api/inngest',
  serve({ client: inngest, functions })
);

// Export the Express app for Vercel's serverless runtime.
export default app;
