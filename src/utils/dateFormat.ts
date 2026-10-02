const DATE_LOCALE = "en-GB";

type DateValue = Date | string | number;

const asDate = (value: DateValue) =>
  value instanceof Date ? value : new Date(value);

export const formatDate = (value: DateValue, fallback = "—") => {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

export const formatTime = (
  value: DateValue,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "—",
) => {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);
};

export const formatDateTime = (
  value: DateValue,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "—",
) => {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);
};

export const isoDateToDisplay = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

export const displayDateToIso = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const timestamp = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === iso
    ? iso
    : null;
};
