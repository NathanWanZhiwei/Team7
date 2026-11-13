const singaporeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function getSingaporeNow(): Date {
  return new Date();
}

export function formatSingaporeDateTime(value: Date): string {
  const parts = Object.fromEntries(
    singaporeFormatter.formatToParts(value).map(({ type, value: part }) => [type, part]),
  );
  const milliseconds = String(value.getUTCMilliseconds()).padStart(3, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}+08:00`;
}
