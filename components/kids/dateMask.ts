const SPANISH_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4);

  if (digits.length <= 4) {
    return `${day}/${month}`;
  }

  return `${day}/${month}/${year}`;
}

export function parseSpanishDate(value: string): Date | null {
  const match = SPANISH_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);

  const exists =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!exists) {
    return null;
  }

  if (date.getTime() > Date.now()) {
    return null;
  }

  return date;
}

export function ageFromBirthDate(birthDate: Date): number {
  const now = new Date();

  let age = now.getFullYear() - birthDate.getFullYear();

  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() &&
      now.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return Math.max(0, age);
}
