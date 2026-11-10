// City layers (D-557, S3): the small, local look for a stop on the trip line. Each city is evoked by three colours
// chosen for this page (deliberately shifted off any transit operator's published line colours, review 10 Nov) and a
// simple landmark line drawing of our own. No operator's logo, roundel, sign artwork, bullet design, line colours or
// map is copied; a city not listed, or a look-alike name, falls back to the trip's own livery.
// Drawings: 24 x 24 viewBox, strokes only, made for this page.
(function () {
  const CITIES = {
    london:    { label: "London",    palette: ["#a4343a", "#2c5f9e", "#4a7c3a"], d: "M10 22V7h4v15M11 7l1-4 1 4M10 11h4M6 22v-7h3v7M15 22v-9h3v9M3 22h18" },
    paris:     { label: "Paris",     palette: ["#d9a400", "#2b4c8c", "#8a5a2b"], d: "M7 22L12 3l5 19M9 15h6M10.5 10h3M12 3V1M4 22h16" },
    amsterdam: { label: "Amsterdam", palette: ["#b8402f", "#2a5c8f", "#d98a2a"], d: "M3 20V10l3-3 3 3v10M9 20V8l3-4 3 4v12M15 20V11l3-3 3 3v9M2 22c3-1.5 6-1.5 10 0s7 1.5 10 0" },
    boston:    { label: "Boston",    palette: ["#9b2335", "#2f6e5e", "#c9822b"], d: "M12 1v4M10 5h4l1 3H9l1-3M9 8h6v14H9zM4 22v-8l5-3M20 22v-8l-5-3M2 22h20" },
    "new york":{ label: "New York",  palette: ["#334f8c", "#c96a3f", "#5a8f4a"], d: "M4 22V12h4v10M8 22V6h3V3h2v3h3v16M16 22v-8h4v8M11 9h2M11 13h2M11 17h2M2 22h20" },
    lisbon:    { label: "Lisbon",    palette: ["#e0a21c", "#a83c3c", "#1f6b5c"], d: "M3 18V9h18v9H3zM3 12h18M6 9v3M10 9v3M14 9v3M18 9v3M6 20.5a1.5 1.5 0 1 0 0.01 0M18 20.5a1.5 1.5 0 1 0 0.01 0M12 9V5M9 5h6" }
  };
  const ALIAS = { nyc: "new york", "new york city": "new york", manhattan: "new york", brooklyn: "new york", lisboa: "lisbon" };
  // Whole names only, and not a look-alike: "New London", "Paris, TX", "Boston, Lincs" stay plain.
  function cityOf(name) {
    const n = String(name || "").toLowerCase().trim();
    if (/,\s*\S/.test(n)) return null;                       // "Paris, TX": a qualified name is another place
    const words = " " + n.replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ") + " ";
    const hit = (w) => words.startsWith(" " + w + " ");     // the city name opens the stop name ("London St Pancras")
    for (const [a, k] of Object.entries(ALIAS)) if (hit(a)) return k;
    for (const k of Object.keys(CITIES)) if (hit(k)) return k;
    return null;
  }
  const NS = "http://www.w3.org/2000/svg";
  function landmark(key) {
    const c = CITIES[key]; if (!c) return null;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "28"); svg.setAttribute("height", "28");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "landmark city-" + key.replace(" ", "-"));
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", c.d); p.setAttribute("fill", "none"); p.setAttribute("stroke-width", "1.6");
    p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    svg.append(p);
    return svg;
  }
  // The city's three colours as a short stripe: the micro layer's mark on the stop.
  function stripe(key) {
    const c = CITIES[key]; if (!c) return null;
    const s = document.createElement("span"); s.className = "city-stripe city-" + key.replace(" ", "-"); s.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i++) s.append(document.createElement("i"));
    return s;
  }
  window.CityLayers = { CITIES, cityOf, landmark, stripe };
})();
