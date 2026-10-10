import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export type AuthUser = { id: string; discord_id: string; name: string };

/** Проверяет JWT и достаёт ПОДТВЕРЖДЁННЫЙ Discord ID из OAuth-идентичности (а не из никнейма). */
export async function authUser(req: Request): Promise<AuthUser | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  const u = data.user, m = u.user_metadata ?? {};
  const idn = (u.identities ?? []).find((i) => i.provider === "discord");
  const discord_id = String(idn?.identity_data?.provider_id ?? idn?.identity_data?.sub ?? m.provider_id ?? "");
  if (!/^\d{5,25}$/.test(discord_id)) return null;
  const name = String(m.custom_claims?.global_name ?? m.full_name ?? m.name ?? m.user_name ?? "Discord user").slice(0, 80);
  return { id: u.id, discord_id, name };
}

const API = "https://discord.com/api/v10";
const env = (k: string) => Deno.env.get(k) ?? "";

export async function notify(kind: "new" | "accepted" | "rejected" | "toggle" | "error", embed: { title: string; fields?: { name: string; value: string }[]; description?: string }, appId?: string) {
  try {
    const url = env("DISCORD_WEBHOOK_URL");
    if (!url) return;
    const { data: s } = await sb.from("settings").select("*").eq("id", 1).single();
    if (!s || s["notify_" + kind] === false) return;
    const admin = env("ADMIN_URL");
    const body = {
      username: "EVU Recruitment",
      allowed_mentions: { parse: [] },
      embeds: [{
        title: embed.title.slice(0, 250), description: embed.description?.slice(0, 1000),
        color: 0xE6E6E6, timestamp: new Date().toISOString(),
        fields: (embed.fields ?? []).map((f) => ({ name: f.name.slice(0, 250), value: (f.value || "—").slice(0, 1000), inline: true })),
        footer: { text: "EVU // RECRUITMENT" },
        ...(admin ? { url: appId ? `${admin}#apps` : admin } : {}),
      }],
    };
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) { console.error("notify failed", e); }
}

export type RoleResult = { ok: boolean; error?: string };

/** Находит участника по Discord ID и выдаёт настроенную роль. Токен бота — только в секретах функции. */
export async function grantRole(discordId: string): Promise<RoleResult> {
  const T = env("DISCORD_BOT_TOKEN"), G = env("DISCORD_GUILD_ID"), R = env("DISCORD_ROLE_ID");
  if (!T || !G || !R) return { ok: false, error: "Discord-интеграция не настроена (секреты функции)." };
  const h = { Authorization: `Bot ${T}` };
  try {
    const m = await fetch(`${API}/guilds/${G}/members/${discordId}`, { headers: h });
    if (m.status === 404) return { ok: false, error: "Пользователь не найден на сервере Discord (он должен находиться на сервере)." };
    if (!m.ok) return { ok: false, error: `Не удалось проверить участника (HTTP ${m.status}).` };
    const r = await fetch(`${API}/guilds/${G}/members/${discordId}/roles/${R}`, { method: "PUT", headers: { ...h, "X-Audit-Log-Reason": "EVU recruitment: application accepted" } });
    if (r.status === 204) return { ok: true };
    if (r.status === 403) return { ok: false, error: "Нет прав: у бота должно быть право Manage Roles, а его роль — выше выдаваемой." };
    if (r.status === 429) return { ok: false, error: "Discord ограничил запросы. Повторите чуть позже." };
    return { ok: false, error: `Discord вернул HTTP ${r.status}.` };
  } catch (_e) { return { ok: false, error: "Нет соединения с Discord API." }; }
}

export async function checkIntegrations() {
  const T = env("DISCORD_BOT_TOKEN"), G = env("DISCORD_GUILD_ID"), R = env("DISCORD_ROLE_ID"), W = env("DISCORD_WEBHOOK_URL");
  const out: { name: string; ok: boolean; detail: string }[] = [];
  const { error } = await sb.from("settings").select("id").eq("id", 1).single();
  out.push({ name: "База данных", ok: !error, detail: error ? error.message : "Соединение установлено" });
  if (!T || !G || !R) { out.push({ name: "Discord-бот", ok: false, detail: "Не заданы DISCORD_BOT_TOKEN / DISCORD_GUILD_ID / DISCORD_ROLE_ID" }); }
  else {
    const h = { Authorization: `Bot ${T}` };
    try {
      const me = await fetch(`${API}/users/@me`, { headers: h });
      if (!me.ok) out.push({ name: "Discord-бот", ok: false, detail: `Токен отклонён (HTTP ${me.status})` });
      else {
        const bot = await me.json();
        out.push({ name: "Discord-бот", ok: true, detail: `Авторизован как ${bot.username}` });
        const [roles, bm] = await Promise.all([fetch(`${API}/guilds/${G}/roles`, { headers: h }), fetch(`${API}/guilds/${G}/members/${bot.id}`, { headers: h })]);
        if (!roles.ok || !bm.ok) out.push({ name: "Роль EVU и иерархия", ok: false, detail: "Бот не состоит на сервере или нет доступа к ролям" });
        else {
          const rl = await roles.json() as { id: string; position: number; name: string }[], mem = await bm.json() as { roles: string[] };
          const target = rl.find((r) => r.id === R), top = Math.max(0, ...rl.filter((r) => mem.roles.includes(r.id)).map((r) => r.position));
          if (!target) out.push({ name: "Роль EVU и иерархия", ok: false, detail: "Роль с указанным DISCORD_ROLE_ID не найдена" });
          else out.push({ name: "Роль EVU и иерархия", ok: top > target.position, detail: top > target.position ? `Роль «${target.name}» ниже роли бота: выдача возможна` : `Роль бота должна стоять ВЫШЕ роли «${target.name}»` });
        }
      }
    } catch (_e) { out.push({ name: "Discord-бот", ok: false, detail: "Нет соединения с Discord API" }); }
  }
  if (!W) out.push({ name: "Webhook уведомлений", ok: false, detail: "DISCORD_WEBHOOK_URL не задан" });
  else { try { const r = await fetch(W); out.push({ name: "Webhook уведомлений", ok: r.ok, detail: r.ok ? "Webhook доступен" : `HTTP ${r.status}` }); } catch (_e) { out.push({ name: "Webhook уведомлений", ok: false, detail: "Нет соединения" }); } }
  return out;
}
