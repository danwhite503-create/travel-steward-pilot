# The plan on a trip: format v1.1

v1.2 (9 Nov 2026, D-555): a part may carry `points` (one to four short lines, 140 characters each) shown as small bullets on the card, and `how` (text, or up to six paragraphs) shown with its `detail` and `sources` behind a "How we know" tap; without `points` a part shows its `detail` as before, in smaller text. The inspector's `note` sits behind "How Margit checked it", and the header shows a `score` only when it reads "n of m". The writer refuses a price claim ("parity", "no premium", "surge", "barely moves", "same price"…) unless the same sentence gives its basis: a rough comparison with the room not named, or the same room (D-554). `v` stays 1.

v1.1 (9 Nov 2026): an optional `progress` block for the team at work, and status `working` (D-547); status `refused`, with `refusal` and up to two counter-proposals (D-550). `v` stays 1.

A plan is one trip item of kind `plan` on the trip. Its `payload` is the JSON below. The page shows it on the trip; the planner (Claude, through the owner's Supabase dashboard) writes it with `supabase/tools/write_plan.py`. Every text is shown as text, never as HTML. Links must be `https://`.

```json
{
  "v": 1,
  "written_at": "2026-11-12T15:00:00Z",
  "status": "checked",                     // "working" while the team works (no options needed yet), "draft" until the inspector signs off, then "checked"
  "summary": "Three ways to do Lisbon, Coimbra and Porto by rail, 7 nights.",
  "options": [
    {
      "id": "A",
      "name": "Slow coast",
      "tagline": "Rail all the way, two nights in Coimbra",
      "nights": 7,
      "carbon_kg_pppd": 21.4,              // per person per waking day
      "carbon_limit": 60,
      "cost": { "amount": 2140, "currency": "USD", "basis": "per person, rail and stays" },
      "tier_a": [ { "rule": "Rail before short flights", "ok": true, "figure": "0 flights under 1,000 km" } ],
      "tradeoffs": [ "40 min longer than option B on day 4; 18 kg less carbon per day" ],
      "legs": [
        { "by": "rail", "day": 2, "title": "Lisbon to Coimbra", "detail": "Alfa Pendular, 1 h 42 min", "price": "EUR 24",
          "book": { "url": "https://www.cp.pt/", "label": "Book on the operator's site" },
          "sources": [ { "title": "CP timetable", "url": "https://www.cp.pt/", "tier": "T1" } ] }
      ]
    }
  ],
  "inspector": { "result": "pass", "score": "28 of 30", "note": "Every hard rule passes." },
  "gaps": [ "Fado venues' December hours not yet published" ]
}
```

A part in v1.2 adds, after `title` and `price`:

```json
"points": ["Northeast Regional 184 · 5:07 pm → 9:50 pm", "4 h 43 min, coach"],
"how": ["Read on Amtrak's own site, 9 Nov 2026, 9:00 pm ET.", "Not read yet: fare type and change terms."]
```

Write points in plain words a friend would use: no tiers, rungs or layer names on the card; those go in `how` or the sources.

`by` names the specialist who did that part: `rail`, `air`, `stay`, `dining`, `events`, `around`, `impact`, `booking`. Options are two to four. The never-kept check runs on the whole row in the database, so a link is refused if it carries a run of 9 or more digits, 1–2 letters followed by 6–9 digits, or "#" followed by a digit: use the operator's page without the token, and say so in the leg's detail.

## The team at work (`progress`, v1.1)

While the planner works, the plan item may carry who is working and on what. The page shows it on the trip; nothing moves on the page unless a team's `state` is `working`, and an `updated_at` older than 30 minutes stops the motion and reads "No update since …". A plan with status `working` may have no options yet.

```json
"progress": {
  "updated_at": "2026-11-10T15:00:00Z",
  "teams": [
    { "key": "rail", "state": "working", "activity": "Checking Lisbon to Coimbra against CP's timetable and a second source.",
      "done": 1, "of": 3, "unit": "rail legs checked", "at": "2026-11-10T14:58:00Z" }
  ]
}
```

`key` is one of the team: `steward`, `critic`, or a specialist above. `state` is `queued`, `working`, `waiting` (on the traveler) or `done`. `activity` is plain words, 300 characters at most; `done` and `of` go together. `write_plan.py --progress PROGRESS.json TRIP_ID` writes only this block (adding a `working` plan with no options if the trip has none), and touches nothing else.

## A refusal (`refused`, v1.1)

When no version of the trip as asked passes the hard rules, the plan is a refusal, never a "checked" plan whose options all break Tier A (D-544(1)). The page shows "Can't be done as asked", the rule and its figure, then the counter-proposals under "What could work instead".

```json
{ "v": 1, "status": "refused",
  "refusal": { "rule": "Carbon ceiling per person per day", "figure": "30% over at 4 nights", "why": "Two transatlantic flights over few days." },
  "options": [ { "id": "A", "name": "Seven nights", "counter": true, "tier_a": [ { "rule": "Carbon ceiling per person per day", "ok": true, "figure": "under" } ],
                 "tradeoffs": [ "Three more nights away" ], "legs": [] } ],
  "inspector": { "result": "pass", "note": "…" } }
```

`refusal.rule` and `refusal.figure` are required; zero to two counter-proposals, each passing every Tier A check. `write_plan.py` refuses a `checked` plan whose every option breaks a hard rule.

## The brief, as the planner reads it (D-550, D-551; `shape` added 10 Nov 2026)

The trip item of kind `brief` the traveler fills in. Fields: `from`; `country` (the main one) and `also` (up to four more); `places` (in order); `date_mode` (`fixed`, `flexible`, `event`, `open`) with `flex_days` (for `flexible` and `event`) and `event` `{name, date}`; `shape` (`round`, `multi`, `oneway`, `open`: the kind of trip, guessed from the places until the traveler picks one; `shape_by` is `auto` or `you`, so a guess can be told from a choice) and `one_way` (true when `shape` is `oneway`, kept for older readers: no return leg; the trip's end date is the last day there); `who` and `parts`; `purpose` (`leisure`, `work`, `mix`); `must`; `avoid`.

In the store, `who` holds traveler ids and `parts` maps an id to `{from, to}` for anyone joining for part of the trip. From store v0.1.4 what the planner reads (the file, and from v0.1.5 the store read, `pilot_planner_read`) gives `who` as `[{name, from, to}]` instead: first names, the dates only for a part of the trip, removed travelers and other people's ids dropped, and no `parts`. Before v0.1.4 the file carries the ids as stored.
