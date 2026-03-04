import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pastoralCabinetRoutes from './routes/pastoralCabinet.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Rotas de Gabinete Pastoral
app.use('/api/pastoral-cabinet', pastoralCabinetRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Erro
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`📍 Ambiente: ${process.env.NODE_ENV}`);
});

export default app;