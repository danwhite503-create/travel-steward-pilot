# The plan on a trip: format v1.1

v1.1 (9 Nov 2026): an optional `progress` block for the team at work, and status `working` (D-547). `v` stays 1.

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
