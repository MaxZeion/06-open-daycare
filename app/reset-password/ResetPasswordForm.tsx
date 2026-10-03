"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SunIcon } from "@/components/shared/icons";
import { updatePassword, type UpdatePasswordState } from "./actions";

const INITIAL_STATE: UpdatePasswordState = {};

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState<
    UpdatePasswordState,
    FormData
  >(updatePassword, INITIAL_STATE);

  return (
    <div className="grid min-h-dvh bg-bg-auth md:grid-cols-[1.05fr_1fr]">
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-[56px_60px] text-white md:flex"
        style={{
          background:
            "linear-gradient(155deg, var(--login-grad-1) 0%, var(--login-grad-2) 45%, var(--login-grad-3) 100%)",
        }}
      >
        <div className="absolute -top-[140px] -right-[120px] h-[420px] w-[420px] rounded-full bg-white/12" />
        <div className="absolute -bottom-[110px] -left-[80px] h-[300px] w-[300px] rounded-full bg-white/10" />
        <div className="relative flex items-center gap-[13px]">
          <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-white/22">
            <SunIcon className="h-[26px] w-[26px] text-white" />
          </div>
          <span className="font-display text-[21px] font-semibold tracking-[0.5px]">
            OpenDayCare
          </span>
        </div>
        <div className="relative">
          <h1 className="font-display text-[42px] leading-[1.12] font-semibold">
            Define tu nueva contraseña.
          </h1>
          <p className="mt-[18px] max-w-[430px] text-[17px] leading-[1.6] text-white/90">
            Elige algo que recuerdes: lo necesitarás la próxima vez que entres
            a ver el día de tu familia.
          </p>
        </div>
        <div className="relative text-sm text-white/90">
          🌿 Guardería Sala Soles
        </div>
      </div>

      <div className="flex items-center justify-center p-10">
        <div className="w-full max-w-[392px]">
          <h2 className="font-display text-[30px] font-semibold text-ink">
            Nueva contraseña
          </h2>
          <p className="mt-[6px] mb-7 text-[15px] text-muted-strong">
            Mínimo 8 caracteres. No la compartas con nadie.
          </p>

          {state.ok ? (
            <div
              role="status"
              className="mb-4 rounded-[14px] border border-[#B9DEC4] bg-[#EAF6EE] p-4 text-[14.5px] text-[#3E8B62]"
            >
              <p className="font-semibold">¡Contraseña actualizada!</p>
              <p className="mt-1 text-[13.5px]">
                Ya podés iniciar sesión con tu nueva contraseña.
              </p>
              <Link
                href="/login?reset=ok"
                className="mt-2 inline-block font-extrabold text-accent-deep"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          ) : null}

          <form action={formAction} noValidate>
            <div className="mb-2 text-xs font-bold tracking-[0.7px] text-muted-strong">
              NUEVA CONTRASEÑA
            </div>
            <input
              type="password"
              name="password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              className="mb-[18px] w-full rounded-[14px] border-[1.5px] border-input-border bg-white px-4 py-[14px] text-[15px] text-ink outline-none placeholder:text-[#B6A99B]"
            />

            <div className="mb-2 text-xs font-bold tracking-[0.7px] text-muted-strong">
              REPETIR CONTRASEÑA
            </div>
            <input
              type="password"
              name="confirm"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              className="mb-[10px] w-full rounded-[14px] border-[1.5px] border-input-border bg-white px-4 py-[14px] text-[15px] text-ink outline-none placeholder:text-[#B6A99B]"
            />

            <button
              type="submit"
              disabled={isPending || state.ok}
              className="mt-5 block w-full rounded-[15px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] px-4 py-[15px] text-base font-extrabold text-white shadow-cta disabled:opacity-70"
            >
              {state.ok ? "Contraseña guardada" : "Guardar contraseña"}
            </button>

            {state.error ? (
              <p
                role="alert"
                className="mt-4 text-center text-[13.5px] font-medium text-accent-deep"
              >
                {state.error}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}