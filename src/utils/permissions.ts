import type { Role } from '../types';

export const PERMISSIONS = {
  dashboard: ['SuperAdmin', 'Admin', 'Líder', 'Membro'] as Role[],
  manageScales: ['SuperAdmin', 'Admin', 'Líder'] as Role[],
  cultsEvents: ['SuperAdmin', 'Admin'] as Role[],
  volunteersCadaster: ['SuperAdmin', 'Admin', 'Líder'] as Role[],
  ministriesDeptSectors: ['SuperAdmin', 'Admin'] as Role[],
  cultTypes: ['SuperAdmin', 'Admin'] as Role[],
  swapsHistory: ['SuperAdmin', 'Admin', 'Líder'] as Role[],
  myPanel: ['SuperAdmin', 'Admin', 'Líder', 'Membro'] as Role[],
  security: ['SuperAdmin', 'Admin'] as Role[],
  activationKeys: ['SuperAdmin'] as Role[],
  backup: ['SuperAdmin', 'Admin', 'Líder'] as Role[],
  changeMinistry: ['SuperAdmin', 'Admin'] as Role[],
  changeAvailability: ['SuperAdmin', 'Admin', 'Líder'] as Role[],
  deactivateMember: ['SuperAdmin', 'Admin', 'Líder'] as Role[],
};

export function can(role: Role, permission: keyof typeof PERMISSIONS): boolean {
  return PERMISSIONS[permission].includes(role);
}

export function isSuperAdmin(role: Role) { return role === 'SuperAdmin'; }
export function isAdmin(role: Role) { return role === 'Admin' || role === 'SuperAdmin'; }
export function isLeader(role: Role) { return role === 'Líder' || role === 'Admin' || role === 'SuperAdmin'; }
export function isMember(role: Role) { return role === 'Membro'; }
