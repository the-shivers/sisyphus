import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { initDatabase } from './db/schema.js';
import playerRoutes from './routes/player.js';
import pushRoutes from './routes/push.js';
import statsRoutes from './routes/stats.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Content-Type', 'X-Player-ID']
}));

// Initialize database
initDatabase();

// API routes
app.route('/api/player', playerRoutes);
app.route('/api/push', pushRoutes);
app.route('/api/stats', statsRoutes);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve static files (the game itself)
app.use('/*', serveStatic({ root: '../' }));

// Start server
const port = parseInt(process.env.PORT || '3000');
console.log(`Sisyphus server starting on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
