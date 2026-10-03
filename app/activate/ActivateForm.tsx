"use client";

import { useState, useActionState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, SunIcon } from "@/components/shared/icons";
import { activate, type ActivateState } from "./actions";
import { AVATAR_PALETTE } from "@/app/(staff)/_components/kids/mockKids";

const CODE_RE = /^[A-Z0-9]{5}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

const INITIAL_STATE: ActivateState = {};

const INPUT_CLASSES =
  "mb-[18px] w-full rounded-[14px] border-[1.5px] border-input-border bg-white px-4 py-[14px] text-[15px] text-ink outline-none placeholder:text-[#B6A99B]";

export interface InvitationPreview {
  childName: string;
  roomName?: string;
  childId: string;
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function avatarFor(id: string): { bg: string; fg: string } {
  return AVATAR_PALETTE[hashId(id) % AVATAR_PALETTE.length];
}

export function ActivateForm({
  initialCode = "",
  preview,
}: {
  initialCode?: string;
  preview?: InvitationPreview;
}) {
  const [state, formAction, isPending] = useActionState<ActivateState, FormData>(
    activate,
    INITIAL_STATE,
  );
  const [isTransitioning, startTransition] = useTransition();

  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [attempted, setAttempted] = useState(false);

  const saving = isPending || isTransitioning;
  const codeInvalid = !CODE_RE.test(code.trim().toUpperCase());
  const emailInvalid = !EMAIL_RE.test(email.trim());
  const passwordInvalid = password.length < MIN_PASSWORD_LENGTH;
  const formInvalid = codeInvalid || emailInvalid || passwordInvalid || !consent;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formInvalid) {
      setAttempted(true);
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  const childName = preview?.childName ?? "";
  const roomName = preview?.roomName ?? "";
  const avatar = preview ? avatarFor(preview.childId) : undefined;
  const avatarInitial = childName ? childName.charAt(0).toUpperCase() : "·";

  if (state.ok) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-auth p-10">
        <div className="w-full max-w-[440px] text-center">
          <div className="mx-auto mb-[22px] flex h-[58px] w-[58px] items-center justify-center rounded-[18px] bg-[linear-gradient(155deg,var(--brand-soft),var(--brand))] shadow-[0_12px_26px_-10px_rgba(238,129,100,0.65)]">
            <SunIcon className="h-[30px] w-[30px] text-white" />
          </div>
          <h1 className="font-display text-[32px] leading-[1.15] font-semibold text-ink">
            ¡Cuenta activada!
          </h1>
          <p className="mt-2 mb-[26px] text-[15.5px] leading-[1.55] text-muted-strong">
            Tu código es válido y tu cuenta ya está creada. Inicia sesión con
            tu email y la contraseña que acabas de crear.
          </p>
          <Link
            href="/login"
            className="block w-full rounded-[15px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] px-4 py-[15px] text-base font-extrabold text-white shadow-cta"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-auth p-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-[22px] flex h-[58px] w-[58px] items-center justify-center rounded-[18px] bg-[linear-gradient(155deg,var(--brand-soft),var(--brand))] shadow-[0_12px_26px_-10px_rgba(238,129,100,0.65)]">
          <SunIcon className="h-[30px] w-[30px] text-white" />
        </div>
        <h1 className="font-display text-[32px] leading-[1.15] font-semibold text-ink">
          Bienvenida a OpenDayCare
        </h1>
        <p className="mt-2 mb-[26px] text-[15.5px] leading-[1.55] text-muted-strong">
          Te invitaron a seguir el día de tu hijo. Crea tu contraseña para
          activar la cuenta.
        </p>

        {preview ? (
          <div className="mb-[22px] flex items-center gap-[14px] rounded-[16px] border-[1.5px] border-input-border bg-white px-4 py-[14px]">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-[19px] font-semibold"
              style={{
                backgroundColor: avatar!.bg,
                color: avatar!.fg,
              }}
            >
              {avatarInitial}
            </div>
            <div>
              <div className="text-[13px] text-muted-strong">
                Te invitaron a seguir a
              </div>
              <div className="font-display text-[17px] font-semibold text-ink">
                {childName}
                {roomName ? ` · ${roomName}` : ""}
              </div>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <input type="hidden" name="consent" value={consent ? "on" : ""} />

          <div className="mb-2 text-xs font-bold tracking-[0.7px] text-muted-strong">
            CÓDIGO DE INVITACIÓN
          </div>
          <input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ej. 7K4P9"
            maxLength={5}
            aria-invalid={attempted && codeInvalid}
            className={`font-display rounded-[14px] border-[1.5px] px-4 py-[14px] text-[18px] font-bold tracking-[3px] text-ink outline-none placeholder:font-body placeholder:text-[15px] placeholder:tracking-normal ${INPUT_CLASSES} ${
              attempted && codeInvalid
                ? "border-field-error"
                : "border-input-border"
            }`}
          />
          {attempted && codeInvalid ? (
            <p className="-mt-3 mb-[18px] text-xs font-bold text-field-error">
              Introduce el código de 5 caracteres.
            </p>
          ) : null}

          <div className="mb-2 text-xs font-bold tracking-[0.7px] text-muted-strong">
            EMAIL
          </div>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            aria-invalid={attempted && emailInvalid}
            className={`${INPUT_CLASSES} ${
              attempted && emailInvalid
                ? "border-field-error"
                : "border-input-border"
            }`}
          />
          {attempted && emailInvalid ? (
            <p className="-mt-3 mb-[18px] text-xs font-bold text-field-error">
              Introduce un email válido.
            </p>
          ) : null}

          <div className="mb-2 text-xs font-bold tracking-[0.7px] text-muted-strong">
            CREAR CONTRASEÑA
          </div>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            aria-invalid={attempted && passwordInvalid}
            className={`${INPUT_CLASSES} ${
              attempted && passwordInvalid
                ? "border-field-error"
                : "border-kid-card-hover"
            }`}
          />
          {attempted && passwordInvalid ? (
            <p className="-mt-3 mb-[18px] text-xs font-bold text-field-error">
              La contraseña debe tener al menos 8 caracteres.
            </p>
          ) : null}

          <label
            className="mb-6 flex cursor-pointer items-start gap-3 rounded-[14px] bg-consent-bg px-4 py-[14px]"
            onClick={(e) => {
              e.preventDefault();
              setConsent((c) => !c);
            }}
          >
            <span
              className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                consent
                  ? "bg-check-bg"
                  : "border-[1.5px] border-input-border bg-white"
              }`}
            >
              {consent && <CheckIcon className="h-[15px] w-[15px] text-white" />}
            </span>
            <span className="text-sm leading-[1.45] text-consent-fg">
              Autorizo a la guardería a tomar y compartir fotos de mi hijo dentro
              de la app.
            </span>
          </label>

          {attempted && !consent ? (
            <p className="mb-3 text-xs font-bold text-field-error">
              Debes autorizar el uso de fotos para continuar.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="block w-full rounded-[15px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] px-4 py-[15px] text-base font-extrabold text-white shadow-cta disabled:opacity-60"
          >
            {saving ? "Activando…" : "Activar mi cuenta"}
          </button>

          {state.error ? (
            <p className="mt-[14px] text-center text-xs font-bold text-field-error">
              {state.error}
            </p>
          ) : null}
        </form>

        <p className="mt-[22px] mb-0 text-center text-[14.5px] text-muted-strong">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-extrabold text-accent-deep">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
