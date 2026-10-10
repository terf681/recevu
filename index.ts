import { authUser, cors, json, notify, sb } from "../_shared/util.ts";
import { validate } from "../_shared/schema.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method", message: "Метод не поддерживается." }, 405);
  try {
    const u = await authUser(req);
    if (!u) return json({ error: "unauthorized", message: "Требуется вход через Discord." }, 401);
    const body = await req.json().catch(() => ({}));

    const { data: st, error: se } = await sb.from("settings").select("*").eq("id", 1).single();
    if (se || !st) return json({ error: "server", message: "Не удалось загрузить настройки." }, 500);

    const { data: lock } = await sb.from("submission_locks").select("locked_until").eq("discord_id", u.discord_id).maybeSingle();
    const lockedUntil = lock && new Date(lock.locked_until) > new Date() ? lock.locked_until : null;

    if (body.action === "status") {
      return json({ open: st.recruitment_open, closed_message: st.closed_message, locked_until: lockedUntil, discord: { id: u.discord_id, name: u.name } });
    }
    if (body.action !== "submit") return json({ error: "bad_request", message: "Неизвестное действие." }, 400);

    if (!st.recruitment_open) return json({ error: "closed", message: st.closed_message }, 403);
    const { errors, clean } = validate(body.answers, st.min_age, u.name);
    if (Object.keys(errors).length) return json({ error: "validation", message: "Проверьте поля анкеты.", errors }, 422);

    // Атомарное занятие слота: защита от гонок и повторной подачи в течение 14 дней (по Discord ID).
    const { data: until, error: le } = await sb.rpc("try_lock", { p_discord: u.discord_id, p_days: 14 });
    if (le) throw le;
    if (!until) return json({ error: "locked", message: "Повторная подача пока недоступна.", locked_until: lockedUntil }, 429);

    const { data: app, error: ie } = await sb.from("applications").insert({
      discord_id: u.discord_id, discord_name: u.name, roblox: clean.q1, answers: clean, source: "web",
    }).select("id").single();
    if (ie || !app) {
      await sb.rpc("release_lock", { p_discord: u.discord_id }); // не блокируем кандидата из-за нашей ошибки
      await sb.from("admin_log").insert({ action: "notify_error", admin_name: "system", details: { stage: "submit", error: ie?.message ?? "insert failed", discord_id: u.discord_id } });
      await notify("error", { title: "Ошибка обработки заявки", description: ie?.message ?? "insert failed", fields: [{ name: "Discord ID", value: u.discord_id }] });
      return json({ error: "server", message: "Не удалось сохранить заявку. Попробуйте ещё раз." }, 500);
    }
    await sb.from("submission_locks").update({ last_application: app.id }).eq("discord_id", u.discord_id);
    await sb.from("admin_log").insert({ action: "submit", application_id: app.id, admin_name: "candidate", admin_discord_id: u.discord_id, details: {} });
    await notify("new", { title: "Новая заявка в EVU", fields: [{ name: "Roblox", value: clean.q1 }, { name: "Discord", value: u.name }, { name: "ID заявки", value: app.id.slice(0, 8) }] }, app.id);
    return json({ ok: true, id: app.id, locked_until: until });
  } catch (e) {
    console.error(e);
    return json({ error: "server", message: "Внутренняя ошибка сервера." }, 500);
  }
});
