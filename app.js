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
  // Each trip gets one of four intercity liveries, fixed by its id so it never changes between visits.
  const LIVERIES = ["lv-it", "lv-jp", "lv-es", "lv-fr"];
  function livery(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return LIVERIES[h % LIVERIES.length]; }
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
  function confirmBox(text, typed) {
    return new Promise((resolve) => {
      $("#confirm-text").textContent = text;
      // The big deletes need a deliberate tick before the button works (no typing).
      $("#confirm-tick-wrap").hidden = !typed; $("#confirm-tick").checked = false;
      $("#confirm-yes").disabled = !!typed;
      $("#confirm-tick").onchange = () => { $("#confirm-yes").disabled = typed && !$("#confirm-tick").checked; };
      $("#confirm").hidden = false;
      const done = (ok) => { $("#confirm").hidden = true; $("#confirm-yes").onclick = $("#confirm-no").onclick = $("#confirm-tick").onchange = null; $("#confirm-yes").disabled = false; resolve(ok); };
      $("#confirm-yes").onclick = () => done(!typed || $("#confirm-tick").checked);
      $("#confirm-no").onclick = () => done(false);
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
  const ready = { name: false, city: false, nationality: false, passport: false, prefSections: new Set(), travelers: 0, datedTrip: false };
  const ESSENTIALS = [
    ["name", "Display name", "add your display name below"],
    ["city", "Home city", "add your home city below"],
    ["nationality", "Nationality", "add a traveler with a nationality on the Travelers tab"],
    ["passport", "Passport expiry", "add a passport expiry date on the Travelers tab"],
    ["prefs", "A preference", "add at least one line on the Preferences tab"]
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
    ready.travelers = rows.length; ready.nationality = rows.some((t) => t.nationality); ready.passport = rows.some((t) => t.passport_expires); paintReady();
    for (const t of data || []) {
      ul.append(el("li", {}, el("span", { class: "who" }, [t.first_name, t.last_name].filter(Boolean).join(" ")),
        el("span", { class: "muted grow" }, [t.nationality, t.passport_expires && "passport expires " + fmtDate(t.passport_expires).replace(/^[A-Za-z]{3}, /, "")].filter(Boolean).join(", ")),
        el("button", { type: "button", class: "link", onclick: async () => {
          if (!(await confirmBox("Remove " + t.first_name + "?"))) return;
          const r = await sb.from("travellers").delete().eq("id", t.id);
          r.error ? flash(explain(r.error), "bad") : loadTravellers();
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
    const { data, error } = await sb.from("trips").select("id, owner, title, date_from, date_to, status").order("created_at", { ascending: false });
    if (error) return flash(explain(error), "bad");
    trips = data || [];
    ready.datedTrip = trips.some((t) => t.owner === user.id && t.date_from && t.date_to); paintReady();
    const ul = $("#trip-list"); ul.replaceChildren();
    for (const t of trips) {
      ul.append(el("li", {}, el("div", { class: "ticket " + livery(t.id) },
        el("button", { type: "button", class: "link", onclick: () => openTrip(t.id) }, t.title),
        route(t.date_from, t.date_to, t.owner !== user.id ? "shared with you" : ""))));
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

  async function openTrip(id) {
    current = trips.find((t) => t.id === id);
    if (!current) return;
    $("#trip-list-wrap").hidden = true; $("#trip-detail").hidden = false;
    $("#trip-title").textContent = current.title;
    $("#trip-ticket").className = "ticket " + livery(current.id);
    $("#trip-dates").replaceWith(Object.assign(route(current.date_from, current.date_to), { id: "trip-dates" }));
    const mine = current.owner === user.id;
    for (const s of ["#share-on", "#share-off", "#share-file", "#trip-delete"]) $(s).disabled = !mine;
    let canWrite = mine;
    if (!mine) { const m = await sb.from("trip_members").select("role").eq("trip_id", current.id).eq("user_id", user.id).maybeSingle(); canWrite = !!(m.data && m.data.role !== "viewer"); }
    $("#item-new").hidden = !canWrite;
    await Promise.all([loadItems(), loadShare()]);
  }
  async function loadItems() {
    const { data, error } = await sb.from("trip_items").select("id, kind, payload, created_by, created_at").eq("trip_id", current.id).order("created_at");
    if (error) return flash(explain(error), "bad");
    const ul = $("#item-list"); ul.replaceChildren();
    for (const i of data || []) {
      const text = (i.payload && (i.payload.text || i.payload.t)) || JSON.stringify(i.payload);
      const li = el("li", {}, el("span", { class: "tag" }, i.kind), el("span", { class: "grow" }, text));
      if (i.created_by === user.id || current.owner === user.id) li.append(" ", el("button", { type: "button", class: "link", onclick: async () => {
        if (!(await confirmBox("Delete this item?"))) return;
        const r = await sb.from("trip_items").delete().eq("id", i.id);
        r.error ? flash(explain(r.error), "bad") : loadItems();
      } }, "Delete"));
      ul.append(li);
    }
    if (!(data || []).length) ul.append(el("li", { class: "empty" }, "Nothing yet. Add a note: where you want to go, what matters, what to avoid."));
  }
  $("#item-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const { error } = await sb.from("trip_items").insert({ trip_id: current.id, kind: "note", payload: { text: f.text.value.trim() } });
    if (error) return flash(explain(error), "bad");
    f.reset(); loadItems();
  });

  // ---------- share with the planner (link (a)) ----------
  async function loadShare() {
    const s = await sb.from("planner_shares").select("id, shared_at, revoked_at").eq("trip_id", current.id).is("revoked_at", null);
    const live = !s.error && (s.data || []).length > 0;
    $("#share-state").textContent = live ? "Shared with the planner since " + fmtDate(s.data[0].shared_at.slice(0, 10)) + "." : "Not shared.";
    $("#share-on").hidden = live; $("#share-file").hidden = !live; $("#share-off").hidden = !live;
    const r = await sb.from("planner_reads").select("how, read_at").eq("trip_id", current.id).order("read_at", { ascending: false });
    const ul = $("#read-log"); ul.replaceChildren();
    for (const x of (r.data || [])) ul.append(el("li", {}, x.read_at.replace("T", " ").slice(0, 16) + " UTC: " + (x.how === "export" ? "file made for the planner" : x.how)));
    if (!(r.data || []).length) ul.append(el("li", { class: "empty" }, "No files made yet."));
  }
  $("#share-on").addEventListener("click", async () => {
    const { error } = await sb.from("planner_shares").insert({ trip_id: current.id });
    error ? flash(explain(error), "bad") : loadShare();
  });
  $("#share-off").addEventListener("click", async () => {
    const { error } = await sb.from("planner_shares").update({ revoked_at: new Date().toISOString() }).eq("trip_id", current.id).is("revoked_at", null);
    error ? flash(explain(error), "bad") : loadShare();
  });
  $("#share-file").addEventListener("click", async () => {
    const { data, error } = await sb.rpc("pilot_export_trip", { t: current.id });
    if (error) return flash(explain(error), "bad");
    download("trip-for-planner-" + current.id.slice(0, 8) + ".json", data);
    flash("File made. Send it to " + (CFG.OPERATOR_NAME || "the planner") + ".", "ok");
    loadShare();
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
