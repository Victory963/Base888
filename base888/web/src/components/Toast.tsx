import { useToastStore } from "@/hooks/useToast";

// Reconstruction of Base44's toast renderer. Mounted once near the app root.
export function ToastViewport() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.variant === "error" ? "error" : ""}`} onClick={() => dismiss(t.id)}>
          <div style={{ fontWeight: 600 }}>{t.title}</div>
          {t.description && <div className="muted" style={{ fontSize: 13 }}>{t.description}</div>}
        </div>
      ))}
    </div>
  );
}
