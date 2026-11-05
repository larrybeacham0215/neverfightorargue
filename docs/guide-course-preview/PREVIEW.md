# Companion Guide course + library preview

**Live test URLs (after publish):**
- Library preview: https://neverfightorargue.com/members/library-preview/
- Guide course preview: https://neverfightorargue.com/guide/course-preview/
- Resource wrapper example: https://neverfightorargue.com/members/library-preview/resource/?id=anti-fight-plan

**Not changed:** `/guide/`, `/members/`, `/downloads/`, welcome video, auth, entitlements, answers API writes.

## Behavior
- Library preview: signed-in content grid with distinct covers for Companion Guide + 4 free PDFs (Anti-Fight Plan, L.U.V. Framework, Stop-Loss Strategy, Validation Exercise). Does **not** re-add removed Anti-Fight Plan & Safety Plan or Printable Companion Set.
- Guide course preview: auth-gated via existing `/guide` API. Splits returned HTML into Start Here + week modules. Desktop sidebar + mobile selects + Previous/Next. Optional light fade transition. Keyboard Left/Right when not typing.
- Answers in course preview: sessionStorage only (`nfoa-guide-course-preview:*`). **No POST** to save answers; **no** welcome-video seen writes; welcome modal not shown here (production video left alone; re-record only after layout approval).
- PDF detail pages keep persistent Back to library; Open/Download use `/downloads/files/...`. Native PDF apps cannot show our back link — source PDFs are not modified.

## Rollback
Delete or revert these paths only:
- `members/library-preview/`
- `guide/course-preview/`
- `assets/library-preview/`
- `docs/guide-course-preview/`
- `tests/guide-course-preview/`

Production My Library / Guide stay as they were.
