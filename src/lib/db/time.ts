export const OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPERATIONAL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getBusinessDate(date: Date = new Date()): string {
  return businessDateFormatter.format(date);
}

export function nowIso(): string {
  return new Date().toISOString();
}
