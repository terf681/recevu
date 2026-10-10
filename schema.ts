// Серверная копия схемы анкеты. Должна совпадать с core.js.
export const TZ: string[] = [];
for (let h = -12; h <= 14; h++) TZ.push("UTC" + (h < 0 ? "-" : "+") + Math.abs(h));

type Q = { id: string; t: "text" | "number" | "tz" | "area" | "discord"; req: number; min?: number; max?: number };
export const QUESTIONS: Q[] = [
  { id: "q1", t: "text", req: 1, min: 3, max: 40 }, { id: "q2", t: "discord", req: 1 },
  { id: "q3", t: "number", req: 1, min: 1, max: 99 }, { id: "q4", t: "tz", req: 1 },
  { id: "q5", t: "area", req: 1, min: 20, max: 1500 }, { id: "q6", t: "area", req: 1, min: 20, max: 1000 },
  { id: "q7", t: "area", req: 1, min: 20, max: 1500 }, { id: "q8", t: "area", req: 1, min: 40, max: 1500 },
  { id: "q9", t: "area", req: 1, min: 40, max: 1500 }, { id: "q10", t: "area", req: 1, min: 2, max: 1500 },
  { id: "q11", t: "area", req: 1, min: 20, max: 1200 }, { id: "q12", t: "area", req: 1, min: 30, max: 1200 },
  { id: "q13", t: "area", req: 1, min: 30, max: 1200 }, { id: "q14", t: "area", req: 1, min: 30, max: 1200 },
  { id: "q15", t: "area", req: 1, min: 30, max: 1200 }, { id: "q16", t: "text", req: 1, min: 2, max: 60 },
  { id: "q17", t: "area", req: 1, min: 60, max: 2500 }, { id: "q18", t: "area", req: 1, min: 30, max: 1500 },
  { id: "q19", t: "area", req: 1, min: 30, max: 1500 }, { id: "q20", t: "area", req: 0, min: 0, max: 1500 },
];

/** Возвращает { errors, clean }. clean содержит только известные ключи, обрезанные строки. */
export function validate(input: unknown, minAge: number, discordName: string) {
  const a = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {}, clean: Record<string, string> = {};
  for (const q of QUESTIONS) {
    if (q.t === "discord") { clean[q.id] = discordName; continue; }
    const raw = a[q.id];
    const v = (typeof raw === "string" || typeof raw === "number" ? String(raw) : "").trim();
    clean[q.id] = v;
    if (!v) { if (q.req) errors[q.id] = "Обязательное поле."; continue; }
    if (q.t === "number") {
      const n = Number(v);
      if (!/^\d{1,2}$/.test(v) || n < 1 || n > 99) errors[q.id] = "Укажите возраст числом от 1 до 99.";
      else if (minAge && n < minAge) errors[q.id] = `Минимальный возраст для подачи: ${minAge}.`;
    } else if (q.t === "tz") {
      if (!TZ.includes(v)) errors[q.id] = "Выберите часовой пояс из списка.";
    } else {
      if (v.length < (q.min ?? 0)) errors[q.id] = `Слишком коротко: минимум ${q.min} симв.`;
      else if (v.length > (q.max ?? 2000)) errors[q.id] = `Слишком длинно: максимум ${q.max} симв.`;
    }
  }
  return { errors, clean };
}
