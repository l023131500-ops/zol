import type { UserRole } from '@kesef/db/types';

/** The 8 roles from 00_MASTER_BRIEF.md §4, ordered by capability. */
export const ROLES: UserRole[] = [
  'resident',
  'activist',
  'council_member',
  'journalist',
  'municipality_admin',
  'staff',
  'superadmin',
];

export const ROLE_LABEL_HE: Record<UserRole, string> = {
  resident: 'תושב',
  activist: 'פעיל חברתי',
  council_member: 'חבר מועצה',
  journalist: 'עיתונאי',
  municipality_admin: 'מנהל רשות',
  staff: 'צוות',
  superadmin: 'מנהל-על',
};

/** Roles allowed into the admin portal. */
export const ADMIN_ROLES: readonly UserRole[] = ['staff', 'superadmin'];

export function hasRole(role: UserRole | null | undefined, allowed: readonly UserRole[]): boolean {
  return role != null && allowed.includes(role);
}

/** anonymous is represented as null. */
export type SessionRole = UserRole | null;
