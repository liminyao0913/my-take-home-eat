import { Temporal } from "@js-temporal/polyfill";

export function toInstant(date: string, time: string, timeZone: string): number {
  const day = Temporal.PlainDate.from(date, { overflow: "reject" });
  const clock = Temporal.PlainTime.from(time, { overflow: "reject" });
  return Temporal.ZonedDateTime.from({
    timeZone, year: day.year, month: day.month, day: day.day,
    hour: clock.hour, minute: clock.minute,
  }, { disambiguation: "reject", overflow: "reject" }).epochMilliseconds;
}

export function minuteOfDay(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minuteToTime(minute: number | null): string | null {
  if (minute === null) return null;
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function localMinute(instant: number, timeZone: string): number {
  const time = Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(timeZone);
  return time.hour * 60 + time.minute;
}
