// The planning team: the Steward and the specialists it manages, each drawn as a person in the uniform of
// the trade whose job they do (original flat art; no real operator's uniform, mark or name).
// Names are working names, Claude's proposals. Only fixed values from this file reach the SVG.
(function () {
  "use strict";
  // Each member: who they are on the site, which planner components they stand for, and how they're drawn.
  const TEAM = [
    { key: "steward", name: "Arlo", role: "Your Steward", does: "Runs your trip: reads your brief, briefs the team, weighs their findings and brings you two to four ways to do it, with the tradeoffs in figures.", parts: "C0, C10",
      bg: "#000000", skin: "#c98b5c", hair: "short", hairC: "#1f1a17", outfit: "#5a5f66", collar: "#ffffff", hat: null, prop: "keys", tie: "#c8a24a" },
    { key: "rail", name: "Giulia", role: "Rail", does: "Finds the trains first: checks every rail leg against two sources and shows the time and carbon against flying.", parts: "C4",
      bg: "#ee352e", skin: "#e8b48f", hair: "bun", hairC: "#3b2416", outfit: "#0e2240", collar: "#ffffff", hat: "conductor", prop: "punch" },
    { key: "air", name: "Kenji", role: "Flights", does: "Only for legs rail can't do well: nonstop first, the fare confirmed on three sources, the airline's figure in the plan.", parts: "C4",
      bg: "#0039a6", skin: "#f6d7c3", hair: "short", hairC: "#111111", outfit: "#1b2a4a", collar: "#ffffff", hat: "pilot", prop: "wings" },
    { key: "stay", name: "Amara", role: "Places to stay", does: "Searches the hotel guides first, then prices rooms in bands, independent and local places shown beside the rest.", parts: "C6",
      bg: "#b933ad", skin: "#5a3825", hair: "curly", hairC: "#1a120d", outfit: "#7a1f3d", collar: "#ffffff", hat: null, prop: "key", badge: true },
    { key: "dining", name: "Mateo", role: "Food and drink", does: "Local guides and papers first, then the critics: independent places near where you'll be, booked when they need it.", parts: "C3",
      bg: "#ff6319", skin: "#c98b5c", hair: "short", hairC: "#2b1d14", outfit: "#111111", collar: "#ffffff", hat: null, prop: "bowtie", vest: true },
    { key: "events", name: "Noor", role: "Events and calendar", does: "What's on while you're there, and what's closed: festivals, games, shows, holidays, with dates checked.", parts: "C3, C17",
      bg: "#fccc0a", skin: "#8d5a3b", hair: "long", hairC: "#1a120d", outfit: "#5b2d86", collar: null, hat: null, prop: "ticket" },
    { key: "around", name: "Femi", role: "Getting around", does: "Local transit, walking and bikes from door to door, with the passes and apps you'll need.", parts: "C4",
      bg: "#00933c", skin: "#5a3825", hair: "short", hairC: "#111111", outfit: "#ff6319", collar: null, hat: "cycling", prop: "stripes" },
    { key: "impact", name: "Sol", role: "Carbon and local impact", does: "Keeps carbon under the daily limit, counts it per person per day, and spreads your visit away from crowded cores.", parts: "C5, C8",
      bg: "#2f5d3a", skin: "#e8b48f", hair: "long", hairC: "#6b4a2b", outfit: "#4f6b3a", collar: null, hat: "ranger", prop: "leaf" },
    { key: "booking", name: "Dev", role: "Booking", does: "Builds each booking link and walks you to the seller's page, then stops: you pay. Confirms what you booked from the email.", parts: "C13",
      bg: "#808183", skin: "#8d5a3b", hair: "short", hairC: "#1a120d", outfit: "#9cc3e6", collar: null, hat: null, prop: "headset" },
    { key: "critic", name: "Margit", role: "The inspector", does: "Never sees how the plan was made. Checks it against every rule and scores it before it reaches you.", parts: "C12, C9",
      bg: "#5c5c5c", skin: "#f6d7c3", hair: "bun", hairC: "#9a9a9a", outfit: "#3b3f45", collar: "#ffffff", hat: null, prop: "clipboard", glasses: true }
  ];

  function hairBack(m) {
    if (m.hair === "long") return `<path d="M68 104 Q64 156 78 172 L122 172 Q136 156 132 104 Z" fill="${m.hairC}"/>`;
    if (m.hair === "curly") return `<circle cx="100" cy="98" r="40" fill="${m.hairC}"/>`;
    return "";
  }
  function hairTop(m) {
    if (m.hat && m.hair === "short") return "";
    if (m.hair === "bun") return `<path d="M72 100 Q74 74 100 73 Q126 74 128 100 Q120 85 100 86 Q80 85 72 100 Z" fill="${m.hairC}"/>${m.hat ? "" : `<circle cx="100" cy="68" r="11" fill="${m.hairC}"/>`}`;
    if (m.hair === "curly") return `<path d="M70 98 Q72 70 100 70 Q128 70 130 98 Q118 84 100 86 Q82 84 70 98 Z" fill="${m.hairC}"/>`;
    if (m.hair === "long") return `<path d="M71 104 Q72 72 100 72 Q128 72 129 104 Q118 86 100 88 Q84 88 71 104 Z" fill="${m.hairC}"/>`;
    return `<path d="M73 100 Q74 74 100 73 Q126 74 127 100 Q120 84 100 85 Q80 85 73 100 Z" fill="${m.hairC}"/>`;
  }
  const HATS = {
    conductor: `<path d="M70 88 L74 66 Q100 58 126 66 L130 88 Z" fill="#0e2240"/><rect x="70" y="80" width="60" height="7" fill="#c8102e"/><path d="M66 90 Q100 98 134 90 L134 94 Q100 102 66 94 Z" fill="#111"/>`,
    pilot: `<path d="M68 86 Q70 62 100 60 Q130 62 132 86 Z" fill="#1b2a4a"/><rect x="68" y="80" width="64" height="6" fill="#c8a24a"/><path d="M66 88 Q100 96 134 88 L134 92 Q100 100 66 92 Z" fill="#111"/><path d="M92 70 L100 66 L108 70" stroke="#c8a24a" stroke-width="3" fill="none"/>`,
    cycling: `<path d="M70 92 Q70 66 100 66 Q130 66 130 92 Z" fill="#111111"/><path d="M100 92 L136 92 Q136 97 128 97 L100 97 Z" fill="#111"/><rect x="72" y="84" width="56" height="4" fill="#fff"/>`,
    ranger: `<ellipse cx="100" cy="86" rx="42" ry="7" fill="#8a6a3a"/><path d="M76 86 Q78 62 100 60 Q122 62 124 86 Z" fill="#8a6a3a"/><path d="M90 62 L100 72 L110 62" fill="none" stroke="#6b4f2a" stroke-width="3"/><rect x="77" y="78" width="46" height="4" fill="#4f6b3a"/>`
  };
  const PROPS = {
    keys: `<g transform="translate(116 160)"><circle r="7" fill="#c8a24a"/><path d="M-9 -9 L9 9 M9 -9 L-9 9" stroke="#2b2b2b" stroke-width="2"/></g>`,
    punch: `<g transform="translate(120 168)"><rect x="-10" y="-4" width="20" height="8" rx="3" fill="#9aa0a6"/><circle cx="-6" cy="0" r="2" fill="#111"/></g>`,
    wings: `<path d="M106 162 Q114 158 124 160 Q114 164 106 164 Z M106 162 Q98 158 88 160 Q98 164 106 164 Z" fill="#c8a24a" transform="translate(6 0)"/>`,
    key: `<g transform="translate(120 166)"><rect x="-4" y="-8" width="8" height="16" rx="2" fill="#c8a24a"/><circle cx="0" cy="-10" r="5" fill="none" stroke="#c8a24a" stroke-width="2"/></g>`,
    bowtie: `<path d="M90 146 L100 151 L110 146 L110 156 L100 151 L90 156 Z" fill="#c8102e"/>`,
    ticket: `<g transform="translate(118 168) rotate(-12)"><rect x="-12" y="-7" width="24" height="14" rx="2" fill="#fccc0a"/><path d="M2 -7 V7" stroke="#5b2d86" stroke-width="1.5" stroke-dasharray="2 2"/></g>`,
    stripes: `<path d="M64 176 L136 176 M63 186 L137 186" stroke="#e6e6e6" stroke-width="5"/>`,
    leaf: `<path d="M116 160 Q126 150 132 160 Q126 170 116 160 Z" fill="#7cc36a"/><path d="M116 160 L132 160" stroke="#2f5d3a" stroke-width="1.5"/>`,
    headset: `<path d="M70 104 Q70 72 100 72 Q130 72 130 104" fill="none" stroke="#222" stroke-width="5"/><rect x="64" y="100" width="10" height="16" rx="4" fill="#222"/><path d="M69 116 Q72 128 86 126" fill="none" stroke="#222" stroke-width="3"/><circle cx="87" cy="126" r="3" fill="#222"/>`,
    clipboard: `<g transform="translate(118 170) rotate(8)"><rect x="-12" y="-14" width="24" height="30" rx="2" fill="#c8a07a"/><rect x="-9" y="-9" width="18" height="22" fill="#fff"/><rect x="-5" y="-17" width="10" height="6" rx="2" fill="#555"/><path d="M-5 -3 H5 M-5 2 H5 M-5 7 H2" stroke="#999" stroke-width="1.5"/></g>`
  };

  function person(m) {
    const collar = m.collar ? `<path d="M86 146 L100 162 L114 146 Z" fill="${m.collar}"/>` : "";
    const vest = m.vest ? `<path d="M80 148 L100 200 L120 148 L126 150 L132 200 L68 200 L74 150 Z" fill="#2b2b2b"/>` : "";
    const tie = m.tie ? `<path d="M97 150 L103 150 L104 176 L100 182 L96 176 Z" fill="${m.tie}"/>` : "";
    const badge = m.badge ? `<rect x="80" y="166" width="18" height="8" rx="2" fill="#fff"/>` : "";
    const glasses = m.glasses ? `<g fill="none" stroke="#222" stroke-width="2"><circle cx="90" cy="106" r="7"/><circle cx="110" cy="106" r="7"/><path d="M97 106 H103"/></g>` : "";
    return `${hairBack(m)}
      <path d="M58 200 L62 162 Q64 148 82 146 L118 146 Q136 148 138 162 L142 200 Z" fill="${m.outfit}"/>
      ${vest}${collar}${tie}
      <rect x="92" y="128" width="16" height="20" fill="${m.skin}"/>
      <circle cx="100" cy="106" r="28" fill="${m.skin}"/>
      ${hairTop(m)}
      <g fill="#1b1b1b"><circle cx="90" cy="106" r="3"/><circle cx="110" cy="106" r="3"/></g>
      <path d="M91 118 Q100 125 109 118" fill="none" stroke="#1b1b1b" stroke-width="2.5" stroke-linecap="round"/>
      ${glasses}${m.hat ? HATS[m.hat] : ""}${badge}${PROPS[m.prop] || ""}`;
  }
  function svg(key) {
    const m = TEAM.find((x) => x.key === key); if (!m) return "";
    const id = "t" + Math.random().toString(36).slice(2, 8);
    return `<svg viewBox="0 0 200 200" role="img" aria-label="${m.name}, ${m.role}">
      <defs><clipPath id="${id}"><circle cx="100" cy="100" r="100"/></clipPath></defs>
      <g clip-path="url(#${id})"><rect width="200" height="200" fill="${m.bg}"/><circle cx="100" cy="230" r="120" fill="#ffffff" opacity=".14"/>${person(m)}</g></svg>`;
  }
  window.TravelTeam = { TEAM, svg };
})();
