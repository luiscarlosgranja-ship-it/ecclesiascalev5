// ─── Core Types ──────────────────────────────────────────────────────────────

export type Role = 'SuperAdmin' | 'Admin' | 'Líder' | 'Membro' | 'Secretaria';

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  member_id: number | null;
  name?: string;
  token: string;
}

export interface Member {
  id: number;
  name: string;
  email?: string;
  whatsapp?: string;
  availability: Record<number, boolean>;
  role: Role;
  department_id?: number;
  department_name?: string;
  entry_date?: string;
  status: 'Ativo' | 'Inativo';
  is_active: number;
  created_at: string;
  ministries?: Ministry[];
  // ─── Campos de desativação ───────────────────────────────────────────────
  deactivated_at?: string;
  deactivated_by?: string;
}

export interface Ministry {
  id: number;
  name: string;
  icon?: string;
  is_active: number;
}

export interface Department {
  id: number;
  name: string;
  icon?: string;
  is_active: number;
  leader_id?: number;
}

export interface Sector {
  id: number;
  name: string;
  is_active: number;
}

export interface CultType {
  id: number;
  name: string;
  default_time?: string;
  default_day?: number;
}

export interface Cult {
  id: number;
  type_id?: number;
  type_name?: string;
  name?: string;
  date: string;
  time: string;
  status: 'Agendado' | 'Confirmado' | 'Cancelado' | 'Realizado';
}

export interface Scale {
  id: number;
  cult_id: number;
  cult_name?: string;
  cult_date?: string;
  cult_time?: string;
  member_id: number;
  member_name?: string;
  sector_id: number;
  sector_name?: string;
  status: 'Pendente' | 'Confirmado' | 'Troca' | 'Recusado';
  confirmed_at?: string;
}

export interface Swap {
  id: number;
  scale_id: number;
  requester_id: number;
  requester_name?: string;
  suggested_member_id?: number;
  suggested_member_name?: string;
  member_status: 'Pendente' | 'Aceito' | 'Recusado';
  status: 'Pendente' | 'Aprovado' | 'Recusado';
  created_at: string;
  cult_name?: string;
  cult_date?: string;
  sector_name?: string;
  department_id?: number;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

export interface ActivationCode {
  code: string;
  institution?: string;
  expires_at?: string;
  is_used: number;
  created_at: string;
}

export interface DashboardStats {
  futureEvents: number;
  activeVolunteers: number;
  filledSlots: number;
  pendingConfirmations: number;
  departmentCount?: number;
  swapRequests?: number;
}

export interface DashboardWidget {
  id: string;
  title: string;
  visible: boolean;
  order: number;
}

export interface PastoralAppointment {
  id: number;
  name: string;
  date: string;
  time: string;
  notes?: string;
  status: 'Agendado' | 'Realizado' | 'Cancelado' | 'Reagendado';
  created_by?: number;
  created_by_name?: string;
  created_at: string;
}

// ─── Agendamento de Gabinete Pastoral ──────────────────────────────────────

export interface PastoralCabinetSchedule {
  id: number;
  date: string;
  time: string;
  duration_minutes: number; // Duração do atendimento (ex: 30, 60)
  is_available: boolean;
  volunteer_id?: number;
  volunteer_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PastoralCabinetBooking {
  id: number;
  volunteer_id: number;
  volunteer_name?: string;
  schedule_id: number;
  date: string;
  time: string;
  duration_minutes: number;
  status: 'Agendado' | 'Confirmado' | 'Cancelado' | 'Realizado';
  notes?: string;
  created_at: string;
  created_by?: number;
  updated_at: string;
}

export interface AvailableTimeSlot {
  date: string;
  time: string;
  duration_minutes: number;
  schedule_id: number;
}
