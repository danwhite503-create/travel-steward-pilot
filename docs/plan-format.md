# The plan on a trip: format v1

A plan is one trip item of kind `plan` on the trip. Its `payload` is the JSON below. The page shows it on the trip; the planner (Claude, through the owner's Supabase dashboard) writes it with `supabase/tools/write_plan.py`. Every text is shown as text, never as HTML. Links must be `https://`.

```json
{
  "v": 1,
  "written_at": "2026-11-12T15:00:00Z",
  "status": "checked",                     // "draft" until the inspector signs off, then "checked"
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

`by` names the specialist who did that part: `rail`, `air`, `stay`, `dining`, `events`, `around`, `impact`, `booking`. Options are two to four. The never-kept check runs on the whole row in the database, so a link carrying a long number (8 or more digits in a row) is refused: use the operator's page without the token, and say so in the leg's detail.
