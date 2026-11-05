# Companion Guide + Library preview (v2 UX)

**Live test URLs**
- Library: https://neverfightorargue.com/members/library-preview/
- Guide: https://neverfightorargue.com/guide/course-preview/
- Resource: https://neverfightorargue.com/members/library-preview/resource/?id=anti-fight-plan

Production `/members/`, `/guide/`, video, auth, and answer APIs are unchanged.

## v2 changes
- Library: compact 5-up cover grid aimed at above-fold desktop; short banner; clear Open CTAs.
- Guide: Chapter disclosure nav with nested numbered **Sections** (not Scripture “verses”). Content chunked losslessly at h3/h4 boundaries. Crumbs + Prev/Next always visible; mobile drawer.
- Answers: sessionStorage only; no POST; entitlement gate preserved.
- Resource: fit-width + page controls + Open/Download + in-app Back. Native PDF apps cannot show Back.

## Rollback
Revert/delete: `members/library-preview/`, `guide/course-preview/`, `assets/library-preview/`, `docs/guide-course-preview/`, `tests/guide-course-preview/`.
