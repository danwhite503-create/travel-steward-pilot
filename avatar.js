// Traveler badge for the profile: an original flat illustration of a traveler in a trip scene.
// Choices are kept only in this browser (localStorage), never sent to the database: the notice
// doesn't list appearance choices among what the pilot keeps. Only fixed option values reach the SVG.
(function () {
  "use strict";
  const KEY = "pilot.avatar";
  const SKIN = ["#f6d7c3", "#e8b48f", "#c98b5c", "#8d5a3b", "#5a3825"];
  const THEMES = {
    ski: "Ski trip", europe: "European city", island: "Island", hiking: "Hiking", safari: "Safari"
  };
  // Match the season: winter skiing, spring cities, summer islands, fall hikes (northern hemisphere).
  function seasonTheme(d) {
    const m = (d || new Date()).getMonth();
    return m === 11 || m <= 1 ? "ski" : m <= 4 ? "europe" : m <= 7 ? "island" : "hiking";
  }
  function load() {
    const def = { figure: "none", skin: 2, theme: "season" };
    try { const v = JSON.parse(localStorage.getItem(KEY)); return Object.assign(def, v || {}); } catch (e) { return def; }
  }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }

  // ---------- scenes (200 x 200, clipped to a circle) ----------
  const SCENES = {
    ski: `<rect width="200" height="200" fill="#cfe3f5"/>
      <path d="M-10 150 L55 60 L95 115 L135 55 L215 150 Z" fill="#8fa9c2"/>
      <path d="M55 60 L70 81 L62 78 L55 86 L48 79 L42 82 Z M135 55 L152 79 L143 76 L135 84 L127 77 L119 80 Z" fill="#fff"/>
      <path d="M-10 140 Q100 118 210 140 L210 210 L-10 210 Z" fill="#fff"/>
      <g fill="#fff"><circle cx="30" cy="40" r="2.5"/><circle cx="168" cy="30" r="2"/><circle cx="110" cy="22" r="2.5"/><circle cx="182" cy="96" r="2"/><circle cx="20" cy="104" r="2"/></g>`,
    europe: `<rect width="200" height="200" fill="#b9d6ee"/>
      <circle cx="160" cy="44" r="16" fill="#fff4c8"/>
      <g fill="#e6dccb"><rect x="0" y="92" width="34" height="80"/><rect x="150" y="86" width="50" height="86"/></g>
      <g fill="#c8553d"><path d="M-4 92 L17 72 L38 92 Z"/><path d="M146 86 L175 64 L204 86 Z"/></g>
      <g fill="#f2b84b"><rect x="34" y="104" width="30" height="68"/></g><path d="M31 104 L49 86 L67 104 Z" fill="#8e3b2e"/>
      <g fill="#46607a"><rect x="8" y="104" width="7" height="10"/><rect x="20" y="104" width="7" height="10"/><rect x="42" y="114" width="6" height="9"/><rect x="52" y="114" width="6" height="9"/><rect x="160" y="98" width="8" height="11"/><rect x="178" y="98" width="8" height="11"/><rect x="160" y="120" width="8" height="11"/><rect x="178" y="120" width="8" height="11"/></g>
      <rect x="0" y="150" width="200" height="8" fill="#8a7f72"/>
      <g fill="#8a7f72"><rect x="10" y="158" width="10" height="42"/><rect x="60" y="158" width="10" height="42"/><rect x="130" y="158" width="10" height="42"/><rect x="180" y="158" width="10" height="42"/></g>
      <rect x="0" y="138" width="200" height="12" rx="3" fill="#c8102e"/><rect x="0" y="141" width="200" height="3" fill="#fff"/>`,
    island: `<rect width="200" height="200" fill="#8fd3f4"/>
      <circle cx="158" cy="46" r="20" fill="#ffd23f"/>
      <rect x="0" y="118" width="200" height="40" fill="#1fa3c8"/>
      <path d="M0 132 Q25 128 50 132 T100 132 T150 132 T200 132" fill="none" stroke="#bfeefc" stroke-width="2"/>
      <path d="M-10 150 Q100 136 210 150 L210 210 L-10 210 Z" fill="#f2dca4"/>
      <path d="M34 160 Q30 110 44 70" fill="none" stroke="#8a5a2b" stroke-width="7" stroke-linecap="round"/>
      <g fill="#2e9e5b"><path d="M44 70 Q20 58 4 72 Q24 66 44 74 Z"/><path d="M44 70 Q66 52 86 66 Q64 64 44 74 Z"/><path d="M44 70 Q40 44 22 38 Q38 52 42 74 Z"/><path d="M44 70 Q58 42 76 40 Q56 54 46 74 Z"/></g>`,
    hiking: `<rect width="200" height="200" fill="#f6d29b"/>
      <circle cx="46" cy="50" r="15" fill="#fff1d6"/>
      <path d="M-10 120 L40 70 L80 108 L130 60 L210 125 L210 210 L-10 210 Z" fill="#c86f3a"/>
      <path d="M-10 145 Q60 112 120 138 T210 130 L210 210 L-10 210 Z" fill="#a94f2a"/>
      <path d="M-10 172 Q90 150 210 170 L210 210 L-10 210 Z" fill="#7b3b22"/>
      <g fill="#2f5d3a"><path d="M160 150 L170 118 L180 150 Z"/><path d="M174 156 L184 126 L194 156 Z"/><path d="M14 160 L23 132 L32 160 Z"/></g>`,
    safari: `<rect width="200" height="200" fill="#f2b45f"/>
      <rect x="0" y="0" width="200" height="70" fill="#f7cf86"/>
      <circle cx="100" cy="118" r="34" fill="#fbe2a6"/>
      <path d="M-10 140 Q100 128 210 140 L210 210 L-10 210 Z" fill="#c9a45a"/>
      <path d="M156 140 L159 96 M159 104 L146 92 M159 100 L172 90" stroke="#3b2a1a" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="158" cy="88" rx="34" ry="8" fill="#3b2a1a"/><ellipse cx="146" cy="80" rx="18" ry="5" fill="#3b2a1a"/>
      <g stroke="#9c7a35" stroke-width="2" stroke-linecap="round"><path d="M20 160 l3 -8 M26 160 l0 -9 M32 160 l-3 -8 M70 166 l3 -8 M76 166 l0 -9"/></g>`
  };
  const OUTFIT = { ski: "#c8102e", europe: "#0e2240", island: "#ffffff", hiking: "#2f5d3a", safari: "#b59a6a" };
  const HAIR = "#2b1d14";

  // Accessories split into a hat (earned with 3 preference sections) and gear (earned with a dated trip).
  const HATS = {
    ski: `<path d="M70 92 Q70 64 100 64 Q130 64 130 92 Z" fill="#0039a6"/><rect x="68" y="88" width="64" height="9" rx="4" fill="#fccc0a"/><circle cx="100" cy="60" r="7" fill="#fccc0a"/>`,
    europe: `<path d="M72 92 Q72 70 100 70 Q128 70 128 92 Z" fill="#0e2240"/><rect x="70" y="88" width="62" height="6" rx="3" fill="#0e2240"/>`,
    island: `<ellipse cx="100" cy="84" rx="44" ry="8" fill="#e9c46a"/><path d="M78 84 Q80 62 100 62 Q120 62 122 84 Z" fill="#e9c46a"/><rect x="78" y="76" width="44" height="5" fill="#ee352e"/>`,
    hiking: `<path d="M72 92 Q72 68 100 68 Q128 68 128 92 Z" fill="#ff6319"/><path d="M100 92 L138 92 Q138 98 128 98 L100 98 Z" fill="#ff6319"/>`,
    safari: `<ellipse cx="100" cy="86" rx="42" ry="7" fill="#d8c49a"/><path d="M76 86 Q78 64 100 64 Q122 64 124 86 Z" fill="#d8c49a"/><rect x="77" y="79" width="46" height="4" fill="#6b4f2a"/>`
  };
  const GEAR = {
    ski: `<path d="M76 140 Q100 152 124 140 L124 150 Q100 160 76 150 Z" fill="#fccc0a"/><path d="M116 150 L120 178" stroke="#fccc0a" stroke-width="8"/>`,
    europe: `<path d="M78 146 L100 160 L122 146" fill="none" stroke="#c8102e" stroke-width="7" stroke-linejoin="round"/><path d="M84 152 L90 186" stroke="#c8102e" stroke-width="7"/>`,
    island: `<g fill="#111"><rect x="82" y="102" width="15" height="8" rx="3"/><rect x="103" y="102" width="15" height="8" rx="3"/><rect x="96" y="104" width="8" height="2"/></g>`,
    hiking: `<path d="M84 150 L84 200 M116 150 L116 200" stroke="#5c3a1e" stroke-width="6"/>`,
    safari: `<g fill="#333"><rect x="86" y="160" width="12" height="12" rx="3"/><rect x="102" y="160" width="12" height="12" rx="3"/></g><path d="M88 160 Q100 140 112 160" fill="none" stroke="#333" stroke-width="2"/>`
  };

  // One figure, drawn in the given colors; `mono` draws every part in one flat color (the unfilled outline).
  function figure(kind, skin, theme, earn, mono) {
    if (kind === "none") return "";
    const s = mono || SKIN[skin] || SKIN[2], top = mono || OUTFIT[theme] || "#333", hairC = mono || HAIR;
    const back = kind === "woman" ? `<path d="M68 104 Q66 150 78 168 L122 168 Q134 150 132 104 Z" fill="${hairC}"/>` : "";
    let hair = kind === "woman"
      ? `<path d="M71 104 Q72 72 100 72 Q128 72 129 104 Q118 86 100 88 Q84 88 71 104 Z" fill="${hairC}"/>`
      : `<path d="M73 100 Q74 74 100 73 Q126 74 127 100 Q120 84 100 85 Q80 85 73 100 Z" fill="${hairC}"/>`;
    const hat = earn.hat ? HATS[theme] || "" : "", gear = earn.gear ? GEAR[theme] || "" : "";
    if (hat && kind === "man") hair = "";
    const shades = earn.gear && theme === "island";
    const face = mono ? "" : (shades ? "" : `<g fill="#1b1b1b"><circle cx="90" cy="106" r="3"/><circle cx="110" cy="106" r="3"/></g>`)
      + `<path d="M91 118 Q100 125 109 118" fill="none" stroke="#1b1b1b" stroke-width="2.5" stroke-linecap="round"/>`;
    const pin = !mono && earn.pin > 1 ? `<circle cx="120" cy="170" r="9" fill="#ee352e" stroke="#fff" stroke-width="2"/><text x="120" y="174" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="11" fill="#fff">${Math.min(earn.pin, 9)}</text>` : "";
    const stroke = !mono && top === "#ffffff" ? "#cfd8dc" : "none";
    return `${back}
      <path d="M58 200 L62 162 Q64 148 82 146 L118 146 Q136 148 138 162 L142 200 Z" fill="${top}" stroke="${stroke}" stroke-width="2"/>
      <rect x="92" y="128" width="16" height="20" fill="${s}"/>
      <circle cx="100" cy="106" r="28" fill="${s}"/>
      ${hair}${mono ? "" : face}${mono ? "" : hat + gear + pin}`;
  }

  // earn: { progress: 0..1 (the essentials), hat, gear, pin: number of travelers }.
  // Below 1, the figure is a pale outline whose color fills from the feet up.
  function svg(opts, label, earn) {
    earn = Object.assign({ progress: 1, hat: true, gear: true, pin: 0 }, earn || {});
    const theme = opts.theme === "season" || !THEMES[opts.theme] ? seasonTheme() : opts.theme;
    const id = "c" + Math.random().toString(36).slice(2, 8);
    const p = Math.max(0, Math.min(1, Number(earn.progress) || 0));
    const top = 200 - Math.round(p * 140);   // the figure spans y 60 to 200
    const fig = opts.figure === "none" ? "" : p >= 1 ? figure(opts.figure, opts.skin, theme, earn)
      : `<g opacity=".38">${figure(opts.figure, opts.skin, theme, earn, "#4a5257")}</g>
         <defs><clipPath id="${id}f"><rect x="0" y="${top}" width="200" height="${200 - top}"/></clipPath></defs>
         <g clip-path="url(#${id}f)">${figure(opts.figure, opts.skin, theme, earn)}</g>`;
    return `<svg viewBox="0 0 200 200" role="img" aria-label="${label || "Your traveler badge"}">
      <defs><clipPath id="${id}"><circle cx="100" cy="100" r="100"/></clipPath></defs>
      <g clip-path="url(#${id})">${SCENES[theme]}${fig}</g></svg>`;
  }
  function render(host, opts, label, earn) { if (host) host.innerHTML = svg(opts, label, earn); }

  window.TravelAvatar = { THEMES, SKIN, seasonTheme, load, save, svg, render };
})();
