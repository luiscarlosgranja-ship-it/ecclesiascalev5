// ─── EcclesiaScale API Server ─────────────────────────────────────────────────
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ─── DB Setup ─────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_PATH || './church.db';
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const PORT = process.env.PORT || 3000;

// ─── Migrations ───────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('SuperAdmin','Admin','Líder','Membro')),
    member_id INTEGER,
    two_factor_code TEXT,
    two_factor_expires DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS ministries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    icon TEXT,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    icon TEXT,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS sectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    whatsapp TEXT,
    availability TEXT DEFAULT '{}',
    role TEXT NOT NULL CHECK(role IN ('SuperAdmin','Admin','Líder','Membro')),
    department_id INTEGER,
    entry_date DATE DEFAULT (date('now')),
    status TEXT DEFAULT 'Ativo',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(department_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS member_ministries (
    member_id INTEGER,
    ministry_id INTEGER,
    PRIMARY KEY(member_id, ministry_id),
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(ministry_id) REFERENCES ministries(id)
  );

  CREATE TABLE IF NOT EXISTS cult_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    default_time TEXT,
    default_day INTEGER
  );

  CREATE TABLE IF NOT EXISTS cults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_id INTEGER,
    name TEXT,
    date DATE NOT NULL,
    time TEXT NOT NULL,
    status TEXT DEFAULT 'Agendado',
    FOREIGN KEY(type_id) REFERENCES cult_types(id)
  );

  CREATE TABLE IF NOT EXISTS scales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cult_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    sector_id INTEGER NOT NULL,
    status TEXT DEFAULT 'Pendente',
    confirmed_at DATETIME,
    FOREIGN KEY(cult_id) REFERENCES cults(id),
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(sector_id) REFERENCES sectors(id)
  );

  CREATE TABLE IF NOT EXISTS swaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scale_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    suggested_member_id INTEGER,
    department_id INTEGER,
    member_status TEXT DEFAULT 'Pendente',
    status TEXT DEFAULT 'Pendente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(scale_id) REFERENCES scales(id),
    FOREIGN KEY(requester_id) REFERENCES members(id),
    FOREIGN KEY(suggested_member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS activation_codes (
    code TEXT PRIMARY KEY,
    institution TEXT,
    expires_at DATETIME,
    is_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Seed ─────────────────────────────────────────────────────────────────────
const { count: seedCount } = db.prepare('SELECT count(*) as count FROM cult_types').get();
if (seedCount === 0) {
  const insertCT = db.prepare('INSERT OR IGNORE INTO cult_types (name, default_time, default_day) VALUES (?,?,?)');
  [
    ['Domingo Manhã', '09:00', 0],
    ['Domingo Noite (Celebração)', '18:00', 0],
    ['Terça-feira (EDP)', '19:30', 2],
    ['Quarta-feira Manhã (Manhã de Milagres)', '09:00', 3],
    ['Quarta-feira Noite (Quarta D)', '19:30', 3],
    ['Quinta-Feira (Culto da Vitória)', '19:30', 4],
    ['Segunda-feira Noite (Culto de Empreendedores)', '19:30', 1],
  ].forEach(([n, t, d]) => insertCT.run(n, t, d));

  const insertSec = db.prepare('INSERT OR IGNORE INTO sectors (name) VALUES (?)');
  ['Setor 1','Setor 2','Setor 3','Setor 4','Recepção','Externo','Máquinas de Cartão','Foto','Filmagem','Som','Iluminação']
    .forEach(s => insertSec.run(s));

  const insertMin = db.prepare('INSERT OR IGNORE INTO ministries (name, icon) VALUES (?,?)');
  [['Louvor','Music'],['Homens','Users'],['Mulheres','Users'],['Família','Home'],['Ação Social','Heart'],['Mídia','Monitor']]
    .forEach(([n, i]) => insertMin.run(n, i));

  const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name, icon) VALUES (?,?)');
  [['Família','Users'],['Som','Volume2'],['Infantil','Baby'],['Adolescentes','Users'],['Jovens','Zap'],['Terceira Idade','Heart'],['Obreiros / Diáconos','Shield']]
    .forEach(([n, i]) => insertDept.run(n, i));

  // SuperAdmin
  const superPw = bcrypt.hashSync('SuperAdmin@2024!', 10);
  db.prepare('INSERT OR IGNORE INTO users (email, password, role) VALUES (?,?,?)').run('super@ecclesia.com', superPw, 'SuperAdmin');

  // Admin
  const adminPw = bcrypt.hashSync('Admin@2024!', 10);
  db.prepare('INSERT OR IGNORE INTO users (email, password, role) VALUES (?,?,?)').run('admin@ecclesia.com', adminPw, 'Admin');

  // Trial: 7 days
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').run('initialized_at', new Date().toISOString());
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').run('trial_expires', trialEnd.toISOString());
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
function isLeader(role) { return ['SuperAdmin', 'Admin', 'Líder'].includes(role); }

function notify(userId, title, message) {
  if (!userId) return;
  try {
    db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?,?,?)').run(userId, title, message);
  } catch {}
}

function generateActivationKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let key = '';
  const bytes = randomBytes(32);
  for (let i = 0; i < 32; i++) key += chars[bytes[i] % chars.length];
  return `EC-${key.slice(0, 8)}-${key.slice(8, 16)}-${key.slice(16, 24)}-${key.slice(24, 32)}`.toUpperCase();
}

function checkTrial(res) {
  const trial = db.prepare('SELECT value FROM settings WHERE key=?').get('trial_expires');
  const activation = db.prepare('SELECT value FROM settings WHERE key=?').get('activated');
  if (activation?.value === '1') return true;
  if (!trial) return true;
  const expires = new Date(trial.value);
  if (new Date() > expires) {
    res.status(403).json({ message: 'Período de teste expirado. Insira uma chave de ativação.' });
    return false;
  }
  return true;
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Dados incompletos' });

  const user = db.prepare('SELECT * FROM users WHERE email=? AND is_active=1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ message: 'Credenciais inválidas' });

  db.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?').run(user.id);

  const member = user.member_id ? db.prepare('SELECT name FROM members WHERE id=?').get(user.member_id) : null;

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, member_id: user.member_id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ id: user.id, email: user.email, role: user.role, member_id: user.member_id, name: member?.name || email, token });
});

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: 'Dados obrigatórios' });
  if (password.length < 8) return res.status(400).json({ message: 'Senha deve ter mínimo 8 caracteres' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const memberResult = db.prepare('INSERT INTO members (name, email, role, is_active) VALUES (?,?,?,1)').run(name, email, 'Membro');
    db.prepare('INSERT INTO users (email, password, role, member_id) VALUES (?,?,?,?)').run(email, hash, 'Membro', memberResult.lastInsertRowid);
    res.json({ message: 'Conta criada com sucesso' });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ message: 'E-mail já cadastrado' });
    res.status(500).json({ message: 'Erro ao criar conta' });
  }
});

app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  // Always return 200 to avoid user enumeration
  if (!user) return res.json({ message: 'Se o e-mail existir, você receberá as instruções.' });

  const code = randomBytes(4).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + 3600000).toISOString();
  db.prepare('UPDATE users SET two_factor_code=?, two_factor_expires=? WHERE id=?').run(code, expires, user.id);
  // In production: send email with code/link
  res.json({ message: 'Se o e-mail existir, você receberá as instruções.' });
});

app.post('/api/verify-2fa', (req, res) => {
  const { code, tempToken } = req.body;
  try {
    const payload = jwt.verify(tempToken, JWT_SECRET + '_2fa');
    const user = db.prepare('SELECT * FROM users WHERE id=? AND two_factor_code=?').get(payload.id, code);
    if (!user) return res.status(401).json({ message: 'Código inválido' });
    if (new Date(user.two_factor_expires) < new Date()) return res.status(401).json({ message: 'Código expirado' });

    db.prepare('UPDATE users SET two_factor_code=NULL, two_factor_expires=NULL WHERE id=?').run(user.id);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, member_id: user.member_id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ id: user.id, email: user.email, role: user.role, member_id: user.member_id, token });
  } catch { res.status(401).json({ message: 'Token inválido' }); }
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ─── Settings / Trial ─────────────────────────────────────────────────────────
app.get('/api/settings/trial', (req, res) => {
  const trial = db.prepare('SELECT value FROM settings WHERE key=?').get('trial_expires');
  const activated = db.prepare('SELECT value FROM settings WHERE key=?').get('activated');

  if (activated?.value === '1') return res.json({ isActive: true, isTrial: false, daysLeft: 999, isExpired: false, message: 'Ativo' });

  if (!trial) return res.json({ isActive: true, isTrial: false, daysLeft: 999, isExpired: false, message: '' });

  const expires = new Date(trial.value);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((expires - now) / 86400000));
  const isExpired = now > expires;

  res.json({ isActive: !isExpired, isTrial: true, daysLeft, isExpired, message: isExpired ? 'Expirado' : `${daysLeft} dia(s) restante(s)` });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get('/api/dashboard/stats', auth, (req, res) => {
  const futureEvents = db.prepare("SELECT count(*) as c FROM cults WHERE date >= date('now') AND status!='Cancelado'").get().c;
  const activeVolunteers = db.prepare("SELECT count(*) as c FROM members WHERE is_active=1").get().c;
  const filledSlots = db.prepare("SELECT count(*) as c FROM scales WHERE status='Confirmado'").get().c;
  const pendingConfirmations = db.prepare("SELECT count(*) as c FROM scales WHERE status='Pendente'").get().c;
  const swapRequests = db.prepare("SELECT count(*) as c FROM swaps WHERE status='Pendente'").get().c;
  res.json({ futureEvents, activeVolunteers, filledSlots, pendingConfirmations, swapRequests });
});

// ─── Members ──────────────────────────────────────────────────────────────────
app.get('/api/members', auth, (req, res) => {
  const { is_active, department_id } = req.query;
  let query = `SELECT m.*, d.name as department_name FROM members m LEFT JOIN departments d ON m.department_id=d.id WHERE 1=1`;
  const params = [];
  if (is_active !== undefined) { query += ' AND m.is_active=?'; params.push(Number(is_active)); }
  if (department_id) { query += ' AND m.department_id=?'; params.push(Number(department_id)); }

  // Leader sees only their dept
  if (req.user.role === 'Líder' && req.user.member_id) {
    const leaderMember = db.prepare('SELECT department_id FROM members WHERE id=?').get(req.user.member_id);
    if (leaderMember?.department_id) { query += ' AND m.department_id=?'; params.push(leaderMember.department_id); }
  }

  query += ' ORDER BY m.name';
  const members = db.prepare(query).all(...params);

  // Attach ministries
  const getMin = db.prepare('SELECT min.* FROM ministries min JOIN member_ministries mm ON min.id=mm.ministry_id WHERE mm.member_id=?');
  members.forEach(m => {
    m.availability = JSON.parse(m.availability || '{}');
    m.ministries = getMin.all(m.id);
  });

  res.json(members);
});

app.get('/api/members/:id', auth, (req, res) => {
  const m = db.prepare('SELECT m.*, d.name as department_name FROM members m LEFT JOIN departments d ON m.department_id=d.id WHERE m.id=?').get(req.params.id);
  if (!m) return res.status(404).json({ message: 'Membro não encontrado' });
  m.availability = JSON.parse(m.availability || '{}');
  m.ministries = db.prepare('SELECT min.* FROM ministries min JOIN member_ministries mm ON min.id=mm.ministry_id WHERE mm.member_id=?').all(m.id);
  res.json(m);
});

app.post('/api/members', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), (req, res) => {
  const { name, email, whatsapp, availability, role, department_id, status, ministries } = req.body;
  if (!name) return res.status(400).json({ message: 'Nome obrigatório' });

  const availStr = JSON.stringify(availability || {});
  const result = db.prepare('INSERT INTO members (name, email, whatsapp, availability, role, department_id, status) VALUES (?,?,?,?,?,?,?)').run(name, email || null, whatsapp || null, availStr, role || 'Membro', department_id || null, status || 'Ativo');
  const memberId = result.lastInsertRowid;

  if (email) {
    const hash = bcrypt.hashSync('EcclesiaScale@' + memberId, 10);
    db.prepare('INSERT OR IGNORE INTO users (email, password, role, member_id) VALUES (?,?,?,?)').run(email, hash, role || 'Membro', memberId);
  }

  if (ministries?.length) {
    const insertMM = db.prepare('INSERT OR IGNORE INTO member_ministries (member_id, ministry_id) VALUES (?,?)');
    ministries.forEach(min => insertMM.run(memberId, min.id));
  }

  res.json({ id: memberId, message: 'Membro criado' });
});

app.put('/api/members/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), (req, res) => {
  const { name, email, whatsapp, availability, role, department_id, status, is_active, ministries } = req.body;
  const availStr = JSON.stringify(availability || {});

  db.prepare('UPDATE members SET name=?, email=?, whatsapp=?, availability=?, role=?, department_id=?, status=?, is_active=? WHERE id=?')
    .run(name, email || null, whatsapp || null, availStr, role, department_id || null, status, is_active ?? 1, req.params.id);

  if (ministries !== undefined) {
    db.prepare('DELETE FROM member_ministries WHERE member_id=?').run(req.params.id);
    if (ministries.length) {
      const insertMM = db.prepare('INSERT OR IGNORE INTO member_ministries (member_id, ministry_id) VALUES (?,?)');
      ministries.forEach(min => insertMM.run(req.params.id, min.id));
    }
  }

  res.json({ message: 'Membro atualizado' });
});

// ─── Users ────────────────────────────────────────────────────────────────────
app.put('/api/users/:id/password', auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ message: 'Senha deve ter mínimo 8 caracteres' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.params.id);
  res.json({ message: 'Senha alterada' });
});

app.post('/api/users/reset-password', auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
  const { email, new_password } = req.body;
  if (!email || !new_password) return res.status(400).json({ message: 'Dados obrigatórios' });
  const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, user.id);
  res.json({ message: 'Senha redefinida' });
});

// ─── Ministries / Departments / Sectors / CultTypes ──────────────────────────
['ministries', 'departments', 'sectors', 'cult_types'].forEach(table => {
  app.get(`/api/${table}`, auth, (req, res) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY name`).all()));

  app.post(`/api/${table}`, auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
    const { name, icon, is_active, default_time, default_day } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome obrigatório' });
    try {
      if (table === 'cult_types') {
        const r = db.prepare('INSERT INTO cult_types (name, default_time, default_day) VALUES (?,?,?)').run(name, default_time || null, default_day ?? null);
        res.json({ id: r.lastInsertRowid });
      } else {
        const r = db.prepare(`INSERT INTO ${table} (name, icon, is_active) VALUES (?,?,?)`).run(name, icon || null, is_active ?? 1);
        res.json({ id: r.lastInsertRowid });
      }
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ message: 'Já existe com este nome' });
      res.status(500).json({ message: 'Erro ao criar' });
    }
  });

  app.put(`/api/${table}/:id`, auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
    const { name, icon, is_active, default_time, default_day, status } = req.body;
    if (table === 'cult_types') {
      db.prepare('UPDATE cult_types SET name=?, default_time=?, default_day=? WHERE id=?').run(name, default_time || null, default_day ?? null, req.params.id);
    } else {
      db.prepare(`UPDATE ${table} SET name=?, icon=?, is_active=? WHERE id=?`).run(name, icon || null, is_active ?? 1, req.params.id);
    }
    res.json({ message: 'Atualizado' });
  });

  app.delete(`/api/${table}/:id`, auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id);
    res.json({ message: 'Excluído' });
  });
});

// ─── Cults ────────────────────────────────────────────────────────────────────
app.get('/api/cults', auth, (req, res) => {
  const { status, limit } = req.query;
  let query = `SELECT c.*, ct.name as type_name FROM cults c LEFT JOIN cult_types ct ON c.type_id=ct.id WHERE 1=1`;
  const params = [];
  if (status) { query += ' AND c.status=?'; params.push(status); }
  query += ' ORDER BY c.date DESC';
  if (limit) { query += ' LIMIT ?'; params.push(Number(limit)); }
  res.json(db.prepare(query).all(...params));
});

app.post('/api/cults', auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
  const { type_id, name, date, time, status } = req.body;
  if (!date || !time) return res.status(400).json({ message: 'Data e horário obrigatórios' });
  const r = db.prepare('INSERT INTO cults (type_id, name, date, time, status) VALUES (?,?,?,?,?)').run(type_id || null, name || null, date, time, status || 'Agendado');
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/cults/:id', auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
  const { type_id, name, date, time, status } = req.body;
  db.prepare('UPDATE cults SET type_id=?, name=?, date=?, time=?, status=? WHERE id=?').run(type_id || null, name || null, date, time, status || 'Agendado', req.params.id);
  res.json({ message: 'Atualizado' });
});

app.delete('/api/cults/:id', auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
  db.prepare('DELETE FROM cults WHERE id=?').run(req.params.id);
  res.json({ message: 'Excluído' });
});

app.post('/api/cults/generate-month', auth, requireRole('SuperAdmin', 'Admin'), (req, res) => {
  const { month, cult_type_ids } = req.body; // month = 'YYYY-MM'
  if (!month || !cult_type_ids?.length) return res.status(400).json({ message: 'Mês e tipos obrigatórios' });

  const [year, mon] = month.split('-').map(Number);
  const cultTypes = db.prepare(`SELECT * FROM cult_types WHERE id IN (${cult_type_ids.map(() => '?').join(',')})`).all(...cult_type_ids);

  const insert = db.prepare('INSERT INTO cults (type_id, date, time, status) VALUES (?,?,?,?)');

  let created = 0;
  const daysInMonth = new Date(year, mon, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, mon - 1, day);
    const dayOfWeek = date.getDay();
    const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    for (const ct of cultTypes) {
      if (ct.default_day === dayOfWeek || ct.default_day === null) {
        insert.run(ct.id, dateStr, ct.default_time || '19:00', 'Agendado');
        created++;
      }
    }
  }

  res.json({ message: `${created} culto(s) criado(s)` });
});

// ─── Scales ───────────────────────────────────────────────────────────────────
app.get('/api/scales', auth, (req, res) => {
  const { cult_id, member_id, limit } = req.query;
  let query = `
    SELECT s.*, m.name as member_name, sec.name as sector_name,
           c.date as cult_date, c.time as cult_time,
           COALESCE(ct.name, c.name) as cult_name
    FROM scales s
    JOIN members m ON s.member_id=m.id
    JOIN sectors sec ON s.sector_id=sec.id
    JOIN cults c ON s.cult_id=c.id
    LEFT JOIN cult_types ct ON c.type_id=ct.id
    WHERE 1=1
  `;
  const params = [];
  if (cult_id) { query += ' AND s.cult_id=?'; params.push(Number(cult_id)); }
  if (member_id) { query += ' AND s.member_id=?'; params.push(Number(member_id)); }
  query += ' ORDER BY c.date, m.name';
  if (limit) { query += ' LIMIT ?'; params.push(Number(limit)); }
  res.json(db.prepare(query).all(...params));
});

app.post('/api/scales', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), (req, res) => {
  const { cult_id, member_id, sector_id } = req.body;
  if (!cult_id || !member_id || !sector_id) return res.status(400).json({ message: 'Dados obrigatórios' });

  // Check: same member in same cult (any sector) — prevent duplicates
  const existing = db.prepare('SELECT id FROM scales WHERE cult_id=? AND member_id=?').get(cult_id, member_id);
  if (existing) return res.status(409).json({ message: 'Voluntário já está escalado neste culto' });

  // Check: same sector in same cult — prevent same sector double booking
  const sectorConflict = db.prepare('SELECT id FROM scales WHERE cult_id=? AND sector_id=?').get(cult_id, sector_id);
  // Note: we allow multiple in same sector; uncomment to restrict:
  // if (sectorConflict) return res.status(409).json({ message: 'Setor já está preenchido neste culto' });

  // Check: max 3x in month (warning, not block — leaders can override)
  const cult = db.prepare('SELECT date FROM cults WHERE id=?').get(cult_id);
  if (cult) {
    const month = cult.date.slice(0, 7);
    const monthCount = db.prepare(`
      SELECT count(*) as c FROM scales s JOIN cults c ON s.cult_id=c.id
      WHERE s.member_id=? AND c.date LIKE ? AND s.status!='Recusado'
    `).get(member_id, `${month}%`).c;
    if (monthCount >= 3 && !isAdmin(req.user.role)) {
      return res.status(409).json({ message: `Voluntário já está escalado ${monthCount}x neste mês (máximo 3)` });
    }
  }

  const r = db.prepare('INSERT INTO scales (cult_id, member_id, sector_id) VALUES (?,?,?)').run(cult_id, member_id, sector_id);

  // Notify member
  const user = db.prepare('SELECT id FROM users WHERE member_id=?').get(member_id);
  if (user && cult) {
    const sector = db.prepare('SELECT name FROM sectors WHERE id=?').get(sector_id);
    notify(user.id, 'Nova Escala', `Você foi escalado para ${sector?.name || 'setor'} em ${cult.date}`);
  }

  res.json({ id: r.lastInsertRowid });
});

app.put('/api/scales/:id/confirm', auth, (req, res) => {
  db.prepare("UPDATE scales SET status='Confirmado', confirmed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ message: 'Confirmado' });
});

app.delete('/api/scales/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), (req, res) => {
  db.prepare('DELETE FROM scales WHERE id=?').run(req.params.id);
  res.json({ message: 'Removido' });
});

app.post('/api/scales/auto-generate', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), (req, res) => {
  const { type, cult_id, month } = req.body;

  let cults = [];
  if (type === 'month' && month) {
    cults = db.prepare("SELECT * FROM cults WHERE date LIKE ? AND status='Agendado'").all(`${month}%`);
  } else if (cult_id) {
    const c = db.prepare('SELECT * FROM cults WHERE id=?').get(cult_id);
    if (c) cults = [c];
  } else {
    cults = db.prepare("SELECT * FROM cults WHERE date >= date('now') AND status='Agendado'").all();
  }

  const members = db.prepare('SELECT * FROM members WHERE is_active=1 AND status="Ativo"').all();
  const sectors = db.prepare('SELECT * FROM sectors WHERE is_active=1').all();

  let created = 0;
  const messages = [];

  for (const cult of cults) {
    const month = cult.date.slice(0, 7);

    for (const sector of sectors) {
      // Find available member not already in this cult and not over limit
      const available = members.filter(m => {
        const alreadyInCult = db.prepare('SELECT id FROM scales WHERE cult_id=? AND member_id=?').get(cult.id, m.id);
        if (alreadyInCult) { messages.push(`${m.name} já está escalado em ${cult.date}`); return false; }

        const monthCount = db.prepare(`
          SELECT count(*) as c FROM scales s JOIN cults c ON s.cult_id=c.id
          WHERE s.member_id=? AND c.date LIKE ?
        `).get(m.id, `${month}%`).c;
        if (monthCount >= 3) return false;

        const avail = JSON.parse(m.availability || '{}');
        return true; // simplified: check availability against cult type if needed
      });

      if (available.length > 0) {
        const member = available[Math.floor(Math.random() * available.length)];
        try {
          db.prepare('INSERT INTO scales (cult_id, member_id, sector_id) VALUES (?,?,?)').run(cult.id, member.id, sector.id);
          created++;
        } catch {}
      }
    }
  }

  res.json({ message: `${created} escala(s) gerada(s)`, warnings: messages.slice(0, 10) });
});

// ─── Swaps ────────────────────────────────────────────────────────────────────
app.get('/api/swaps', auth, (req, res) => {
  const { status, member_id, limit } = req.query;
  let query = `
    SELECT sw.*, 
      req.name as requester_name, 
      sug.name as suggested_member_name,
      sec.name as sector_name,
      COALESCE(ct.name, cu.name) as cult_name,
      cu.date as cult_date,
      sc.department_id
    FROM swaps sw
    JOIN scales sc ON sw.scale_id=sc.id
    JOIN members req ON sw.requester_id=req.id
    LEFT JOIN members sug ON sw.suggested_member_id=sug.id
    LEFT JOIN sectors sec ON sc.sector_id=sec.id
    JOIN cults cu ON sc.cult_id=cu.id
    LEFT JOIN cult_types ct ON cu.type_id=ct.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND sw.status=?'; params.push(status); }
  if (member_id) { query += ' AND (sw.requester_id=? OR sw.suggested_member_id=?)'; params.push(Number(member_id), Number(member_id)); }

  // Leader: only their dept
  if (req.user.role === 'Líder' && req.user.member_id) {
    const leaderMember = db.prepare('SELECT department_id FROM members WHERE id=?').get(req.user.member_id);
    if (leaderMember?.department_id) { query += ' AND sc.department_id=?'; params.push(leaderMember.department_id); }
  }

  query += ' ORDER BY sw.created_at DESC';
  if (limit) { query += ' LIMIT ?'; params.push(Number(limit)); }
  res.json(db.prepare(query).all(...params));
});

app.post('/api/swaps', auth, (req, res) => {
  const { scale_id, suggested_email } = req.body;
  if (!scale_id) return res.status(400).json({ message: 'scale_id obrigatório' });

  const scale = db.prepare('SELECT * FROM scales WHERE id=?').get(scale_id);
  if (!scale) return res.status(404).json({ message: 'Escala não encontrada' });

  // Only same dept swaps
  const requester = db.prepare('SELECT * FROM members WHERE id=?').get(scale.member_id);
  let suggestedId = null;

  if (suggested_email) {
    const suggested = db.prepare('SELECT id, department_id FROM members WHERE email=?').get(suggested_email);
    if (!suggested) return res.status(404).json({ message: 'Membro sugerido não encontrado' });
    if (suggested.department_id !== requester.department_id) return res.status(400).json({ message: 'Trocas apenas entre membros do mesmo departamento' });
    suggestedId = suggested.id;
  }

  const r = db.prepare('INSERT INTO swaps (scale_id, requester_id, suggested_member_id, department_id) VALUES (?,?,?,?)').run(scale_id, scale.member_id, suggestedId, requester.department_id);

  // Notify leader
  if (requester.department_id) {
    const leader = db.prepare(`
      SELECT u.id FROM users u JOIN members m ON u.member_id=m.id
      WHERE m.department_id=? AND m.role='Líder' LIMIT 1
    `).get(requester.department_id);
    if (leader) notify(leader.id, 'Solicitação de Troca', `${requester.name} solicitou uma troca de setor`);
  }

  // Notify suggested member
  if (suggestedId) {
    const sugUser = db.prepare('SELECT id FROM users WHERE member_id=?').get(suggestedId);
    if (sugUser) notify(sugUser.id, 'Troca Solicitada', `${requester.name} solicitou uma troca com você`);
  }

  res.json({ id: r.lastInsertRowid });
});

app.put('/api/swaps/:id', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), (req, res) => {
  const { status } = req.body;
  const swap = db.prepare('SELECT * FROM swaps WHERE id=?').get(req.params.id);
  if (!swap) return res.status(404).json({ message: 'Troca não encontrada' });

  db.prepare('UPDATE swaps SET status=? WHERE id=?').run(status, req.params.id);

  if (status === 'Aprovado' && swap.suggested_member_id) {
    // Execute the swap
    const scale = db.prepare('SELECT * FROM scales WHERE id=?').get(swap.scale_id);
    if (scale) {
      db.prepare("UPDATE scales SET member_id=?, status='Troca' WHERE id=?").run(swap.suggested_member_id, swap.scale_id);
    }
  }

  // Notify requester
  const requesterUser = db.prepare('SELECT id FROM users WHERE member_id=?').get(swap.requester_id);
  if (requesterUser) notify(requesterUser.id, 'Troca ' + status, `Sua solicitação de troca foi ${status.toLowerCase()}`);

  // Notify suggested
  if (swap.suggested_member_id) {
    const sugUser = db.prepare('SELECT id FROM users WHERE member_id=?').get(swap.suggested_member_id);
    if (sugUser) notify(sugUser.id, 'Troca ' + status, `A troca foi ${status.toLowerCase()} pelo líder`);
  }

  res.json({ message: 'Atualizado' });
});

app.put('/api/swaps/:id/member', auth, (req, res) => {
  const { member_status } = req.body;
  const swap = db.prepare('SELECT * FROM swaps WHERE id=?').get(req.params.id);
  if (!swap) return res.status(404).json({ message: 'Troca não encontrada' });

  db.prepare('UPDATE swaps SET member_status=? WHERE id=?').run(member_status, req.params.id);

  // Notify requester
  const requesterUser = db.prepare('SELECT id FROM users WHERE member_id=?').get(swap.requester_id);
  if (requesterUser) notify(requesterUser.id, 'Resposta de Troca', `O membro ${member_status.toLowerCase()} a troca`);

  res.json({ message: 'Atualizado' });
});

// ─── Notifications ────────────────────────────────────────────────────────────
app.get('/api/notifications/:user_id', auth, (req, res) => {
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.params.user_id);
  res.json(notifications);
});

app.put('/api/notifications/:id/read', auth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=?').run(req.params.id);
  res.json({ message: 'Lido' });
});

// ─── Activation Codes ─────────────────────────────────────────────────────────
app.get('/api/activation-codes', auth, requireRole('SuperAdmin'), (req, res) => {
  res.json(db.prepare('SELECT * FROM activation_codes ORDER BY created_at DESC').all());
});

app.post('/api/activation-codes', auth, requireRole('SuperAdmin'), (req, res) => {
  const { institution, expiry_days } = req.body;
  if (!institution) return res.status(400).json({ message: 'Nome da instituição obrigatório' });

  const code = generateActivationKey();
  let expires = null;
  if (expiry_days && Number(expiry_days) > 0) {
    const d = new Date();
    d.setDate(d.getDate() + Number(expiry_days));
    expires = d.toISOString();
  }

  db.prepare('INSERT INTO activation_codes (code, institution, expires_at) VALUES (?,?,?)').run(code, institution, expires);
  res.json({ code, institution, expires_at: expires });
});

app.post('/api/activation-codes/activate', auth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: 'Código obrigatório' });

  const record = db.prepare('SELECT * FROM activation_codes WHERE code=?').get(code);
  if (!record) return res.status(404).json({ message: 'Código inválido' });
  if (record.is_used) return res.status(409).json({ message: 'Código já utilizado' });
  if (record.expires_at && new Date(record.expires_at) < new Date()) return res.status(410).json({ message: 'Código expirado' });

  db.prepare('UPDATE activation_codes SET is_used=1 WHERE code=?').run(code);
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('activated', '1');

  res.json({ message: 'Sistema ativado com sucesso!' });
});

// ─── Backup ───────────────────────────────────────────────────────────────────
app.post('/api/backup', auth, requireRole('SuperAdmin', 'Admin', 'Líder'), (req, res) => {
  // In production: export to Supabase or S3
  const tables = ['members', 'cults', 'scales', 'swaps', 'notifications', 'departments', 'sectors', 'ministries'];
  const backup = {};
  for (const t of tables) {
    try { backup[t] = db.prepare(`SELECT * FROM ${t}`).all(); } catch {}
  }
  backup.exported_at = new Date().toISOString();

  res.json({ message: `Backup realizado em ${new Date().toLocaleString('pt-BR')}`, data: backup });
});

// ─── Static (production) ──────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 EcclesiaScale API rodando em http://localhost:${PORT}`);
  console.log(`\n📋 Credenciais padrão:`);
  console.log(`   SuperAdmin: super@ecclesia.com / SuperAdmin@2024!`);
  console.log(`   Admin:      admin@ecclesia.com / Admin@2024!\n`);
});
