# TODO — Import module (local Markdown → Notion)

Plan: [plan.md](plan.md) · Spec: [../SPEC-import.md](../SPEC-import.md).

## Status: ✅ COMPLETE

Phases A–F done. 136 vitest tests + `tsc --noEmit` green offline; all live checkpoints
CP-A–F verified against a real database (incl. CP-E image upload, fixed via the Blob MIME
type in [src/import/uploadFiles.ts](../src/import/uploadFiles.ts)).

Deferred enhancements (not blocking — documented in the README "Known limitations" section):
non-image file attachments, and intra-batch duplicate-key de-duplication.
