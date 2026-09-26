"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, InfoCircleIcon, SendIcon } from "../shared/icons";
import { AVATAR_PALETTE, type Parent } from "./mockKids";

const RELACIONES = ["Mamá", "Papá", "Tutor/a"] as const;
type Relacion = (typeof RELACIONES)[number];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const FIELD_CLASSES =
  "w-full rounded-[14px] border-[1.5px] bg-field-bg px-4 py-[13px] text-[15px] text-ink outline-none placeholder:text-field-placeholder";

function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export type LinkParentModalProps = {
  open: boolean;
  kidName: string;
  existingParentsCount: number;
  onClose: () => void;
  onSubmit: (parent: Parent) => void;
};

export function LinkParentModal({
  open,
  kidName,
  existingParentsCount,
  onClose,
  onSubmit,
}: LinkParentModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relacion, setRelacion] = useState<Relacion>("Mamá");
  const [attempted, setAttempted] = useState(false);
  const [inviteCode] = useState(() => generateInviteCode());

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const trimmedName = name.trim();
  const nameParts = trimmedName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts[1] ?? "";
  const nameInvalid = firstName.length < 3 || lastName.length === 0;
  const emailInvalid = !EMAIL_RE.test(email.trim());
  const showNameError = attempted && nameInvalid;
  const showEmailError = attempted && emailInvalid;

  function handleSubmit() {
    if (nameInvalid || emailInvalid) {
      setAttempted(true);
      return;
    }
    const avatar =
      AVATAR_PALETTE[existingParentsCount % AVATAR_PALETTE.length];
    const parent: Parent = {
      name: trimmedName,
      initials: trimmedName.charAt(0).toUpperCase(),
      bg: avatar.bg,
      fg: avatar.fg,
      role: relacion,
      status: "pendiente",
      note: "invitación enviada",
    };
    onSubmit(parent);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vincular padre"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-[480px] flex-col overflow-hidden rounded-[24px] border border-border bg-modal-bg shadow-modal"
      >
        <header className="flex flex-none items-center justify-between border-b border-border px-[26px] py-5">
          <div>
            <div className="font-display text-[18px] font-semibold text-ink">
              Vincular padre
            </div>
            <div className="text-[13px] text-muted">a {kidName}</div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-close-btn-bg text-close-btn-fg"
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="overflow-y-auto px-[26px] py-[22px]">
          <div className="mb-[20px] flex gap-[11px] rounded-[14px] bg-info-banner-bg px-4 py-[13px]">
            <InfoCircleIcon className="mt-[1px] h-5 w-5 flex-none text-info-banner-icon" />
            <span className="text-[13.5px] leading-[1.45] text-info-banner-fg">
              Le enviaremos un correo con un código para que active su cuenta.
              Solo verá el feed de {kidName}.
            </span>
          </div>

          <div className="mb-[18px]">
            <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              NOMBRE DEL PADRE/MADRE
            </div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Diego Fernández"
              aria-invalid={showNameError}
              className={`${FIELD_CLASSES} ${
                showNameError ? "border-field-error" : "border-input-border"
              }`}
            />
            {showNameError ? (
              <p className="mt-2 text-xs font-bold text-field-error">
                Introduce nombre y apellido (mínimo 3 caracteres en el nombre).
              </p>
            ) : null}
          </div>

          <div className="mb-[18px]">
            <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              EMAIL
            </div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="correo@ejemplo.com"
              aria-invalid={showEmailError}
              className={`${FIELD_CLASSES} ${
                showEmailError ? "border-field-error" : "border-input-border"
              }`}
            />
            {showEmailError ? (
              <p className="mt-2 text-xs font-bold text-field-error">
                Introduce un email válido.
              </p>
            ) : null}
          </div>

          <div className="mb-[20px]">
            <div className="mb-[10px] text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              PARENTESCO
            </div>
            <div className="flex gap-[9px]">
              {RELACIONES.map((option) => {
                const selected = relacion === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRelacion(option)}
                    className={`flex-1 rounded-full border-[1.5px] py-[11px] text-[14px] font-extrabold ${
                      selected
                        ? "border-kinship-on-border bg-kinship-on-bg text-kinship-on-fg"
                        : "border-kinship-off-border bg-kinship-off-bg text-kinship-off-fg"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-[20px] rounded-[16px] border-[1.5px] border-dashed border-code-box-border bg-code-box-bg px-[18px] py-[18px] text-center">
            <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-code-title">
              CÓDIGO DE INVITACIÓN
            </div>
            <div className="font-display text-[34px] font-semibold tracking-[7px] text-code-text">
              {inviteCode}
            </div>
            <div className="mt-[6px] text-[13px] text-code-sub">
              Vence en 7 días
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-gradient-to-b from-brand-deep-soft to-brand-deep py-[14px] text-[15.5px] font-extrabold text-white shadow-cta"
          >
            <SendIcon className="h-[19px] w-[19px]" />
            Enviar invitación
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
