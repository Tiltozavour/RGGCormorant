import { useRef } from "react";

type AdminDialogVariant = "info" | "confirm" | "input";

interface AdminDialogProps {
  isOpen: boolean;
  variant?: AdminDialogVariant;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  initialValue?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputType?: "text" | "number" | "password";
  danger?: boolean;
  onConfirm: (value?: string) => void;
  onClose: () => void;
}

function AdminDialog({
  isOpen,
  variant = "info",
  title,
  message,
  confirmLabel,
  cancelLabel,
  initialValue = "",
  inputLabel,
  inputPlaceholder,
  inputType = "text",
  danger = false,
  onConfirm,
  onClose,
}: AdminDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const showCancel = variant !== "info";
  const getInputValue = () => inputRef.current?.value ?? initialValue;

  return (
    <div className="fixed inset-0 z-[30000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        <h3 className={`text-lg font-black uppercase tracking-wide ${danger ? "text-red-300" : "text-yellow-300"}`}>
          {title}
        </h3>

        {message && (
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            {message}
          </p>
        )}

        {variant === "input" && (
          <label className="mt-5 flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            {inputLabel}
            <input
              autoFocus
              key={`${title}-${initialValue}`}
              ref={inputRef}
              type={inputType}
              defaultValue={initialValue}
              placeholder={inputPlaceholder}
              onKeyDown={(event) => {
                if (event.key === "Enter") onConfirm(getInputValue());
                if (event.key === "Escape") onClose();
              }}
              className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm normal-case tracking-normal text-white outline-none transition focus:border-yellow-400/60"
            />
          </label>
        )}

        <div className="mt-6 flex justify-end gap-3">
          {showCancel && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-zinc-300 transition hover:bg-white/10"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm(variant === "input" ? getInputValue() : undefined)}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
              danger
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-yellow-400 text-black hover:bg-white"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminDialog;
