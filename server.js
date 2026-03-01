// ─── EcclesiaScale API Server (Supabase Edition) ─────────────────────────────
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

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

// ─── Auto-inicializa trial se não existir ─────────────────────────────────────
async function ensureTrialInitialized() {
  try {
    const { data: activated } = await db.from('settings').select('value').eq('key', 'activated').single();
    if (activated?.value === '1') return; // já ativado, não precisa checar trial

    const { data: trial } = await db.from('settings').select('value').eq('key', 'trial_expires').single();
    if (!trial) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);
      await db.from('settings').insert({ key: 'trial_expires', value: trialEnd.toISOString() });
      console.log('\u23f1\ufe0f  Trial de 7 dias iniciado. Expira em:', trialEnd.toLocaleDateString('pt-BR'));
    } else {
      const expires = new Date(trial.value);
      const daysLeft = Math.max(0, Math.ceil((expires - new Date()) / 86400000));
      console.log(`\u23f1\ufe0f  Trial: ${daysLeft} dia(s) restante(s) (expira ${expires.toLocaleDateString('pt-BR')})`);
    }
  } catch (e) {
    console.warn('⚠️  Não foi possível verificar trial (Supabase indisponível?):', e.message);
  }
}

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
  if (!email) return res.status(400).json({ message: 'E-mail obrigatório' });

  const { data: user } = await db.from('users').select('id').eq('email', email).maybeSingle();
  // Resposta genérica para não revelar se o e-mail existe
  if (!user) return res.json({ message: 'Se o e-mail existir, você receberá as instruções.' });

  const code = randomBytes(4).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + 3600000).toISOString();
  await db.from('users').update({ two_factor_code: code, two_factor_expires: expires }).eq('id', user.id);

  // ✅ Envia o código por e-mail (usa SMTP do primeiro SuperAdmin/Admin com SMTP configurado)
  try {
    // Busca o id do primeiro admin com SMTP configurado
    const { data: adminUsers } = await db.from('users').select('id').in('role', ['SuperAdmin', 'Admin']);
    let transporter, smtpUser;
    for (const admin of (adminUsers || [])) {
      try {
        const result = await getTransporter(admin.id);
        transporter = result.transporter;
        smtpUser = result.user;
        break;
      } catch { /* sem SMTP, tenta próximo */ }
    }
    if (!transporter) throw new Error('Nenhum admin com SMTP configurado encontrado.');
    await transporter.sendMail({
      from: `EcclesiaScale <${smtpUser}>`,
      to: email,
      subject: 'Código de Recuperação — EcclesiaScale',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#b45309">🔐 Recuperação de Senha</h2>
        <p>Seu código de recuperação é:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#b45309;background:#1c1917;padding:16px 24px;border-radius:8px;display:inline-block;margin:12px 0">${code}</div>
        <p style="color:#666;font-size:13px">Este código expira em <strong>1 hora</strong>. Se você não solicitou isso, ignore este e-mail.</p>
      </div>`,
    });
  } catch (err) {
    // Loga mas não expõe ao usuário — o código ainda fica salvo para uso manual
    console.error('[forgot-password] Falha ao enviar e-mail:', err.message);
  }

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
  // Se não existe registro de trial, cria agora com 7 dias e retorna como trial ativo
  if (!trial) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    await db.from('settings').insert({ key: 'trial_expires', value: trialEnd.toISOString() });
    return res.json({ isActive: true, isTrial: true, daysLeft: 7, isExpired: false, message: '7 dia(s) restante(s)' });
  }

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

  let defaultPassword = null;
  let userCreated = false;

  if (email) {
    const { data: existingUser } = await db.from('users').select('id').eq('email', email).maybeSingle();
    if (!existingUser) {
      // ✅ Gera senha padrão e retorna ao Admin para informar ao membro
      defaultPassword = 'EcclesiaScale@' + member.id;
      const hash = bcrypt.hashSync(defaultPassword, 10);
      await db.from('users').insert({ email, password: hash, role: role || 'Membro', member_id: member.id });
      userCreated = true;
    }
  }

  if (ministries?.length) {
    await db.from('member_ministries').upsert(ministries.map(min => ({ member_id: member.id, ministry_id: min.id })), { ignoreDuplicates: true });
  }

  res.json({
    id: member.id,
    message: 'Membro criado',
    user_created: userCreated,
    default_password: defaultPassword,
    login_info: userCreated
      ? `Acesso criado! E-mail: ${email} | Senha inicial: ${defaultPassword} | Oriente o voluntário a trocar a senha no primeiro acesso.`
      : null,
  });
});

app.put('/api/members/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { name, email, whatsapp, availability, role, department_id, status, is_active, ministries } = req.body;

  await db.from('members').update({
    name, email: email || null, whatsapp: whatsapp || null,
    availability: availability || {},
    role, department_id: department_id || null, status, is_active: is_active ?? true
  }).eq('id', req.params.id);

  // ✅ Atualiza usuário existente OU cria se e-mail foi adicionado agora
  if (email && role) {
    const { data: existingUser } = await db.from('users').select('id').eq('email', email).maybeSingle();
    if (existingUser) {
      // Usuário já existe: atualiza role e status, NUNCA a senha
      await db.from('users').update({ role, is_active: is_active ?? true }).eq('id', existingUser.id);
    } else {
      // ✅ Novo e-mail adicionado ao membro: cria acesso com senha padrão
      const memberId = req.params.id;
      const defaultPassword = 'EcclesiaScale@' + memberId;
      const hash = bcrypt.hashSync(defaultPassword, 10);
      await db.from('users').insert({ email, password: hash, role: role || 'Membro', member_id: Number(memberId), is_active: is_active ?? true });
      console.log(`[users] Acesso criado para membro ${memberId} via PUT. Senha inicial: ${defaultPassword}`);
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

  // ─── Busca cultos conforme o tipo de geração ──────────────────────────────────
  let cultsQuery = db.from('cults').select('*').eq('status', 'Agendado');
  if (type === 'month' && month) cultsQuery = cultsQuery.like('date', `${month}%`);
  else if (cult_id) cultsQuery = cultsQuery.eq('id', cult_id);
  else cultsQuery = cultsQuery.gte('date', today);

  const { data: cults } = await cultsQuery;
  const { data: members } = await db.from('members').select('*').eq('is_active', true).eq('status', 'Ativo');
  const { data: sectors } = await db.from('sectors').select('*').eq('is_active', true);

  let created = 0;
  let skippedUnavailable = 0;

  for (const cult of cults || []) {
    const monthStr = cult.date.slice(0, 7);

    // ✅ Descobre o dia da semana do culto (0=Dom, 1=Seg ... 6=Sab)
    // Usa UTC para evitar problemas de fuso horário ao parsear 'YYYY-MM-DD'
    const [cy, cm, cd] = cult.date.split('-').map(Number);
    const cultDayOfWeek = new Date(Date.UTC(cy, cm - 1, cd)).getUTCDay();

    for (const sector of sectors || []) {
      for (const member of members || []) {
        // ── Verifica se já está escalado neste culto ──────────────────────────
        const { data: alreadyInCult } = await db.from('scales')
          .select('id').eq('cult_id', cult.id).eq('member_id', member.id).maybeSingle();
        if (alreadyInCult) continue;

        // ✅ Verifica disponibilidade do membro para o dia da semana do culto
        // availability é um objeto { [cult_type_id ou day_of_week]: boolean }
        // O campo armazenado pode ser string (JSON) ou objeto — normaliza aqui
        let availability = member.availability;
        if (typeof availability === 'string') {
          try { availability = JSON.parse(availability); } catch { availability = {}; }
        }
        availability = availability || {};

        // Verifica disponibilidade pelo type_id do culto (se existir)
        // E também pelo dia da semana como fallback
        const availableByType = cult.type_id != null
          ? availability[cult.type_id] === true || availability[String(cult.type_id)] === true
          : true;

        const availableByDay = availability[cultDayOfWeek] === true
          || availability[String(cultDayOfWeek)] === true;

        // Se a disponibilidade foi cadastrada por tipo de culto, usa o tipo.
        // Se foi por dia da semana, usa o dia. Se o objeto estiver vazio,
        // considera disponível (membro sem restrição cadastrada).
        const hasAnyAvailability = Object.keys(availability).length > 0;

        if (hasAnyAvailability) {
          // Tenta primeiro pelo type_id; se não tiver type_id, tenta pelo dia
          const isAvailable = cult.type_id != null ? availableByType : availableByDay;
          if (!isAvailable) {
            skippedUnavailable++;
            continue; // ← pula membro indisponível
          }
        }
        // Se availability estiver vazio ({}) → sem restrição → pode ser escalado

        // ── Verifica limite mensal (máx 3x por mês) ───────────────────────────
        const { count: monthCount } = await db.from('scales')
          .select('*, cults!inner(date)', { count: 'exact', head: true })
          .eq('member_id', member.id)
          .neq('status', 'Recusado')
          .like('cults.date', `${monthStr}%`);

        if (monthCount >= 3) continue;

        // ── Escala o membro ───────────────────────────────────────────────────
        await db.from('scales').insert({ cult_id: cult.id, member_id: member.id, sector_id: sector.id });

        // ── Notifica o voluntário escalado
        const { data: userToNotify } = await db.from('users').select('id').eq('member_id', member.id).maybeSingle();
        if (userToNotify) {
          const sectorName = sector.name || 'setor';
          const cultDate = cult.date || '';
          const cultTime = cult.time ? ' às ' + cult.time : '';
          const cultName = cult.name || 'culto';
          await notify(userToNotify.id, 'Nova Escala',
            `Você foi escalado para ${sectorName} no culto "${cultName}" em ${cultDate}${cultTime}`);
        }
        created++;
        break; // um membro por setor por culto
      }
    }
  }

  res.json({
    message: `${created} escala(s) gerada(s)${skippedUnavailable > 0 ? ` · ${skippedUnavailable} voluntário(s) pulado(s) por indisponibilidade` : ''}`,
    created,
    skipped_unavailable: skippedUnavailable,
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

// Helper: generate backup data (single source of truth)
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

// ─── Backup Email Config (por usuário) ───────────────────────────────────────
// GET  /api/settings/backup-email?user_id=X  → retorna e-mail configurado
app.get('/api/settings/backup-email', auth, async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ message: 'user_id obrigatório' });

  // Apenas o próprio usuário ou admin pode ver
  if (Number(user_id) !== req.user.id && !isAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Acesso negado' });
  }

  const key = `backup_email_user_${user_id}`;
  const { data } = await db.from('settings').select('value').eq('key', key).maybeSingle();
  res.json({ value: data?.value || null });
});

// POST /api/settings/backup-email  → salva e-mail do usuário
app.post('/api/settings/backup-email', auth, async (req, res) => {
  const { user_id, email } = req.body;
  if (!user_id || !email) return res.status(400).json({ message: 'user_id e email obrigatórios' });

  // Apenas o próprio usuário ou admin pode salvar
  if (Number(user_id) !== req.user.id && !isAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Acesso negado' });
  }

  const key = `backup_email_user_${user_id}`;
  await db.from('settings').upsert({ key, value: email }, { onConflict: 'key' });
  res.json({ message: 'E-mail salvo com sucesso!' });
});

// ─── Backup ───────────────────────────────────────────────────────────────────
app.post('/api/backup', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const backup = await generateBackupData();
  res.json({ message: `Backup realizado em ${new Date().toLocaleString('pt-BR')}`, data: backup });
});

// ─── Gmail OAuth2 helper ──────────────────────────────────────────────────────
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI  // ex: https://seu-app.railway.app/api/settings/gmail/callback
  );
}

// Retorna transporter nodemailer usando Gmail API OAuth2 (se configurado)
// ou fallback para SMTP convencional
async function getTransporter(userId) {
  // ── Tenta Gmail OAuth2 primeiro ──────────────────────────────────────────────
  const keys = [
    `gmail_refresh_token_user_${userId}`,
    `gmail_email_user_${userId}`,
  ];
  const { data: oauthData } = await db.from('settings').select('key,value').in('key', keys);
  const oauthCfg = Object.fromEntries((oauthData || []).map(r => [r.key, r.value]));
  const refreshToken = oauthCfg[`gmail_refresh_token_user_${userId}`];
  const gmailEmail   = oauthCfg[`gmail_email_user_${userId}`];

  if (refreshToken && gmailEmail) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { token: accessToken } = await oauth2Client.getAccessToken();
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: gmailEmail,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken,
        accessToken,
      },
    });
    return { transporter, user: gmailEmail };
  }

  // ── Fallback: SMTP convencional ───────────────────────────────────────────────
  const smtpKeys = [
    `smtp_host_user_${userId}`,
    `smtp_port_user_${userId}`,
    `smtp_user_user_${userId}`,
    `smtp_pass_user_${userId}`,
  ];
  const { data: smtpData } = await db.from('settings').select('key,value').in('key', smtpKeys);
  const cfg = Object.fromEntries((smtpData || []).map(r => [r.key, r.value]));
  const host = cfg[`smtp_host_user_${userId}`];
  const port = Number(cfg[`smtp_port_user_${userId}`] || 587);
  const user = cfg[`smtp_user_user_${userId}`];
  const pass = cfg[`smtp_pass_user_${userId}`];

  if (!host || !user || !pass) {
    throw new Error('E-mail não configurado. Acesse Backup → Config. E-mail e conecte o Gmail ou configure o SMTP.');
  }

  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  return { transporter, user };
}

// ─── Gmail OAuth2 — iniciar autenticação ─────────────────────────────────────
app.get('/api/settings/gmail/auth', auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://mail.google.com/'],
    state: String(req.user.id), // passa userId para recuperar no callback
  });
  res.json({ url });
});

// ─── Gmail OAuth2 — callback (recebe code do Google) ─────────────────────────
app.get('/api/settings/gmail/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send('Parâmetros inválidos.');
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    console.log('[gmail/callback] tokens recebidos:', JSON.stringify({
      has_access_token: !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    }));

    if (!tokens.refresh_token) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:24px">
          <h2 style="color:#b45309">⚠️ Erro ao conectar Gmail</h2>
          <p>O Google não retornou o token de autenticação necessário.</p>
          <p>Para resolver:</p>
          <ol>
            <li>Acesse <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a></li>
            <li>Encontre e remova o acesso do app <strong>EcclesiaScale</strong></li>
            <li>Volte ao painel e tente conectar o Gmail novamente</li>
          </ol>
          <p><button onclick="window.close()">Fechar</button></p>
        </html>
      `);
    }

    oauth2Client.setCredentials(tokens);

    // Busca o e-mail da conta Google autorizada
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    console.log('[gmail/callback] e-mail obtido:', profile.email);

    // Salva refresh_token e e-mail no banco por userId
    await db.from('settings').upsert(
      { key: `gmail_refresh_token_user_${userId}`, value: tokens.refresh_token },
      { onConflict: 'key' }
    );
    await db.from('settings').upsert(
      { key: `gmail_email_user_${userId}`, value: profile.email },
      { onConflict: 'key' }
    );

    // Redireciona de volta para o painel com sucesso
    res.send(`<script>window.close(); window.opener && window.opener.postMessage('gmail_connected', '*');</script>
      <p>✅ Gmail conectado com sucesso! Pode fechar esta janela.</p>`);
  } catch (err) {
    console.error('[gmail/callback] ERRO:', err.message, err.stack);
    res.status(500).send('Erro ao conectar Gmail: ' + err.message);
  }
});

// ─── Gmail OAuth2 — status da conexão ────────────────────────────────────────
app.get('/api/settings/gmail/status', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const userId = req.user.id;
  const { data } = await db.from('settings').select('key,value')
    .in('key', [`gmail_refresh_token_user_${userId}`, `gmail_email_user_${userId}`]);
  const cfg = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  const email = cfg[`gmail_email_user_${userId}`] || null;
  const connected = !!(cfg[`gmail_refresh_token_user_${userId}`] && email);
  res.json({ connected, email });
});

// ─── Gmail OAuth2 — desconectar ───────────────────────────────────────────────
app.delete('/api/settings/gmail', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const userId = req.user.id;
  await db.from('settings').delete().in('key', [
    `gmail_refresh_token_user_${userId}`,
    `gmail_email_user_${userId}`,
  ]);
  res.json({ message: 'Gmail desconectado.' });
});

// GET SMTP config do usuário logado (pass masked)
app.get('/api/settings/smtp', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const userId = req.user.id;
  const keys = [
    `smtp_host_user_${userId}`,
    `smtp_port_user_${userId}`,
    `smtp_user_user_${userId}`,
    `smtp_pass_user_${userId}`,
  ];
  const { data } = await db.from('settings').select('key,value').in('key', keys);
  const cfg = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  const host = cfg[`smtp_host_user_${userId}`] || '';
  const user = cfg[`smtp_user_user_${userId}`] || '';
  const pass = cfg[`smtp_pass_user_${userId}`];
  res.json({
    host,
    port: cfg[`smtp_port_user_${userId}`] || '587',
    user,
    pass: pass ? '••••••••' : '',
    configured: !!(host && user && pass),
  });
});

// POST /api/settings/smtp/test — verifica conexão (Gmail OAuth2 ou SMTP)
app.post('/api/settings/smtp/test', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  try {
    const { transporter } = await getTransporter(req.user.id);
    await transporter.verify();
    res.json({ message: '✅ Conexão verificada com sucesso!' });
  } catch (err) {
    console.error('[smtp/test]', err.message, err.code);
    const detail =
      err.message.includes('não configurado') ? err.message :
      err.code === 'EAUTH'       ? 'Credenciais inválidas — verifique o e-mail e a senha/App Password.' :
      err.code === 'ECONNECTION' ? 'Não foi possível conectar — verifique o Host e a Porta.' :
      err.code === 'ETIMEDOUT'   ? 'Tempo esgotado — Railway bloqueia SMTP. Use a opção Conectar Gmail.' :
      err.code === 'ESOCKET'     ? 'Erro de socket — tente trocar a porta (587 ↔ 465).' :
      err.message;
    res.status(400).json({ message: detail });
  }
});

// POST SMTP config (salva por usuário logado)
app.post('/api/settings/smtp', auth, requireRole('SuperAdmin', 'Admin'), async (req, res) => {
  const { host, port, user, pass } = req.body;
  const userId = req.user.id;
  if (!host || !user) return res.status(400).json({ message: 'Host e e-mail são obrigatórios' });

  const entries = [
    { key: `smtp_host_user_${userId}`, value: host },
    { key: `smtp_port_user_${userId}`, value: String(port || '587') },
    { key: `smtp_user_user_${userId}`, value: user },
  ];
  if (pass && pass !== '••••••••') entries.push({ key: `smtp_pass_user_${userId}`, value: pass });

  for (const entry of entries) {
    await db.from('settings').upsert(entry, { onConflict: 'key' });
  }
  res.json({ message: 'Configurações salvas com sucesso!' });
});

// POST restore from backup
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

// POST send backup by email — aberto para SuperAdmin, Admin e Líder
app.post('/api/backup/send-email', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'E-mail destinatário obrigatório' });

  const backup = await generateBackupData();
  const json = JSON.stringify(backup, null, 2);
  const filename = `backup_ecclesiascale_${new Date().toISOString().slice(0, 10)}.json`;

  try {
    const { transporter, user: smtpUser } = await getTransporter(req.user.id);
    await transporter.sendMail({
      from: `EcclesiaScale <${smtpUser}>`,
      to: email,
      subject: `Backup EcclesiaScale — ${new Date().toLocaleDateString('pt-BR')}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#b45309">📦 Backup EcclesiaScale</h2>
        <p>Segue em anexo o backup do sistema gerado em <strong>${new Date().toLocaleString('pt-BR')}</strong>.</p>
        <p style="color:#666;font-size:13px">Este e-mail foi enviado automaticamente. Guarde o arquivo em local seguro.</p>
      </div>`,
      attachments: [{ filename, content: json, contentType: 'application/json' }],
    });
    res.json({ message: `Backup enviado para ${email} com sucesso!` });
  } catch (err) {
    console.error('[backup/send-email] Erro:', err.message, '| code:', err.code);
    const detail =
      err.message.includes('SMTP não configurado') ? err.message :
      err.code === 'EAUTH'                         ? 'Credenciais inválidas — verifique o e-mail e a senha/App Password.' :
      err.code === 'ECONNECTION'                   ? 'Não foi possível conectar ao servidor SMTP. Verifique o Host e a Porta.' :
      err.code === 'ETIMEDOUT'                     ? 'Tempo esgotado ao conectar ao servidor SMTP. Verifique o Host e a Porta.' :
      err.code === 'ESOCKET'                       ? 'Erro de socket. Tente trocar a porta (587 ↔ 465) ou ative "Acesso a app menos seguro".' :
      err.message;
    res.status(500).json({ message: detail });
  }
});

// ─── Static (production) ──────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  // Compatível com Express 4 e 5
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 EcclesiaScale API rodando em http://localhost:${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL}`);
  await ensureTrialInitialized();
  console.log('');
});
