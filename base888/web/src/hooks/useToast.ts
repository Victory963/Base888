import { create } from "zustand";

// Reconstruction of Base44's use-toast / toast module: a tiny global toast
// store with auto-dismiss.
export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "error";
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = (() => { try { return crypto.randomUUID(); } catch { return `t-${Date.now()}`; } })();
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4000);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}));

export function useToast() {
  const push = useToastStore((s) => s.push);
  return {
    toast: (title: string, description?: string) => push({ title, description }),
    error: (title: string, description?: string) => push({ title, description, variant: "error" })
  };
}
