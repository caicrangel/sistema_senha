import express from 'express';
import cors from 'cors';
import http from 'http';
import bcrypt from 'bcryptjs';
import { Server } from 'socket.io';
import { migrate, seed } from './db.js';
import authRoutes from './routes/auth.routes.js';
import ticketRoutes from './routes/tickets.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportRoutes from './routes/reports.routes.js';

const app = express();
const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: '*' }, path: '/socket.io' });

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes(io));
app.use('/api/admin', adminRoutes(io));
app.use('/api/reports', reportRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  for (let i = 0; i < 10; i++) {
    try {
      await migrate();
      break;
    } catch (e) {
      console.log('Aguardando banco de dados...', e.message);
      await new Promise((r) => setTimeout(r, 2000));
      if (i === 9) throw e;
    }
  }
  await seed(bcrypt);
  server.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
}

start();
