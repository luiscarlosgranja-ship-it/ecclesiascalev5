import express from 'express';
import { supabase } from '../utils/supabaseServer.js'; // Seu cliente Supabase

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS: Gerenciar Disponibilidade (Admin/Secretaria)
// ─────────────────────────────────────────────────────────────────────────────

// POST: Criar novo horário disponível
router.post('/schedules', async (req, res) => {
  try {
    const { date, time, duration_minutes, is_available } = req.body;

    // Validação
    if (!date || !time || !duration_minutes) {
      return res.status(400).json({
        error: 'Data, hora e duração são obrigatórios'
      });
    }

    // Inserir no Supabase
    const { data, error } = await supabase
      .from('pastoral_cabinet_schedules')
      .insert([
        {
          date,
          time,
          duration_minutes,
          is_available: is_available !== false
        }
      ])
      .select();

    if (error) {
      console.error('Erro ao inserir:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET: Listar todos os horários
router.get('/schedules', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pastoral_cabinet_schedules')
      .select('*')
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('Erro ao buscar:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Deletar um horário
router.delete('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se existe agendamento neste horário
    const { data: bookings, error: checkError } = await supabase
      .from('pastoral_cabinet_bookings')
      .select('id')
      .eq('schedule_id', id)
      .limit(1);

    if (checkError) {
      console.error('Erro ao verificar:', checkError);
      return res.status(500).json({ error: checkError.message });
    }

    if (bookings && bookings.length > 0) {
      return res.status(400).json({
        error: 'Não é possível deletar este horário pois já tem agendamento'
      });
    }

    // Deletar horário
    const { error } = await supabase
      .from('pastoral_cabinet_schedules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao deletar:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Horário deletado com sucesso' });
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS: Visualizar Disponibilidade (Voluntário)
// ─────────────────────────────────────────────────────────────────────────────

// GET: Disponibilidade por mês (para calendário)
router.get('/availability/:month', async (req, res) => {
  try {
    const { month } = req.params; // Formato: "2024-03"
    const [year, monthNum] = month.split('-');

    // Buscar todos os horários do mês
    const { data: schedules, error } = await supabase
      .from('pastoral_cabinet_schedules')
      .select('date, is_available')
      .gte('date', `${year}-${monthNum}-01`)
      .lt('date', `${year}-${parseInt(monthNum) + 1}-01`)
      .order('date', { ascending: true });

    if (error) {
      console.error('Erro ao buscar:', error);
      return res.status(500).json({ error: error.message });
    }

    // Agrupar por data e verificar se tem disponibilidade
    const availability = {};
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    // Inicializar todos os dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${monthNum}-${String(day).padStart(2, '0')}`;
      availability[dateStr] = { hasAvailable: false };
    }

    // Marcar dias com disponibilidade
    schedules.forEach(schedule => {
      if (schedule.is_available) {
        availability[schedule.date].hasAvailable = true;
      }
    });

    // Converter para array
    const result = Object.entries(availability).map(([date, info]) => ({
      date,
      hasAvailable: info.hasAvailable
    }));

    res.json(result);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET: Horários disponíveis para uma data específica
router.get('/available-slots/:date', async (req, res) => {
  try {
    const { date } = req.params;

    // Buscar horários disponíveis deste dia
    const { data: slots, error } = await supabase
      .from('pastoral_cabinet_schedules')
      .select('id, date, time, duration_minutes')
      .eq('date', date)
      .eq('is_available', true)
      .order('time', { ascending: true });

    if (error) {
      console.error('Erro ao buscar:', error);
      return res.status(500).json({ error: error.message });
    }

    // Formatar resposta
    const result = slots.map(slot => ({
      schedule_id: slot.id,
      date: slot.date,
      time: slot.time,
      duration_minutes: slot.duration_minutes
    }));

    res.json(result);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS: Agendamentos (Voluntário)
// ─────────────────────────────────────────────────────────────────────────────

// POST: Agendar gabinete
router.post('/bookings', async (req, res) => {
  try {
    const { volunteer_id, schedule_id, date, time, duration_minutes, status, notes } = req.body;

    // Validação
    if (!volunteer_id || !schedule_id || !date || !time) {
      return res.status(400).json({
        error: 'Voluntário, horário, data e hora são obrigatórios'
      });
    }

    // Verificar se o horário ainda está disponível
    const { data: schedule, error: scheduleError } = await supabase
      .from('pastoral_cabinet_schedules')
      .select('is_available')
      .eq('id', schedule_id)
      .single();

    if (scheduleError || !schedule || !schedule.is_available) {
      return res.status(400).json({
        error: 'Este horário não está mais disponível'
      });
    }

    // Verificar se o voluntário já tem agendamento neste horário
    const { data: existing, error: existError } = await supabase
      .from('pastoral_cabinet_bookings')
      .select('id')
      .eq('volunteer_id', volunteer_id)
      .eq('schedule_id', schedule_id)
      .limit(1);

    if (existError) {
      console.error('Erro ao verificar:', existError);
      return res.status(500).json({ error: existError.message });
    }

    if (existing && existing.length > 0) {
      return res.status(400).json({
        error: 'Você já tem um agendamento neste horário'
      });
    }

    // Criar agendamento
    const { data: booking, error: bookingError } = await supabase
      .from('pastoral_cabinet_bookings')
      .insert([
        {
          volunteer_id,
          schedule_id,
          date,
          time,
          duration_minutes,
          status: status || 'Agendado',
          notes
        }
      ])
      .select();

    if (bookingError) {
      console.error('Erro ao criar agendamento:', bookingError);
      return res.status(500).json({ error: bookingError.message });
    }

    // Marcar horário como não disponível
    await supabase
      .from('pastoral_cabinet_schedules')
      .update({ is_available: false })
      .eq('id', schedule_id);

    res.status(201).json(booking[0]);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET: Agendamentos de um voluntário
router.get('/bookings/volunteer/:volunteerId', async (req, res) => {
  try {
    const { volunteerId } = req.params;

    const { data, error } = await supabase
      .from('pastoral_cabinet_bookings')
      .select('*')
      .eq('volunteer_id', volunteerId)
      .order('date', { ascending: false })
      .order('time', { ascending: false });

    if (error) {
      console.error('Erro ao buscar:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT: Atualizar status do agendamento
router.put('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const { data, error } = await supabase
      .from('pastoral_cabinet_bookings')
      .update({ status, notes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Erro ao atualizar:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Cancelar agendamento
router.delete('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar agendamento para obter schedule_id
    const { data: booking, error: getError } = await supabase
      .from('pastoral_cabinet_bookings')
      .select('schedule_id')
      .eq('id', id)
      .single();

    if (getError || !booking) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    // Deletar agendamento
    const { error: deleteError } = await supabase
      .from('pastoral_cabinet_bookings')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Erro ao deletar:', deleteError);
      return res.status(500).json({ error: deleteError.message });
    }

    // Liberar horário (marcar como disponível)
    await supabase
      .from('pastoral_cabinet_schedules')
      .update({ is_available: true })
      .eq('id', booking.schedule_id);

    res.json({ message: 'Agendamento cancelado com sucesso' });
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
