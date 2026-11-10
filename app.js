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
  function confirmBox(text, lever) {
    return new Promise((resolve) => {
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
    if (!user) { showConsent(false); $("#who").textContent = ""; $("#who-badge").hidden = true; return; }
    $("#who").textContent = user.email || ""; $("#who-badge").hidden = false;
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
        route(t.date_from, t.date_to, [p.one_way ? "one way, no return" : "", t.owner !== user.id ? "shared with you" : ""].filter(Boolean).join(", ")))));
    }
    if (!trips.length) ul.append(el("li", { class: "empty" }, "No trips yet. Add your first below: a title is enough to start, and dates help the planner."));
  }
  $("#trip-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const row = { title: f.title.value.trim(), date_from: f.date_from.value || null, date_to: f.date_to.value || null };
    const { error } = await sb.from("trips").insert(row);
    if (error) return flash(explain(error), "bad");
    f.reset(); flash("Trip added.", "ok"); loadTrips();
  });
  $("#trip-back").addEventListener("click", () => { current = null; $("#trip-detail").hidden = true; $("#trip-list-wrap").hidden = false; loadTrips(); });

  function paintTicket() {
    const bp = (briefs[current.id] || {}).payload || {};
    $("#trip-title").textContent = current.title;
    $("#trip-ticket").className = "ticket " + livery(current.id, bp.country);
    $("#trip-stations").replaceWith(Object.assign(stations(bp), { id: "trip-stations" }));
    // One way: the trip's end date is the last day there, not a return (review L6).
    $("#trip-dates").replaceWith(Object.assign(route(current.date_from, current.date_to, bp.one_way ? "one way, no return" : ""), { id: "trip-dates" }));
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
    for (const s of ["#share-on", "#share-off", "#share-file", "#trip-delete"]) $(s).disabled = !mine;
    let canWrite = mine;
    if (!mine) { const m = await sb.from("trip_members").select("role").eq("trip_id", current.id).eq("user_id", user.id).maybeSingle(); canWrite = !!(m.data && m.data.role !== "viewer"); }
    $("#item-new").hidden = !canWrite;
    fillBrief(bp, canWrite); paintDocs(bp);
    await Promise.all([loadItems(), loadShare()]);
  }
  async function loadItems() {
    const { data, error } = await sb.from("trip_items").select("id, kind, payload, created_by, created_at, updated_at").eq("trip_id", current.id).order("created_at");
    if (error) return flash(explain(error), "bad");
    const ul = $("#item-list"); ul.replaceChildren();
    const notes = (data || []).filter((i) => i.kind !== "brief" && i.kind !== "plan");
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
        shareLive ? "Queued with Arlo. The team starts when the planner picks it up, and you'll see who's working here." :
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
        checked ? "Checked by Margit" + (p.inspector && p.inspector.score ? ", " + p.inspector.score : "") : "Draft: Margit hasn't checked it yet")));
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
    if (gaps.length) box.append(el("h4", {}, "Still open"), el("ul", { class: "gaps" }, ...gaps.map((g) => el("li", {}, String(g)))));
    if (p.inspector && p.inspector.note) box.append(el("p", { class: "inspector-note" }, face("critic", "tiny"), String(p.inspector.note)));
  }
  function optionView(o) {
    const v = el("div", { class: "option" });
    if (o.tagline) v.append(el("p", { class: "tagline" }, o.tagline));
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
    if (ta.length) v.append(el("h4", {}, "The hard rules"), el("ul", { class: "tier-a" }, ...ta.map((r) =>
      el("li", { class: r.ok ? "ok" : "bad" }, el("span", { class: "mark" }, r.ok ? "Passes" : "Breaks"), el("span", { class: "grow" }, String(r.rule || "")), r.figure ? el("span", { class: "muted" }, String(r.figure)) : ""))));
    const tr = (Array.isArray(o.tradeoffs) ? o.tradeoffs : []).filter(Boolean);
    if (tr.length) v.append(el("h4", {}, "What you trade"), el("ul", { class: "tradeoffs" }, ...tr.map((t) => el("li", {}, String(t)))));
    const legs = (Array.isArray(o.legs) ? o.legs : []);
    if (legs.length) {
      const ul = el("ol", { class: "legs" });
      for (const g of legs) {
        const key = SPECIALIST[g.by] || "steward";
        const T = window.TravelTeam, who = T ? (T.TEAM.find((x) => x.key === key) || {}).name : "";
        const li = el("li", {}, face(key, "leg-face"), el("div", { class: "leg-body" },
          el("div", { class: "leg-top" }, g.day ? el("span", { class: "day" }, "Day " + g.day) : "", el("span", { class: "leg-title" }, String(g.title || "")), g.price ? el("span", { class: "price" }, String(g.price)) : ""),
          g.detail ? el("p", { class: "leg-detail" }, String(g.detail)) : "",
          el("div", { class: "leg-foot" }, who ? el("span", { class: "muted small" }, "From " + who) : "",
            g.book && g.book.url ? extLink(g.book.url, String(g.book.label || "Book on the seller's site"), "book") : "",
            ...(Array.isArray(g.sources) ? g.sources : []).slice(0, 4).map((s) => extLink(s.url, String(s.title || "Source") + (s.tier ? " (" + s.tier + ")" : ""), "source")))));
        ul.append(li);
      }
      v.append(el("h4", {}, "Day by day"), ul);
    }
    return v;
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
  function fillBrief(p, canWrite) {
    const f = $("#brief");
    $("#brief-also-list").replaceChildren(); $("#brief-also-add").hidden = false;
    for (const c of (Array.isArray(p.also) ? p.also : [])) alsoRow(c);
    f.from.value = p.from || ""; f.country.value = p.country || ""; f.places.value = placesOf(p).join("\n");
    for (const r of $$("#brief input[name=date_mode]")) r.checked = r.value === (p.date_mode || "");
    f.flex_days.value = p.flex_days || ""; f.one_way.checked = !!p.one_way; f.event_name.value = (p.event && p.event.name) || ""; f.event_date.value = (p.event && p.event.date) || "";
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
      one_way: f.one_way.checked || null,
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
    $("#share-state").textContent = live ? "Sent to the planner on " + fmtDate(s.data[0].shared_at.slice(0, 10)) + ". If you didn't email the file yet, make it again below." : "Not sent yet.";
    $("#share-on").hidden = live; $("#share-file").hidden = !live; $("#share-off").hidden = !live;
    const r = await sb.from("planner_reads").select("how, read_at").eq("trip_id", current.id).order("read_at", { ascending: false });
    const ul = $("#read-log"); ul.replaceChildren();
    for (const x of (r.data || [])) ul.append(el("li", {}, x.read_at.replace("T", " ").slice(0, 16) + " UTC: " + (x.how === "export" ? "file made for the planner" : x.how)));
    if (!(r.data || []).length) ul.append(el("li", { class: "empty" }, "No files made yet."));
  }
  // One step: record the share, then make the file to email (D-550, fix 3).
  async function makeFile() {
    const { data, error } = await sb.rpc("pilot_export_trip", { t: current.id });
    if (error) { loadShare(); return flash(explain(error), "bad"); }
    download("trip-for-planner-" + current.id.slice(0, 8) + ".json", data);
    flash("File made. Email it to " + (CFG.OPERATOR_NAME || "the planner") + ": the planner starts when it arrives.", "ok");
    loadShare();
  }
  $("#share-on").addEventListener("click", async () => {
    if (!shareLive) {   // already shared (a file failed earlier): don't record a second share (review L7)
      const { error } = await sb.from("planner_shares").insert({ trip_id: current.id });
      if (error) return flash(explain(error), "bad");
    }
    await makeFile();
  });
  $("#share-off").addEventListener("click", async () => {
    const { error } = await sb.from("planner_shares").update({ revoked_at: new Date().toISOString() }).eq("trip_id", current.id).is("revoked_at", null);
    error ? flash(explain(error), "bad") : loadShare();
  });
  $("#share-file").addEventListener("click", makeFile);
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
