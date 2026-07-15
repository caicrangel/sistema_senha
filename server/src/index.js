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
import settingsRoutes from './routes/settings.routes.js';
import emailRoutes from './routes/email.routes.js';
import { startEmailScheduler } from './email.js';
import { verifyToken } from './auth.js';
import { setDoctor, removeSocket, summary } from './presence.js';

const app = express();
const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: '*' }, path: '/socket.io' });

// Presença de médicos: a tela do Consultório anuncia quem está online
const broadcastDoctors = () => io.emit('doctors:online', summary());

io.on('connection', (socket) => {
  socket.on('presence:doctor', ({ token } = {}) => {
    const u = verifyToken(token);
    if (u && (u.role === 'admin' || (u.permissions || []).includes('medico'))) {
      setDoctor(socket.id, { doctorId: u.id, doctorName: u.name, specialtyId: u.specialty_id || null });
      broadcastDoctors();
    }
  });
  socket.on('presence:leave', () => {
    if (removeSocket(socket.id)) broadcastDoctors();
  });
  socket.on('disconnect', () => {
    if (removeSocket(socket.id)) broadcastDoctors();
  });
});

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes(io));
app.use('/api/admin', adminRoutes(io));
app.use('/api/reports', reportRoutes);
app.use('/api', settingsRoutes(io));
app.use('/api/admin', emailRoutes());

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
  startEmailScheduler();
  server.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
}

start();
