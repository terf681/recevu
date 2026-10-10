/* EVU Recruitment — общее ядро: анкета, UI, API (демо + Supabase) */
(function () {
"use strict";
var C = window.EVU_CONFIG || {};
var LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
var $ = function (s, c) { return (c || document).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
var E = function (code, message, status) { var e = new Error(message || code); e.code = code; e.status = status || 0; return e; };
var uid = function () { return (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2)); };

/* ---------- анкета ---------- */
var TZ = []; for (var h = -12; h <= 14; h++) TZ.push("UTC" + (h < 0 ? "-" : "+") + Math.abs(h));
var STEPS = [
  { t: "Идентификация", d: "Основные данные кандидата" },
  { t: "Опыт", d: "Игровой и ролевой опыт" },
  { t: "Мотивация", d: "Причины и цели вступления" },
  { t: "Дисциплина", d: "Поведение и командная работа" },
  { t: "Персонаж", d: "Образ вашего персонажа" },
  { t: "Завершение", d: "Дополнительные сведения и отправка" }
];
var Q = [
  { id: "q1", s: 0, t: "text", l: "Никнейм в Roblox", req: 1, min: 3, max: 40, ph: "Ваш ник в Roblox" },
  { id: "q2", s: 0, t: "discord", l: "Имя пользователя в Discord", req: 1 },
  { id: "q3", s: 0, t: "number", l: "Возраст", req: 1, min: 1, max: 99, ph: "Полных лет" },
  { id: "q4", s: 0, t: "tz", l: "Часовой пояс", req: 1 },
  { id: "q5", s: 1, t: "area", l: "Опыт игры в Roblox", req: 1, min: 20, max: 1500, h: "Как давно вы играете и в каких проектах." },
  { id: "q6", s: 1, t: "area", l: "Активность и количество свободного времени", req: 1, min: 20, max: 1000, h: "В какие дни и часы вы можете быть в игре." },
  { id: "q7", s: 1, t: "area", l: "Опыт RolePlay", req: 1, min: 20, max: 1500, h: "Где и как долго вы играли в ролевых проектах." },
  { id: "q10", s: 1, t: "area", l: "Опыт пребывания в других фракциях и организациях", req: 1, min: 2, max: 1500, h: "Если опыта нет, так и напишите." },
  { id: "q8", s: 2, t: "area", l: "Почему вы хотите вступить в EVU?", req: 1, min: 40, max: 1500 },
  { id: "q9", s: 2, t: "area", l: "Почему организация должна выбрать именно вас?", req: 1, min: 40, max: 1500 },
  { id: "q11", s: 2, t: "area", l: "Ваши цели в EVU", req: 1, min: 20, max: 1200 },
  { id: "q12", s: 3, t: "area", l: "Ваше отношение к дисциплине", req: 1, min: 30, max: 1200 },
  { id: "q13", s: 3, t: "area", l: "Что вы сделаете при конфликте с другим участником?", req: 1, min: 30, max: 1200 },
  { id: "q14", s: 3, t: "area", l: "Что вы сделаете, если не согласны с приказом?", req: 1, min: 30, max: 1200 },
  { id: "q15", s: 3, t: "area", l: "Ваши навыки командной работы", req: 1, min: 30, max: 1200 },
  { id: "q16", s: 4, t: "text", l: "Имя или позывной персонажа", req: 1, min: 2, max: 60, ph: "Имя или позывной" },
  { id: "q17", s: 4, t: "area", l: "Биография персонажа", req: 1, min: 60, max: 2500 },
  { id: "q18", s: 4, t: "area", l: "Характер персонажа", req: 1, min: 30, max: 1500 },
  { id: "q19", s: 4, t: "area", l: "Сильные стороны и недостатки", req: 1, min: 30, max: 1500 },
  { id: "q20", s: 5, t: "area", l: "Дополнительная информация", req: 0, min: 0, max: 1500, h: "Необязательно." }
];
var QN = function (q) { return +q.id.slice(1); };
var QSORT = Q.slice().sort(function (a, b) { return QN(a) - QN(b); });
var ST = { new: "Новая", review: "На рассмотрении", accepted: "Принята", rejected: "Отклонена", info: "Нужна информация" };
var DEFAULTS = {
  recruitment_open: false,
  closed_message: "Набор в EVU временно закрыт. Подача заявок недоступна.",
  success_message: "Ваша заявка принята и передана на рассмотрение. Ожидайте решения администрации.",
  rules_text: "Требования к кандидатам определяются руководством EVU.\nЗаявка заполняется полностью и честно.\nДля подачи нужен аккаунт Discord.\nПовторная подача возможна через 14 дней после отправки.",
  min_age: 0,
  notify_new: true, notify_accepted: true, notify_rejected: true, notify_toggle: true, notify_error: true
};

function validate(a, minAge) {
  var er = {}; a = a || {};
  Q.forEach(function (q) {
    if (q.t === "discord") return;
    var v = String(a[q.id] == null ? "" : a[q.id]).trim();
    if (!v) { if (q.req) er[q.id] = "Обязательное поле."; return; }
    if (q.t === "number") {
      var n = Number(v);
      if (!/^\d{1,2}$/.test(v) || n < q.min || n > q.max) er[q.id] = "Укажите возраст числом от 1 до 99.";
      else if (minAge && n < minAge) er[q.id] = "Минимальный возраст для подачи: " + minAge + ".";
    } else if (q.t === "tz") { if (TZ.indexOf(v) < 0) er[q.id] = "Выберите часовой пояс из списка."; }
    else {
      if (v.length < q.min) er[q.id] = "Слишком коротко: минимум " + q.min + " симв. (сейчас " + v.length + ").";
      else if (v.length > q.max) er[q.id] = "Слишком длинно: максимум " + q.max + " симв.";
    }
  });
  return er;
}

/* ---------- UI ---------- */
var tbox;
function toast(msg, err) {
  if (!tbox) { tbox = document.createElement("div"); tbox.className = "toasts"; tbox.setAttribute("role", "status"); tbox.setAttribute("aria-live", "polite"); document.body.appendChild(tbox); }
  var t = document.createElement("div"); t.className = "tst" + (err ? " er" : ""); t.textContent = msg; tbox.appendChild(t);
  setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 400); }, err ? 5200 : 3000);
}
function modal(o) {
  return new Promise(function (res) {
    var prev = document.activeElement, ov = document.createElement("div");
    ov.className = "ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.innerHTML = '<div class="mod' + (o.wide ? " wide" : "") + '"><div class="mh"><h3>' + esc(o.title) + '</h3>' + (o.closable === false ? "" : '<button class="x" type="button" aria-label="Закрыть">✕</button>') + '</div><div class="mb">' + (o.html || "") + '</div><div class="acts"></div></div>';
    var acts = $(".acts", ov), done = false;
    function close(v) {
      if (done) return; done = true; document.removeEventListener("keydown", key, true);
      ov.classList.remove("show");
      setTimeout(function () { ov.remove(); if (!$(".ov")) document.body.classList.remove("lock"); if (prev && prev.focus) try { prev.focus(); } catch (e) {} }, reduce ? 0 : 320);
      res(v);
    }
    function key(e) {
      if (e.key === "Escape" && o.closable !== false) { e.stopPropagation(); close(null); }
      if (e.key === "Tab") {
        var f = $$("button,input,select,textarea,a[href]", ov).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return; var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    }
    (o.buttons || []).forEach(function (b) {
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "btn sm " + (b.cls || "dim"); btn.textContent = b.label;
      btn.addEventListener("click", function () {
        if (b.onClick) { var r = b.onClick(ov, close); if (r === false) return; if (r !== undefined && r !== true) { close(r); return; } }
        close(b.value);
      });
      acts.appendChild(btn);
    });
    if (!acts.children.length) acts.remove();
    var x = $(".x", ov); if (x) x.addEventListener("click", function () { close(null); });
    ov.addEventListener("mousedown", function (e) { if (e.target === ov && o.closable !== false) close(null); });
    document.addEventListener("keydown", key, true);
    document.body.appendChild(ov); document.body.classList.add("lock");
    requestAnimationFrame(function () { ov.classList.add("show"); var f = $("input,select,textarea", ov) || $(".acts .btn", ov) || $(".x", ov); if (f) f.focus(); });
    if (o.onOpen) o.onOpen(ov, close);
  });
}
function confirmBox(title, text, ok, danger) {
  return modal({ title: title, html: "<p>" + esc(text) + "</p>", buttons: [{ label: "Отмена", value: false }, { label: ok || "Подтвердить", cls: "solid", value: true }] }).then(function (v) { return !!v; });
}
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
  return new Promise(function (ok, no) { var a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select(); try { document.execCommand("copy") ? ok() : no(); } catch (e) { no(e); } a.remove(); });
}
function fmtDate(i) { try { return new Date(i).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return i || ""; } }
function fmtLeft(ms) {
  if (ms < 0) ms = 0; var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), q = s % 60, p = function (n) { return String(n).padStart(2, "0"); };
  return d + " д " + p(h) + ":" + p(m) + ":" + p(q);
}

/* публичные эффекты */
function fx() {
  var nav = $(".nav"), bar = $("#prog i"), links = $$(".menu a[href^='#']"), ids = links.map(function (a) { return $(a.getAttribute("href")); }).filter(Boolean), tick = false;
  function on() {
    var max = document.documentElement.scrollHeight - innerHeight, y = scrollY;
    if (bar) bar.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";
    if (nav) nav.classList.toggle("sc", y > 30);
    var cur = -1; ids.forEach(function (s, i) { if (s.getBoundingClientRect().top < innerHeight * .35) cur = i; });
    links.forEach(function (a, i) { a.classList.toggle("on", i === cur); });
    tick = false;
  }
  addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(on); } }, { passive: true }); addEventListener("resize", on); on();
  var bg = $("#burger"), mn = $("#menu");
  if (bg && mn) {
    var shut = function () { mn.classList.remove("open"); bg.setAttribute("aria-expanded", "false"); };
    bg.addEventListener("click", function () { var o = mn.classList.toggle("open"); bg.setAttribute("aria-expanded", String(o)); });
    $$("a", mn).forEach(function (a) { a.addEventListener("click", shut); });
    addEventListener("resize", function () { if (innerWidth > 1020) shut(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") shut(); });
  }
  $$(".type").forEach(function (el) {
    var t = el.textContent, i = 0; el.setAttribute("aria-label", t); el.innerHTML = "";
    t.split("").forEach(function (ch) { var s = document.createElement("span"); s.className = "c"; s.setAttribute("aria-hidden", "true"); s.textContent = ch === " " ? "\u00a0" : ch; s.style.transitionDelay = (i++ * 28) + "ms"; el.appendChild(s); });
  });
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (!e.isIntersecting) return; e.target.classList.add("in"); io.unobserve(e.target); $$("[data-count]", e.target).forEach(count); if (e.target.hasAttribute("data-count")) count(e.target); });
  }, { threshold: .15 }) : null;
  $$(".rv,.type").forEach(function (el) { io ? io.observe(el) : el.classList.add("in"); });
  $$(".card").forEach(function (c) { c.addEventListener("pointermove", function (e) { var r = c.getBoundingClientRect(); c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px"); }); });
  var tx = $(".tx"); if (tx && !reduce) setInterval(function () { tx.classList.add("gl"); setTimeout(function () { tx.classList.remove("gl"); }, 160); }, 6000);
}
function count(el) {
  var t = +el.dataset.count, s = performance.now(); if (isNaN(t)) return;
  if (reduce) { el.textContent = t; return; }
  (function f(n) { var k = Math.min(1, (n - s) / 1200); el.textContent = Math.round(t * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); })(s);
}

/* ---------- оценка анкеты (помощник, не вердикт) ---------- */
var TPL = [/хочу\s+развиваться/i, /ищу\s+(свою\s+)?команду/i, /лучш(ая|ей)\s+(фракци|организаци)/i, /ваша\s+организаци\w+\s+(лучш|самая)/i, /^\s*(да|нет|\+|-|\.+|ок|не знаю)\s*$/i, /я\s+не\s+знаю,?\s+что\s+(написать|сказать)/i, /как\s+(языковая\s+модель|искусственный\s+интеллект)/i, /^\s*(.{1,3})\s*$/];
function words(t) { return String(t).toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, " ").split(/\s+/).filter(function (w) { return w.length > 2; }); }
function score(a) {
  a = a || {};
  var req = Q.filter(function (q) { return q.req && q.t !== "discord"; }), filled = 0, fl = [], good = 0;
  req.forEach(function (q) { if (String(a[q.id] || "").trim()) filled++; });
  var areas = Q.filter(function (q) { return q.t === "area" && q.req; });
  areas.forEach(function (q) {
    var t = String(a[q.id] || "").trim(); if (!t) return;
    var w = t.split(/\s+/).filter(Boolean).length, bad = false;
    if (t.length < Math.max(q.min + 15, 30) && q.min > 5) { fl.push("Слишком короткий ответ: «" + q.l + "» (" + t.length + " симв.)."); bad = true; }
    if (TPL.some(function (r) { return r.test(t); })) { fl.push("Шаблонная или пустая формулировка: «" + q.l + "»."); bad = true; }
    var u = new Set(words(t)).size, tw = words(t).length; if (tw >= 12 && u / tw < .5) { fl.push("Много повторов слов: «" + q.l + "»."); bad = true; }
    if (/(.)\1{5,}/.test(t)) { fl.push("Повторяющиеся символы: «" + q.l + "»."); bad = true; }
    if (!bad && w >= 5) good++;
  });
  for (var i = 0; i < areas.length; i++) for (var j = i + 1; j < areas.length; j++) {
    var x = new Set(words(a[areas[i].id] || "")), y = new Set(words(a[areas[j].id] || ""));
    if (x.size < 6 || y.size < 6) continue; var inter = 0; x.forEach(function (w) { if (y.has(w)) inter++; });
    if (inter / (x.size + y.size - inter) > .7) fl.push("Ответы почти совпадают: «" + areas[i].l + "» и «" + areas[j].l + "».");
  }
  var age = Number(a.q3); if (a.q3 && (isNaN(age) || age < 5 || age > 80)) fl.push("Возраст выглядит нереалистичным: " + a.q3 + ".");
  if (a.q1 && a.q16 && String(a.q1).toLowerCase() === String(a.q16).toLowerCase()) fl.push("Позывной персонажа совпадает с ником Roblox.");
  if (/24\s*\/\s*7|круглосуточно|всегда\s+онлайн/i.test(a.q6 || "")) fl.push("Заявлена нереалистичная активность: проверьте ответ об активности.");
  if (a.q1 && /\s/.test(a.q1)) fl.push("В нике Roblox есть пробелы: возможна ошибка ввода.");
  return { comp: req.length ? Math.round(filled / req.length * 100) : 0, content: areas.length ? Math.round(good / areas.length * 100) : 0, flags: fl };
}

/* ---------- API: демо-режим ---------- */
var DK = "evu_rc_demo_v1";
function ddb() {
  var d = null; try { d = JSON.parse(localStorage.getItem(DK) || "null"); } catch (e) {}
  if (!d) { d = { settings: Object.assign({}, DEFAULTS, { recruitment_open: true }), apps: [], logs: [], locks: {} }; seed(d); dsave(d); }
  return d;
}
function dsave(d) { localStorage.setItem(DK, JSON.stringify(d)); }
function seed(d) {
  var good = "Играю в Roblox несколько лет, участвовал в ролевых проектах и привык работать по правилам и по приказам старших. Могу быть онлайн по вечерам в будни и почти весь день в выходные.";
  var names = [["Nord_Vector", "kira.9", "Kira", "new"], ["Sable_Unit", "mrk0", "Marek", "review"], ["Arden77", "arden", "Arden", "info"], ["QuietLine", "ql_ghost", "Quiet", "accepted"], ["x_Ronin_x", "ronin2", "Ronin", "rejected"], ["Halcyon_R", "halcyon", "Halcyon", "new"]];
  names.forEach(function (n, i) {
    var a = { q1: n[0], q2: n[1], q3: String(16 + i), q4: "UTC+" + (i + 1) };
    Q.forEach(function (q) { if (q.t === "area" && q.req) a[q.id] = i === 4 ? "хочу вступить, ищу команду" : good + " (" + q.l.toLowerCase() + ")"; });
    a.q16 = n[2]; a.q20 = "";
    d.apps.push({ id: uid(), created_at: new Date(Date.now() - (i + 1) * 3600e3 * 7).toISOString(), discord_id: "10000000000000000" + i, discord_name: n[1], roblox: n[0], answers: a, status: n[3], notes: [], role_status: n[3] === "accepted" ? "granted" : "none", role_error: "", reviewed_by: null, reviewed_at: null, source: "demo-seed" });
  });
}
function dsess(kind) { try { return JSON.parse(sessionStorage.getItem("evu_demo_" + kind) || "null"); } catch (e) { return null; } }
var RANK = { viewer: 1, reviewer: 2, owner: 3 };
var NEED = { me: 1, dashboard: 1, list: 1, get: 1, logs: 1, get_settings: 1, set_status: 2, bulk_status: 2, add_note: 2, retry_role: 2, delete: 3, import: 3, set_settings: 3, test: 3 };
var STV = Object.keys(ST);
function dlog(d, u, appId, action, details) { d.logs.unshift({ id: uid(), created_at: new Date().toISOString(), admin_name: u.name, admin_discord_id: u.discord_id, application_id: appId || null, action: action, details: details || {} }); d.logs = d.logs.slice(0, 500); }
function dRole(a) { a.role_status = "granted"; a.role_error = ""; return { ok: true, demo: true }; }
function dAdmin(act, p) {
  p = p || {}; var d = ddb(), u = dsess("admin");
  if (!u) throw E("unauth", "Требуется вход", 401);
  if ((RANK[u.role] || 0) < (NEED[act] || 9)) throw E("forbidden", "Недостаточно прав для этого действия.", 403);
  var find = function (id) { var a = d.apps.filter(function (x) { return x.id === id; })[0]; if (!a) throw E("not_found", "Заявка не найдена.", 404); return a; };
  function setSt(a, st, note) {
    if (STV.indexOf(st) < 0) throw E("bad_status", "Неизвестный статус.", 400);
    var old = a.status; a.status = st; a.reviewed_by = u.name; a.reviewed_at = new Date().toISOString();
    if (note) a.notes.push({ id: uid(), at: a.reviewed_at, by: u.name, text: note });
    dlog(d, u, a.id, "status", { from: old, to: st, note: note || "" });
    var role = null; if (st === "accepted") { role = dRole(a); dlog(d, u, a.id, "role", { ok: true, demo: true }); }
    return role;
  }
  var out;
  switch (act) {
    case "me": out = { name: u.name, discord_id: u.discord_id, role: u.role }; break;
    case "dashboard": {
      var c = { total: d.apps.length }; STV.forEach(function (s) { c[s] = d.apps.filter(function (a) { return a.status === s; }).length; });
      var series = []; for (var i = 13; i >= 0; i--) { var day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); series.push({ day: day, n: d.apps.filter(function (a) { return a.created_at.slice(0, 10) === day; }).length }); }
      out = { counts: c, series: series, recent: d.apps.slice().sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; }).slice(0, 6), logs: d.logs.slice(0, 8), open: d.settings.recruitment_open }; break;
    }
    case "list": out = { items: d.apps.slice().sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; }) }; break;
    case "get": { var a = find(p.id); out = { app: a, logs: d.logs.filter(function (l) { return l.application_id === a.id; }) }; break; }
    case "set_status": { var a2 = find(p.id), r = setSt(a2, p.status, p.note); dsave(d); out = { app: a2, role: r }; break; }
    case "bulk_status": { var rs = []; (p.ids || []).forEach(function (id) { var a3 = find(id); setSt(a3, p.status, ""); rs.push({ id: id, role_status: a3.role_status }); }); dsave(d); out = { results: rs }; break; }
    case "add_note": { var a4 = find(p.id), t = String(p.text || "").trim(); if (!t) throw E("empty", "Пустая заметка.", 400); a4.notes.push({ id: uid(), at: new Date().toISOString(), by: u.name, text: t.slice(0, 2000) }); dlog(d, u, a4.id, "note", {}); dsave(d); out = { app: a4 }; break; }
    case "retry_role": { var a5 = find(p.id); if (a5.status !== "accepted") throw E("bad_state", "Роль выдаётся только принятым кандидатам.", 400); dRole(a5); dlog(d, u, a5.id, "role_retry", { ok: true, demo: true }); dsave(d); out = { app: a5, role: { ok: true, demo: true } }; break; }
    case "delete": { var ids = p.ids || []; d.apps = d.apps.filter(function (x) { return ids.indexOf(x.id) < 0; }); dlog(d, u, null, "delete", { count: ids.length }); dsave(d); out = { deleted: ids.length }; break; }
    case "import": {
      var n = 0, sk = 0; (p.items || []).forEach(function (it) {
        if (!it || !it.roblox || !it.answers || typeof it.answers !== "object") { sk++; return; }
        d.apps.push({ id: uid(), created_at: it.created_at || new Date().toISOString(), discord_id: String(it.discord_id || ""), discord_name: String(it.discord_name || ""), roblox: String(it.roblox), answers: it.answers, status: STV.indexOf(it.status) >= 0 ? it.status : "new", notes: [], role_status: "none", role_error: "", reviewed_by: null, reviewed_at: null, source: "import" }); n++;
      }); dlog(d, u, null, "import", { imported: n, skipped: sk }); dsave(d); out = { imported: n, skipped: sk }; break;
    }
    case "logs": out = { items: d.logs }; break;
    case "get_settings": out = { settings: d.settings }; break;
    case "set_settings": {
      var s = d.settings, was = s.recruitment_open, k;
      for (k in DEFAULTS) if (p.settings && k in p.settings) s[k] = p.settings[k];
      s.min_age = Math.max(0, Math.min(99, parseInt(s.min_age, 10) || 0));
      dlog(d, u, null, "settings", { open: s.recruitment_open, toggled: was !== s.recruitment_open }); dsave(d); out = { settings: s }; break;
    }
    case "test": out = { checks: [{ name: "База данных", ok: true, detail: "Демо: localStorage браузера" }, { name: "Discord-бот", ok: false, detail: "Демо-режим: реальная проверка недоступна" }, { name: "Роль EVU и иерархия", ok: false, detail: "Демо-режим" }, { name: "Webhook уведомлений", ok: false, detail: "Демо-режим" }] }; break;
    default: throw E("unknown", "Неизвестное действие.", 400);
  }
  return out;
}
function dLoginModal(kind) {
  var isA = kind === "admin";
  return modal({
    title: isA ? "Демо-вход администратора" : "Демо-вход кандидата",
    html: '<p style="margin-bottom:14px">Демо-режим: настоящий Discord OAuth подключается через Supabase (см. README). Введите данные для проверки интерфейса.</p><div class="fld"><label for="dn">Имя в Discord</label><input class="inp" id="dn" value="' + (isA ? "Admin" : "Candidate") + '"></div>' +
      '<div class="fld" style="margin-top:14px"><label for="di">Discord ID</label><input class="inp" id="di" inputmode="numeric" value="' + (isA ? "900000000000000001" : "200000000000000001") + '"></div>' +
      (isA ? '<div class="fld" style="margin-top:14px"><label for="dr">Роль</label><select class="inp" id="dr"><option value="owner">owner — все права</option><option value="reviewer">reviewer — заявки и заметки</option><option value="viewer">viewer — только просмотр</option></select></div>' : ""),
    buttons: [{ label: "Отмена", value: null }, { label: "Войти", cls: "solid", onClick: function (el) {
      var n = $("#dn", el).value.trim(), i = $("#di", el).value.trim();
      if (n.length < 2 || !/^\d{5,25}$/.test(i)) { toast("Введите имя и числовой Discord ID.", true); return false; }
      var s = { name: n, discord_id: i }; if (isA) s.role = $("#dr", el).value;
      sessionStorage.setItem("evu_demo_" + kind, JSON.stringify(s)); return s;
    } }]
  });
}

/* ---------- API: Supabase (боевой режим) ---------- */
var SK = "evu_rc_session";
function loadS() { try { return JSON.parse(localStorage.getItem(SK) || "null"); } catch (e) { return null; } }
function saveS(s) { if (s) localStorage.setItem(SK, JSON.stringify(s)); else localStorage.removeItem(SK); }
function normUser(u) {
  var m = u.user_metadata || {}, idn = (u.identities || []).filter(function (i) { return i.provider === "discord"; })[0];
  return { discord_id: m.provider_id || (idn && idn.identity_data && idn.identity_data.provider_id) || null, name: m.custom_claims && m.custom_claims.global_name || m.full_name || m.name || m.user_name || "Discord user" };
}
function sbFetch(path, o) {
  o = o || {}; var h = { apikey: C.SUPABASE_ANON_KEY, "Content-Type": "application/json", Authorization: "Bearer " + (o.token || C.SUPABASE_ANON_KEY) };
  return fetch(C.SUPABASE_URL + path, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
}
async function parseHash() {
  if (location.hash.indexOf("access_token=") < 0 && location.hash.indexOf("error_description=") < 0) return;
  var p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname + location.search);
  if (p.get("error_description")) { toast("Ошибка входа через Discord: " + p.get("error_description"), true); return; }
  var s = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_at: Date.now() + (+p.get("expires_in") || 3600) * 1000 };
  try { var r = await sbFetch("/auth/v1/user", { token: s.access_token }); if (!r.ok) throw 0; s.user = normUser(await r.json()); saveS(s); }
  catch (e) { toast("Не удалось завершить вход. Повторите попытку.", true); }
}
async function refresh(s) {
  try {
    var r = await sbFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } });
    if (!r.ok) throw 0; var j = await r.json();
    s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: s.user }; saveS(s); return s;
  } catch (e) { saveS(null); throw E("unauth", "Сессия истекла. Войдите снова.", 401); }
}
async function fn(name, body) {
  var s = loadS(); if (!s) throw E("unauth", "Требуется вход через Discord.", 401);
  if (s.expires_at - Date.now() < 60000) s = await refresh(s);
  var r;
  try { r = await fetch(C.SUPABASE_URL + "/functions/v1/" + name, { method: "POST", headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + s.access_token }, body: JSON.stringify(body || {}) }); }
  catch (e) { throw E("network", "Нет соединения с сервером. Проверьте интернет и повторите попытку.", 0); }
  var j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 401) { saveS(null); throw E("unauth", "Сессия истекла. Войдите снова.", 401); }
  if (!r.ok) { var er = E(j && j.error || "server", j && j.message || "Ошибка сервера (" + r.status + ").", r.status); er.data = j; throw er; }
  return j;
}

var api = {
  mode: LIVE ? "live" : "demo",
  init: async function () { if (LIVE) await parseHash(); },
  session: function (kind) { if (LIVE) { var s = loadS(); return s && s.user && s.user.discord_id ? s.user : null; } return dsess(kind || "cand"); },
  login: async function (kind) {
    if (LIVE) { location.href = C.SUPABASE_URL + "/auth/v1/authorize?provider=discord&scopes=identify&redirect_to=" + encodeURIComponent(location.origin + location.pathname); return null; }
    return dLoginModal(kind === "admin" ? "admin" : "cand");
  },
  logout: function (kind) { if (LIVE) saveS(null); else sessionStorage.removeItem("evu_demo_" + (kind || "cand")); },
  settings: async function () {
    if (!LIVE) return Object.assign({}, DEFAULTS, ddb().settings);
    try { var r = await sbFetch("/rest/v1/settings?id=eq.1&select=*"); if (!r.ok) throw 0; var j = await r.json(); return Object.assign({}, DEFAULTS, j[0] || {}); }
    catch (e) { throw E("network", "Не удалось загрузить настройки рекрутинга.", 0); }
  },
  status: async function () {
    if (LIVE) return fn("submit-application", { action: "status" });
    var d = ddb(), u = dsess("cand"), lk = u && d.locks[u.discord_id];
    return { open: d.settings.recruitment_open, closed_message: d.settings.closed_message, locked_until: lk && new Date(lk) > new Date() ? lk : null, discord: u ? { id: u.discord_id, name: u.name } : null };
  },
  submit: async function (a) {
    if (LIVE) return fn("submit-application", { action: "submit", answers: a });
    var d = ddb(), u = dsess("cand"); if (!u) throw E("unauth", "Требуется вход.", 401);
    await new Promise(function (r) { setTimeout(r, 1800); });
    if (!d.settings.recruitment_open) throw Object.assign(E("closed", d.settings.closed_message, 403), { data: { message: d.settings.closed_message } });
    var lk = d.locks[u.discord_id]; if (lk && new Date(lk) > new Date()) throw Object.assign(E("locked", "Повторная подача пока недоступна.", 429), { data: { locked_until: lk } });
    var er = validate(a, d.settings.min_age); if (Object.keys(er).length) throw Object.assign(E("validation", "Проверьте поля анкеты.", 422), { data: { errors: er } });
    var clean = {}; Q.forEach(function (q) { clean[q.id] = String(a[q.id] == null ? "" : a[q.id]).trim(); }); clean.q2 = u.name;
    var until = new Date(Date.now() + 14 * 864e5).toISOString(); d.locks[u.discord_id] = until;
    var app = { id: uid(), created_at: new Date().toISOString(), discord_id: u.discord_id, discord_name: u.name, roblox: clean.q1, answers: clean, status: "new", notes: [], role_status: "none", role_error: "", reviewed_by: null, reviewed_at: null, source: "web" };
    d.apps.push(app); dsave(d); return { ok: true, id: app.id, locked_until: until };
  },
  admin: function (act, p) { return LIVE ? fn("admin", Object.assign({ action: act }, p || {})) : Promise.resolve().then(function () { return dAdmin(act, p); }); }
};

window.EVU = { LIVE: LIVE, $: $, $$: $$, esc: esc, E: E, Q: Q, QSORT: QSORT, QN: QN, STEPS: STEPS, TZ: TZ, ST: ST, DEFAULTS: DEFAULTS, validate: validate, score: score, toast: toast, modal: modal, confirmBox: confirmBox, copyText: copyText, fmtDate: fmtDate, fmtLeft: fmtLeft, fx: fx, count: count, api: api, reduce: reduce, resetDemo: function () { localStorage.removeItem(DK); } };
})();
