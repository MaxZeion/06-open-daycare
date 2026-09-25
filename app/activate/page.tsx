"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckIcon, SunIcon } from "@/components/shared/icons";

export default function ActivatePage() {
  const router = useRouter();
  const [code, setCode] = useState("7K4P9");
  const [email, setEmail] = useState("lucia.fernandez@gmail.com");
  const [password, setPassword] = useState("contraseña");
  const [consent, setConsent] = useState(true);

  function handleActivate() {
    if (email.trim() && password.trim()) {
      router.push("/");
    }
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
          Te invitaron a seguir el día de tu hijo. Creá tu contraseña para
          activar la cuenta.
        </p>

        <div className="mb-[22px] flex items-center gap-[14px] rounded-[16px] border-[1.5px] border-input-border bg-white px-4 py-[14px]">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-[19px] font-semibold"
            style={{
              backgroundColor: "var(--avatar-mateo-bg)",
              color: "var(--avatar-mateo-fg)",
            }}
          >
            M
          </div>
          <div>
            <div className="text-[13px] text-muted-strong">
              Te invitaron a seguir a
            </div>
            <div className="font-display text-[17px] font-semibold text-ink">
              Mateo · Sala Soles
            </div>
          </div>
        </div>

        <div className="mb-2 text-xs font-bold tracking-[0.7px] text-muted-strong">
          CÓDIGO DE INVITACIÓN
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="font-display mb-[18px] w-full rounded-[14px] border-[1.5px] border-input-border bg-white px-4 py-[14px] text-[18px] font-bold tracking-[3px] text-ink outline-none"
        />

        <div className="mb-2 text-xs font-bold tracking-[0.7px] text-muted-strong">
          EMAIL
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-[18px] w-full rounded-[14px] border-[1.5px] border-input-border bg-white px-4 py-[14px] text-[15px] text-ink outline-none placeholder:text-[#B6A99B]"
        />

        <div className="mb-2 text-xs font-bold tracking-[0.7px] text-muted-strong">
          CREAR CONTRASEÑA
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-[18px] w-full rounded-[14px] border-[1.5px] border-kid-card-hover bg-white px-4 py-[14px] text-[15px] text-ink outline-none"
        />

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

        <button
          type="button"
          onClick={handleActivate}
          className="block w-full rounded-[15px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] px-4 py-[15px] text-base font-extrabold text-white shadow-cta"
        >
          Activar mi cuenta
        </button>

        <p className="mt-[22px] mb-0 text-center text-[14.5px] text-muted-strong">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-extrabold text-accent-deep">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
