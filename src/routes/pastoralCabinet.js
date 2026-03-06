import express from 'express';
import { supabase } from '../utils/supabaseServer.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS: Gerenciar Disponibilidade (Admin/Secretaria)
// ─────────────────────────────────────────────────────────────────────────────

// POST: Criar novo horário disponível
router.post('/schedules', async (req, res) => {
  try {
    const { date, time, duration_minutes, is_available } = req.body;

    if (!date || !time || !duration_minutes) {
      return res.status(400).json({ error: 'Data, hora e duração são obrigatórios' });
    }

    const { data, error } = await supabase
      .from('pastoral_cabinet_schedules')
      .insert([{ date, time, duration_minutes, is_available: is_available !== false }])
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

// GET: Listar todos os horários (com dados do agendamento se ocupado)
router.get('/schedules', async (req, res) => {
  try {
    const { data: schedules, error } = await supabase
      .from('pastoral_cabinet_schedules')
      .select('*')
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('Erro ao buscar:', error);
      return res.status(500).json({ error: error.message });
    }

    // Buscar bookings para enriquecer os horários ocupados
    const { data: bookings } = await supabase
      .from('pastoral_cabinet_bookings')
      .select('id, schedule_id, booked_name, booked_phone, subject, volunteer_id')
      .in('schedule_id', schedules.map(s => s.id));

    const bookingMap = {};
    (bookings || []).forEach(b => { bookingMap[b.schedule_id] = b; });

    const enriched = schedules.map(s => {
      const b = bookingMap[s.id];
      return {
        ...s,
        booking_id:      b?.id || null,
        // Prefer booking table, fallback to fields stored directly on schedule
        booked_by_name:  b?.booked_name  || s.booked_by_name  || null,
        booked_by_phone: b?.booked_phone || s.booked_by_phone || null,
        booking_subject: b?.subject      || s.booking_subject || null,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT: Atualizar dados de um horário (data, hora, duração, solicitante, disponibilidade)
router.put('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, duration_minutes, is_available,
            booked_by_name, booked_by_phone, booking_subject } = req.body;

    const updateData = {};
    if (date              !== undefined) updateData.date              = date;
    if (time              !== undefined) updateData.time              = time;
    if (duration_minutes  !== undefined) updateData.duration_minutes  = duration_minutes;
    if (is_available      !== undefined) updateData.is_available      = is_available;
    if (booked_by_name    !== undefined) updateData.booked_by_name    = booked_by_name;
    if (booked_by_phone   !== undefined) updateData.booked_by_phone   = booked_by_phone;
    if (booking_subject   !== undefined) updateData.booking_subject   = booking_subject;

    const { data, error } = await supabase
      .from('pastoral_cabinet_schedules')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Erro ao atualizar horário:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Deletar um horário
router.delete('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;

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
      return res.status(400).json({ error: 'Não é possível deletar este horário pois já tem agendamento' });
    }

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
    const { month } = req.params;
    const [year, monthNum] = month.split('-');

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

    const availability = {};
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${monthNum}-${String(day).padStart(2, '0')}`;
      availability[dateStr] = { hasAvailable: false };
    }

    schedules.forEach(schedule => {
      if (schedule.is_available) {
        availability[schedule.date].hasAvailable = true;
      }
    });

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
// ROTAS: Agendamentos
// ─────────────────────────────────────────────────────────────────────────────

// POST: Criar agendamento (voluntário OU secretaria)
router.post('/bookings', async (req, res) => {
  try {
    const {
      volunteer_id, schedule_id, date, time, duration_minutes, status, notes,
      booked_name, booked_phone, subject
    } = req.body;

    if (!schedule_id) {
      return res.status(400).json({ error: 'Horário é obrigatório' });
    }

    if (!volunteer_id && !booked_name) {
      return res.status(400).json({ error: 'Nome do solicitante é obrigatório' });
    }

    // Buscar dados completos do horário
    const { data: schedule, error: scheduleError } = await supabase
      .from('pastoral_cabinet_schedules')
      .select('id, date, time, duration_minutes, is_available')
      .eq('id', schedule_id)
      .single();

    if (scheduleError || !schedule) {
      return res.status(404).json({ error: 'Horário não encontrado' });
    }

    if (!schedule.is_available) {
      return res.status(400).json({ error: 'Este horário não está mais disponível' });
    }

    // Se for voluntário: verificar duplicata
    if (volunteer_id) {
      const { data: existing } = await supabase
        .from('pastoral_cabinet_bookings')
        .select('id')
        .eq('volunteer_id', volunteer_id)
        .eq('schedule_id', schedule_id)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.status(400).json({ error: 'Você já tem um agendamento neste horário' });
      }
    }

    // Montar objeto de insert
    const insertData = {
      schedule_id,
      date: date || schedule.date,
      time: time || schedule.time,
      duration_minutes: duration_minutes || schedule.duration_minutes,
      status: status || 'Agendado',
      notes: notes || null,
    };
    if (volunteer_id) insertData.volunteer_id = volunteer_id;
    if (booked_name)  insertData.booked_name  = booked_name;
    if (booked_phone) insertData.booked_phone = booked_phone;
    if (subject)      insertData.subject      = subject;

    const { data: booking, error: bookingError } = await supabase
      .from('pastoral_cabinet_bookings')
      .insert([insertData])
      .select();

    if (bookingError) {
      console.error('Erro ao criar agendamento:', bookingError);
      return res.status(500).json({ error: bookingError.message });
    }

    // Marcar horário como ocupado
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

// PUT: Atualizar agendamento (status, notas, nome, telefone, assunto)
router.put('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, booked_name, booked_phone, subject } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (status       !== undefined) updateData.status       = status;
    if (notes        !== undefined) updateData.notes        = notes;
    if (booked_name  !== undefined) updateData.booked_name  = booked_name;
    if (booked_phone !== undefined) updateData.booked_phone = booked_phone;
    if (subject      !== undefined) updateData.subject      = subject;

    const { data, error } = await supabase
      .from('pastoral_cabinet_bookings')
      .update(updateData)
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

// DELETE: Cancelar agendamento (libera o horário)
router.delete('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: booking, error: getError } = await supabase
      .from('pastoral_cabinet_bookings')
      .select('schedule_id')
      .eq('id', id)
      .single();

    if (getError || !booking) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    const { error: deleteError } = await supabase
      .from('pastoral_cabinet_bookings')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Erro ao deletar:', deleteError);
      return res.status(500).json({ error: deleteError.message });
    }

    // Liberar horário
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
