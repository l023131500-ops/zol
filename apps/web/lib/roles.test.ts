import { describe, it, expect } from 'vitest';
import { ROLES, ADMIN_ROLES, hasRole, ROLE_LABEL_HE } from './roles';

describe('role-based access control', () => {
  it('defines all 8 roles from the master brief', () => {
    expect(ROLES).toHaveLength(7); // 7 authenticated roles + anonymous (null) = 8 states
    expect(ROLES).toContain('resident');
    expect(ROLES).toContain('superadmin');
    expect(ROLES).toContain('municipality_admin');
  });

  it('every role has a Hebrew label', () => {
    for (const role of ROLES) {
      expect(ROLE_LABEL_HE[role]).toBeTruthy();
    }
  });

  it('anonymous (null) is never admin', () => {
    expect(hasRole(null, ADMIN_ROLES)).toBe(false);
  });

  it('resident and municipality_admin are not admin-portal roles', () => {
    expect(hasRole('resident', ADMIN_ROLES)).toBe(false);
    expect(hasRole('municipality_admin', ADMIN_ROLES)).toBe(false);
  });

  it('staff and superadmin reach the admin portal', () => {
    expect(hasRole('staff', ADMIN_ROLES)).toBe(true);
    expect(hasRole('superadmin', ADMIN_ROLES)).toBe(true);
  });
});
