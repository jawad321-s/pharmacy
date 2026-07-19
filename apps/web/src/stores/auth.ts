'use client';

import { create } from 'zustand';
import { api, setTokens } from '@/lib/api';

export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string | null;
  tenantRole: string | null;
  platformRole: string | null;
  branchId: string | null;
  permissions: string[];
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  status: string;
  currency: string;
  logoUrl: string | null;
}

interface AuthState {
  user: Profile | null;
  tenant: TenantInfo | null;
  ready: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<Profile>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: Profile;
  tenant: TenantInfo | null;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  tenant: null,
  ready: false,

  hydrate: async () => {
    try {
      const me = await api<{ user: Profile; tenant: TenantInfo | null; permissions: string[] }>(
        '/auth/me',
      );
      set({
        user: { ...me.user, permissions: me.permissions },
        tenant: me.tenant,
        ready: true,
      });
    } catch {
      set({ user: null, tenant: null, ready: true });
    }
  },

  login: async (email, password) => {
    const response = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    });
    setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    });
    set({ user: response.user, tenant: response.tenant, ready: true });
    return response.user;
  },

  logout: async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      // token may already be invalid
    }
    setTokens(null);
    set({ user: null, tenant: null });
  },

  hasPermission: (permission) => {
    const user = get().user;
    if (!user) return false;
    if (user.platformRole) return true;
    return user.permissions.includes(permission);
  },
}));
