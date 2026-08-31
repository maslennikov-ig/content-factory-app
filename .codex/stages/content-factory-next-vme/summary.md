# Stage 7 summary

Status: in progress.

Stage `content-factory-next-vme` is the programme stage that carries the
Content section from screens-without-routes to a working part of the product,
and then closes the defects that walking it found. Its acceptance boundary is
one: the section reads and writes real rows, every refusal it can produce has a
name a screen can branch on, and nothing it activates is a version another form
would reject.

The stage manifest exists because the orchestration contract pointed at stage 6
(`content-factory-next-or3`) while the handoff had already moved to this one,
and `check_stage_ready.py` refused the mismatch. The pointer now names this
stage and this stage has the manifest the profile requires.

## What is done

- `content-factory-next-07h` — the section wired end to end: one contract
  naming every route, response and error code; repositories, services and
  controllers behind it; containers for the wizard, the voice tab, the material
  library, the brief and the applied-voice strip. Released to
  `factory.aidevteam.ru` and walked there.
- `vme.7`, `vme.8`, `vme.9` — the three doors the production pass found shut:
  the wizard's manual path, the brief tab, and file intake. Released as image
  `5935909250f4` on 2026-08-23 and walked on production by route and by
  browser.

## What this pass carries

Four defects found while doing the above, plus the pre-publication proof:

- `vme.10` — the paste route's body ceiling against the limit its DTO declares.
- `vme.11` — the passport reading the latest measurement rather than the one
  its active version was built from.
- `vme.12` — the voice path activating a version the brand form would refuse.
- `vme.13` — a workspace fact with a route and no door.
- `7ph` — the six pre-publication checks. It proves readiness and publishes
  nothing; the move itself (`cft`) and the links after it (`9gd`) stay closed
  behind owner authority.

## Evidence

- `.codex/stages/content-factory-next-vme.5/evidence/` — screen 04 and the four
  wizard paths walked by clicking on the local stand.
- `.codex/stages/content-factory-next-vme.6/evidence/production/` — the two
  earlier releases walked on `factory.aidevteam.ru`.
- `.codex/stages/content-factory-next-vme.7/evidence/` — the three doors, live
  and in the browser, locally and on production.

## Explicit non-goals

The nine owner decisions listed in the epic stay open. No stage inside this one
may close, absorb or narrow them; they are repeated under `## Explicit defers`
in `.codex/handoff.md`.
