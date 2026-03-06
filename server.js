// ─── EcclesiaScale API Server (Supabase Edition) ─────────────────────────────
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ─── Supabase Setup ───────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // use service_role key (bypasses RLS)
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

  // Attach ministries
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
    // ✅ CORREÇÃO: Verifica se usuário já existe antes de criar, evitando sobrescrever senha
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

  // ✅ CORREÇÃO: Atualiza apenas role e is_active do usuário, NUNCA a senha
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
app.put('/api/users/:id/password', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ message: 'Senha deve ter mínimo 8 caracteres' });
  const hash = bcrypt.hashSync(password, 10);
  await db.from('users').update({ password: hash }).eq('id', req.params.id);
  res.json({ message: 'Senha alterada' });
});

app.post('/api/users/reset-password', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { email, new_password } = req.body;
  if (!email || !new_password) return res.status(400).json({ message: 'Dados obrigatórios' });
  const { data: user } = await db.from('users').select('id').eq('email', email).single();
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
  const hash = bcrypt.hashSync(new_password, 10);
  await db.from('users').update({ password: hash }).eq('id', user.id);
  res.json({ message: 'Senha redefinida' });
});

// ─── Generic CRUD: ministries / departments / sectors / cult_types ────────────
const SIMPLE_TABLES = ['ministries', 'departments', 'sectors', 'cult_types'];

SIMPLE_TABLES.forEach(table => {
  app.get(`/api/${table}`, auth, async (req, res) => {
    const { data, error } = await db.from(table).select('*').order('name');
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post(`/api/${table}`, auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
    const { name, icon, is_active, default_time, default_day } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome obrigatório' });

    // Verifica duplicidade por nome (case-insensitive)
    const { data: existing } = await db.from(table).select('id').ilike('name', name.trim()).maybeSingle();
    if (existing) return res.status(409).json({ message: `Já existe um item com o nome "${name.trim()}" nesta lista.` });

    let payload = table === 'cult_types'
      ? { name: name.trim(), default_time: default_time || null, default_day: default_day ?? null }
      : table === 'sectors'
      ? { name: name.trim(), is_active: is_active ?? true }
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

    // Verifica duplicidade por nome (case-insensitive), excluindo o próprio item
    const { data: existing } = await db.from(table).select('id').ilike('name', name.trim()).neq('id', req.params.id).maybeSingle();
    if (existing) return res.status(409).json({ message: `Já existe um item com o nome "${name.trim()}" nesta lista.` });

    let payload = table === 'cult_types'
      ? { name: name.trim(), default_time: default_time || null, default_day: default_day ?? null }
      : table === 'sectors'
      ? { name: name.trim(), is_active: is_active ?? true }
      : { name: name.trim(), icon: icon || null, is_active: is_active ?? true };

    await db.from(table).update(payload).eq('id', req.params.id);
    res.json({ message: 'Atualizado' });
  });

  app.delete(`/api/${table}/:id`, auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
    await db.from(table).delete().eq('id', req.params.id);
    res.json({ message: 'Excluído' });
  });
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

  // Check monthly limit
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

  const { data, error } = await db.from('scales').insert({ cult_id, member_id, sector_id }).select().single();
  if (error) return res.status(500).json({ message: error.message });

  // Notify member
  const { data: user } = await db.from('users').select('id').eq('member_id', member_id).maybeSingle();
  if (user && cult) {
    const { data: sector } = await db.from('sectors').select('name').eq('id', sector_id).single();
    await notify(user.id, 'Nova Escala', `Você foi escalado para ${sector?.name || 'setor'} em ${cult.date}`);
  }

  res.json({ id: data.id });
});

app.put('/api/scales/:id/confirm', auth, async (req, res) => {
  await db.from('scales').update({ status: 'Confirmado', confirmed_at: new Date().toISOString() }).eq('id', req.params.id);
  res.json({ message: 'Confirmado' });
});

app.delete('/api/scales/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  await db.from('scales').delete().eq('id', req.params.id);
  res.json({ message: 'Removido' });
});

app.post('/api/scales/auto-generate', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { type, cult_id, month } = req.body;
  const today = new Date().toISOString().slice(0, 10);

  let cultsQuery = db.from('cults').select('*').eq('status', 'Agendado');
  if (type === 'month' && month) cultsQuery = cultsQuery.like('date', `${month}%`);
  else if (cult_id) cultsQuery = cultsQuery.eq('id', cult_id);
  else cultsQuery = cultsQuery.gte('date', today);

  const { data: cults } = await cultsQuery;
  const { data: members } = await db.from('members').select('*').eq('is_active', true).eq('status', 'Ativo');
  const { data: sectors } = await db.from('sectors').select('*').eq('is_active', true);

  let created = 0;

  for (const cult of cults || []) {
    const monthStr = cult.date.slice(0, 7);
    for (const sector of sectors || []) {
      for (const member of members || []) {
        const { data: alreadyInCult } = await db.from('scales').select('id').eq('cult_id', cult.id).eq('member_id', member.id).maybeSingle();
        if (alreadyInCult) continue;

        const { count: monthCount } = await db.from('scales')
          .select('*, cults!inner(date)', { count: 'exact', head: true })
          .eq('member_id', member.id)
          .like('cults.date', `${monthStr}%`);

        if (monthCount >= 3) continue;

        await db.from('scales').insert({ cult_id: cult.id, member_id: member.id, sector_id: sector.id });
        created++;
        break; // one member per sector per cult
      }
    }
  }

  res.json({ message: `${created} escala(s) gerada(s)` });
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

  // Notify leader
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

// ─── Pastoral Cabinet Schedules ───────────────────────────────────────────────

// Listar todos os horários cadastrados
app.get('/api/pastoral-cabinet/schedules', auth, async (req, res) => {
  const { data, error } = await db
    .from('pastoral_cabinet_schedules')
    .select('*, pastoral_cabinet_bookings(id, volunteer_id, status, booked_name, booked_phone, subject, members(name))')
    .order('date').order('time');
  if (error) return res.status(500).json({ message: error.message });

  const result = (data || []).map(s => {
    const booking = (s.pastoral_cabinet_bookings || []).find(b => b.status === 'Agendado' || b.status === 'Confirmado');
    return {
      ...s,
      is_available: !booking,
      booking_id: booking?.id || null,
      booked_by_name: booking?.booked_name || booking?.members?.name || s.booked_by_name || null,
      booked_by_phone: booking?.booked_phone || s.booked_by_phone || null,
      booking_subject: booking?.subject || s.booking_subject || null,
      pastoral_cabinet_bookings: undefined,
    };
  });
  res.json(result);
});

// Disponibilidade de um mês (para o calendário do voluntário)
app.get('/api/pastoral-cabinet/availability/:month', auth, async (req, res) => {
  const { month } = req.params; // formato: yyyy-MM
  const [year, mon] = month.split('-').map(Number);
  const firstDay = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay  = `${year}-${String(mon).padStart(2, '0')}-${new Date(year, mon, 0).getDate()}`;

  const { data, error } = await db
    .from('pastoral_cabinet_schedules')
    .select('date, id, pastoral_cabinet_bookings(id, status)')
    .gte('date', firstDay)
    .lte('date', lastDay)
    .order('date');
  if (error) return res.status(500).json({ message: error.message });

  // Agrupa por data e verifica se tem algum slot livre
  const byDate = {};
  (data || []).forEach(s => {
    const hasBooking = (s.pastoral_cabinet_bookings || []).some(
      (b) => b.status === 'Agendado' || b.status === 'Confirmado'
    );
    if (!byDate[s.date]) byDate[s.date] = { date: s.date, hasAvailable: false };
    if (!hasBooking) byDate[s.date].hasAvailable = true;
  });

  // Gera todos os dias do mês com flag hasAvailable
  const daysInMonth = new Date(year, mon, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    result.push({ date: dateStr, hasAvailable: byDate[dateStr]?.hasAvailable || false });
  }
  res.json(result);
});

// Horários disponíveis de uma data específica
app.get('/api/pastoral-cabinet/available-slots/:date', auth, async (req, res) => {
  const { date } = req.params;
  const { data, error } = await db
    .from('pastoral_cabinet_schedules')
    .select('*, pastoral_cabinet_bookings(id, status)')
    .eq('date', date)
    .order('time');
  if (error) return res.status(500).json({ message: error.message });

  const slots = (data || [])
    .filter(s => {
      // Bloqueia se is_available=false (agendado pela secretaria direto no schedule)
      if (!s.is_available) return false;
      // Bloqueia se há booking ativo na tabela separada (agendado por voluntário)
      const hasActive = (s.pastoral_cabinet_bookings || []).some(
        (b) => b.status === 'Agendado' || b.status === 'Confirmado'
      );
      return !hasActive;
    })
    .map(s => ({
      schedule_id: s.id,
      time: s.time,
      duration_minutes: s.duration_minutes,
    }));
  res.json(slots);
});

// Criar horário de gabinete
app.post('/api/pastoral-cabinet/schedules', auth, requireRole('SuperAdmin', 'Admin', 'Secretaria'), async (req, res) => {
  const { date, time, duration_minutes, is_available,
          booked_by_name, booked_by_phone, booking_subject } = req.body;
  if (!date || !time) return res.status(400).json({ message: 'Data e hora são obrigatórios' });

  // Validar dia da semana (seg-sex apenas)
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0 || dow === 6) {
    return res.status(400).json({ message: 'Gabinete só pode ser agendado de segunda a sexta-feira' });
  }

  // Se foi informado nome do solicitante, já nasce como ocupado
  const hasBooking = !!(booked_by_name && booked_by_name.trim());
  const insertData = {
    date, time,
    duration_minutes: duration_minutes || 60,
    is_available: hasBooking ? false : (is_available ?? true),
  };
  if (booked_by_name)   insertData.booked_by_name   = booked_by_name.trim();
  if (booked_by_phone)  insertData.booked_by_phone  = booked_by_phone.trim();
  if (booking_subject)  insertData.booking_subject  = booking_subject.trim();

  const { data, error } = await db
    .from('pastoral_cabinet_schedules')
    .insert(insertData)
    .select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'Já existe um horário nesta data e hora' });
    return res.status(500).json({ message: error.message });
  }
  res.json(data);
});

// Excluir horário de gabinete
app.delete('/api/pastoral-cabinet/schedules/:id', auth, requireRole('SuperAdmin', 'Admin', 'Secretaria'), async (req, res) => {
  // Verifica se há agendamento ativo
  const { data: bookings } = await db
    .from('pastoral_cabinet_bookings')
    .select('id')
    .eq('schedule_id', req.params.id)
    .in('status', ['Agendado', 'Confirmado'])
    .maybeSingle();
  if (bookings) return res.status(409).json({ message: 'Não é possível excluir: há agendamento ativo neste horário' });

  await db.from('pastoral_cabinet_schedules').delete().eq('id', req.params.id);
  res.json({ message: 'Excluído' });
});

// Atualizar horário de gabinete (data, hora, duração, dados do solicitante, disponibilidade)
app.put('/api/pastoral-cabinet/schedules/:id', auth, requireRole('SuperAdmin', 'Admin', 'Secretaria'), async (req, res) => {
  const { date, time, duration_minutes, is_available,
          booked_by_name, booked_by_phone, booking_subject } = req.body;

  // Validar dia da semana (seg-sex apenas) se data foi fornecida
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=Dom, 6=Sáb
    if (dow === 0 || dow === 6) {
      return res.status(400).json({ message: 'Gabinete só pode ser agendado de segunda a sexta-feira' });
    }
  }

  const updateData = {};
  if (date             !== undefined) updateData.date             = date;
  if (time             !== undefined) updateData.time             = time;
  if (duration_minutes !== undefined) updateData.duration_minutes = duration_minutes;
  if (booked_by_name   !== undefined) updateData.booked_by_name   = booked_by_name;
  if (booked_by_phone  !== undefined) updateData.booked_by_phone  = booked_by_phone;
  if (booking_subject  !== undefined) updateData.booking_subject  = booking_subject;

  // Se está recebendo dados de solicitante, marcar como ocupado automaticamente
  if (booked_by_name) {
    updateData.is_available = false;
  } else if (is_available !== undefined) {
    updateData.is_available = is_available;
  }

  const { data, error } = await db
    .from('pastoral_cabinet_schedules')
    .update(updateData)
    .eq('id', req.params.id)
    .select().single();

  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// ─── Pastoral Cabinet Bookings ────────────────────────────────────────────────

// Listar agendamentos de um voluntário
app.get('/api/pastoral-cabinet/bookings/volunteer/:volunteer_id', auth, async (req, res) => {
  const { data, error } = await db
    .from('pastoral_cabinet_bookings')
    .select('*, pastoral_cabinet_schedules(duration_minutes)')
    .eq('volunteer_id', req.params.volunteer_id)
    .order('date', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });

  res.json((data || []).map(b => ({
    ...b,
    duration_minutes: b.pastoral_cabinet_schedules?.duration_minutes || null,
    pastoral_cabinet_schedules: undefined,
  })));
});

// Criar agendamento (voluntário OU secretaria)
app.post('/api/pastoral-cabinet/bookings', auth, async (req, res) => {
  const { volunteer_id, schedule_id, date, time, notes, booked_name, booked_phone, subject } = req.body;

  if (!schedule_id) return res.status(400).json({ message: 'Horário é obrigatório' });
  if (!volunteer_id && !booked_name) return res.status(400).json({ message: 'Nome do solicitante é obrigatório' });

  // Validar dia da semana no date fornecido (se houver)
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) {
      return res.status(400).json({ message: 'Gabinete só pode ser agendado de segunda a sexta-feira' });
    }
  }

  // Buscar dados do horário
  const { data: schedule, error: scheduleError } = await db
    .from('pastoral_cabinet_schedules')
    .select('id, date, time, duration_minutes, is_available')
    .eq('id', schedule_id)
    .single();
  if (scheduleError || !schedule) return res.status(404).json({ message: 'Horário não encontrado' });

  // Verifica se o horário ainda está disponível
  const { data: existing } = await db
    .from('pastoral_cabinet_bookings')
    .select('id')
    .eq('schedule_id', schedule_id)
    .in('status', ['Agendado', 'Confirmado'])
    .maybeSingle();
  if (existing) return res.status(409).json({ message: 'Este horário já foi reservado' });

  const insertData = {
    schedule_id,
    date: date || schedule.date,
    time: time || schedule.time,
    notes: notes || null,
    status: 'Agendado',
  };
  if (volunteer_id) insertData.volunteer_id = volunteer_id;
  if (booked_name)  insertData.booked_name  = booked_name;
  if (booked_phone) insertData.booked_phone = booked_phone;
  if (subject)      insertData.subject      = subject;

  const { data, error } = await db
    .from('pastoral_cabinet_bookings')
    .insert(insertData)
    .select().single();
  if (error) return res.status(500).json({ message: error.message });

  // Marca o schedule como ocupado
  await db.from('pastoral_cabinet_schedules').update({ is_available: false }).eq('id', schedule_id);

  // Notifica o admin
  const { data: admins } = await db.from('users').select('id').in('role', ['SuperAdmin', 'Admin']);
  const nomeSolicitante = booked_name || 'Voluntário';
  for (const admin of admins || []) {
    await notify(admin.id, 'Novo Agendamento de Gabinete',
      `${nomeSolicitante} agendou o gabinete para ${insertData.date} às ${insertData.time}`);
  }

  res.json({ id: data.id });
});

// Atualizar status de agendamento
app.put('/api/pastoral-cabinet/bookings/:id', auth, requireRole('SuperAdmin', 'Admin', 'Secretaria'), async (req, res) => {
  const { status, booked_name, booked_phone, subject } = req.body;
  const { data: booking } = await db.from('pastoral_cabinet_bookings').select('*').eq('id', req.params.id).single();
  if (!booking) return res.status(404).json({ message: 'Agendamento não encontrado' });

  const updates = {};
  if (status !== undefined) updates.status = status;
  if (booked_name !== undefined) updates.booked_name = booked_name;
  if (booked_phone !== undefined) updates.booked_phone = booked_phone;
  if (subject !== undefined) updates.subject = subject;

  await db.from('pastoral_cabinet_bookings').update(updates).eq('id', req.params.id);

  // Se cancelado, libera o horário
  if (status === 'Cancelado') {
    await db.from('pastoral_cabinet_schedules').update({ is_available: true }).eq('id', booking.schedule_id);
  }

  // Notifica o voluntário se mudou status
  if (status) {
    const { data: userRow } = await db.from('users').select('id').eq('member_id', booking.volunteer_id).maybeSingle();
    if (userRow) await notify(userRow.id, 'Gabinete ' + status, `Seu agendamento de gabinete foi ${status.toLowerCase()}`);
  }

  res.json({ message: 'Atualizado' });
});

// ─── Backup ───────────────────────────────────────────────────────────────────
app.post('/api/backup', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const tables = ['members', 'cults', 'scales', 'swaps', 'notifications', 'departments', 'sectors', 'ministries'];
  const backup = {};
  for (const t of tables) {
    const { data } = await db.from(t).select('*');
    backup[t] = data || [];
  }
  backup.exported_at = new Date().toISOString();
  res.json({ message: `Backup realizado em ${new Date().toLocaleString('pt-BR')}`, data: backup });
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
