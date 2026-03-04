import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Importar rotas
import pastoralCabinetRoutes from './routes/pastoralCabinet.js';

// Você pode importar outras rotas aqui conforme necessário
// import usersRoutes from './routes/users.js';
// import membersRoutes from './routes/members.js';
// import cultsRoutes from './routes/cults.js';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARES
// ─────────────────────────────────────────────────────────────────────────────

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS DE SAÚDE
// ─────────────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor está rodando' });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS DA APLICAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

// ✅ Rotas de Gabinete Pastoral (NOVA FUNCIONALIDADE)
app.use('/api/pastoral-cabinet', pastoralCabinetRoutes);

// Suas outras rotas aqui (descomente conforme necessário)
// app.use('/api/users', usersRoutes);
// app.use('/api/members', membersRoutes);
// app.use('/api/cults', cultsRoutes);
// app.use('/api/pastoral', pastoralRoutes);
// app.use('/api/scales', scalesRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS NÃO ENCONTRADAS
// ─────────────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRATAMENTO DE ERROS
// ─────────────────────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Erro:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INICIAR SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`📍 Ambiente: ${NODE_ENV}`);
  console.log(`🌐 CORS habilitado para: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log('');
  console.log('📚 Endpoints disponíveis:');
  console.log('  GET  /health');
  console.log('  POST   /api/pastoral-cabinet/schedules');
  console.log('  GET    /api/pastoral-cabinet/schedules');
  console.log('  DELETE /api/pastoral-cabinet/schedules/:id');
  console.log('  GET    /api/pastoral-cabinet/availability/:month');
  console.log('  GET    /api/pastoral-cabinet/available-slots/:date');
  console.log('  POST   /api/pastoral-cabinet/bookings');
  console.log('  GET    /api/pastoral-cabinet/bookings/volunteer/:volunteerId');
  console.log('  PUT    /api/pastoral-cabinet/bookings/:id');
  console.log('  DELETE /api/pastoral-cabinet/bookings/:id');
});

export default app;
