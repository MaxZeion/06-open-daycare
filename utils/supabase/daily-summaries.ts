import { cookies } from "next/headers";
import { createClient } from "./server";
import type { CurrentUser } from "./types";

export interface DailySummaryChild {
  id: string;
  fullName: string;
  roomName: string | null;
}

export interface DailySummary {
  id: string;
  childId: string;
  date: string;
  mealsCount: number;
  sleepMinutes: number;
  activitiesCount: number;
  mood: string | null;
  highlight: string | null;
  child: DailySummaryChild | null;
}

interface SummaryChildRow {
  id: string;
  full_name: string;
  room: { name: string } | null;
}

interface SummaryRow {
  id: string;
  child_id: string;
  date: string;
  meals_count: number;
  sleep_minutes: number;
  activities_count: number;
  mood: string | null;
  highlight: string | null;
  children: SummaryChildRow | SummaryChildRow[] | null;
}

function firstRow<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toDailySummary(row: SummaryRow): DailySummary {
  const child = firstRow(row.children);
  return {
    id: row.id,
    childId: row.child_id,
    date: row.date,
    mealsCount: row.meals_count,
    sleepMinutes: row.sleep_minutes,
    activitiesCount: row.activities_count,
    mood: row.mood,
    highlight: row.highlight,
    child: child
      ? {
          id: child.id,
          fullName: child.full_name,
          roomName: child.room?.name ?? null,
        }
      : null,
  };
}

const SUMMARY_CHILD_JOIN = `
  id, child_id, date, meals_count, sleep_minutes, activities_count,
  mood, highlight,
  children:child_id ( id, full_name, room:room_id ( name ) )
`;

export function todayEuropeMadrid(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function listParentChildren(
  currentUser: CurrentUser,
): Promise<DailySummaryChild[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("parent_children")
    .select(
      `child_id, children:child_id ( id, full_name, room:room_id ( name ) )`,
    )
    .eq("parent_id", currentUser.userId)
    .returns<
      Array<{ child_id: string; children: SummaryChildRow | SummaryChildRow[] | null }>
    >();

  if (error) {
    throw error;
  }
  if (!data) return [];

  return data
    .map((row) => firstRow(row.children))
    .filter((child): child is SummaryChildRow => child !== null)
    .map((child) => ({
      id: child.id,
      fullName: child.full_name,
      roomName: child.room?.name ?? null,
    }));
}

export async function listDailySummariesForParent(
  currentUser: CurrentUser,
  date: string,
): Promise<DailySummary[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: linkRows, error: linkError } = await supabase
    .from("parent_children")
    .select("child_id")
    .eq("parent_id", currentUser.userId)
    .returns<Array<{ child_id: string }>>();

  if (linkError) {
    throw linkError;
  }
  const childIds = (linkRows ?? []).map((row) => row.child_id);
  if (childIds.length === 0) return [];

  const { data, error } = await supabase
    .from("daily_summaries")
    .select(SUMMARY_CHILD_JOIN)
    .in("child_id", childIds)
    .eq("date", date)
    .returns<SummaryRow[]>();

  if (error) {
    throw error;
  }
  if (!data) return [];

  return data.map(toDailySummary);
}
