// ─── EcclesiaScale API Server (Supabase Edition) ─────────────────────────────
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ─── Supabase Setup ───────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const PORT = process.env.PORT || 3000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Não autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ message: 'Token inválido' }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Acesso negado' });
    next();
  };
}

function isAdmin(role) { return ['SuperAdmin', 'Admin'].includes(role); }

async function notify(userId, title, message) {
  if (!userId) return;
  await db.from('notifications').insert({ user_id: userId, title, message });
}

function generateActivationKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(32);
  let key = '';
  for (let i = 0; i < 32; i++) key += chars[bytes[i] % chars.length];
  return `EC-${key.slice(0, 8)}-${key.slice(8, 16)}-${key.slice(16, 24)}-${key.slice(24, 32)}`;
}

async function checkTrial(res) {
  const { data: activation } = await db.from('settings').select('value').eq('key', 'activated').single();
  if (activation?.value === '1') return true;
  const { data: trial } = await db.from('settings').select('value').eq('key', 'trial_expires').single();
  if (!trial) return true;
  if (new Date() > new Date(trial.value)) {
    res.status(403).json({ message: 'Período de teste expirado. Insira uma chave de ativação.' });
    return false;
  }
  return true;
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ─── Rotas públicas ───────────────────────────────────────────────────────────
app.get('/api/public/departments', async (req, res) => {
  const { data, error } = await db.from('departments').select('id, name').order('name');
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.get('/api/public/cult_types', async (req, res) => {
  const { data, error } = await db.from('cult_types').select('id, name').order('name');
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Dados incompletos' });

  const { data: user } = await db.from('users').select('*').eq('email', email).eq('is_active', true).single();
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ message: 'Credenciais inválidas' });

  await db.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

  let memberName = email;
  if (user.member_id) {
    const { data: member } = await db.from('members').select('name').eq('id', user.member_id).single();
    memberName = member?.name || email;
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, member_id: user.member_id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ id: user.id, email: user.email, role: user.role, member_id: user.member_id, name: memberName, token });
});

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: 'Dados obrigatórios' });
  if (password.length < 8) return res.status(400).json({ message: 'Senha deve ter mínimo 8 caracteres' });

  const hash = bcrypt.hashSync(password, 10);
  const { data: member, error: memberError } = await db.from('members').insert({ name, email, role: 'Membro', is_active: true }).select().single();
  if (memberError) {
    if (memberError.code === '23505') return res.status(409).json({ message: 'E-mail já cadastrado' });
    return res.status(500).json({ message: 'Erro ao criar conta' });
  }

  const { error: userError } = await db.from('users').insert({ email, password: hash, role: 'Membro', member_id: member.id });
  if (userError) {
    if (userError.code === '23505') return res.status(409).json({ message: 'E-mail já cadastrado' });
    return res.status(500).json({ message: 'Erro ao criar conta' });
  }

  res.json({ message: 'Conta criada com sucesso' });
});

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  const { data: user } = await db.from('users').select('id').eq('email', email).single();
  if (!user) return res.json({ message: 'Se o e-mail existir, você receberá as instruções.' });

  const code = randomBytes(4).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + 3600000).toISOString();
  await db.from('users').update({ two_factor_code: code, two_factor_expires: expires }).eq('id', user.id);
  res.json({ message: 'Se o e-mail existir, você receberá as instruções.' });
});

app.post('/api/verify-2fa', async (req, res) => {
  const { code, tempToken } = req.body;
  try {
    const payload = jwt.verify(tempToken, JWT_SECRET + '_2fa');
    const { data: user } = await db.from('users').select('*').eq('id', payload.id).eq('two_factor_code', code).single();
    if (!user) return res.status(401).json({ message: 'Código inválido' });
    if (new Date(user.two_factor_expires) < new Date()) return res.status(401).json({ message: 'Código expirado' });

    await db.from('users').update({ two_factor_code: null, two_factor_expires: null }).eq('id', user.id);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, member_id: user.member_id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ id: user.id, email: user.email, role: user.role, member_id: user.member_id, token });
  } catch { res.status(401).json({ message: 'Token inválido' }); }
});

// ─── Settings / Trial ─────────────────────────────────────────────────────────
app.get('/api/settings/trial', async (req, res) => {
  const { data: activated } = await db.from('settings').select('value').eq('key', 'activated').single();
  if (activated?.value === '1') return res.json({ isActive: true, isTrial: false, daysLeft: 999, isExpired: false, message: 'Ativo' });

  const { data: trial } = await db.from('settings').select('value').eq('key', 'trial_expires').single();
  if (!trial) return res.json({ isActive: true, isTrial: false, daysLeft: 999, isExpired: false, message: '' });

  const expires = new Date(trial.value);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((expires - now) / 86400000));
  const isExpired = now > expires;

  res.json({ isActive: !isExpired, isTrial: true, daysLeft, isExpired, message: isExpired ? 'Expirado' : `${daysLeft} dia(s) restante(s)` });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get('/api/dashboard/stats', auth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const [{ count: futureEvents }, { count: activeVolunteers }, { count: filledSlots }, { count: pendingConfirmations }, { count: swapRequests }] = await Promise.all([
    db.from('cults').select('*', { count: 'exact', head: true }).gte('date', today).neq('status', 'Cancelado'),
    db.from('members').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('scales').select('*', { count: 'exact', head: true }).eq('status', 'Confirmado'),
    db.from('scales').select('*', { count: 'exact', head: true }).eq('status', 'Pendente'),
    db.from('swaps').select('*', { count: 'exact', head: true }).eq('status', 'Pendente'),
  ]);

  res.json({ futureEvents, activeVolunteers, filledSlots, pendingConfirmations, swapRequests });
});

// ─── Members ──────────────────────────────────────────────────────────────────
app.get('/api/members', auth, async (req, res) => {
  const { is_active, department_id } = req.query;

  let query = db.from('members').select('*, departments(name)').order('name');
  if (is_active !== undefined) query = query.eq('is_active', is_active === '1' || is_active === 'true');
  if (department_id) query = query.eq('department_id', Number(department_id));

  if (req.user.role === 'Líder' && req.user.member_id) {
    const { data: leaderMember } = await db.from('members').select('department_id').eq('id', req.user.member_id).single();
    if (leaderMember?.department_id) query = query.eq('department_id', leaderMember.department_id);
  }

  const { data: members, error } = await query;
  if (error) return res.status(500).json({ message: error.message });

  const memberIds = members.map(m => m.id);
  const { data: mmRows } = await db.from('member_ministries').select('member_id, ministries(*)').in('member_id', memberIds);

  members.forEach(m => {
    if (typeof m.availability === 'string') m.availability = JSON.parse(m.availability || '{}');
    m.department_name = m.departments?.name || null;
    delete m.departments;
    m.ministries = mmRows?.filter(r => r.member_id === m.id).map(r => r.ministries) || [];
  });

  res.json(members);
});

app.get('/api/members/:id', auth, async (req, res) => {
  const { data: m, error } = await db.from('members').select('*, departments(name)').eq('id', req.params.id).single();
  if (!m || error) return res.status(404).json({ message: 'Membro não encontrado' });

  if (typeof m.availability === 'string') m.availability = JSON.parse(m.availability || '{}');
  m.department_name = m.departments?.name || null;
  delete m.departments;

  const { data: mmRows } = await db.from('member_ministries').select('ministries(*)').eq('member_id', m.id);
  m.ministries = mmRows?.map(r => r.ministries) || [];

  res.json(m);
});

app.post('/api/members', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { name, email, whatsapp, availability, role, department_id, status, ministries } = req.body;
  if (!name) return res.status(400).json({ message: 'Nome obrigatório' });

  const { data: member, error } = await db.from('members').insert({
    name, email: email || null, whatsapp: whatsapp || null,
    availability: availability || {},
    role: role || 'Membro', department_id: department_id || null, status: status || 'Ativo'
  }).select().single();

  if (error) return res.status(500).json({ message: error.message });

  if (email) {
    const { data: existingUser } = await db.from('users').select('id').eq('email', email).maybeSingle();
    if (!existingUser) {
      const hash = bcrypt.hashSync('EcclesiaScale@' + member.id, 10);
      await db.from('users').insert({ email, password: hash, role: role || 'Membro', member_id: member.id });
    }
  }

  if (ministries?.length) {
    await db.from('member_ministries').upsert(ministries.map(min => ({ member_id: member.id, ministry_id: min.id })), { ignoreDuplicates: true });
  }

  res.json({ id: member.id, message: 'Membro criado' });
});

app.put('/api/members/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { name, email, whatsapp, availability, role, department_id, status, is_active, ministries } = req.body;

  await db.from('members').update({
    name, email: email || null, whatsapp: whatsapp || null,
    availability: availability || {},
    role, department_id: department_id || null, status, is_active: is_active ?? true
  }).eq('id', req.params.id);

  if (email && role) {
    const { data: existingUser } = await db.from('users').select('id').eq('email', email).maybeSingle();
    if (existingUser) {
      await db.from('users').update({ role, is_active: is_active ?? true }).eq('id', existingUser.id);
    }
  }

  if (ministries !== undefined) {
    await db.from('member_ministries').delete().eq('member_id', req.params.id);
    if (ministries.length) {
      await db.from('member_ministries').insert(ministries.map(min => ({ member_id: Number(req.params.id), ministry_id: min.id })));
    }
  }

  res.json({ message: 'Membro atualizado' });
});

// ─── Users ────────────────────────────────────────────────────────────────────
app.put('/api/users/:id/password', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ message: 'Senha deve ter mínimo 8 caracteres' });

  const memberId = Number(req.params.id);
  let { data: userByMember } = await db.from('users').select('id').eq('member_id', memberId).single();

  const hash = bcrypt.hashSync(password, 10);
  if (userByMember) {
    await db.from('users').update({ password: hash }).eq('id', userByMember.id);
  } else {
    await db.from('users').update({ password: hash }).eq('id', memberId);
  }
  res.json({ message: 'Senha alterada' });
});

app.post('/api/users/reset-password', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { email, new_password } = req.body;
  if (!email || !new_password) return res.status(400).json({ message: 'Dados obrigatórios' });
  if (new_password.length < 8) return res.status(400).json({ message: 'Senha deve ter mínimo 8 caracteres' });
  const { data: user } = await db.from('users').select('id').eq('email', email.toLowerCase().trim()).single();
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
  const hash = bcrypt.hashSync(new_password, 10);
  await db.from('users').update({ password: hash }).eq('id', user.id);
  res.json({ message: 'Senha redefinida com sucesso' });
});

// ─── Generic CRUD: ministries / departments / cult_types ─────────────────────
const SIMPLE_TABLES = ['ministries', 'departments', 'cult_types'];

SIMPLE_TABLES.forEach(table => {
  app.get(`/api/${table}`, auth, async (req, res) => {
    const { data, error } = await db.from(table).select('*').order('name');
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post(`/api/${table}`, auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
    const { name, icon, is_active, default_time, default_day } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome obrigatório' });

    const { data: existing } = await db.from(table).select('id').ilike('name', name.trim()).maybeSingle();
    if (existing) return res.status(409).json({ message: `Já existe um item com o nome "${name.trim()}" nesta lista.` });

    let payload = table === 'cult_types'
      ? { name: name.trim(), default_time: default_time || null, default_day: default_day ?? null }
      : { name: name.trim(), icon: icon || null, is_active: is_active ?? true };

    const { data, error } = await db.from(table).insert(payload).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ message: `Já existe um item com o nome "${name.trim()}" nesta lista.` });
      return res.status(500).json({ message: error.message });
    }
    res.json({ id: data.id });
  });

  app.put(`/api/${table}/:id`, auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
    const { name, icon, is_active, default_time, default_day } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome obrigatório' });

    const { data: existing } = await db.from(table).select('id').ilike('name', name.trim()).neq('id', req.params.id).maybeSingle();
    if (existing) return res.status(409).json({ message: `Já existe um item com o nome "${name.trim()}" nesta lista.` });

    let payload = table === 'cult_types'
      ? { name: name.trim(), default_time: default_time || null, default_day: default_day ?? null }
      : { name: name.trim(), icon: icon || null, is_active: is_active ?? true };

    await db.from(table).update(payload).eq('id', req.params.id);
    res.json({ message: 'Atualizado' });
  });

  app.delete(`/api/${table}/:id`, auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
    await db.from(table).delete().eq('id', req.params.id);
    res.json({ message: 'Excluído' });
  });
});

// ─── Sectors CRUD ─────────────────────────────────────────────────────────────
app.get('/api/sectors', auth, async (req, res) => {
  const { data, error } = await db.from('sectors').select('*, departments(name)').order('name');
  if (error) return res.status(500).json({ message: error.message });
  res.json(data.map(s => ({ ...s, department_name: s.departments?.name || null, departments: undefined })));
});

app.post('/api/sectors', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { name, is_active, department_id } = req.body;
  if (!name) return res.status(400).json({ message: 'Nome obrigatório' });

  if (req.user.role === 'Líder') {
    const { data: leaderMember } = await db.from('members').select('department_id').eq('id', req.user.member_id).single();
    if (!leaderMember?.department_id || leaderMember.department_id !== Number(department_id)) {
      return res.status(403).json({ message: 'Líderes só podem gerenciar setores do próprio departamento' });
    }
  }

  const { data: existing } = await db.from('sectors').select('id').ilike('name', name.trim()).maybeSingle();
  if (existing) return res.status(409).json({ message: `Já existe um setor com o nome "${name.trim()}"` });

  const { data, error } = await db.from('sectors').insert({
    name: name.trim(), is_active: is_active ?? true, department_id: department_id || null,
  }).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json({ id: data.id });
});

app.put('/api/sectors/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { name, is_active, department_id } = req.body;
  if (!name) return res.status(400).json({ message: 'Nome obrigatório' });

  if (req.user.role === 'Líder') {
    const { data: sector } = await db.from('sectors').select('department_id').eq('id', req.params.id).single();
    const { data: leaderMember } = await db.from('members').select('department_id').eq('id', req.user.member_id).single();
    if (!sector || sector.department_id !== leaderMember?.department_id) {
      return res.status(403).json({ message: 'Líderes só podem gerenciar setores do próprio departamento' });
    }
  }

  const { data: existing } = await db.from('sectors').select('id').ilike('name', name.trim()).neq('id', req.params.id).maybeSingle();
  if (existing) return res.status(409).json({ message: `Já existe um setor com o nome "${name.trim()}"` });

  await db.from('sectors').update({
    name: name.trim(), is_active: is_active ?? true, department_id: department_id || null,
  }).eq('id', req.params.id);
  res.json({ message: 'Atualizado' });
});

app.delete('/api/sectors/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  if (req.user.role === 'Líder') {
    const { data: sector } = await db.from('sectors').select('department_id').eq('id', req.params.id).single();
    const { data: leaderMember } = await db.from('members').select('department_id').eq('id', req.user.member_id).single();
    if (!sector || sector.department_id !== leaderMember?.department_id) {
      return res.status(403).json({ message: 'Líderes só podem gerenciar setores do próprio departamento' });
    }
  }
  await db.from('sectors').delete().eq('id', req.params.id);
  res.json({ message: 'Excluído' });
});

// ─── Cults ────────────────────────────────────────────────────────────────────
app.get('/api/cults', auth, async (req, res) => {
  const { status, limit } = req.query;
  let query = db.from('cults').select('*, cult_types(name)').order('date', { ascending: false });
  if (status) query = query.eq('status', status);
  if (limit) query = query.limit(Number(limit));

  const { data, error } = await query;
  if (error) return res.status(500).json({ message: error.message });

  res.json(data.map(c => ({ ...c, type_name: c.cult_types?.name || null, cult_types: undefined })));
});

app.post('/api/cults', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { type_id, name, date, time, status } = req.body;
  if (!date || !time) return res.status(400).json({ message: 'Data e horário obrigatórios' });
  const { data, error } = await db.from('cults').insert({ type_id: type_id || null, name: name || null, date, time, status: status || 'Agendado' }).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json({ id: data.id });
});

app.put('/api/cults/:id', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { type_id, name, date, time, status } = req.body;
  await db.from('cults').update({ type_id: type_id || null, name: name || null, date, time, status: status || 'Agendado' }).eq('id', req.params.id);
  res.json({ message: 'Atualizado' });
});

app.delete('/api/cults/:id', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  await db.from('cults').delete().eq('id', req.params.id);
  res.json({ message: 'Excluído' });
});

app.post('/api/cults/generate-month', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { month, cult_type_ids } = req.body;
  if (!month || !cult_type_ids?.length) return res.status(400).json({ message: 'Mês e tipos obrigatórios' });

  const [year, mon] = month.split('-').map(Number);
  const { data: cultTypes } = await db.from('cult_types').select('*').in('id', cult_type_ids);

  const toInsert = [];
  const daysInMonth = new Date(year, mon, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, mon - 1, day);
    const dayOfWeek = date.getDay();
    const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    for (const ct of cultTypes) {
      if (ct.default_day === dayOfWeek || ct.default_day === null) {
        toInsert.push({ type_id: ct.id, date: dateStr, time: ct.default_time || '19:00', status: 'Agendado' });
      }
    }
  }

  if (toInsert.length) await db.from('cults').insert(toInsert);
  res.json({ message: `${toInsert.length} culto(s) criado(s)` });
});

// ─── Scales ───────────────────────────────────────────────────────────────────
app.get('/api/scales', auth, async (req, res) => {
  const { cult_id, member_id, limit } = req.query;

  let query = db.from('scales').select(`
    *,
    members(name),
    sectors(name),
    cults(date, time, name, cult_types(name))
  `).order('cult_id');

  if (cult_id) query = query.eq('cult_id', Number(cult_id));
  if (member_id) query = query.eq('member_id', Number(member_id));
  if (limit) query = query.limit(Number(limit));

  const { data, error } = await query;
  if (error) return res.status(500).json({ message: error.message });

  res.json(data.map(s => ({
    ...s,
    member_name: s.members?.name,
    sector_name: s.sectors?.name,
    cult_date: s.cults?.date,
    cult_time: s.cults?.time,
    cult_name: s.cults?.cult_types?.name || s.cults?.name,
    members: undefined, sectors: undefined, cults: undefined,
  })));
});

app.post('/api/scales', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { cult_id, member_id, sector_id } = req.body;
  if (!cult_id || !member_id || !sector_id) return res.status(400).json({ message: 'Dados obrigatórios' });

  const { data: existing } = await db.from('scales').select('id').eq('cult_id', cult_id).eq('member_id', member_id).maybeSingle();
  if (existing) return res.status(409).json({ message: 'Voluntário já está escalado neste culto' });

  const { data: cult } = await db.from('cults').select('date').eq('id', cult_id).single();
  if (cult) {
    const month = cult.date.slice(0, 7);
    const { count: monthCount } = await db.from('scales')
      .select('*, cults!inner(date)', { count: 'exact', head: true })
      .eq('member_id', member_id)
      .neq('status', 'Recusado')
      .like('cults.date', `${month}%`);

    if (monthCount >= 3 && !isAdmin(req.user.role)) {
      return res.status(409).json({ message: `Voluntário já está escalado ${monthCount}x neste mês (máximo 3)` });
    }
  }

  let department_id = req.body.department_id || null;
  if (!department_id && req.user.member_id) {
    const { data: leaderMember } = await db.from('members').select('department_id').eq('id', req.user.member_id).single();
    department_id = leaderMember?.department_id || null;
  }

  const { data, error } = await db.from('scales').insert({ cult_id, member_id, sector_id, department_id }).select().single();
  if (error) return res.status(500).json({ message: error.message });

  const { data: user } = await db.from('users').select('id').eq('member_id', member_id).maybeSingle();
  if (user && cult) {
    const { data: sector } = await db.from('sectors').select('name').eq('id', sector_id).single();
    await notify(user.id, 'Nova Escala', `Você foi escalado para ${sector?.name || 'setor'} em ${cult.date}`);
  }

  res.json({ id: data.id });
});

// ─── Escalas agrupadas por departamento ──────────────────────────────────────
app.get('/api/scales/by-department/:cult_id', auth, async (req, res) => {
  const cult_id = Number(req.params.cult_id);

  const { data: scales, error } = await db.from('scales').select(`
    id, status, department_id,
    members(id, name, department_id),
    sectors(id, name, department_id),
    departments(name)
  `).eq('cult_id', cult_id).order('department_id');

  if (error) return res.status(500).json({ message: error.message });

  const { data: allDepartments } = await db.from('departments').select('*').eq('is_active', true).order('name');

  const grouped = {};
  for (const dept of allDepartments || []) {
    grouped[dept.id] = { department_id: dept.id, department_name: dept.name, scales: [] };
  }
  grouped['none'] = { department_id: null, department_name: 'Sem Departamento', scales: [] };

  for (const s of scales || []) {
    // ✅ Prioridade: department_id do SETOR (onde o membro foi escalado),
    //    fallback para department_id do membro, depois da escala
    const deptId = s.sectors?.department_id || s.members?.department_id || s.department_id || null;
    const key = deptId && grouped[deptId] ? deptId : 'none';
    grouped[key].scales.push({
      id: s.id,
      status: s.status,
      member_name: s.members?.name || '—',
      member_id: s.members?.id,
      sector_name: s.sectors?.name || '—',
      department_id: deptId,
      department_name: grouped[deptId]?.department_name || '—',
    });
  }

  const result = Object.values(grouped)
    .filter(g => g.scales.length > 0 || g.department_id !== null)
    .sort((a, b) => {
      if (a.department_id === null) return 1;
      if (b.department_id === null) return -1;
      return a.department_name.localeCompare(b.department_name);
    });

  res.json(result);
});

// ─── Preencher voluntários automaticamente ────────────────────────────────────
app.post('/api/scales/fill-cult', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { cult_id } = req.body;
  if (!cult_id) return res.status(400).json({ message: 'cult_id obrigatório' });

  const { data: cult } = await db.from('cults').select('*').eq('id', cult_id).single();
  if (!cult) return res.status(404).json({ message: 'Culto não encontrado' });
  const monthStr = cult.date.slice(0, 7);

  const { data: sectors } = await db.from('sectors').select('*').eq('is_active', true);
  if (!sectors?.length) return res.status(400).json({ message: 'Nenhum setor ativo cadastrado' });

  const { data: already } = await db.from('scales').select('member_id, sector_id').eq('cult_id', cult_id);
  const alreadyMemberIds = new Set((already || []).map(s => s.member_id));
  const alreadySectorIds = new Set((already || []).map(s => s.sector_id));

  const pendingSectors = sectors.filter(s => !alreadySectorIds.has(s.id));
  if (!pendingSectors.length) return res.json({ message: 'Todos os setores já estão preenchidos', created: 0 });

  const { data: members } = await db.from('members')
    .select('id, name, department_id')
    .eq('is_active', true)
    .eq('status', 'Ativo');

  const monthCountMap = {};
  for (const m of members || []) {
    const { count } = await db.from('scales')
      .select('*, cults!inner(date)', { count: 'exact', head: true })
      .eq('member_id', m.id)
      .not('status', 'eq', 'Recusado')
      .like('cults.date', `${monthStr}%`);
    monthCountMap[m.id] = count || 0;
  }

  const eligible = (members || []).filter(m =>
    !alreadyMemberIds.has(m.id) && monthCountMap[m.id] < 3
  );

  const shuffled = eligible.sort(() => Math.random() - 0.5);
  let created = 0;
  const usedInThisCult = new Set(alreadyMemberIds);

  for (const sector of pendingSectors) {
    // ✅ Prioriza membro do mesmo departamento do setor
    const candidate =
      shuffled.find(m => !usedInThisCult.has(m.id) && m.department_id === sector.department_id) ||
      shuffled.find(m => !usedInThisCult.has(m.id));
    if (!candidate) break;

    const { error } = await db.from('scales').insert({
      cult_id,
      member_id: candidate.id,
      sector_id: sector.id,
      department_id: candidate.department_id || null, // ✅ salva department do membro
    });

    if (!error) {
      usedInThisCult.add(candidate.id);
      created++;
      const { data: userRow } = await db.from('users').select('id').eq('member_id', candidate.id).maybeSingle();
      if (userRow) await notify(userRow.id, 'Nova Escala', `Você foi escalado para ${sector.name} em ${cult.date}`);
    }
  }

  res.json({ message: `${created} voluntário(s) adicionado(s) automaticamente`, created });
});

app.put('/api/scales/:id/confirm', auth, async (req, res) => {
  await db.from('scales').update({ status: 'Confirmado', confirmed_at: new Date().toISOString() }).eq('id', req.params.id);
  res.json({ message: 'Confirmado' });
});

app.delete('/api/scales/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  await db.from('scales').delete().eq('id', req.params.id);
  res.json({ message: 'Removido' });
});

// ─── Auto Generate — OTIMIZADO ────────────────────────────────────────────────
app.post('/api/scales/auto-generate', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { type, cult_id, month } = req.body;
  const today = new Date().toISOString().slice(0, 10);

  let cultsQuery = db.from('cults').select('*').neq('status', 'Cancelado');
  if (type === 'month' && month)  cultsQuery = cultsQuery.like('date', `${month}%`);
  else if (cult_id)               cultsQuery = cultsQuery.eq('id', cult_id);
  else                            cultsQuery = cultsQuery.gte('date', today);

  const [{ data: cults }, { data: members }, { data: sectors }] = await Promise.all([
    cultsQuery,
    db.from('members').select('id, name, department_id').eq('is_active', true).eq('status', 'Ativo'),
    db.from('sectors').select('id, name, department_id').eq('is_active', true),
  ]);

  if (!cults?.length)   return res.json({ message: 'Nenhum culto encontrado', created: 0, cults_count: 0 });
  if (!members?.length) return res.json({ message: 'Nenhum voluntário ativo', created: 0, cults_count: 0 });
  if (!sectors?.length) return res.json({ message: 'Nenhum setor ativo', created: 0, cults_count: 0 });

  const months = [...new Set(cults.map(c => c.date.slice(0, 7)))];
  const cultIds = cults.map(c => c.id);

  const { data: existingScales } = await db.from('scales')
    .select('cult_id, member_id, sector_id')
    .in('cult_id', cultIds.slice(0, 500));

  // Contagens mensais em paralelo
  const monthCountResults = await Promise.all(
    months.map(m =>
      db.from('scales')
        .select('member_id, cults!inner(date)')
        .like('cults.date', `${m}%`)
        .neq('status', 'Recusado')
    )
  );

  const memberMonthCount = {};
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    for (const row of monthCountResults[i]?.data || []) {
      const key = `${row.member_id}:${m}`;
      memberMonthCount[key] = (memberMonthCount[key] || 0) + 1;
    }
  }

  const cultMemberSet = new Set();
  const cultSectorSet = new Set();
  for (const s of existingScales || []) {
    cultMemberSet.add(`${s.cult_id}:${s.member_id}`);
    cultSectorSet.add(`${s.cult_id}:${s.sector_id}`);
  }

  const toInsert = [];

  for (const cult of cults) {
    const monthStr = cult.date.slice(0, 7);
    const freeSectors = sectors.filter(s => !cultSectorSet.has(`${cult.id}:${s.id}`));
    if (!freeSectors.length) continue;

    const shuffled = [...members].sort(() => Math.random() - 0.5);

    const usedInCult = new Set(
      [...cultMemberSet]
        .filter(k => k.startsWith(`${cult.id}:`))
        .map(k => Number(k.split(':')[1]))
    );

    for (const sector of freeSectors) {
      // ✅ Prioriza membro do mesmo departamento do setor
      const candidate =
        shuffled.find(m => {
          if (usedInCult.has(m.id)) return false;
          if ((memberMonthCount[`${m.id}:${monthStr}`] || 0) >= 3) return false;
          return m.department_id === sector.department_id;
        }) ||
        shuffled.find(m => {
          if (usedInCult.has(m.id)) return false;
          return (memberMonthCount[`${m.id}:${monthStr}`] || 0) < 3;
        });

      if (!candidate) continue;

      toInsert.push({
        cult_id: cult.id,
        member_id: candidate.id,
        sector_id: sector.id,
        department_id: candidate.department_id || null, // ✅ department do membro
      });

      usedInCult.add(candidate.id);
      cultMemberSet.add(`${cult.id}:${candidate.id}`);
      cultSectorSet.add(`${cult.id}:${sector.id}`);
      const key = `${candidate.id}:${monthStr}`;
      memberMonthCount[key] = (memberMonthCount[key] || 0) + 1;
    }
  }

  const BATCH = 500;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.from('scales').insert(toInsert.slice(i, i + BATCH));
  }

  res.json({
    message: `${toInsert.length} escala(s) gerada(s)`,
    created: toInsert.length,
    cults_count: cults.length,
    scales_count: toInsert.length,
  });
});

// ─── Swaps ────────────────────────────────────────────────────────────────────
app.get('/api/swaps', auth, async (req, res) => {
  const { status, member_id, limit } = req.query;

  let query = db.from('swaps').select(`
    *,
    requester:members!swaps_requester_id_fkey(name),
    suggested:members!swaps_suggested_member_id_fkey(name),
    scales(sector_id, department_id, cults(date, name, cult_types(name)), sectors(name))
  `).order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (member_id) query = query.or(`requester_id.eq.${member_id},suggested_member_id.eq.${member_id}`);
  if (limit) query = query.limit(Number(limit));

  if (req.user.role === 'Líder' && req.user.member_id) {
    const { data: leaderMember } = await db.from('members').select('department_id').eq('id', req.user.member_id).single();
    if (leaderMember?.department_id) query = query.eq('scales.department_id', leaderMember.department_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ message: error.message });

  res.json(data.map(sw => ({
    ...sw,
    requester_name: sw.requester?.name,
    suggested_member_name: sw.suggested?.name,
    sector_name: sw.scales?.sectors?.name,
    cult_name: sw.scales?.cults?.cult_types?.name || sw.scales?.cults?.name,
    cult_date: sw.scales?.cults?.date,
    requester: undefined, suggested: undefined, scales: undefined,
  })));
});

app.post('/api/swaps', auth, async (req, res) => {
  const { scale_id, suggested_email } = req.body;
  if (!scale_id) return res.status(400).json({ message: 'scale_id obrigatório' });

  const { data: scale } = await db.from('scales').select('*').eq('id', scale_id).single();
  if (!scale) return res.status(404).json({ message: 'Escala não encontrada' });

  const { data: requester } = await db.from('members').select('*').eq('id', scale.member_id).single();
  let suggestedId = null;

  if (suggested_email) {
    const { data: suggested } = await db.from('members').select('id, department_id').eq('email', suggested_email).single();
    if (!suggested) return res.status(404).json({ message: 'Membro sugerido não encontrado' });
    if (suggested.department_id !== requester.department_id) return res.status(400).json({ message: 'Trocas apenas entre membros do mesmo departamento' });
    suggestedId = suggested.id;
  }

  const { data, error } = await db.from('swaps').insert({
    scale_id, requester_id: scale.member_id, suggested_member_id: suggestedId, department_id: requester.department_id
  }).select().single();
  if (error) return res.status(500).json({ message: error.message });

  if (requester.department_id) {
    const { data: leader } = await db.from('users')
      .select('id, members!inner(department_id, role)')
      .eq('members.department_id', requester.department_id)
      .eq('members.role', 'Líder')
      .limit(1)
      .maybeSingle();
    if (leader) await notify(leader.id, 'Solicitação de Troca', `${requester.name} solicitou uma troca de setor`);
  }

  if (suggestedId) {
    const { data: sugUser } = await db.from('users').select('id').eq('member_id', suggestedId).maybeSingle();
    if (sugUser) await notify(sugUser.id, 'Troca Solicitada', `${requester.name} solicitou uma troca com você`);
  }

  res.json({ id: data.id });
});

app.put('/api/swaps/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { status } = req.body;
  const { data: swap } = await db.from('swaps').select('*').eq('id', req.params.id).single();
  if (!swap) return res.status(404).json({ message: 'Troca não encontrada' });

  await db.from('swaps').update({ status }).eq('id', req.params.id);

  if (status === 'Aprovado' && swap.suggested_member_id) {
    await db.from('scales').update({ member_id: swap.suggested_member_id, status: 'Troca' }).eq('id', swap.scale_id);
  }

  const { data: requesterUser } = await db.from('users').select('id').eq('member_id', swap.requester_id).maybeSingle();
  if (requesterUser) await notify(requesterUser.id, 'Troca ' + status, `Sua solicitação de troca foi ${status.toLowerCase()}`);

  if (swap.suggested_member_id) {
    const { data: sugUser } = await db.from('users').select('id').eq('member_id', swap.suggested_member_id).maybeSingle();
    if (sugUser) await notify(sugUser.id, 'Troca ' + status, `A troca foi ${status.toLowerCase()} pelo líder`);
  }

  res.json({ message: 'Atualizado' });
});

app.put('/api/swaps/:id/member', auth, async (req, res) => {
  const { member_status } = req.body;
  const { data: swap } = await db.from('swaps').select('*').eq('id', req.params.id).single();
  if (!swap) return res.status(404).json({ message: 'Troca não encontrada' });

  await db.from('swaps').update({ member_status }).eq('id', req.params.id);

  const { data: requesterUser } = await db.from('users').select('id').eq('member_id', swap.requester_id).maybeSingle();
  if (requesterUser) await notify(requesterUser.id, 'Resposta de Troca', `O membro ${member_status.toLowerCase()} a troca`);

  res.json({ message: 'Atualizado' });
});

// ─── Notifications ────────────────────────────────────────────────────────────
app.get('/api/notifications/:user_id', auth, async (req, res) => {
  const { data } = await db.from('notifications').select('*').eq('user_id', req.params.user_id).order('created_at', { ascending: false }).limit(50);
  res.json(data || []);
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
  await db.from('notifications').update({ is_read: true }).eq('id', req.params.id);
  res.json({ message: 'Lido' });
});

// ─── Activation Codes ─────────────────────────────────────────────────────────
app.get('/api/activation-codes', auth, requireRole('SuperAdmin'), async (req, res) => {
  const { data } = await db.from('activation_codes').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});

app.post('/api/activation-codes', auth, requireRole('SuperAdmin'), async (req, res) => {
  const { institution, expiry_days } = req.body;
  if (!institution) return res.status(400).json({ message: 'Nome da instituição obrigatório' });

  const code = generateActivationKey();
  let expires = null;
  if (expiry_days && Number(expiry_days) > 0) {
    const d = new Date();
    d.setDate(d.getDate() + Number(expiry_days));
    expires = d.toISOString();
  }

  await db.from('activation_codes').insert({ code, institution, expires_at: expires });
  res.json({ code, institution, expires_at: expires });
});

app.post('/api/activation-codes/activate', auth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: 'Código obrigatório' });

  const { data: record } = await db.from('activation_codes').select('*').eq('code', code).single();
  if (!record) return res.status(404).json({ message: 'Código inválido' });
  if (record.is_used) return res.status(409).json({ message: 'Código já utilizado' });
  if (record.expires_at && new Date(record.expires_at) < new Date()) return res.status(410).json({ message: 'Código expirado' });

  await db.from('activation_codes').update({ is_used: true }).eq('code', code);
  await db.from('settings').upsert({ key: 'activated', value: '1' }, { onConflict: 'key' });

  res.json({ message: 'Sistema ativado com sucesso!' });
});

// ─── Church Settings ──────────────────────────────────────────────────────────
const CHURCH_FIELDS = ['church_name','church_cnpj','church_address','church_neighborhood','church_city','church_zip','church_phone','church_pastor_dirigente','church_pastor_presidente'];

app.get('/api/church', auth, async (req, res) => {
  const { data } = await db.from('settings').select('key, value').in('key', CHURCH_FIELDS);
  const result = {};
  (data || []).forEach(r => {
    const k = r.key.replace('church_', '');
    result[k === 'church_name' ? 'name' : k] = r.value || '';
  });
  if (!result.name) {
    const nameRow = (data || []).find(r => r.key === 'church_name');
    result.name = nameRow?.value || '';
  }
  res.json(result);
});

app.put('/api/church', auth, requireRole('SuperAdmin'), async (req, res) => {
  const { name, cnpj, address, neighborhood, city, zip, phone, pastor_dirigente, pastor_presidente } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Nome da igreja é obrigatório' });

  const fields = { church_name: name, church_cnpj: cnpj || '', church_address: address || '', church_neighborhood: neighborhood || '', church_city: city || '', church_zip: zip || '', church_phone: phone || '', church_pastor_dirigente: pastor_dirigente || '', church_pastor_presidente: pastor_presidente || '' };

  for (const [key, value] of Object.entries(fields)) {
    await db.from('settings').upsert({ key, value }, { onConflict: 'key' });
  }
  res.json({ message: 'Dados salvos com sucesso' });
});

app.get('/api/public/church-name', async (req, res) => {
  const { data } = await db.from('settings').select('value').eq('key', 'church_name').single();
  res.json({ name: data?.value || '' });
});

// ─── Logo ─────────────────────────────────────────────────────────────────────
app.get('/api/settings/logo', async (req, res) => {
  const { data } = await db.from('settings').select('value').eq('key', 'church_logo').single();
  res.json({ logo: data?.value || null });
});

app.put('/api/settings/logo', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { logo } = req.body;
  if (logo === null || logo === undefined) {
    await db.from('settings').delete().eq('key', 'church_logo');
    return res.json({ message: 'Logo removido' });
  }
  await db.from('settings').upsert({ key: 'church_logo', value: logo }, { onConflict: 'key' });
  res.json({ message: 'Logo salvo com sucesso' });
});

app.post('/api/settings/logo', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { logo } = req.body;
  if (logo === null || logo === undefined) {
    await db.from('settings').delete().eq('key', 'church_logo');
    return res.json({ message: 'Logo removido' });
  }
  await db.from('settings').upsert({ key: 'church_logo', value: logo }, { onConflict: 'key' });
  res.json({ message: 'Logo salvo com sucesso' });
});

app.delete('/api/settings/logo', auth, requireRole('SuperAdmin'), async (req, res) => {
  await db.from('settings').delete().eq('key', 'church_logo');
  res.json({ message: 'Logo removido' });
});

// ─── Pastoral Appointments ────────────────────────────────────────────────────
app.get('/api/pastoral', auth, requireRole('SuperAdmin', 'Admin', 'Secretaria'), async (req, res) => {
  const { data, error } = await db
    .from('pastoral_appointments')
    .select('*, users(email)')
    .order('date', { ascending: true })
    .order('time', { ascending: true });
  if (error) return res.status(500).json({ message: error.message });
  const result = (data || []).map(a => ({
    ...a,
    created_by_name: a.users?.email || null,
    users: undefined,
  }));
  res.json(result);
});

app.post('/api/pastoral', auth, requireRole('SuperAdmin', 'Admin', 'Secretaria'), async (req, res) => {
  const { name, date, time, notes, status } = req.body;
  if (!name?.trim() || !date || !time) return res.status(400).json({ message: 'Nome, data e hora são obrigatórios' });

  const { data: conflict } = await db.from('pastoral_appointments')
    .select('id, name')
    .eq('date', date)
    .eq('time', time)
    .not('status', 'in', '("Cancelado")')
    .maybeSingle();
  if (conflict) return res.status(409).json({ message: `Horário já ocupado por ${conflict.name} neste dia. Escolha outro horário.` });

  const { data, error } = await db.from('pastoral_appointments').insert({
    name: name.trim(), date, time,
    notes: notes || null,
    status: status || 'Agendado',
    created_by: req.user.id,
  }).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

app.put('/api/pastoral/:id', auth, requireRole('SuperAdmin', 'Admin', 'Secretaria'), async (req, res) => {
  const { name, date, time, notes, status } = req.body;
  if (!name?.trim() || !date || !time) return res.status(400).json({ message: 'Nome, data e hora são obrigatórios' });

  const { data: conflict } = await db.from('pastoral_appointments')
    .select('id, name')
    .eq('date', date)
    .eq('time', time)
    .not('status', 'in', '("Cancelado")')
    .neq('id', req.params.id)
    .maybeSingle();
  if (conflict) return res.status(409).json({ message: `Horário já ocupado por ${conflict.name} neste dia. Escolha outro horário.` });

  const { error } = await db.from('pastoral_appointments').update({
    name: name.trim(), date, time,
    notes: notes || null,
    status: status || 'Agendado',
    updated_at: new Date().toISOString(),
  }).eq('id', req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: 'Atualizado' });
});

app.delete('/api/pastoral/:id', auth, requireRole('SuperAdmin', 'Admin', 'Secretaria'), async (req, res) => {
  const { error } = await db.from('pastoral_appointments').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: 'Excluído' });
});

// ─── Backup ───────────────────────────────────────────────────────────────────
const BACKUP_TABLES = ['departments', 'ministries', 'sectors', 'cult_types', 'members', 'member_ministries', 'cults', 'scales', 'swaps', 'notifications'];

async function generateBackupData() {
  const backup = {};
  for (const t of BACKUP_TABLES) {
    const { data } = await db.from(t).select('*');
    backup[t] = data || [];
  }
  backup.exported_at = new Date().toISOString();
  return backup;
}

app.post('/api/backup', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const backup = await generateBackupData();
  res.json({ message: `Backup realizado em ${new Date().toLocaleString('pt-BR')}`, data: backup });
});

async function getTransporter() {
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass'];
  const { data } = await db.from('settings').select('key,value').in('key', keys);
  const cfg = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  return nodemailer.createTransport({
    host: cfg.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(cfg.smtp_port || process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: cfg.smtp_user || process.env.SMTP_USER,
      pass: cfg.smtp_pass || process.env.SMTP_PASS,
    },
  });
}

app.get('/api/settings/smtp', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass'];
  const { data } = await db.from('settings').select('key,value').in('key', keys);
  const cfg = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  res.json({
    host: cfg.smtp_host || '',
    port: cfg.smtp_port || '587',
    user: cfg.smtp_user || '',
    pass: cfg.smtp_pass ? '••••••••' : '',
  });
});

app.post('/api/settings/smtp', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { host, port, user, pass } = req.body;
  if (!host || !user) return res.status(400).json({ message: 'Host e e-mail são obrigatórios' });

  const entries = [
    { key: 'smtp_host', value: host },
    { key: 'smtp_port', value: String(port || '587') },
    { key: 'smtp_user', value: user },
  ];
  if (pass && pass !== '••••••••') entries.push({ key: 'smtp_pass', value: pass });

  for (const entry of entries) {
    await db.from('settings').upsert(entry, { onConflict: 'key' });
  }
  res.json({ message: 'Configurações salvas com sucesso!' });
});

app.post('/api/backup/restore', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { data: backupJson, confirm } = req.body;
  if (!backupJson) return res.status(400).json({ message: 'Dados de backup obrigatórios' });
  if (confirm !== true) return res.status(400).json({ message: 'Confirmação obrigatória (confirm: true)' });

  const results = [];
  const errors = [];

  for (const table of BACKUP_TABLES) {
    const rows = backupJson[table];
    if (!Array.isArray(rows) || rows.length === 0) {
      results.push({ table, status: 'skipped', count: 0 });
      continue;
    }
    try {
      const { error } = await db.from(table).upsert(rows, { ignoreDuplicates: false });
      if (error) {
        errors.push({ table, error: error.message });
        results.push({ table, status: 'error', count: 0 });
      } else {
        results.push({ table, status: 'ok', count: rows.length });
      }
    } catch (e) {
      errors.push({ table, error: e.message });
      results.push({ table, status: 'error', count: 0 });
    }
  }

  const hasErrors = errors.length > 0;
  res.status(hasErrors ? 207 : 200).json({
    message: hasErrors
      ? `Restauração concluída com ${errors.length} erro(s). Verifique os detalhes.`
      : `Restauração concluída! ${results.filter(r => r.status === 'ok').length} tabela(s) restaurada(s).`,
    results,
    errors: hasErrors ? errors : undefined,
    restored_at: new Date().toISOString(),
  });
});

app.post('/api/backup/send-email', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'E-mail destinatário obrigatório' });

  const backup = await generateBackupData();
  const json = JSON.stringify(backup, null, 2);
  const filename = `backup_ecclesiascale_${new Date().toISOString().slice(0, 10)}.json`;

  const { data: smtpCfg } = await db.from('settings').select('key,value').in('key', ['smtp_user']);
  const fromEmail = smtpCfg?.[0]?.value || process.env.SMTP_USER || '';

  try {
    const transporter = await getTransporter();
    await transporter.sendMail({
      from: `EcclesiaScale <${fromEmail}>`,
      to: email,
      subject: `Backup EcclesiaScale - ${new Date().toLocaleDateString('pt-BR')}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#b45309">📦 Backup EcclesiaScale</h2>
        <p>Segue em anexo o backup do sistema gerado em <strong>${new Date().toLocaleString('pt-BR')}</strong>.</p>
        <p style="color:#666;font-size:13px">Este e-mail foi enviado automaticamente. Guarde o arquivo em local seguro.</p>
      </div>`,
      attachments: [{ filename, content: json, contentType: 'application/json' }],
    });
    res.json({ message: `Backup enviado para ${email} com sucesso!` });
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    res.status(500).json({ message: 'Erro ao enviar e-mail. Verifique as configurações SMTP na aba Config. E-mail.' });
  }
});

// ─── Static (production) ──────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('/*path', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 EcclesiaScale API rodando em http://localhost:${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL}\n`);
});
