"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SunIcon } from "@/components/shared/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("caro@opendaycare.com");
  const [password, setPassword] = useState("");

  function handleLogin() {
    if (email.trim() && password.trim()) {
      router.push("/");
    }
  }

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
            El día de cada niño,
            <br />
            compartido con su familia.
          </h1>
          <p className="mt-[18px] max-w-[430px] text-[17px] leading-[1.6] text-white/90">
            Publicá momentos, gestioná las salas y mantené a las familias cerca,
            desde un solo lugar.
          </p>
        </div>
        <div className="relative text-sm text-white/90">
          🌿 Guardería Sala Soles
        </div>
      </div>

      <div className="flex items-center justify-center p-10">
        <div className="w-full max-w-[392px]">
          <h2 className="font-display text-[30px] font-semibold text-ink">
            Iniciar sesión
          </h2>
          <p className="mt-[6px] mb-7 text-[15px] text-muted-strong">
            Ingresá para ver el día de hoy.
          </p>

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
            CONTRASEÑA
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mb-[10px] w-full rounded-[14px] border-[1.5px] border-input-border bg-white px-4 py-[14px] text-[15px] text-ink outline-none placeholder:text-[#B6A99B] focus:border-kid-card-hover"
          />

          <div className="mt-[10px] mb-5 text-right">
            <span className="cursor-pointer text-[13.5px] font-bold text-accent-deep">
              ¿Olvidaste tu contraseña?
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            className="block w-full rounded-[15px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] px-4 py-[15px] text-base font-extrabold text-white shadow-cta"
          >
            Iniciar sesión
          </button>

          <p className="mt-6 mb-0 text-center text-[14.5px] text-muted-strong">
            ¿Te invitó la guardería?{" "}
            <Link
              href="/activate"
              className="font-extrabold text-accent-deep"
            >
              Activá tu cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
