import { create } from "zustand";
import * as api from "./api";
import type { CurrentUserResponse } from "./api";

// Real session against the Spring Boot backend — separate from the mock `useAppStore`
// (which still drives the not-yet-wired-up features). Login bridges the two so existing
// mock-data screens keep working once real auth features replace them one by one.
interface AuthState {
  user: CurrentUserResponse | null;
  hydrated: boolean;
  error: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hydrated: false,
  error: null,
  loading: false,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.login(email, password);
      api.setTokens(res.accessToken, res.refreshToken);
      set({ user: res.user, loading: false });
      return true;
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : "Unable to reach the server.";
      set({ error: message, loading: false });
      return false;
    }
  },

  logout: async () => {
    const refreshToken = api.getRefreshToken();
    if (refreshToken) {
      try {
        await api.logoutApi(refreshToken);
      } catch {
        // best-effort revoke; clear local session regardless
      }
    }
    api.clearTokens();
    set({ user: null });
  },

  hydrate: async () => {
    if (get().hydrated) return;
    const token = api.getAccessToken();
    if (!token) {
      set({ hydrated: true });
      return;
    }
    try {
      const user = await api.getCurrentUser();
      set({ user, hydrated: true });
    } catch {
      api.clearTokens();
      set({ user: null, hydrated: true });
    }
  },
}));
