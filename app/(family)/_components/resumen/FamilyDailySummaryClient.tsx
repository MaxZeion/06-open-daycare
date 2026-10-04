"use client";

import { useState } from "react";
import { avatarFor } from "@/app/(staff)/_components/kids/mapKid";
import type { PostKind } from "@/app/(staff)/_components/feed/mockPosts";
import type { DailySummary, DailySummaryChild } from "@/utils/supabase/daily-summaries";
import type { FeedPost } from "@/utils/supabase/posts";

const HIGHLIGHT_KINDS: Partial<Record<PostKind, { label: string; bg: string; fg: string }>> = {
  logro: { label: "logro", bg: "#CFEBD8", fg: "#3E9B6C" },
  actividad: { label: "actividad", bg: "#C7E7F1", fg: "#2E89A6" },
  comida: { label: "comida", bg: "#F7E7A6", fg: "#9A7B1E" },
};

function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

function formatSleep(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest.toString().padStart(2, "0")}`;
}

function isSameDateEuropeMadrid(publishedAtIso: string, date: string): boolean {
  const madridDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(publishedAtIso));
  return madridDate === date;
}

function summarizeBody(body: string): { title: string; rest: string | null } {
  const parts = body.split(/(?<=[.!?])\s+/);
  const title = parts[0] ?? body;
  const rest = parts.slice(1).join(" ").trim();
  return { title, rest: rest.length > 0 ? rest : null };
}

export function FamilyDailySummaryClient({
  summaries,
  linkedChildren: children,
  posts,
  date,
  dateLabel,
}: {
  summaries: DailySummary[];
  linkedChildren: DailySummaryChild[];
  posts: FeedPost[];
  date: string;
  dateLabel: string;
}) {
  const [selectedChildId, setSelectedChildId] = useState(
    children[0]?.id ?? "",
  );

  const selectedChild =
    children.find((child) => child.id === selectedChildId) ?? children[0];

  const summary = selectedChild
    ? summaries.find((item) => item.childId === selectedChild.id)
    : undefined;

  const highlights = selectedChild
    ? posts
        .filter(
          (post) =>
            post.childIds?.includes(selectedChild.id) &&
            post.kind in HIGHLIGHT_KINDS &&
            post.publishedAt &&
            isSameDateEuropeMadrid(post.publishedAt, date),
        )
        .sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""))
        .slice(-2)
        .reverse()
    : [];

  if (children.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[700px] px-5 pb-20 pt-[34px] md:px-10">
        <p className="rounded-[16px] border border-border bg-surface px-4 py-16 text-center text-[14.5px] text-muted-strong">
          Aún no tienes peques vinculados. Cuando una maestra te invite,
          aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[700px] px-5 pb-20 pt-[34px] md:px-10">
      {children.length > 1 ? (
        <div className="mb-[22px] flex flex-wrap gap-2.5">
          {children.map((child) => {
            const active = child.id === selectedChild?.id;
            const avatar = avatarFor(child.id);
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => setSelectedChildId(child.id)}
                aria-pressed={active}
                className={`flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] py-[7px] pl-2 pr-[15px] text-sm font-bold transition-colors ${
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-border bg-surface text-idle"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full font-display text-[13px] font-semibold"
                  style={{ backgroundColor: avatar.bg, color: avatar.fg }}
                >
                  {firstName(child.fullName).charAt(0).toUpperCase()}
                </span>
                {firstName(child.fullName)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mb-[22px] rounded-[22px] bg-[linear-gradient(160deg,#FBE0D2,#F9D2DE)] px-[30px] py-7">
        <p className="mb-1.5 text-[12.5px] font-extrabold tracking-[0.8px] text-accent">
          RESUMEN DEL DÍA
        </p>
        <h1 className="font-display text-[32px] font-semibold text-ink">
          El día de {selectedChild ? firstName(selectedChild.fullName) : "tu peque"}
        </h1>
        <p className="mt-1.5 text-[15px] text-[#9A6A6A]">{dateLabel}</p>
      </div>

      {summary ? (
        <>
          <div className="mb-[18px] grid grid-cols-3 gap-3.5">
            <div className="rounded-[18px] bg-[#F7E7A6] p-5 text-center">
              <svg
                aria-hidden="true"
                className="mx-auto mb-2 h-[26px] w-[26px] text-[#9A7B1E]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 11h18a8 8 0 0 1-16 0M12 3v3" />
              </svg>
              <div className="font-display text-[26px] font-semibold text-[#9A7B1E]">
                {summary.mealsCount}
              </div>
              <div className="text-[13px] font-semibold text-[#9A7B1E]">
                comidas
              </div>
            </div>
            <div className="rounded-[18px] bg-[#E7DCF6] p-5 text-center">
              <svg
                aria-hidden="true"
                className="mx-auto mb-2 h-[26px] w-[26px] text-[#7B5FC0]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
              </svg>
              <div className="font-display text-[26px] font-semibold text-[#7B5FC0]">
                {formatSleep(summary.sleepMinutes)}
              </div>
              <div className="text-[13px] font-semibold text-[#7B5FC0]">
                de siesta
              </div>
            </div>
            <div className="rounded-[18px] bg-[#C7E7F1] p-5 text-center">
              <svg
                aria-hidden="true"
                className="mx-auto mb-2 h-[26px] w-[26px] text-[#2E89A6]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.1 1-5.8-4.3-4.1 5.9-.9z" />
              </svg>
              <div className="font-display text-[26px] font-semibold text-[#2E89A6]">
                {summary.activitiesCount}
              </div>
              <div className="text-[13px] font-semibold text-[#2E89A6]">
                momentos
              </div>
            </div>
          </div>

          <div className="mb-6 flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-[18px] py-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F9D2DE]">
              <svg
                aria-hidden="true"
                className="h-6 w-6 text-[#C56486]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
              </svg>
            </div>
            <div>
              <div className="text-[13px] text-muted">Ánimo del día</div>
              <div className="font-display text-lg font-semibold text-ink">
                {summary.mood ?? "Sin registrar"}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mb-6 rounded-[22px] border border-dashed border-divider bg-surface px-6 py-14 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            Mañana habrá mucho más que ver ✨
          </p>
          <p className="mt-2 text-[14px] text-muted-strong">
            La maestra todavía no ha contado cómo ha ido el día. En cuanto lo
            haga, aparecerá aquí.
          </p>
        </div>
      )}

      <p className="mb-3.5 text-[12.5px] font-extrabold tracking-[0.8px] text-divider-ink">
        LO MÁS LINDO DE HOY
      </p>
      {highlights.length > 0 ? (
        <div className="flex flex-col gap-[18px]">
          {highlights.map((post) => {
            const palette = HIGHLIGHT_KINDS[post.kind] ?? {
              label: post.kind,
              bg: "#C7E7F1",
              fg: "#2E89A6",
            };
            const { title, rest } = summarizeBody(post.body);
            return (
              <div key={post.id} className="flex items-start gap-3.5">
                <div
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: palette.bg }}
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: palette.fg }}
                  />
                </div>
                <div className="min-w-0">
                  <div
                    className="font-display text-base font-semibold"
                    style={{ color: palette.fg }}
                  >
                    {title}
                  </div>
                  <div className="mt-0.5 text-sm text-muted-strong">
                    {post.time}
                    {rest ? ` · ${rest}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-strong">
          Todavía no hay momentos destacados del día.
        </p>
      )}
    </div>
  );
}
