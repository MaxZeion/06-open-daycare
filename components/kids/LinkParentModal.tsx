"use client";

import { useEffect, useActionState, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, InfoCircleIcon, SendIcon } from "../shared/icons";
import { inviteParent, type InviteParentState } from "../../app/kids/actions";

const RELACIONES = ["Mamá", "Papá", "Tutor/a"] as const;
type Relacion = (typeof RELACIONES)[number];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const FIELD_CLASSES =
  "w-full rounded-[14px] border-[1.5px] bg-field-bg px-4 py-[13px] text-[15px] text-ink outline-none placeholder:text-field-placeholder";

const INITIAL_STATE: InviteParentState = {};

export type LinkParentModalProps = {
  kidName: string;
  childId: string;
  onClose: () => void;
};

export function LinkParentModal({
  kidName,
  childId,
  onClose,
}: LinkParentModalProps) {
  const [state, formAction, isPending] = useActionState<
    InviteParentState,
    FormData
  >(inviteParent, INITIAL_STATE);
  const [isTransitioning, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relacion, setRelacion] = useState<Relacion>("Mamá");
  const [attempted, setAttempted] = useState(false);
  const closedOnSuccess = useRef(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (state.ok && !closedOnSuccess.current) {
      closedOnSuccess.current = true;
      onClose();
    }
  }, [state, onClose]);

  const trimmedName = name.trim();
  const nameParts = trimmedName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts[1] ?? "";
  const nameInvalid = firstName.length < 3 || lastName.length === 0;
  const emailInvalid = !EMAIL_RE.test(email.trim());
  const showNameError = attempted && nameInvalid;
  const showEmailError = attempted && emailInvalid;
  const saving = isPending || isTransitioning;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nameInvalid || emailInvalid) {
      setAttempted(true);
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
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

        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto px-[26px] py-[22px]"
        >
          <input type="hidden" name="child_id" value={childId} />
          <input type="hidden" name="relationship" value={relacion} />

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
              name="full_name"
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
              name="email"
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

          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-gradient-to-b from-brand-deep-soft to-brand-deep py-[14px] text-[15.5px] font-extrabold text-white shadow-cta disabled:opacity-60"
          >
            <SendIcon className="h-[19px] w-[19px]" />
            {saving ? "Enviando…" : "Enviar invitación"}
          </button>

          {state.error ? (
            <p className="mt-[14px] text-center text-xs font-bold text-field-error">
              {state.error}
            </p>
          ) : null}
        </form>
      </div>
    </div>,
    document.body
  );
}
