import { createStore } from "./createStore";
import type { User } from "@/api/authApi";

interface AuthState {
  user: User | null;
  status: "idle" | "loading" | "authenticated" | "anonymous";
  setUser: (u: User | null) => void;
  setStatus: (s: AuthState["status"]) => void;
  reset: () => void;
}

export const useAuthStore = createStore<AuthState>(
  (set) => ({
    user: null,
    status: "idle",
    setUser: (user) => set({ user, status: user ? "authenticated" : "anonymous" }),
    setStatus: (status) => set({ status }),
    reset: () => set({ user: null, status: "anonymous" })
  }),
  { name: "auth", persistKeys: ["user"] }
);
