# connect — repo open items

> Repo operations / deferred items only. The product/design backlog of record is
> `discovery/alpha/ROADMAP_TODO.md`; the tracking scheme is `CroftC/.claude/TRACKING.md`.
> Cross-reference E-numbers where an item here implements a backlog row.

## Open

- [ ] **Incoming: a contract proposal for group-derived calling grants (croft P7 S3).**
  The croft-side product-shell adoption plan
  (`croft/plans/2026-08-25-1-plan-product-shell-adoption.md`, backlog row **E137**)
  has a phase — S3 — that designs the **DID ↔ persona-key binding fact** (**E120**):
  the recorded human act that ties a calling identity (atproto DID, proven by OAuth)
  to a social identity (persona keys). The product win it unlocks is **calling grants
  derived from group membership and standing**, and that derivation would be a change
  to *this* repo's contract — so it is a contract conversation, not a croft
  unilateral.

  What to expect, and what will NOT happen:
  - S3 produces a **proposal document only**, authored in croft at
    `docs/proposals/connect-contract-v3-group-grants.md` and carried here by the
    owner. **No P7 commit lands in this repo** — contract v2 stays canonical and
    untouched while croftcall runs through testing.
  - The proposal will sketch what a grant record would say plus the **degrade path
    for v2 peers** (G8: stated version + visible degrade path).
  - Decision on adopting any of it is this repo's to make, on its own schedule.

  Nothing is required here until that document arrives. This entry exists so the
  proposal is expected rather than a surprise. Cross-refs: **E120**, **E137**;
  croft `docs/adr/0001` (rendered-principal seam), `docs/adr/0002` (the two
  admissions are severed — relay admits traffic, never members).
