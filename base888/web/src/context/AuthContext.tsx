import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi, type User } from "@/api/authApi";
import { session } from "@/api/axiosClient";
import { useAuthStore } from "@/stores/authStore";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (email: string, fullName: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Reconstruction of Base44's AuthContext: bootstraps the session on mount,
// exposes login/logout, and keeps the auth store in sync.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    try {
      if (!session.getAccessToken()) { setUser(null); return; }
      const me = await authApi.me();
      setUser(me);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    void (async () => {
      await refreshMe();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string, turnstileToken?: string) {
    const u = await authApi.login(email, password, turnstileToken);
    setUser(u);
  }

  async function register(email: string, fullName: string, password: string, turnstileToken?: string) {
    const u = await authApi.register(email, fullName, password, turnstileToken);
    setUser(u);
  }

  async function logout() {
    await authApi.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
