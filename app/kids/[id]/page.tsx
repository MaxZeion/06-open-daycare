import Link from "next/link";
import { AppShell } from "../../../components/shared/AppShell";
import { ArrowLeftIcon } from "../../../components/shared/icons";
import { KIDS } from "../../../components/kids/mockKids";
import type { Kid } from "../../../components/kids/mockKids";
import { ProfileClient } from "./ProfileClient";

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[16px] border border-border bg-surface px-6 py-16 text-center">
      <p className="font-display text-[22px] font-semibold text-ink">
        No encontramos a este niño
      </p>
      <p className="text-[15px] text-muted">
        Revisá el enlace o volvé a la lista.
      </p>
      <Link
        href="/kids"
        className="mt-2 flex items-center gap-2 text-[14px] font-bold text-accent"
      >
        <ArrowLeftIcon className="h-[18px] w-[18px]" />
        Volver a Niños
      </Link>
    </div>
  );
}

export default async function KidProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const kid: Kid | undefined = KIDS.find((item) => item.id === id);

  return (
    <AppShell active="kids">
      <div className="mx-auto w-full max-w-[820px] px-5 pt-8 pb-24 md:px-10 md:pt-[34px] md:pb-20">
        {kid ? <ProfileClient kid={kid} /> : <NotFound />}
      </div>
    </AppShell>
  );
}
