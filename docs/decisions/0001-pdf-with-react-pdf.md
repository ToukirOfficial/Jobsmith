# 0001 PDFs with @react-pdf/renderer

**Decision.** CVs and cover letters are rendered with `@react-pdf/renderer` from React templates in `packages/pdf`.

**Why.** The same templates render the live preview in the browser and the final file in the worker, so the
preview is exactly what gets exported. It produces real, selectable text in reading order (ATS-friendly), A4,
with no headless browser on the server. The PDF standard fonts (Helvetica, Times) keep files small and need no
font files.

**Trade-off.** Standard fonts cover Western European text only. Hyphenation is turned off so words and links
are never split.
