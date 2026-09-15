import { Killzone } from "../types/strategy.js";

/** true si la fecha (UTC) cae en fin de semana (sabado o domingo, hora UTC). */
export function isWeekendUTC(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function minutesSinceMidnightUTC(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Devuelve el nombre de la killzone activa en `date`, o null si ninguna aplica. */
export function activeKillzone(killzones: Killzone[], date: Date): string | null {
  if (killzones.length === 0) return null;
  const nowMin = minutesSinceMidnightUTC(date);
  for (const kz of killzones) {
    const start = parseHHMM(kz.startUTC);
    const end = parseHHMM(kz.endUTC);
    const inWindow = start <= end ? nowMin >= start && nowMin <= end : nowMin >= start || nowMin <= end; // soporta rangos que cruzan medianoche
    if (inWindow) return kz.name;
  }
  return null;
}
