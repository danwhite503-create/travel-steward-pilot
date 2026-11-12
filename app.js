// Pilot page v0.2 (D-538; Google sign-in, D-541). Static; talks only to the pilot's Supabase project.
// All text from the database is shown with textContent, never as HTML.
(function () {
  "use strict";
  const CFG = window.PILOT_CONFIG || {};
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const PENDING = "pilot.pendingConsent";
  const SECTIONS = [
    ["mobility", "Getting there (rail, air)"], ["lodging", "Where you stay"], ["food", "Food"],
    ["around", "Getting around"], ["events", "Events"], ["pace", "Pace"], ["values", "Values"], ["budget", "Budget"]
  ];

  // ---------- small helpers ----------
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return n;
  }
  // Dates are stored as YYYY-MM-DD; show them as "Tue, Mar 9, 2027", read in UTC so they never shift a day.
  function fmtDate(d) {
    if (!d) return "";
    const t = new Date(d + "T00:00:00Z");
    return isNaN(t) ? d : t.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  function nights(a, b) {
    if (!a || !b) return null;
    const n = Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
    return isNaN(n) || n < 0 ? null : n;
  }
  // Each trip gets one of four intercity liveries: Italy, Japan, Spain and France by the brief's main country;
  // any other trip one of the four, fixed by its id so it never changes between visits.
  const LIVERIES = ["lv-it", "lv-jp", "lv-es", "lv-fr"];
  const BY_COUNTRY = { IT: "lv-it", JP: "lv-jp", ES: "lv-es", FR: "lv-fr" };
  function livery(id, country) {
    if (BY_COUNTRY[country]) return BY_COUNTRY[country];
    let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return LIVERIES[h % LIVERIES.length];
  }
  // ISO 3166 alpha-2 codes; names come from the browser, in English.
  const COUNTRY_CODES = ("AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ " +
    "DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN " +
    "KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL " +
    "PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW " +
    "HK MO PR TW GL FO AW CW BM KY VI GU PF NC RE GP MQ").split(" ");
  const countryName = (() => { try { const d = new Intl.DisplayNames(["en"], { type: "region" }); return (c) => d.of(c) || c; } catch (e) { return (c) => c; } })();
  // The brief of each trip, by trip id: { id, payload }. Kept as a trip item of kind "brief".
  let briefs = {};
  let plans = {};
  // What a plan amounts to (D-550): a refusal, or options that all break a hard rule, is never "ready" (D-544(1)).
  function planState(p) {
    if (!p) return null;
    if (p.status === "refused") return "refused";
    const opts = Array.isArray(p.options) ? p.options : [];
    const breaks = (o) => (Array.isArray(o.tier_a) ? o.tier_a : []).some((r) => r && r.ok === false);
    if (opts.length && opts.every(breaks)) return "breaks";
    if (p.status === "working") return "working";
    return p.status === "checked" ? "checked" : "draft";
  }
  const CHIP = { refused: ["Can't be done as asked", " bad"], breaks: ["Breaks a hard rule", " bad"], working: ["Team at work", ""], checked: ["Plan ready", " checked"], draft: ["Plan in progress", ""] };
  let travelerRows = [];
  function placesOf(p) { return (p && Array.isArray(p.places) ? p.places : []).filter(Boolean); }
  // Where a trip runs, as on a departure board: from, then each place in order.
  function stations(p) {
    const stops = [p.from, ...placesOf(p)].filter(Boolean);
    // A brief with no route yet says so, rather than "not started" (found in the recap recordings).
    const started = p && Object.keys(p).some((k) => k !== "v" && p[k] !== null && !(Array.isArray(p[k]) && !p[k].length) && p[k] !== "");
    return stops.length ? el("div", { class: "stations" }, stops.join(" → ")) : el("div", { class: "stations empty" }, started ? "Route not set yet" : "Brief not started");
  }
  // A trip's dates as a short route: departure, a line, return; nights underneath.
  function route(a, b, extra) {
    const n = nights(a, b);
    const box = el("div", { class: "route" + (a && b ? "" : " undated") },
      el("span", {}, a ? fmtDate(a) : "Dates not set"), el("span", { class: "track", "aria-hidden": "true" }), el("span", {}, b ? fmtDate(b) : ""));
    const note = [n === null ? "" : n === 1 ? "1 night" : n + " nights", extra || ""].filter(Boolean).join(", ");
    if (note) box.append(el("span", { class: "nights" }, note));
    return box;
  }
  function flash(msg, kind) {
    const f = $("#flash"); f.textContent = msg; f.className = "flash " + (kind || ""); f.hidden = false;
    clearTimeout(flash.t); flash.t = setTimeout(() => { f.hidden = true; }, 7000);
  }
  // Turn a database error into plain words. The never-kept trigger raises check_violation.
  function explain(err) {
    if (!err) return "Something went wrong.";
    const m = String(err.message || err);
    const refused = m.match(/refused, this looks like (.+?), which the pilot never keeps/);
    if (refused) return "Not saved: this looks like " + refused[1] + ", which the pilot never keeps. Please reword it.";
    if (err.code === "23514") return "Not saved: a value is outside what's allowed (for example a 2-letter nationality, or an end date before the start).";
    if (err.code === "42501") return "Not allowed: " + m.replace(/^pilot store: /, "");
    return m;
  }
  // The held agreement lives in this tab only (sessionStorage): the Google round trip returns to the same tab,
  // and another person signing in later in another tab or window can't pick it up.
  function store(k, v) { try { if (v === undefined) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // Small removals confirm with one button. The deletes that can't be undone confirm by pulling a lever:
  // the handle slid to the end of its track (mouse, touch or keyboard). Released early, it springs back.
  function confirmBox(text, lever, yesLabel) {
    return new Promise((resolve) => {
      const Y = $("#confirm-yes"); Y.textContent = yesLabel || "Delete"; Y.className = yesLabel ? "" : "danger";
      const L = $("#confirm-lever"), fill = $("#confirm-lever-fill"), wrap = $("#confirm-lever-wrap");
      $("#confirm-text").textContent = text;
      wrap.hidden = !lever; $("#confirm-yes").hidden = !!lever;
      const paint = () => { fill.style.width = L.value + "%"; L.setAttribute("aria-valuetext", Number(L.value) >= 100 ? "Pulled: deleting" : L.value + " percent pulled"); };
      L.value = 0; paint();
      let settled = false, pointer = false;
      const done = (ok) => {
        if (settled) return; settled = true;
        $("#confirm").hidden = true; $("#confirm-yes").hidden = false;
        $("#confirm-yes").onclick = $("#confirm-no").onclick = L.oninput = L.onchange = L.onpointerdown = L.onpointerup = L.onpointercancel = null;
        resolve(ok);
      };
      const springBack = () => { wrap.classList.add("springing"); L.value = 0; paint(); setTimeout(() => wrap.classList.remove("springing"), 300); };
      L.oninput = paint;
      L.onpointerdown = () => { pointer = true; };
      L.onpointerup = L.onpointercancel = () => { pointer = false; setTimeout(() => { if (!settled && Number(L.value) < 100) springBack(); }, 0); };
      L.onchange = () => { if (Number(L.value) >= 100) done(true); else if (!pointer) paint(); };
      $("#confirm").hidden = false;
      $("#confirm-yes").onclick = () => done(!lever);
      $("#confirm-no").onclick = () => done(false);
      (lever ? L : $("#confirm-yes")).focus();
    });
  }
  const draft = /^draft/i.test(CFG.NOTICE_VERSION || "draft");

  // ---------- config text ----------
  for (const n of $$("[data-cfg]")) n.textContent = CFG[n.dataset.cfg] || n.textContent;
  if (CFG.PILOT_NAME) document.title = CFG.PILOT_NAME;
  if (CFG.NOTICE_URL) for (const a of $$('a[href="notice.html"]')) a.href = CFG.NOTICE_URL;
  if (draft) $("#draft-banner").hidden = false;

  // Refuse a secret key: it bypasses every access rule, and this page is public.
  function secretKey(k) {
    if (!k) return false;
    if (/^sb_secret_/i.test(k)) return true;
    const parts = k.split(".");
    if (parts.length === 3) { try { const p = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))); return p.role !== "anon"; } catch (e) { return true; } }
    return false;
  }
  if (secretKey(CFG.SUPABASE_PUBLISHABLE_KEY)) {
    $("#config-banner").textContent = "Stopped: config.js holds a secret key. Remove it at once, and replace it with the publishable (anon) key.";
    $("#config-banner").hidden = false; $("#view-consent").hidden = false; $("#consent-submit").disabled = true; return;
  }
  const sb = window.__PILOT_CLIENT__ ||
    (CFG.SUPABASE_URL && CFG.SUPABASE_PUBLISHABLE_KEY && window.supabase
      ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } })
      : null);
  if (!sb) { $("#config-banner").hidden = false; $("#view-consent").hidden = false; $("#consent-submit").disabled = true; return; }

  let user = null, trips = [], current = null;

  // ---------- consent and sign-in ----------
  $("#consent-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (draft) return flash("Sign-up is off until the notice is approved.", "bad");
    if (!f.adult.checked || !f.agree.checked || !f.others.checked) return flash("Please tick all three boxes.", "bad");
    const scope = { adult: true, agree: true, others_agreed: true, ticked_at: new Date().toISOString() };
    if (user) return agreeNow(scope);   // already signed in: write the agreement now
    // Held in this tab only until sign-in finishes, good for 15 minutes.
    store(PENDING, { notice_version: CFG.NOTICE_VERSION, scope, at: Date.now() });
    // Closed pilot: Supabase refuses a Google account whose email Daniel hasn't added
    // (sign-ups are off in the project), and the page asks for nothing beyond Google's basic sign-in.
    try {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
      if (error) { store(PENDING); flash(explain(error), "bad"); }
    } catch (err) { store(PENDING); flash(explain(err), "bad"); }
  });
  async function agreeNow(scope) {
    if (draft) return flash("Sign-up is off until the notice is approved.", "bad");
    const ins = await sb.from("consents").insert({ notice_version: CFG.NOTICE_VERSION, scope });
    if (ins.error && ins.error.code !== "23505") return flash(explain(ins.error), "bad");
    store(PENDING);
    running = null; return onSession({ user });
  }

  async function ensureConsent() {
    const { data, error } = await sb.from("consents").select("id, notice_version, agreed_at, withdrawn_at").is("withdrawn_at", null);
    if (error) throw error;
    if ((data || []).some((c) => c.notice_version === CFG.NOTICE_VERSION)) { store(PENDING); return true; }
    const p = load(PENDING);
    const fresh = p && p.notice_version === CFG.NOTICE_VERSION && Date.now() - (p.at || 0) < 900e3;
    if (fresh && !draft) {
      const ins = await sb.from("consents").insert({ notice_version: p.notice_version, scope: p.scope });
      if (ins.error && ins.error.code !== "23505") throw ins.error;   // 23505: already agreed (another tab)
      store(PENDING);
      return true;
    }
    if (p && !fresh) store(PENDING);
    return false;
  }

  // One render at a time: a second call waits for the first, then runs only if the user changed.
  let running = null, renderedFor;
  function onSession(session) {
    const id = session && session.user ? session.user.id : null;
    const go = async () => { if (id === renderedFor && id !== null) return; renderedFor = id; await render(session); };
    running = (running || Promise.resolve()).then(go, go);
    return running;
  }
  function showConsent(signedIn) {
    $("#view-app").hidden = true; $("#view-consent").hidden = false;
    $("#signin-note").hidden = signedIn;
    $("#consent-submit").textContent = signedIn ? "Agree and continue" : "Agree and sign in with Google";
    $("#nc-data").hidden = !signedIn;
  }
  async function render(session) {
    user = session && session.user;
    if (!user) { showConsent(false); $("#who").textContent = ""; $("#who-badge").hidden = true; $("#head-signout").hidden = true; return; }
    $("#who").textContent = user.email || ""; $("#who-badge").hidden = false; $("#head-signout").hidden = false;
    let ok = false;
    try { ok = await ensureConsent(); } catch (e) { flash(explain(e), "bad"); }
    if (!ok) {
      // Signed in without an agreement on this version: ask for it, write nothing else,
      // and keep download and delete within reach.
      renderedFor = undefined;
      showConsent(true);
      flash(draft ? "The notice isn't approved yet, so there's nothing to agree to. You can still download or delete your data below." : "Please read and agree to this version before going on.", "bad");
      return;
    }
    $("#view-consent").hidden = true; $("#view-app").hidden = false;
    await Promise.all([loadProfile(), loadTrips(), loadTravellers(), loadPrefs()]);
  }

  // ---------- tabs ----------
  for (const b of $$("[data-tab]")) b.addEventListener("click", () => {
    for (const x of $$("[data-tab]")) x.setAttribute("aria-selected", String(x === b));
    for (const p of $$("[data-panel]")) p.hidden = p.dataset.panel !== b.dataset.tab;
  });

  // ---------- readiness: the essentials and the extras, worked out from what's already entered ----------
  // The five essentials (his choice, D-549): what the planner needs to start any trip. Passport dates are
  // checked per trip instead, where the trip goes abroad (paintDocs), so a trip at home never stalls on them.
  const ready = { name: false, city: false, traveler: false, prefSections: new Set(), travelers: 0, brief: false, datedTrip: false };
  const ESSENTIALS = [
    ["name", "Display name", "add your display name below"],
    ["city", "Home city", "add your home city below"],
    ["traveler", "A traveler", "add yourself on the Travelers tab"],
    ["prefs", "A preference", "add at least one line on the Preferences tab"],
    ["brief", "A trip brief", "start a trip and save its brief on the Trips tab"]
  ];
  function essentialsDone() { return ESSENTIALS.map(([k]) => k === "prefs" ? ready.prefSections.size > 0 : !!ready[k]); }
  function earned() {
    const done = essentialsDone(), n = done.filter(Boolean).length;
    return { progress: n / ESSENTIALS.length, hat: ready.prefSections.size >= 3, gear: ready.datedTrip, pin: ready.travelers, n, done };
  }
  function paintReady() {
    const e = earned();
    const ul = $("#essentials"); ul.replaceChildren();
    ESSENTIALS.forEach(([k, label], i) => ul.append(el("li", { class: (e.done[i] ? "done" : "") + (e.done[i] && i > 0 && e.done[i - 1] ? " joined" : "") }, el("span", { class: "sr" }, e.done[i] ? "Done: " : "To do: "), label)));
    const next = ESSENTIALS.find((x, i) => !e.done[i]);
    $("#essentials-note").textContent = e.n === ESSENTIALS.length
      ? "All five done: the planner has what it needs to start a trip."
      : e.n + " of " + ESSENTIALS.length + " done. Next: " + next[2] + ".";
    const ex = $("#extras"); ex.replaceChildren();
    for (const [got, what, how] of [
      [e.hat, "Hat", "fill in 3 preference sections (" + ready.prefSections.size + " so far)"],
      [e.gear, "Gear for your scene", "add a trip with dates"],
      [e.pin > 1, "Companion pin", "add a second traveler"]
    ]) ex.append(el("li", { class: got ? "got" : "" }, el("span", { class: "who" }, what), el("span", { class: "muted grow" }, got ? "Earned" : "To earn: " + how)));
    if (window.__paintBadge) window.__paintBadge();
  }

  // ---------- traveler badge (this browser only; see avatar.js) ----------
  function setupBadge() {
    const A = window.TravelAvatar; if (!A) return;
    const v = A.load();
    const paint = () => {
      const e = earned();
      A.render($("#badge"), v, "Your traveler badge, " + e.n + " of 5 essentials done", e);
      A.render($("#who-badge"), v, "Your traveler badge", e);
      $("#badge-skin").hidden = v.figure === "none";
    };
    for (const r of $$("#badge-figure input")) { r.checked = r.value === v.figure; r.addEventListener("change", () => { v.figure = r.value; A.save(v); paint(); }); }
    for (const r of $$("#badge-skin input")) { r.checked = Number(r.value) === Number(v.skin); r.addEventListener("change", () => { v.skin = Number(r.value); A.save(v); paint(); }); }
    const sel = $("#badge-theme"); sel.value = A.THEMES[v.theme] ? v.theme : "season";
    sel.addEventListener("change", () => { v.theme = sel.value; A.save(v); paint(); });
    window.__paintBadge = paint;
    paint();
  }
  setupBadge();

  // ---------- the planning team (see team.js) ----------
  (function paintTeam() {
    const T = window.TravelTeam; if (!T) return;
    const ul = $("#team-list");
    for (const m of T.TEAM) {
      const face = el("span", { class: "face" }); face.innerHTML = T.svg(m.key);
      ul.append(el("li", { class: m.key === "steward" ? "lead" : m.key === "critic" ? "lead inspector" : "" }, face,
        el("div", {}, el("span", { class: "who" }, m.name), el("span", { class: "role" }, m.role), el("p", { class: "does" }, m.does))));
    }
  })();

  // ---------- the team in one chat, and the trip's tabs (his direction, 11 Nov 21:08) ----------
  // With the live steward on, a trip opens on tabs: Chat · Trip · Wallet & passport · Suitcase. The chat stays one
  // thread; the team sits beside it (a strip on a phone, a column on a computer) and whoever spoke last comes forward.
  // The other parts of the trip page are moved into the tabs, not rebuilt, so every existing control keeps working.
  const LIVE_TEAM = ["steward", "dining", "events", "around", "suitcase"];
  const TAB_KEYS = ["chat", "trip", "wallet", "suitcase"];
  const TAB_LABEL = { chat: "Chat", trip: "Trip", wallet: "Wallet & passport", suitcase: "Suitcase" };
  let tabsOn = false;
  function setupTripTabs() {
    if (tabsOn || CFG.STEWARD_LIVE !== true) return;
    const detail = $("#trip-detail"), anchor = $("#trip-edit");
    if (!detail || !anchor) return;
    tabsOn = true;
    const nav = el("div", { class: "trip-tabs", id: "trip-tabs", role: "tablist", "aria-label": "Trip sections" },
      ...TAB_KEYS.map((k) => el("button", { type: "button", role: "tab", id: "tab-" + k, "aria-controls": "panel-" + k, "aria-selected": "false",
        onclick: () => showTab(k) }, TAB_LABEL[k], el("span", { class: "tab-dot", hidden: "" }))));
    const panels = TAB_KEYS.map((k) => el("div", { class: "tab-panel", id: "panel-" + k, role: "tabpanel", "aria-labelledby": "tab-" + k, hidden: "" }));
    const P = Object.fromEntries(TAB_KEYS.map((k, i) => [k, panels[i]]));
    const rail = el("aside", { class: "team-rail", id: "team-rail", "aria-label": "Your team in this chat" });
    for (const key of LIVE_TEAM) {
      const T = window.TravelTeam, m = T && T.TEAM.find((x) => x.key === key); if (!m) continue;
      const face = el("span", { class: "face" }); face.innerHTML = T.svg(key);
      rail.append(el("button", { type: "button", class: "mate", "data-agent": key, title: "Ask " + m.name + " (" + m.role + ")",
        onclick: () => { showTab("chat"); const t = $("#talk-text"); if (t.disabled) return; if (key !== "steward" && !t.value.startsWith(m.name)) t.value = m.name + ", " + t.value; t.focus(); } },
        face, el("span", { class: "mate-name" }, m.name), el("span", { class: "mate-role" }, key === "steward" ? "Steward" : m.role)));
    }
    rail.append(el("p", { class: "muted small rail-note" }, "Rail, flights, stays, carbon, booking and the inspector work behind the scenes on the plan."));
    // Everything after the edit form moves: the chat to Chat, the suitcase to Suitcase, documents to Wallet, the rest to Trip.
    const moving = []; for (let n = anchor.nextElementSibling; n; n = n.nextElementSibling) moving.push(n);
    // The two warnings (plan out of date, missing passport dates) stay above the tabs, so no tab hides them.
    let at = anchor;
    for (const n of moving) {
      if (n.id === "plan-stale" || n.id === "trip-docs") at = n;
      else if (n.id === "talk") P.chat.append(n);
      else if (n.id === "packing") P.suitcase.append(n);
      else P.trip.append(n);
    }
    P.wallet.append(el("section", { class: "panel", id: "wallet-people", "aria-label": "Passports" }),
      el("section", { class: "panel muted small", id: "wallet-later" }, "Bookings and points come here once the next version of the notice is approved: vendor, dates, amount and status, never booking references, ticket or member numbers."));
    const body = el("div", { class: "trip-body" }, el("div", { class: "trip-main" }, nav, ...panels), rail);
    at.after(body);
    $("#talk h3").textContent = "Talk to your team";
    $("#talk-intro").textContent = "One chat with the whole team. Arlo leads and brings in whoever a question is for; they fill the Trip, Wallet & passport and Suitcase tabs as you go. Places, prices and times are suggestions until the team checks them.";
    $("#talk-text").placeholder = "Ask or tell the team…";
    showTab("chat");
  }
  function showTab(k) {
    if (!tabsOn) return;
    for (const t of TAB_KEYS) {
      const on = t === k;
      $("#panel-" + t).hidden = !on;
      const b = $("#tab-" + t); b.setAttribute("aria-selected", on ? "true" : "false"); b.classList.toggle("on", on);
      if (on) b.querySelector(".tab-dot").hidden = true;
    }
  }
  function dotTab(k) { if (tabsOn && !$("#tab-" + k).classList.contains("on")) $("#tab-" + k + " .tab-dot").hidden = false; }
  // Who's speaking: the last team voice comes forward; while a message is out, Arlo is "thinking".
  function paintRail(rows, thinking) {
    if (!tabsOn) return;
    const last = [...(rows || [])].reverse().find((m) => m.kind !== "user" && m.kind !== "handoff" && m.agent);
    const lead = thinking ? "steward" : last ? last.agent : "steward";
    for (const b of document.querySelectorAll("#team-rail .mate")) {
      const on = b.dataset.agent === lead;
      b.classList.toggle("speaking", on); b.classList.toggle("thinking", on && !!thinking);
      b.setAttribute("aria-current", on ? "true" : "false");
    }
  }
  let lastThread = [];
  // Wallet & passport: the travelers going on this trip, with the passport expiry the pilot keeps (dates only).
  function paintWallet(bp) {
    const box = $("#wallet-people"); if (!box) return;
    const going = new Set(Array.isArray(bp && bp.who) ? bp.who : []);
    const rows = (travelerRows || []).filter((t) => going.has(t.id));
    box.replaceChildren(el("h3", {}, "Passports"));
    if (!rows.length) { box.append(el("p", { class: "muted small" }, "Tick who's going in the Trip tab's brief, and their passport expiry dates show here.")); return; }
    const ul = el("ul", { class: "list" });
    for (const t of rows) ul.append(el("li", {}, el("span", { class: "who" }, [t.first_name, t.last_name].filter(Boolean).join(" ")),
      el("span", { class: "muted grow" }, [t.nationality, t.passport_expires ? "passport expires " + fmtDate(t.passport_expires).replace(/^[A-Za-z]{3}, /, "") : "passport expiry not added"].filter(Boolean).join(", "))));
    box.append(ul, el("p", { class: "muted small" }, "Entry rules for the countries on the route are checked by the planning team at the source; Arlo's chat can't confirm them."));
  }
  setupTripTabs();

  // ---------- profile ----------
  async function loadProfile() {
    const { data, error } = await sb.from("profiles").select("display_name, home_city").maybeSingle();
    if (error) return flash(explain(error), "bad");
    const f = $("#profile-form");
    f.display_name.value = (data && data.display_name) || "";
    f.home_city.value = (data && data.home_city) || "";
    ready.name = !!f.display_name.value.trim(); ready.city = !!f.home_city.value.trim(); paintReady();
  }
  $("#profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const row = { user_id: user.id, display_name: f.display_name.value.trim(), home_city: f.home_city.value.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await sb.from("profiles").upsert(row, { onConflict: "user_id" });
    if (error) return flash(explain(error), "bad");
    flash("Saved.", "ok"); ready.name = !!row.display_name; ready.city = !!row.home_city; paintReady();
  });

  // ---------- travellers ----------
  async function loadTravellers() {
    const { data, error } = await sb.from("travellers").select("id, first_name, last_name, nationality, passport_expires").order("created_at");
    if (error) return flash(explain(error), "bad");
    const ul = $("#traveller-list"); ul.replaceChildren();
    const rows = data || [];
    travelerRows = rows;
    ready.travelers = rows.length; ready.traveler = rows.length > 0; paintReady();
    for (const t of data || []) {
      ul.append(el("li", {}, el("span", { class: "who" }, [t.first_name, t.last_name].filter(Boolean).join(" ")),
        el("span", { class: "muted grow" }, [t.nationality, t.passport_expires && "passport expires " + fmtDate(t.passport_expires).replace(/^[A-Za-z]{3}, /, "")].filter(Boolean).join(", ")),
        el("button", { type: "button", class: "link", onclick: async () => {
          if (!(await confirmBox("Remove " + t.first_name + "?"))) return;
          const r = await sb.from("travellers").delete().eq("id", t.id);
          if (r.error) return flash(explain(r.error), "bad");
          await loadTravellers();
          await dropFromBriefs(t.id);
        } }, "Remove")));
    }
    if (!(data || []).length) ul.append(el("li", { class: "empty" }, "No travelers yet. Add yourself first, then anyone coming with you."));
  }
  $("#traveller-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const row = { first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim() || null,
      nationality: f.nationality.value.trim().toUpperCase() || null, passport_expires: f.passport_expires.value || null };
    const { error } = await sb.from("travellers").insert(row);
    if (error) return flash(explain(error), "bad");
    f.reset(); flash("Added.", "ok"); loadTravellers();
  });

  // ---------- preferences ----------
  async function loadPrefs() {
    const { data, error } = await sb.from("prefs").select("section, items");
    if (error) return flash(explain(error), "bad");
    const by = Object.fromEntries((data || []).map((r) => [r.section, r.items || []]));
    ready.prefSections = new Set(Object.keys(by).filter((k) => (by[k] || []).length)); paintReady();
    const wrap = $("#prefs-wrap"); wrap.replaceChildren();
    for (const [key, label] of SECTIONS) {
      const ta = el("textarea", { rows: "3", maxlength: "2000", "aria-label": label });
      ta.value = (by[key] || []).map((i) => (typeof i === "string" ? i : i.label || "")).join("\n");
      const form = el("form", { class: "stack pref" }, el("h3", {}, label), ta, el("button", { type: "submit" }, "Save " + label.toLowerCase()));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const items = ta.value.split("\n").map((s) => s.trim()).filter(Boolean).map((s) => ({ label: s }));
        const { error } = await sb.from("prefs").upsert({ user_id: user.id, section: key, items, updated_at: new Date().toISOString() }, { onConflict: "user_id,section" });
        if (error) return flash(explain(error), "bad");
        flash("Saved.", "ok"); items.length ? ready.prefSections.add(key) : ready.prefSections.delete(key); paintReady();
      });
      wrap.append(form);
    }
  }

  // ---------- trips ----------
  async function loadTrips() {
    const { data, error } = await sb.from("trips").select("id, owner, title, date_from, date_to, status, updated_at").order("created_at", { ascending: false });
    if (error) return flash(explain(error), "bad");
    trips = data || [];
    const b = await sb.from("trip_items").select("id, trip_id, payload, created_at, updated_at").eq("kind", "brief").order("created_at");
    briefs = {};
    for (const r of (b.data || [])) briefs[r.trip_id] = { id: r.id, payload: r.payload || {}, at: r.updated_at || r.created_at };
    const pl = await sb.from("trip_items").select("id, trip_id, payload, created_at").eq("kind", "plan").order("created_at");
    plans = {};
    for (const r of (pl.data || [])) plans[r.trip_id] = { id: r.id, payload: r.payload || {}, at: r.created_at };
    ready.datedTrip = trips.some((t) => t.owner === user.id && t.date_from && t.date_to);
    ready.brief = trips.some((t) => t.owner === user.id && briefs[t.id]); paintReady();
    const ul = $("#trip-list"); ul.replaceChildren();
    for (const t of trips) {
      const p = (briefs[t.id] || {}).payload || {};
      ul.append(el("li", {}, el("div", { class: "ticket " + livery(t.id, p.country) },
        el("button", { type: "button", class: "link", onclick: () => openTrip(t.id) }, t.title),
        stations(p),
        plans[t.id] ? (isStale(t, plans[t.id].payload, plans[t.id].at) && ["checked", "refused"].includes(planState(plans[t.id].payload))
          ? el("span", { class: "plan-chip stale" }, "Plan out of date")
          : el("span", { class: "plan-chip" + CHIP[planState(plans[t.id].payload || {})][1] }, CHIP[planState(plans[t.id].payload || {})][0])) : "",
        route(t.date_from, t.date_to, [({ oneway: "one way, no return", multi: "multi-city", open: "open-ended" })[p.shape || (p.one_way ? "oneway" : "")] || "", t.owner !== user.id ? "shared with you" : ""].filter(Boolean).join(", ")))));
    }
    if (!trips.length) ul.append(el("li", { class: "empty" }, CFG.STEWARD_LIVE === true ? "No trips yet. Tell Arlo about one below." : "No trips yet. Add your first below: a title is enough to start, and dates help the planner."));
  }
  // Starter tiles (his choice C, 10 Nov 12:16 ET): ideas for the time of year, three at a time, shuffled on each visit
  // and on "More ideas"; and a budget row. Written ahead on the page, kept to the trip rules (trains first, a day's
  // carbon limit), so nothing is sent anywhere until he writes to Arlo; Arlo's own replies then tailor the choices.
  const SEASON = [
    ["A ski week reached by train", "A winter city break with museums", "Winter sun, one long train ride", "A cosy weekend in a small town", "Northern lights, if the timing fits"],
    ["A winter city break with museums", "A ski week reached by train", "A long weekend of food and markets", "Winter sun, one long train ride", "A quiet week by the sea out of season"],
    ["Early spring in southern Europe", "A long weekend of food and markets", "A city break before the crowds", "Spring skiing reached by train", "A week by train through two or three cities"],
    ["Spring blossom in a city of gardens", "A week by train through two or three cities", "A walking trip between villages", "A city break before the crowds", "A long weekend of food and markets"],
    ["A walking trip between villages", "A coast trip before summer", "A week by train through two or three cities", "Gardens and vineyards by train", "A city weekend under the carbon limit"],
    ["A coast trip before the peak", "Long light evenings up north", "A lake and mountain week by train", "A festival trip", "A walking trip between villages"],
    ["Long light evenings up north", "A lake and mountain week by train", "Islands reached by ferry", "A cooler mountain escape", "A festival trip"],
    ["A cooler mountain escape", "Islands reached by ferry", "Long light evenings up north", "A lake and mountain week by train", "A quiet city while locals are away"],
    ["Harvest season in wine country", "A coast trip after the crowds", "A week by train through two or three cities", "A walking trip between villages", "A city break as the season turns"],
    ["Autumn colour by train", "Harvest season in wine country", "A city break as the season turns", "A long weekend of food and markets", "A walking trip in autumn"],
    ["Early Christmas markets by train", "A winter city break with museums", "Autumn colour, if it's still out", "A cosy weekend in a small town", "Winter sun, one long train ride"],
    ["Christmas markets by train", "A cosy weekend in a small town", "A winter city break with museums", "A ski week reached by train", "New Year somewhere new"]];
  const BUDGET = [["Shoestring", "on a tight budget"], ["Mid-range", "on a mid-range budget"], ["Treat", "as a treat, budget flexible"]];
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const addToStart = (words) => { const t = $("#start-text"); const v = t.value.trim(); t.value = v ? v.replace(/[.,;]?$/, ", ") + words : words.charAt(0).toUpperCase() + words.slice(1); t.focus(); };
  // On the explore path the ideas and budget tiles sit in the chat: a tap is a message to Arlo (his choice, 11 Nov:
  // every tile starts or continues the chat; nothing just adds words to a box).
  function paintExploreTiles() {
    const box = $("#explore-tiles"); if (!box) return;
    const m = new Date().getMonth(), month = new Date().toLocaleString("en-US", { month: "long" });
    const send = (t) => { box.hidden = true; sendTalk(t); };
    box.replaceChildren(
      el("p", { class: "tiles-head" }, "Ideas for " + month),
      el("div", { class: "chips ideas" }, ...shuffle(SEASON[m]).slice(0, 3).map((c) => el("button", { type: "button", class: "chip idea", onclick: () => send("Something like: " + c.charAt(0).toLowerCase() + c.slice(1)) }, c)),
        el("button", { type: "button", class: "chip more", onclick: paintExploreTiles, "aria-label": "Show more ideas" }, "More ideas")),
      el("p", { class: "tiles-head" }, "Budget"),
      el("div", { class: "chips budget", role: "group", "aria-label": "Budget" }, ...BUDGET.map(([label, words]) => el("button", { type: "button", class: "chip money", onclick: () => send("Budget: " + words) }, label))));
  }

  // Arlo first (his direction, 10 Nov 10:51 ET): with the live steward on, a new trip starts as a message to Arlo,
  // not a form. The trip is made with the message as a working title; Arlo names it and sets its dates (set_trip).
  if (CFG.STEWARD_LIVE === true) {
    $("#trip-new").hidden = true; $("#trip-start").hidden = false;
    const T = window.TravelTeam, av = $("#start-avatar");
    if (T && T.svg && av) { av.className = "face"; av.innerHTML = T.svg("steward"); }
  }
  const workingTitle = (text) => { const t = text.replace(/\s+/g, " ").trim(); if (t.length <= 60) return t; const cut = t.slice(0, 60); return cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : 60) + "…"; };
  // Voice to text (his choice B, 10 Nov 11:35 ET): the browser's own speech service turns speech into text in the box;
  // nothing is sent until the traveler taps Send, so the never-kept check and the review of the words still apply.
  // Shown only where the browser has speech recognition; elsewhere a hint points to the phone keyboard's mic.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recBtn = null;
  function stopMic() { if (rec) { try { rec.stop(); } catch (_) {} } }
  const noteFor = (btn) => document.getElementById(btn.dataset.for === "start-text" ? "start-note" : "talk-note");
  function micNote(btn, text) { const n = noteFor(btn); if (n) n.textContent = text; }
  for (const btn of document.querySelectorAll("button.mic")) {
    if (CFG.STEWARD_LIVE !== true) continue;
    if (!SR) { const h = $("#start-mic-hint"); if (h && btn.dataset.for === "start-text") h.textContent = "Tip: on a phone, tap the mic on your keyboard to speak."; continue; }
    btn.hidden = false;
    if (btn.dataset.for === "start-text") { const h = $("#start-mic-hint"); if (h) h.textContent = "Tap to speak instead of typing"; }
    btn.addEventListener("click", () => {
      if (rec && recBtn === btn) { stopMic(); return; }
      stopMic();
      const box = document.getElementById(btn.dataset.for); const before = box.value ? box.value.trim() + " " : "";
      rec = new SR(); recBtn = btn; rec.lang = navigator.language || "en-US"; rec.interimResults = true; rec.continuous = false;
      rec.onresult = (ev) => { let t = ""; for (const r of ev.results) t += r[0].transcript; box.value = (before + t).slice(0, Number(box.maxLength) > 0 ? box.maxLength : 1000); };
      rec.onerror = (ev) => micNote(btn, ev.error === "not-allowed" || ev.error === "service-not-allowed"
        ? "The microphone is blocked. Allow it in your browser's settings, or type instead." : "Didn't catch that. Tap the mic and try again, or type.");
      rec.onend = () => { btn.classList.remove("on"); btn.setAttribute("aria-pressed", "false"); if (recBtn === btn) { rec = null; recBtn = null; }
        const n = noteFor(btn); if (n && /^Listening/.test(n.textContent)) n.textContent = box.value.trim() ? "Check the words, then send." : ""; box.focus(); };
      btn.classList.add("on"); btn.setAttribute("aria-pressed", "true"); micNote(btn, "Listening… tap the mic again to stop.");
      try { rec.start(); } catch (_) { rec = null; recBtn = null; btn.classList.remove("on"); micNote(btn, "The mic couldn't start. Type instead."); }
    });
  }
  const DOORS = { mind: ["New trip", "I have a trip in mind."], explore: ["Exploring ideas", "Help me find somewhere to go."], event: ["Around an event", "I'm planning a trip around an event."] };
  async function startTrip(title, text) {
    const note = $("#start-note");
    $("#start-send").disabled = true; for (const d of document.querySelectorAll("[data-door]")) d.disabled = true;
    note.textContent = "Setting up your trip…";
    // The id is made here and the insert asks for nothing back (see below).
    const id = crypto.randomUUID();
    const { error } = await sb.from("trips").insert({ id, title, date_from: null, date_to: null });
    $("#start-send").disabled = false; for (const d of document.querySelectorAll("[data-door]")) d.disabled = false;
    if (error) { note.textContent = explain(error); return false; }
    note.textContent = "";
    await loadTrips(); await openTrip(id);
    $("#talk").scrollIntoView({ block: "start" });
    await sendTalk(text);
    return true;
  }
  for (const d of document.querySelectorAll("[data-door]")) d.addEventListener("click", () => { const [t, m] = DOORS[d.dataset.door]; startTrip(t, m); });
  { const sub = $("#door-explore-sub"); if (sub) sub.textContent = "Ideas for " + new Date().toLocaleString("en-US", { month: "long" }) + ", by budget and feel"; }
  $("#trip-start").addEventListener("submit", async (e) => {
    e.preventDefault();
    stopMic();
    const text = $("#start-text").value.trim(), note = $("#start-note");
    if (!text) { note.textContent = "Tell Arlo a little about the trip first."; return; }
    const nk = neverKept(text);
    if (nk) { note.textContent = "Not sent: this looks like " + nk + ", which the pilot never keeps. Reword it and try again."; return; }
    if (await startTrip(workingTitle(text), text)) $("#start-text").value = "";
  });
  $("#trip-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const row = { title: f.title.value.trim(), date_from: f.date_from.value || null, date_to: f.date_to.value || null };
    const { error } = await sb.from("trips").insert(row);
    if (error) return flash(explain(error), "bad");
    f.reset(); flash(CFG.STEWARD_LIVE === true ? "Trip added. Tell Arlo about it below." : "Trip added. Fill in the brief below.", "ok");
    await loadTrips();
    // Open the trip just made (his phone test, D-554): the newest trip of mine with this title.
    const made = trips.find((t) => t.owner === user.id && t.title === row.title);
    if (made) { await openTrip(made.id); const b = $("#brief-wrap"); if (b) { b.open = true; b.scrollIntoView({ block: "start" }); } }
  });
  $("#trip-back").addEventListener("click", () => { current = null; $("#trip-detail").hidden = true; $("#trip-list-wrap").hidden = false; loadTrips(); });

  function paintTicket() {
    const bp = (briefs[current.id] || {}).payload || {};
    $("#trip-title").textContent = current.title;
    $("#trip-ticket").className = "ticket " + livery(current.id, bp.country);
    $("#trip-stations").replaceWith(Object.assign(stations(bp), { id: "trip-stations" }));
    // One way: the trip's end date is the last day there, not a return (review L6).
    $("#trip-dates").replaceWith(Object.assign(route(current.date_from, current.date_to, ({ oneway: "one way, no return", multi: "multi-city", open: "open-ended" })[bp.shape || (bp.one_way ? "oneway" : "")] || ""), { id: "trip-dates" }));
  }
  $("#trip-edit-btn").addEventListener("click", () => {
    const f = $("#trip-edit"); f.title.value = current.title; f.date_from.value = current.date_from || ""; f.date_to.value = current.date_to || "";
    f.hidden = false; f.title.focus();
  });
  $("#trip-edit-cancel").addEventListener("click", () => { $("#trip-edit").hidden = true; $("#trip-edit-btn").focus(); });
  $("#trip-edit").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const row = { title: f.title.value.trim(), date_from: f.date_from.value || null, date_to: f.date_to.value || null };
    const datesMoved = row.date_from !== (current.date_from || null) || row.date_to !== (current.date_to || null);
    if (!datesMoved && row.title === current.title) { f.hidden = true; $("#trip-edit-btn").focus(); return; }
    // Only a date change touches the trip's time, so a renamed trip doesn't mark its plan out of date (review L2).
    if (datesMoved) row.updated_at = new Date().toISOString();
    const { data, error } = await sb.from("trips").update(row).eq("id", current.id).select("id, updated_at");
    if (error) return flash(explain(error), "bad");
    if (Array.isArray(data) && !data.length) return flash("Not saved: only the trip's owner can change it.", "bad");   // review L3
    if (Array.isArray(data) && data[0] && data[0].updated_at) row.updated_at = data[0].updated_at;   // the store's time (v0.1.4)
    Object.assign(current, row); f.hidden = true; paintTicket(); paintStale(); flash("Trip updated.", "ok"); $("#trip-edit-btn").focus();
  });
  async function openTrip(id) {
    current = trips.find((t) => t.id === id);
    if (!current) return;
    currentPlan = null; currentPlanAt = null; shareLive = false;
    $("#trip-edit").hidden = true; $("#trip-edit-btn").hidden = current.owner !== user.id;
    $("#trip-list-wrap").hidden = true; $("#trip-detail").hidden = false;
    const bp = (briefs[current.id] || {}).payload || {};
    paintTicket();
    const mine = current.owner === user.id;
    for (const s of ["#share-on", "#share-off", "#trip-delete"]) $(s).disabled = !mine;
    let canWrite = mine;
    if (!mine) { const m = await sb.from("trip_members").select("role").eq("trip_id", current.id).eq("user_id", user.id).maybeSingle(); canWrite = !!(m.data && m.data.role !== "viewer"); }
    $("#item-new").hidden = !canWrite; tripCanWrite = canWrite;
    fillBrief(bp, canWrite); paintDocs(bp); paintWallet(bp);
    if (tabsOn) { showTab("chat"); for (const k of TAB_KEYS) $("#tab-" + k + " .tab-dot").hidden = true; }
    $("#talk").hidden = CFG.STEWARD_LIVE !== true;   // shown only once he switches the live steward on (D-557)
    $("#talk-form").hidden = !canWrite; $("#talk-text").disabled = !canWrite; $("#talk-note").textContent = "";
    await Promise.all([loadItems(), loadShare(), loadThread()]);
  }
  // ---------- talk to the steward (D-557, S1) ----------
  // The thread lives in the store (messages); the steward-chat function writes the traveler's message as them,
  // then Arlo's reply and any brief fields it filled. Nothing is sent from here but the message and the trip id.
  async function loadThread() {
    const ol = $("#thread"); if (!ol || !current) return;
    const { data, error } = await sb.from("messages").select("id, author, agent, kind, body, chips, payload, created_at").eq("trip_id", current.id).order("created_at");
    if (error) { ol.replaceChildren(); return; }
    ol.replaceChildren();
    const rows = data || [];
    if (!rows.length) ol.append(el("li", { class: "empty" }, "Say hello, or tell Arlo where you'd like to go."));
    const T = window.TravelTeam;
    rows.forEach((m, i) => {
      const mine = m.kind === "user";
      if (m.kind === "handoff") { ol.append(el("li", { class: "handoff small" }, m.body)); return; }
      if (m.kind === "proposal") { ol.append(proposalCard(m, i === rows.length - 1)); return; }
      const tm = T && T.TEAM.find((x) => x.key === m.agent);
      const who = mine ? (m.author === user.id ? "You" : "Someone on this trip") : tm ? tm.name + " · " + (m.agent === "steward" ? "Steward" : tm.role) : "The team";
      const li = el("li", { class: "msg " + (mine ? "me" : "agent") + (tm && !mine ? " by-" + m.agent : "") }, el("div", { class: "msg-who" }, who), el("div", { class: "msg-body" }, m.body));
      if (tabsOn && tm && !mine) { const f = el("span", { class: "msg-face", "aria-hidden": "true" }); f.innerHTML = T.svg(m.agent); li.prepend(f); }
      if (m.kind === "suggestion") li.querySelector(".msg-who").append(" ", el("span", { class: "badge-sugg" }, "suggestion"));
      // Arlo's choices stay tappable when only a proposal card follows them (D-558).
      const last = rows.slice(i + 1).every((r) => r.kind === "proposal");
      if (!mine && last && Array.isArray(m.chips) && m.chips.length && !$("#talk-text").disabled)
        li.append(el("div", { class: "chips" }, ...m.chips.map((c) => el("button", { type: "button", class: "chip", onclick: () => sendTalk(c) }, c))));
      ol.append(li);
    });
    ol.scrollTop = ol.scrollHeight;
    lastThread = rows; paintRail(rows, false);
    // The explore path: while the trip has no places yet and Arlo's last word offers no choices of its own.
    const ex = $("#explore-tiles");
    if (ex) {
      const lastRow = rows[rows.length - 1];
      const exploring = current.title === "Exploring ideas" && CFG.STEWARD_LIVE === true && lastRow && lastRow.kind !== "user" && !(Array.isArray(lastRow.chips) && lastRow.chips.length);
      ex.hidden = !exploring; if (exploring) paintExploreTiles();
    }
  }
  // Arlo's proposals (D-558): a card that writes nothing until the owner taps it; then the page writes the record with
  // the owner's own sign-in (row security applies) and tells Arlo in the thread, so the chat carries on.
  function proposalCard(m, last) {
    const p = m.payload || {}, mine = current && user && current.owner === user.id;
    const li = el("li", { class: "msg agent proposal" }, el("div", { class: "msg-who" }, "Arlo · Steward ", el("span", { class: "badge-prop" }, "to save")), el("div", { class: "msg-body" }, m.body));
    if (p.type === "traveler") li.append(el("p", { class: "muted small" }, "Only add people who've agreed to be on the pilot, as the notice asks."));
    if (!last || !mine || $("#talk-text").disabled) return li;
    const note = $("#talk-note");
    const yes = el("button", { type: "button", class: "chip yes" }, p.type === "traveler" ? "Add" : "Save");
    const no = el("button", { type: "button", class: "chip" }, "Not now");
    yes.addEventListener("click", async () => {
      yes.disabled = no.disabled = true;
      let error = null, said = "";
      if (p.type === "traveler") {
        const row = { first_name: p.first_name }; if (p.last_name) row.last_name = p.last_name; if (p.nationality) row.nationality = p.nationality;
        ({ error } = await sb.from("travellers").insert(row)); said = "Added " + p.first_name + " as a traveler.";
      } else if (p.type === "pref") {
        const cur = await sb.from("prefs").select("items").eq("section", p.section).maybeSingle();
        const items = ((cur.data && cur.data.items) || []).concat([{ label: p.line }]);
        ({ error } = await sb.from("prefs").upsert({ user_id: user.id, section: p.section, items, updated_at: new Date().toISOString() }, { onConflict: "user_id,section" }));
        said = "Saved to my preferences: " + p.line;
      } else if (p.type === "home") {
        const cur = await sb.from("profiles").select("display_name").maybeSingle();
        const name = (cur.data && cur.data.display_name) || (user.email || "Me").split("@")[0];
        ({ error } = await sb.from("profiles").upsert({ user_id: user.id, display_name: name, home_city: p.city, updated_at: new Date().toISOString() }, { onConflict: "user_id" }));
        said = "Saved " + p.city + " as my home city.";
      }
      if (error) { yes.disabled = no.disabled = false; note.textContent = explain(error); return; }
      await sendTalk(said);
    });
    no.addEventListener("click", () => { yes.disabled = no.disabled = true; sendTalk("Not now."); });
    li.append(el("div", { class: "chips" }, yes, no));
    return li;
  }
  // The never-kept check, on the page too (overnight runs, 10 Nov): a message carrying such a value never leaves the
  // phone, and the reason is named. The same patterns as the database and the function; it works by pattern.
  function neverKept(raw) {
    const t = String(raw).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, " ").replace(/\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?/g, " ");
    if (/(\d[ -]?){8,}\d/.test(t)) return "a long number (card, account or document number)";
    if (/(^|[^a-z])[a-z]{1,2}\d{6,9}([^0-9]|$)/i.test(t)) return "a passport-shaped number";
    if (/(password|passcode|\bpin\b|\bcvv\b|\bcvc\b)\s*[:=]?\s*\S/i.test(t)) return "a password or code";
    if (/(\bapt\b\.?|\bunit\b|\bsuite\b|\bflat\b|#)\s*\d/i.test(t)) return "a unit number in an address";
    return null;
  }
  let talking = false;
  async function sendTalk(text) {
    text = (text || "").trim();
    const note = $("#talk-note");
    if (!text || talking || !current) return;
    const nk = neverKept(text);
    if (nk) { note.textContent = "Not sent: this looks like " + nk + ", which the pilot never keeps. Reword it and try again."; return; }
    talking = true; $("#talk-form button").disabled = true; note.textContent = tabsOn ? "The team is thinking…" : "Arlo is thinking…"; paintRail(lastThread, true);
    const { data, error } = await sb.functions.invoke("steward-chat", { body: { trip_id: current.id, text } });
    talking = false; $("#talk-form button").disabled = false; paintRail(lastThread, false);
    if (error) {
      const st = error.context && error.context.status;
      let why = "Arlo couldn't answer just now. Try again in a minute.";
      if (st === 503) why = "The live steward isn't switched on yet. The brief below still works, and the planner reads it when you send the trip.";
      else if (st === 404) why = "Arlo couldn't find this trip. Go back to All trips and open it again.";
      else if (st === 400) why = "That message wasn't sent: it was empty, too long, or looked like a number or code the pilot never keeps. Reword it and try again.";
      else if (st === 403) why = "Only the trip's owner and editors can write here.";
      else if (st === 429) why = "That's today's limit for messages. Try again tomorrow.";
      try { const b = error.context && typeof error.context.json === "function" ? await error.context.clone().json() : null; if (b && typeof b.error === "string" && st !== 400) why = b.error; } catch (_) { /* keep ours */ }
      note.textContent = why;
      return;
    }
    note.textContent = ""; $("#talk-text").value = "";
    await loadThread();
    if (data && data.packing_changed) { await loadItems(); note.textContent = tabsOn ? "Tove updated your Suitcase." : "Tove updated the packing list below."; dotTab("suitcase"); }
    if (data && (data.brief_changed || data.dates_changed)) {
      await loadTrips(); current = trips.find((t) => t.id === current.id) || current;
      const bp = (briefs[current.id] || {}).payload || {};
      fillBrief(bp, !$("#brief button[type=submit]").disabled); paintDocs(bp); paintWallet(bp); paintTicket(); dotTab("trip");
      // Say only what changed (his phone, 11 Nov: "name and dates" when only the name was set).
      const tc = data.title_changed, ds = data.dates_set;
      note.textContent = tc && ds ? "Arlo set the trip's name and dates. Edit trip changes them."
        : ds ? "Arlo set the trip's dates. Edit trip changes them."
        : tc ? "Arlo named the trip. Edit trip changes it."
        : data.dates_changed ? "Arlo updated the trip. Edit trip changes it." : "Arlo updated the brief below.";
    }
  }
  $("#talk-form").addEventListener("submit", (e) => { e.preventDefault(); stopMic(); sendTalk($("#talk-text").value); });

  async function loadItems() {
    const { data, error } = await sb.from("trip_items").select("id, kind, payload, created_by, created_at, updated_at").eq("trip_id", current.id).order("created_at");
    if (error) return flash(explain(error), "bad");
    const ul = $("#item-list"); ul.replaceChildren();
    const notes = (data || []).filter((i) => i.kind !== "brief" && i.kind !== "plan" && i.kind !== "packing");
    paintPacking((data || []).filter((i) => i.kind === "packing").pop() || null);
    const planItem = (data || []).filter((i) => i.kind === "plan").pop();
    currentPlan = planItem ? planItem.payload || {} : null;
    currentPlanAt = planItem ? planItem.created_at : null;
    renderPlan(currentPlan); paintWork(); paintStale();
    // With a plan on the trip, the brief folds under its heading; without one, it stays open.
    $("#brief-wrap").open = !planItem;
    for (const i of notes) {
      const text = (i.payload && (i.payload.text || i.payload.t)) || JSON.stringify(i.payload);
      const li = el("li", {}, el("span", { class: "tag" }, i.kind), el("span", { class: "grow" }, text));
      if (i.created_by === user.id || current.owner === user.id) li.append(" ", el("button", { type: "button", class: "link", onclick: async () => {
        if (!(await confirmBox("Delete this item?"))) return;
        const r = await sb.from("trip_items").delete().eq("id", i.id);
        r.error ? flash(explain(r.error), "bad") : loadItems();
      } }, "Delete"));
      ul.append(li);
    }
    if (!notes.length) ul.append(el("li", { class: "empty" }, "No notes yet. Anything the brief doesn't cover goes here."));
  }
  // ---------- Tove's packing list (store v0.1.9) ----------
  // One list per trip. Tove adds generic items through the steward; the owner and editors tick, add and remove them
  // here with their own sign-in. Each change re-reads the list first and writes it whole, so a tick isn't lost to an
  // older copy (two people ticking at the same moment can still overwrite each other: last write wins).
  let tripCanWrite = false;
  const PACK_ORDER = ["clothing", "footwear", "toiletries", "tech", "gear", "other"];
  const PACK_LABEL = { clothing: "Clothing", footwear: "Footwear", toiletries: "Toiletries", tech: "Tech", gear: "Gear", other: "Other" };
  function paintPacking(item) {
    const sec = $("#packing"); if (!sec) return;
    const items = item && item.payload && Array.isArray(item.payload.items) ? item.payload.items : [];
    sec.hidden = !tabsOn && !item && !tripCanWrite;
    $("#pack-add").hidden = !tripCanWrite;
    const ul = $("#pack-list"); ul.replaceChildren();
    if (!items.length) { ul.append(el("li", { class: "empty" }, "Nothing yet. Ask Tove what to pack, or add your own.")); return; }
    for (const cat of PACK_ORDER) {
      const rows = items.filter((i) => (PACK_ORDER.includes(i.cat) ? i.cat : "other") === cat);
      if (!rows.length) continue;
      ul.append(el("li", { class: "pack-cat" }, PACK_LABEL[cat]));
      for (const i of rows) {
        const box = el("input", { type: "checkbox", "aria-label": "Packed: " + i.name });
        box.checked = !!i.got; box.disabled = !tripCanWrite;
        box.addEventListener("change", () => changePacking((list) => list.map((x) => (x.id === i.id ? Object.assign({}, x, { got: box.checked }) : x))));
        const li = el("li", { class: "pack-item" + (i.got ? " got" : "") }, el("label", {}, box, el("span", { class: "grow" }, i.name)));
        if (i.why) li.append(el("div", { class: "muted small pack-why" }, i.why));
        if (tripCanWrite) li.append(el("button", { type: "button", class: "link small", "aria-label": "Remove " + i.name,
          onclick: () => changePacking((list) => list.filter((x) => x.id !== i.id)) }, "Remove"));
        ul.append(li);
      }
    }
  }
  async function changePacking(fn) {
    const r = await sb.from("trip_items").select("id, payload").eq("trip_id", current.id).eq("kind", "packing").maybeSingle();
    if (r.error) return flash(explain(r.error), "bad");
    const now = new Date().toISOString();
    const items = fn(r.data && r.data.payload && Array.isArray(r.data.payload.items) ? r.data.payload.items : []);
    const payload = { v: 1, items, updated_at: now };
    const w = r.data ? await sb.from("trip_items").update({ payload }).eq("id", r.data.id)
      : await sb.from("trip_items").insert({ trip_id: current.id, kind: "packing", payload });
    if (w.error) flash(explain(w.error), "bad");
    loadItems();
  }
  $("#pack-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, name = f.item.value.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) return;
    const nk = neverKept(name);
    if (nk) return flash("Not added: this looks like " + nk + ", which the pilot never keeps.", "bad");
    const fold = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    f.reset();
    changePacking((list) => list.some((x) => fold(x.name) === fold(name)) ? list
      : list.concat([{ id: "u" + Date.now().toString(36), name, cat: "other", why: "", by: "you", got: false }]));
  });
  $("#item-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const { error } = await sb.from("trip_items").insert({ trip_id: current.id, kind: "note", payload: { text: f.text.value.trim() } });
    if (error) return flash(explain(error), "bad");
    f.reset(); loadItems();
  });

  // ---------- the team at work (docs/plan-format.md, v1.1 progress) ----------
  // Shown only from what the planner wrote. Nothing moves unless an update says someone is working,
  // and an update older than 30 minutes stops the motion and says so.
  let currentPlan = null, currentPlanAt = null, shareLive = false;
  // Fix 4 (D-550): a brief or trip changed after the plan was written makes the plan out of date; say so.
  function isStale(trip, plan, planAt) {
    const opts = plan && Array.isArray(plan.options) ? plan.options : [];
    const at = Date.parse(planAt || ""), br = briefs[trip.id];
    const changed = [br && Date.parse(br.at || ""), Date.parse(trip.updated_at || "")].filter((t) => !isNaN(t));
    return !!((opts.length || planState(plan) === "refused") && !isNaN(at) && changed.some((t) => t > at + 1000));
  }
  function paintStale() {
    const box = $("#plan-stale"); if (!box || !current) return; box.replaceChildren();
    const stale = isStale(current, currentPlan, currentPlanAt);
    box.hidden = !stale;
    if (stale) box.append(el("h4", {}, "This plan is out of date"),
      el("p", {}, "The trip or its brief changed after the plan was written (" + when(currentPlanAt) + "). Send the trip to the planner again for a plan that matches."));
  }
  const STALE_MS = 30 * 60e3;
  const STATES = { queued: "Queued", working: "Working", waiting: "Waiting on you", done: "Done" };
  function when(iso) {
    const t = new Date(iso); if (isNaN(t)) return "";
    return t.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function paintWork() {
    const box = $("#work"); if (!box) return; box.replaceChildren(); box.classList.remove("stale");
    const T = window.TravelTeam; if (!T || !current) return;
    const pr = currentPlan && currentPlan.progress;
    const teams = pr && Array.isArray(pr.teams) ? pr.teams.filter((x) => x && T.TEAM.some((m) => m.key === x.key) && STATES[x.state]) : [];
    const finished = currentPlan && (currentPlan.status === "checked" || currentPlan.status === "refused");
    if (!teams.length || finished) {
      // No update from the planner: say plainly where the trip stands, and show the team without motion.
      const faces = el("span", { class: "crew-faces" });
      for (const m of T.TEAM) { const f = el("span", { class: "face", title: m.name + ", " + m.role }); f.innerHTML = T.svg(m.key); faces.append(f); }
      const line = finished ? (currentPlan.status === "refused" ? "The team has answered: it can't be done as asked. See what could work instead." : "The team has finished this plan.") :
        shareLive ? "Sent to Arlo. The team starts when the planner picks it up, and you'll see who's working here." :
        "Send this trip to the planner (below) to start. You'll see who's working on it here.";
      box.append(el("div", { class: "idle" }, el("div", { class: "crew" }, el("span", { class: "crew-label" }, "Your team"), faces), el("p", { class: "muted small" }, line)));
      return;
    }
    const at = Date.parse(pr.updated_at || "");
    const stale = !isNaN(at) && Date.now() - at > STALE_MS;
    if (stale) box.classList.add("stale");
    const working = teams.filter((x) => x.state === "working").length;
    box.append(el("div", { class: "work-head" }, el("h3", {}, working ? "The team at work" : "The team"),
      el("span", { class: "muted small", role: "status" }, stale ? "No update since " + when(pr.updated_at) + "." :
        (working ? working + " working · " : "") + (isNaN(at) ? "" : "updated " + when(pr.updated_at)))));
    const line = el("div", { class: "work-line", "aria-hidden": "true" });
    for (const x of teams) { const m = T.TEAM.find((y) => y.key === x.key); line.append(el("span", { class: "stop " + x.state }, el("span", { class: "dot" }), m.name)); }
    const rows = el("ul", { class: "work-rows" });
    for (const x of teams) {
      const m = T.TEAM.find((y) => y.key === x.key);
      const f = el("span", { class: "face" }); f.innerHTML = T.svg(m.key);
      const art = el("span", { class: "art" }); art.innerHTML = T.work(m.key, x.state !== "working" || stale);
      const body = el("div", {}, el("div", {}, el("span", { class: "who" }, m.name), " ", el("span", { class: "muted small" }, m.role), el("span", { class: "state" }, STATES[x.state])),
        el("p", { class: "doing" }, String(x.activity || (x.state === "working" ? T.DOING[m.key] : "")).slice(0, 300)));
      if (Number.isInteger(x.done) && Number.isInteger(x.of) && x.of > 0 && x.done >= 0) {
        const meter = el("span", { class: "meter" }, el("span", { class: "fill" }));
        meter.firstChild.style.width = Math.min(100, Math.round(100 * x.done / x.of)) + "%";
        body.append(el("div", { class: "count" }, meter, el("span", { class: "muted small" }, Math.min(x.done, x.of) + " of " + x.of + (x.unit ? " " + String(x.unit).slice(0, 40) : ""))));
      }
      if (x.at && !isNaN(Date.parse(x.at))) body.append(el("span", { class: "muted small" }, "Last: " + when(x.at)));
      rows.append(el("li", { class: x.state }, f, art, body));
    }
    box.append(line, rows);
  }
  setInterval(() => { if (current && !$("#trip-detail").hidden) paintWork(); }, 60e3);

  // ---------- the plan, as the planner wrote it (docs/plan-format.md) ----------
  const SPECIALIST = { rail: "rail", air: "air", stay: "stay", dining: "dining", events: "events", around: "around", impact: "impact", booking: "booking" };
  function face(key, cls) {
    const f = el("span", { class: "face " + (cls || "") }); const T = window.TravelTeam;
    if (T) f.innerHTML = T.svg(key); return f;
  }
  function safeLink(u) { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : null; } catch (e) { return null; } }
  function extLink(u, text, cls) {
    const h = safeLink(u); if (!h) return el("span", { class: "muted" }, text);
    return el("a", { href: h, target: "_blank", rel: "noopener noreferrer", class: cls || "" }, text);
  }
  const num = (x, d) => (typeof x === "number" && isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d || 0 }) : null);
  function renderPlan(p) {
    const box = $("#plan"); box.replaceChildren();
    const state = planState(p);
    if (state === "refused" && p.refusal) {
      // A refusal: what can't be done and by how much, then what could work instead (the counter-proposal).
      box.hidden = false;
      const r = p.refusal;
      box.append(el("div", { class: "plan-head" }, el("h3", {}, "Can't be done as asked"), el("span", { class: "plan-status bad" }, face("critic", "tiny"), "Checked by Margit")),
        el("div", { class: "refusal" }, el("span", { class: "mark" }, "Breaks"), el("div", {},
          el("strong", {}, String(r.rule || "")), r.figure ? el("p", { class: "figure" }, String(r.figure)) : "", r.why ? el("p", {}, String(r.why)) : "")));
      if (p.summary) box.append(el("p", { class: "plan-summary" }, p.summary));
      if (!Array.isArray(p.options) || !p.options.length) { box.append(el("p", { class: "muted" }, "No version of this trip passes the hard rules yet.")); return; }
      box.append(el("h4", {}, "What could work instead"));
    } else if (!p || !Array.isArray(p.options) || !p.options.length) { box.hidden = true; return; }
    box.hidden = false;
    if (state === "breaks") box.append(el("div", { class: "refusal" }, el("span", { class: "mark" }, "Not finished"),
      el("p", {}, "Every option here breaks a hard rule, so this plan doesn't count as finished. The planner owes you a version that passes, or a refusal with what would.")));
    const checked = p.status === "checked" || state === "refused";
    if (state !== "refused") box.append(el("div", { class: "plan-head" },
      el("h3", {}, "Your plan"),
      el("span", { class: "plan-status" + (state === "breaks" ? " bad" : checked ? " checked" : "") }, face(checked || state === "breaks" ? "critic" : "steward", "tiny"),
        state === "breaks" ? "Margit: every option breaks a hard rule" :
        checked ? "Checked by Margit" + (p.inspector && /^\d+ of \d+$/.test(String(p.inspector.score || "")) ? ", " + p.inspector.score : "") : "Draft: Margit hasn't checked it yet")));
    if (p.summary) box.append(el("p", { class: "plan-summary" }, p.summary));
    if (p.written_at) box.append(el("p", { class: "muted small" }, "Written " + fmtDate(String(p.written_at).slice(0, 10)) + " by Arlo and the team."));
    const opts = p.options.slice(0, 4);
    const bar = el("div", { class: "options", role: "tablist", "aria-label": "Ways to do this trip" });
    const body = el("div", { class: "option-body" });
    const show = (i) => {
      for (const [j, b] of Array.from(bar.children).entries()) b.setAttribute("aria-selected", String(i === j));
      body.replaceChildren(optionView(opts[i]));
    };
    opts.forEach((o, i) => bar.append(el("button", { type: "button", role: "tab", onclick: () => show(i) },
      el("span", { class: "platform" }, String(o.id || String.fromCharCode(65 + i)).slice(0, 2)), el("span", {}, o.name || "Option " + (i + 1)))));
    box.append(bar, body); show(0);
    const gaps = (Array.isArray(p.gaps) ? p.gaps : []).filter(Boolean);
    if (gaps.length) box.append(el("h4", {}, "Still open"), el("ul", { class: "gaps small" }, ...gaps.map((g) => el("li", {}, String(g)))));
    // v1.2: how the inspector checked it sits behind a tap; the verdict stays in the header.
    if (p.inspector && p.inspector.note) box.append(el("details", { class: "how inspector-how" }, el("summary", {}, "How Margit checked it"),
      el("p", { class: "inspector-note" }, face("critic", "tiny"), String(p.inspector.note))));
  }
  // The trip line (D-557, S2): the option's tentpoles drawn as a rail line. Stations are where the trip stops
  // (with the stay there), track is each train or flight between them, in day order. Built only from the plan's
  // own parts; a part whose title doesn't name its ends is shown by its title. Flights read dashed.
  // Stop names come from a part's title: "… · A → B", or "A to B" when both ends read as place names (not
  // "Return to Rome"). Anything else is shown by its title, never guessed.
  const NOT_PLACE = /^(return|back|day|go|going|trip|travel|head|on|then)\b/i;
  function legEnds(title) {
    const t = String(title || ""), seg = t.includes(" · ") ? t.slice(t.lastIndexOf(" · ") + 3) : t;
    let m = seg.split(/\s*→\s*/);
    if (m.length !== 2) { m = seg.split(/\s+to\s+/); if (m.length !== 2 || NOT_PLACE.test(m[0]) || !/^\p{Lu}/u.test(m[0]) || !/^\p{Lu}/u.test(m[1])) return null; }
    return m[0].trim() && m[1].trim() ? [m[0].trim(), m[1].trim()] : null;
  }
  // A stop's name with its city layer (S3): the city's colours and a drawing, when the city is one we've drawn.
  function stopName(name) {
    const span = el("span", { class: "stop-name" }, name), C = window.CityLayers, key = C && C.cityOf(name);
    if (key) { const lm = C.landmark(key), sp = C.stripe(key); if (lm) span.append(lm); if (sp) span.append(sp); span.title = C.CITIES[key].label; }
    return span;
  }
  // A stay's label: its name, skipping a leading date part ("Fri 4 Dec · …").
  const DATEISH = /^(day \d|mon|tue|wed|thu|fri|sat|sun)\b/i;
  function stayLabel(title) { const parts = String(title || "").split(" · "); return parts.find((p) => !DATEISH.test(p.trim())) || parts[0]; }
  // The trip line (S2), after the review of 10 Nov: stays sit at a stop only when the parts carry days (stays
  // before the first move at the start); nights shown only as the stay's own words; a broken hard rule named once
  // on the line, never guessed onto a segment; a change of station between two moves drawn as "across town".
  function tripLine(o, cls) {
    const legs = (Array.isArray(o.legs) ? o.legs : []).map((g, i) => ({ g, i, day: Number(g.day) || 0 }));
    const moves = legs.filter((x) => x.g.by === "rail" || x.g.by === "air").sort((a, b) => a.day - b.day || a.i - b.i);
    if (!moves.length) return null;
    const dated = legs.every((x) => x.day > 0);
    const stays = legs.filter((x) => x.g.by === "stay");
    const ol = el("ol", { class: "trip-line " + cls, "aria-label": "The trip as a line: stops and the trains or flights between them" });
    const broken = (Array.isArray(o.tier_a) ? o.tier_a : []).filter((r) => r && r.ok === false);
    if (broken.length) ol.append(el("li", { class: "line-warn small" }, el("strong", {}, "Breaks a hard rule: "), broken.map((r) => String(r.rule || "") + (r.figure ? " (" + String(r.figure) + ")" : "")).join("; ")));
    const stayAt = (from, to) => dated ? stays.filter((s) => s.day >= from && (to == null || s.day < to)) : [];
    const stopLi = (name, here, extra) => {
      const li = el("li", { class: "stop" + (extra ? " " + extra : "") }, el("span", { class: "dot", "aria-hidden": "true" }), stopName(name));
      if (here.length) li.append(el("span", { class: "stop-stay small" }, here.map((s) => stayLabel(s.g.title)).join("; ")));
      return li;
    };
    const first = legEnds(moves[0].g.title);
    ol.append(stopLi(first ? first[0] : "Start", stayAt(-Infinity, moves[0].day), "start"));
    let prev = first ? first[0] : null;
    moves.forEach((x, k) => {
      const ends = legEnds(x.g.title), pts = strs(x.g.points, 1), next = moves[k + 1];
      if (k > 0 && ends && prev && ends[0] !== prev) {
        ol.append(el("li", { class: "seg local" }, el("span", { class: "seg-mode" }, "Across town"), el("span", { class: "seg-what small" }, "from " + prev + " to " + ends[0])));
        ol.append(stopLi(ends[0], [], ""));
      }
      ol.append(el("li", { class: "seg " + (x.g.by === "air" ? "air" : "rail") },
        el("span", { class: "seg-mode" }, x.g.by === "air" ? "Flight" : "Train"),
        el("span", { class: "seg-what small" }, [x.day ? "Day " + x.day : "", pts[0] || (ends ? "" : String(x.g.title || ""))].filter(Boolean).join(" · "))));
      const name = ends ? ends[1] : "Stop " + (k + 1);
      ol.append(stopLi(name, stayAt(x.day, next ? next.day : null), k === moves.length - 1 ? "end" : ""));
      prev = ends ? ends[1] : null;
    });
    return ol;
  }
  function optionView(o) {
    const v = el("div", { class: "option" });
    if (o.tagline) v.append(el("p", { class: "tagline" }, o.tagline));
    const bp = current ? (briefs[current.id] || {}).payload || {} : {};
    const line = tripLine(o, current ? livery(current.id, bp.country) : "lv-it");
    if (line) v.append(el("h4", {}, "The line"), line);
    const m = el("div", { class: "metrics" });
    if (num(o.nights) !== null) m.append(el("div", { class: "metric" }, el("span", { class: "big" }, num(o.nights)), el("span", { class: "small muted" }, o.nights === 1 ? "night" : "nights")));
    if (num(o.carbon_kg_pppd, 1) !== null) {
      const lim = typeof o.carbon_limit === "number" && o.carbon_limit > 0 ? o.carbon_limit : null;
      const meter = el("span", { class: "meter" + (lim && o.carbon_kg_pppd > lim ? " over" : "") }, el("span", { class: "fill" }));
      // CSSOM, not a style attribute: the page's CSP allows the first and refuses the second.
      if (lim) meter.firstChild.style.width = Math.min(100, Math.round(100 * o.carbon_kg_pppd / lim)) + "%";
      m.append(el("div", { class: "metric" }, el("span", { class: "big" }, num(o.carbon_kg_pppd, 1) + " kg"),
        el("span", { class: "small muted" }, "carbon per person per day" + (lim ? ", limit " + num(lim) : "")), lim ? meter : ""));
    }
    if (o.cost && num(o.cost.amount) !== null) m.append(el("div", { class: "metric" }, el("span", { class: "big" }, (o.cost.currency || "") + " " + num(o.cost.amount)), el("span", { class: "small muted" }, o.cost.basis || "")));
    v.append(m);
    const ta = (Array.isArray(o.tier_a) ? o.tier_a : []);
    if (ta.length) v.append(el("h4", {}, "The hard rules"), el("ul", { class: "tier-a small" }, ...ta.map((r) =>
      el("li", { class: r.ok ? "ok" : "bad" }, el("span", { class: "mark" }, r.ok ? "Passes" : "Breaks"), el("span", { class: "grow" }, String(r.rule || "")), r.figure ? el("span", { class: "muted fig" }, String(r.figure)) : ""))));
    const tr = (Array.isArray(o.tradeoffs) ? o.tradeoffs : []).filter(Boolean);
    if (tr.length) v.append(el("h4", {}, "What you trade"), el("ul", { class: "tradeoffs small" }, ...tr.map((t) => el("li", {}, String(t)))));
    const legs = (Array.isArray(o.legs) ? o.legs : []);
    if (legs.length) {
      const ul = el("ol", { class: "legs" });
      for (const g of legs) {
        const key = SPECIALIST[g.by] || "steward";
        const T = window.TravelTeam, who = T ? (T.TEAM.find((x) => x.key === key) || {}).name : "";
        const li = el("li", {}, face(key, "leg-face"), el("div", { class: "leg-body" },
          el("div", { class: "leg-top" }, g.day ? el("span", { class: "day" }, "Day " + g.day) : "", el("span", { class: "leg-title" }, String(g.title || "")), g.price ? el("span", { class: "price" }, String(g.price)) : ""),
          ...legBody(g),
          el("div", { class: "leg-foot" }, who ? el("span", { class: "muted small" }, "From " + who) : "",
            g.book && g.book.url ? extLink(g.book.url, String(g.book.label || "Book on the seller's site"), "book") : ""),
          legHow(g)));
        ul.append(li);
      }
      v.append(el("h4", {}, "Day by day"), ul);
    }
    return v;
  }

  // v1.2 (D-555): a part reads as a few short points; the long detail, the method and the sources sit behind
  // "How we know". A v1.1 plan (no points) keeps its detail on the card, in smaller text.
  const strs = (x, n) => (Array.isArray(x) ? x : x ? [x] : []).filter((s) => typeof s === "string" && s.trim()).slice(0, n);
  function legBody(g) {
    const pts = strs(g.points, 4);
    if (pts.length) return [el("ul", { class: "leg-points" }, ...pts.map((t) => el("li", {}, t)))];
    return g.detail ? [el("p", { class: "leg-detail small" }, String(g.detail))] : [];
  }
  function legHow(g) {
    const pts = strs(g.points, 4), how = strs(g.how, 6), src = (Array.isArray(g.sources) ? g.sources : []).slice(0, 4);
    const paras = [...(pts.length && g.detail ? [String(g.detail)] : []), ...how];
    if (!paras.length && !src.length) return "";
    return el("details", { class: "how" }, el("summary", {}, "How we know"),
      ...paras.map((t) => el("p", {}, t)),
      src.length ? el("ul", { class: "how-sources" }, ...src.map((s) => el("li", {}, extLink(s.url, String(s.title || "Source"), "source"),
        s.tier ? el("span", { class: "muted" }, " · " + String(s.tier)) : ""))) : "");
  }

  // Fix 5 (D-550): removing a traveler takes that one id off the owner's briefs. Each brief is re-read just
  // before the write and only its `who` changes, so a co-editor's other edits are kept (review H1). Ids the
  // owner can't see (an editor's travelers) are never touched (review M1).
  async function dropFromBriefs(travelerId) {
    for (const t of trips.filter((x) => x.owner === user.id && briefs[x.id])) {
      const cur = await sb.from("trip_items").select("id, payload").eq("id", briefs[t.id].id).maybeSingle();
      if (cur.error || !cur.data) continue;
      const p = cur.data.payload || {};
      const inParts = p.parts && typeof p.parts === "object" && travelerId in p.parts;
      if (!(Array.isArray(p.who) && p.who.includes(travelerId)) && !inParts) continue;
      const parts = inParts ? Object.fromEntries(Object.entries(p.parts).filter(([k]) => k !== travelerId)) : p.parts;
      const payload = Object.assign({}, p, { who: (p.who || []).filter((w) => w !== travelerId), parts: parts && Object.keys(parts).length ? parts : null });
      const w = await sb.from("trip_items").update({ payload }).eq("id", cur.data.id);
      if (w.error) { flash("Couldn't update the brief of “" + t.title + "”: " + explain(w.error), "bad"); continue; }
      briefs[t.id].payload = payload;
    }
    if (current && briefs[current.id]) { fillBrief(briefs[current.id].payload, !$("#brief button[type=submit]").disabled); paintDocs(briefs[current.id].payload); }
  }

  // ---------- documents for a trip abroad: a reminder, never a blocker ----------
  // Abroad means the brief's main country differs from a ticked traveler's nationality. A traveler with no
  // nationality, or no passport expiry date when abroad, gets a line saying what to add.
  const andList = (xs) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
  function countriesOf(p) { return [...new Set([p && p.country, ...((p && Array.isArray(p.also)) ? p.also : [])].filter(Boolean))]; }
  function paintDocs(p) {
    const box = $("#trip-docs"); if (!box) return; box.replaceChildren();
    const cs = countriesOf(p), going = new Set(Array.isArray(p && p.who) ? p.who : []);
    // Travelers who need the same thing are named together, one line per need (D-550).
    const need = {};
    if (cs.length) for (const t of travelerRows.filter((x) => going.has(x.id))) {
      let key = null;
      if (!t.nationality) key = "nat|" + cs.join(",");
      else { const abroad = cs.filter((c) => c !== t.nationality); if (abroad.length && !t.passport_expires) key = "pp|" + abroad.join(","); }
      if (key) (need[key] = need[key] || []).push(t.first_name);
    }
    const lines = Object.entries(need).map(([k, who]) => {
      const [kind, list] = k.split("|"), names = andList(list.split(",").map(countryName));
      return kind === "nat" ? andList(who) + ": add " + (who.length > 1 ? "nationalities" : "a nationality") + ", so the planner can check the entry rules for " + names + "."
        : andList(who) + ": add " + (who.length > 1 ? "passport expiry dates" : "a passport expiry date") + ". " + names + " " + (list.includes(",") ? "check" : "checks") + " how long a passport must stay valid.";
    });
    box.hidden = !lines.length;
    if (lines.length) box.append(el("h4", {}, "Before you go abroad"), el("ul", {}, ...lines.map((x) => el("li", {}, x))), el("p", { class: "muted small" }, "Add these on the Travelers tab. The planner checks the entry rules for each traveler once the dates are set."));
  }

  // ---------- the trip brief ----------
  (function fillCountries() {
    const sel = $("#brief select[name=country]");
    const opts = COUNTRY_CODES.map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1]));
    for (const [c, n] of opts) sel.append(el("option", { value: c }, n));
  })();
  function showDateParts() {
    const m = ($("#brief input[name=date_mode]:checked") || {}).value;
    // An event can have flexible days around it too (D-551; found in the test-trip runs, N5).
    $("#brief-flex").hidden = m !== "flexible" && m !== "event"; $("#brief-event").hidden = m !== "event";
    $("#flex-label").textContent = m === "event" ? "Days either side of the event, if flexible" : "Days either way";
  }
  for (const r of $$("#brief input[name=date_mode]")) r.addEventListener("change", showDateParts);
  function alsoRow(code) {
    const sel = el("select", { name: "also", "aria-label": "Also visiting" }, el("option", { value: "" }, "Choose a country"));
    for (const o of $("#brief select[name=country]").options) if (o.value) sel.append(el("option", { value: o.value }, o.textContent));
    sel.value = code || "";
    const row = el("div", { class: "also-row" }, sel, el("button", { type: "button", class: "link", "aria-label": "Remove this country", onclick: () => { row.remove(); $("#brief-also-add").hidden = false; $("#brief-also-add").focus(); } }, "Remove"));
    $("#brief-also-list").append(row);
    $("#brief-also-add").hidden = $$("#brief-also-list select").length >= 4;
  }
  $("#brief-also-add").addEventListener("click", () => alsoRow(""));
  // Kind of trip (his request, 10 Nov 00:45 ET): round trip, multi-city, one way or open-ended. Guessed from
  // the places until he picks one; one way is never guessed (a single place reads as a round trip).
  let shapeBy = "auto";
  const SHAPE_WORD = { round: "a round trip", multi: "multi-city", oneway: "one way", open: "open-ended" };
  function shapeNow() { const r = $("#brief input[name=shape]:checked"); return r ? r.value : null; }
  function guessShape() {
    const f = $("#brief"), n = f.places.value.split("\n").map((s) => s.trim()).filter(Boolean).length;
    return n >= 2 ? "multi" : n === 1 ? "round" : (f.country.value || f.from.value.trim()) ? null : "open";
  }
  function setShape(v, by) {
    shapeBy = by;
    for (const r of $$("#brief input[name=shape]")) r.checked = r.value === v;
    $("#shape-note").textContent = !v ? "" : by === "auto" ? "Guessed " + SHAPE_WORD[v] + " from your places. Pick another if that's wrong." : "";
  }
  function autoShape() { if (shapeBy === "auto") setShape(guessShape(), "auto"); }
  for (const r of $$("#brief input[name=shape]")) r.addEventListener("change", () => setShape(r.value, "you"));
  for (const s of ["textarea[name=places]", "input[name=from]", "select[name=country]"]) $("#brief " + s).addEventListener("input", autoShape);
  // City suggestions (his phone test, D-554): a built-in list (cities.js), no third-party data. US cities read
  // "Boston, MA"; others "Paris, France". Adding a listed city fills the main country, or adds it under
  // "Also visiting" (up to four) when the trip already has another main country.
  const CITY_CC = new Map();
  (function fillCities() {
    const dl = $("#city-list"); if (!dl) return;
    for (const c of (window.PILOT_CITIES || [])) {
      const label = c.cc === "US" ? c.city + ", " + c.region : c.city + ", " + countryName(c.cc);
      CITY_CC.set(label.toLowerCase(), c.cc);
      dl.append(el("option", { value: label }));
    }
  })();
  function addPlace() {
    const inp = $("#place-add"), v = inp.value.trim(), note = $("#place-add-note");
    if (!v) return;
    const f = $("#brief"), lines = f.places.value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length >= 12) { note.textContent = "Twelve places is the most a brief holds."; return; }
    if (!lines.some((x) => x.toLowerCase() === v.toLowerCase())) lines.push(v);
    f.places.value = lines.join("\n"); autoShape(); inp.value = ""; note.textContent = "Added " + v + ".";
    const cc = CITY_CC.get(v.toLowerCase());
    if (cc && [...f.country.options].some((o) => o.value === cc)) {
      const also = $$("#brief-also-list select").map((x) => x.value);
      if (!f.country.value) { f.country.value = cc; note.textContent += " Main country set to " + countryName(cc) + "."; }
      else if (f.country.value !== cc && !also.includes(cc)) {
        if (also.length < 4) { alsoRow(cc); note.textContent += " " + countryName(cc) + " added under Also visiting."; }
        else note.textContent += " Four other countries is the most a brief holds, so " + countryName(cc) + " wasn't added.";
      }
    }
    inp.focus();
  }
  $("#place-add-btn").addEventListener("click", addPlace);
  $("#place-add").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addPlace(); } });
  function fillBrief(p, canWrite) {
    const f = $("#brief");
    $("#brief-also-list").replaceChildren(); $("#brief-also-add").hidden = false;
    for (const c of (Array.isArray(p.also) ? p.also : [])) alsoRow(c);
    f.from.value = p.from || ""; f.country.value = p.country || ""; f.places.value = placesOf(p).join("\n");
    for (const r of $$("#brief input[name=date_mode]")) r.checked = r.value === (p.date_mode || "");
    f.flex_days.value = p.flex_days || ""; setShape(p.shape || (p.one_way ? "oneway" : ""), p.shape_by || (p.one_way ? "you" : "auto")); f.event_name.value = (p.event && p.event.name) || ""; f.event_date.value = (p.event && p.event.date) || "";
    for (const r of $$("#brief input[name=purpose]")) r.checked = r.value === (p.purpose || "");
    f.must.value = p.must || ""; f.avoid.value = p.avoid || "";
    const who = $("#brief-who"); who.replaceChildren(el("legend", {}, "Who's going"));
    const going = new Set(Array.isArray(p.who) ? p.who : []);   // a removed traveler's id simply finds no box (fix 5)
    const parts = (p.parts && typeof p.parts === "object") ? p.parts : {};
    for (const t of travelerRows) {
      // Joining for part of the trip (D-551; test-trip run N3): a tick and two dates, shown once the person is going.
      const pt = parts[t.id] || null;
      const box = Object.assign(el("input", { type: "checkbox", name: "who", value: t.id }), { checked: going.has(t.id) });
      const full = [t.first_name, t.last_name].filter(Boolean).join(" ");
      const partBox = Object.assign(el("input", { type: "checkbox", name: "part", value: t.id, "aria-label": full + ": part of the trip only" }), { checked: !!pt });
      const from = Object.assign(el("input", { type: "date", name: "part_from", "aria-label": full + " joins on" }), { value: (pt && pt.from) || "" });
      const to = Object.assign(el("input", { type: "date", name: "part_to", "aria-label": full + " leaves on" }), { value: (pt && pt.to) || "" });
      for (const d of [from, to]) { if (current.date_from) d.min = current.date_from; if (current.date_to) d.max = current.date_to; }
      const dates = el("span", { class: "part-dates" }, "from ", from, " to ", to);
      const partLab = el("label", { class: "part" }, partBox, " part of the trip");
      const row = el("div", { class: "who-row", "data-id": t.id, "data-name": full }, el("label", {}, box, " " + [t.first_name, t.last_name].filter(Boolean).join(" ")), partLab, dates);
      const sync = () => { partLab.hidden = !box.checked; dates.hidden = !box.checked || !partBox.checked; };
      box.addEventListener("change", sync); partBox.addEventListener("change", sync); sync();
      who.append(row);
    }
    if (!travelerRows.length) who.append(el("span", { class: "muted small" }, "Add the people going on the Travelers tab, then tick them here."));
    for (const x of f.elements) x.disabled = !canWrite;
    showDateParts();
  }
  // Part-of-trip dates, checked before saving (review L5): both dates, in order, inside the trip's dates.
  function partsOf() {
    const out = {}, lo = current.date_from || "", hi = current.date_to || "";
    for (const row of $$("#brief-who .who-row")) {
      const id = row.dataset.id, q = (n) => row.querySelector("input[name=" + n + "]"), name = row.dataset.name;
      if (!q("who").checked || !q("part").checked) continue;
      const from = q("part_from").value || null, to = q("part_to").value || null;
      if (!from || !to) throw new Error("Add both dates for " + name + ", or untick 'part of the trip'.");
      if (from > to) throw new Error(name + "'s dates are in the wrong order.");
      if ((lo && from < lo) || (hi && to > hi)) throw new Error(name + "'s dates fall outside the trip's dates.");
      out[id] = { from, to };
    }
    return out;
  }
  $("#brief").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, mode = ($("#brief input[name=date_mode]:checked") || {}).value || null;
    let parts;
    try { parts = partsOf(); } catch (err) { return flash("Not saved: " + err.message, "bad"); }
    // A co-editor sees only their own travelers: keep the owner's entries they can't see (review M3).
    const prev = (briefs[current.id] || {}).payload || {}, shown = new Set(travelerRows.map((x) => x.id));
    const keepUnseen = current.owner !== user.id;
    const who = [...$$("#brief input[name=who]:checked").map((x) => x.value), ...(keepUnseen && Array.isArray(prev.who) ? prev.who.filter((w) => !shown.has(w)) : [])];
    if (keepUnseen && prev.parts && typeof prev.parts === "object") for (const [k, v] of Object.entries(prev.parts)) if (!shown.has(k)) parts[k] = v;
    const payload = {
      v: 1, from: f.from.value.trim() || null, country: f.country.value || null,
      also: [...new Set($$("#brief-also-list select").map((x) => x.value).filter((c) => c && c !== f.country.value))].slice(0, 4),
      places: f.places.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12),
      date_mode: mode,
      flex_days: (mode === "flexible" || mode === "event") && f.flex_days.value ? Math.max(1, Math.min(30, Number(f.flex_days.value))) : null,
      shape: shapeNow(), shape_by: shapeBy,
      one_way: shapeNow() === "oneway" || null,
      parts: Object.keys(parts).length ? parts : null,
      event: mode === "event" && (f.event_name.value.trim() || f.event_date.value) ? { name: f.event_name.value.trim() || null, date: f.event_date.value || null } : null,
      who,
      purpose: ($("#brief input[name=purpose]:checked") || {}).value || null,
      must: f.must.value.trim() || null, avoid: f.avoid.value.trim() || null
    };
    const have = briefs[current.id];
    const r = have
      ? await sb.from("trip_items").update({ payload, updated_at: new Date().toISOString() }).eq("id", have.id)
      : await sb.from("trip_items").insert({ trip_id: current.id, kind: "brief", payload });
    if (r.error) return flash(explain(r.error), "bad");
    flash("Brief saved.", "ok"); paintDocs(payload);
    await loadTrips();
    paintTicket(); paintStale();
  });

  // ---------- share with the planner (link (a)) ----------
  async function loadShare() {
    const s = await sb.from("planner_shares").select("id, shared_at, revoked_at").eq("trip_id", current.id).is("revoked_at", null);
    const live = !s.error && (s.data || []).length > 0;
    shareLive = live; paintWork();
    $("#share-state").textContent = live ? "Sent to the planner on " + fmtDate(s.data[0].shared_at.slice(0, 10)) + ". The planner reads it here: nothing to download or email." : "Not sent yet.";
    $("#share-on").hidden = live; $("#share-off").hidden = !live;
    const r = await sb.from("planner_reads").select("how, read_at").eq("trip_id", current.id).order("read_at", { ascending: false });
    const ul = $("#read-log"); ul.replaceChildren();
    for (const x of (r.data || [])) ul.append(el("li", {}, x.read_at.replace("T", " ").slice(0, 16) + " UTC: " + (READ_HOW[x.how] || x.how)));
    if (!(r.data || []).length) ul.append(el("li", { class: "empty" }, live ? "Not read yet." : "Nothing read yet."));
  }
  // The planner reads a shared trip in the store (D-553): sending is the share, with no file to download or email.
  const READ_HOW = { store: "read by the planner", export: "file made for the planner" };
  // Before sending, say what's missing (his phone test, D-554): no brief, no one ticked, no preferences.
  function sendGaps() {
    const bp = (briefs[current.id] || {}).payload;
    const gaps = [];
    if (!bp) gaps.push("the trip brief isn't saved");
    else {
      if (!Array.isArray(bp.who) || !bp.who.length) gaps.push("no one is ticked as going");
      if (!(bp.places || []).length && !bp.country) gaps.push("the brief names no place or country");
    }
    if (!ready.prefSections.size) gaps.push("you have no preferences saved");
    return gaps;
  }
  $("#share-on").addEventListener("click", async () => {
    const gaps = shareLive ? [] : sendGaps();
    if (gaps.length && !(await confirmBox("Before you send: " + gaps.join("; ") + ". The planner can still start, but the plan will be more general. Send anyway?", false, "Send anyway"))) return;
    if (!shareLive) {   // never record a second live share (review L7)
      const { error } = await sb.from("planner_shares").insert({ trip_id: current.id });
      if (error) return flash(explain(error), "bad");
    }
    flash("Sent. The planner reads it here, and you'll see the team at work above.", "ok");
    loadShare();
  });
  $("#share-off").addEventListener("click", async () => {
    const { error } = await sb.from("planner_shares").update({ revoked_at: new Date().toISOString() }).eq("trip_id", current.id).is("revoked_at", null);
    error ? flash(explain(error), "bad") : loadShare();
  });
  $("#trip-delete").addEventListener("click", async () => {
    if (!(await confirmBox("Delete “" + current.title + "” and everything on it? This can't be undone.", true))) return;
    const { error } = await sb.from("trips").delete().eq("id", current.id);
    if (error) return flash(explain(error), "bad");
    $("#trip-back").click(); flash("Trip deleted.", "ok");
  });

  // ---------- your data ----------
  async function exportMine() {
    const { data, error } = await sb.rpc("pilot_export_my_data");
    if (error) return flash(explain(error), "bad");
    // The sign-in record lives in Supabase's sign-in service, not the pilot's tables: add it from the session.
    const s = user ? { email: user.email || null, user_metadata: user.user_metadata || {},
      identities: (user.identities || []).map((i) => ({ provider: i.provider, identity_data: i.identity_data || {}, created_at: i.created_at || null })) } : null;
    download("my-pilot-data.json", Object.assign({}, data, { sign_in: s }));
  }
  async function deleteMine() {
    if (!(await confirmBox("Delete all your data from the pilot? This can't be undone.", true))) return;
    const { error } = await sb.rpc("pilot_delete_my_data");
    if (error) return flash(explain(error), "bad");
    store(PENDING);
    await sb.auth.signOut();
    flash("Your data is deleted. To close your sign-in account too, ask " + (CFG.OPERATOR_NAME || "the operator") + ".", "ok");
  }
  $("#export-btn").addEventListener("click", exportMine);
  $("#delete-btn").addEventListener("click", deleteMine);
  $("#nc-export").addEventListener("click", exportMine);
  $("#nc-delete").addEventListener("click", deleteMine);
  $("#signout-btn").addEventListener("click", () => sb.auth.signOut());
  // Sign out from the header (his phone, 10 Nov): then reload, which also picks up a new release without a hard reload.
  $("#head-signout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
  $("#nc-signout").addEventListener("click", () => sb.auth.signOut());

  // ---------- start ----------
  // A Google sign-in that failed comes back with an error; an account not on the list comes back as signup_disabled.
  const q = new URLSearchParams(location.search + "&" + location.hash.replace(/^#/, ""));
  const linkError = q.get("error_description") || q.get("error");
  let sawSession = false;
  if (linkError) {
    store(PENDING);
    const notListed = q.get("error_code") === "signup_disabled" || /signups? not allowed/i.test(linkError);
    flash(notListed
      ? "That Google account's email isn't on the pilot's list. Sign in with the Google account for the email you gave " + (CFG.OPERATOR_NAME || "the operator") + ", or ask to be added."
      : "Sign-in with Google didn't finish (" + linkError.replace(/\+/g, " ") + "). Please try again.", "bad");
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }
  // Every event goes through onSession, which renders once per user. Token refreshes are skipped.
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "TOKEN_REFRESHED") return;
    if (session) sawSession = true;
    setTimeout(() => onSession(session), 0);
  });
  setTimeout(() => {
    if (!sawSession && q.get("code") && !linkError) flash("Sign-in with Google couldn't finish here. Please start again from this page, in this browser.", "bad");
  }, 3000);
})();
