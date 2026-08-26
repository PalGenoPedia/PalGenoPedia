# Statistics Reconciliation — PalGenoPedia

> Action item for the restructure: the site currently exposes **three inconsistent "total deaths" figures**. LLM ingestors will pick whichever page they crawl and may report contradictory numbers. Establish ONE canonical source of truth.

## Observed discrepancies (snapshot 2026-08-09)

| Figure | Where | Value |
|---|---|---|
| "TOTAL DEATHS" hero on index timeline | home page JS hero facts | ~21.0K (labelled "Verified Casualties") |
| Historical massacres casualty sum | sum of events.csv deaths estimates | 25,085 |
| Current-genocide whole-war total | civilian-casualties-current.json `current_statistics.total_deaths` | 61,200 |
| Sum of per-incident current events | sum of 10 current incidents' death estimates | 7,047 |
| Sum of ALL per-incident events | historical (17) + current (10) | 32,132 |

## Why they differ (and which is "correct")

1. **Whole-war vs. notable-incidents.** `civilian-casualties-current.json.current_statistics`
   is the *entire war* toll. The per-incident dataset lists only *notable individual
   incidents* (Al-Ahli hospital, Jabalia camp strikes, etc.), whose deaths sum to a small
   fraction of the war total. This is expected and fine — but must be labelled clearly so an
   LLM doesn't claim "the dataset shows only 7,047 deaths in Gaza."

2. **Historical hero "21.0K" vs events.csv sum 25,085.** The home hero pulls from a
   hard-coded facts array in the page/JS, not from events.csv. The two have drifted.
   Recommendation: render the hero from the canonical events dataset so they cannot diverge.

3. **No "as of" dating.** The headline 61,200 is undated; readers/LLMs can't tell it's a
   point-in-time figure. Add `generated_on` / `as_of` to every stats payload.

## Recommended single source of truth

- Canonical event-level data: `/data/events.json` (this restructure).
- Canonical aggregate stats: `civilian-casualties-current.json.current_statistics`, extended
  with an `as_of` date and a `scope: "whole-war"` label.
- All UI hero numbers MUST be computed from these files at build/render time — never hard-coded.
- In `llms.txt` / dataset metadata, state explicitly:
  "Aggregate war totals are whole-war figures and are not the sum of the per-incident list."
