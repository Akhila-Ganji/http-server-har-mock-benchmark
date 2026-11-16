# Hack report

How you tried to beat your own checks, and what you fixed. Score each attempt with `./check.sh`
(AGENTS.md shows how), and copy the score and failing checks from its output. If an attempt scores
wrongly, fix the checks, never the brief, then score every attempt again.

## The plausible wrong fix

The fix a capable engineer, or a strong coding agent, could ship and believe is right. It must
look reasonable in review and fail at least one blocker.

**What it does.** Implements naive exact URL string matching (`entry.request.url === req.url`) and
stateless first-match lookup (`entries.find(...)`). It ignores query parameter reordering,
case-insensitive `Vary` headers, and sequential consumption.

**Why it's plausible.** For basic mock servers where queries have a single parameter or fixed parameter
order and each endpoint is requested once, `entries.find(e => e.request.url === req.url)` looks
clean and passes standard happy-path sanity checks.

**What catches it.** `reference-har-mock` tests reordered query parameters, case-insensitive `Vary`
header routing, and sequential FIFO consumption. The wrong fix fails on all of these.

```diff
--- a/lib/har-mock.js
+++ b/lib/har-mock.js
@@ -0,0 +1,28 @@
+'use strict';
+
+function createHarMockMiddleware(harData) {
+  var entries = (harData && harData.log && Array.isArray(harData.log.entries))
+    ? harData.log.entries
+    : [];
+
+  return function harMockHandler(req, res) {
+    // Naive exact string URL match and stateless find
+    var matched = entries.find(function (e) {
+      return e.request && e.request.method === req.method && e.request.url === 'http://localhost:8080' + req.url;
+    });
+
+    if (!matched) {
+      res.statusCode = 404;
+      res.setHeader('Content-Type', 'application/json');
+      res.end(JSON.stringify({ error: 'HAR_ENTRY_NOT_FOUND' }));
+      return;
+    }
+
+    res.statusCode = matched.response.status || 200;
+    res.end(matched.response.content ? (matched.response.content.text || '') : '');
+  };
+}
+
+module.exports = {
+  createHarMockMiddleware: createHarMockMiddleware
+};
```

## Concrete attack scenarios

### hardcoded-fixture
- **What it does**: Instead of general HAR 1.2 parsing and dynamic request normalization, hardcodes static responses matching only known paths in `test/fixtures/mock.har`.
- **Why an agent might try it**: To bypass writing query string normalization, Vary parsing, and base64 decoders by returning canned responses.
- **What catches it**: `reference-har-mock` tests startup exit codes on missing/malformed HAR files and issues diverse requests requiring dynamic FIFO state tracking and Vary header evaluation. Hardcoding fails dynamic exit code 1 handling and sequential state checks.
- **Result**: Score 0, fails `reference-har-mock`.

### skip-base64
- **What it does**: Implements the mock server middleware but sends `content.text` directly without checking `content.encoding === 'base64'` or decoding with `Buffer.from(text, 'base64')`.
- **Why an agent might try it**: Assumes all HAR content is plain text or neglects binary/image assets.
- **What catches it**: `reference-har-mock` requests recorded base64 binary assets (e.g. `/binary.png`) and asserts exact byte-for-byte equality against decoded buffers.
- **Result**: Score 0, fails `reference-har-mock`.

### utf8-corruption
- **What it does**: Corrupts multi-byte UTF-8 payloads by using naive ASCII/latin1 string conversions or slicing across multi-byte character boundaries.
- **Why an agent might try it**: Treats all string response bodies as single-byte ASCII characters, neglecting multi-byte UTF-8 encoding requirements.
- **What catches it**: `reference-har-mock` tests responses containing multi-byte UTF-8 characters (e.g. emojis and non-ASCII text) and asserts that the body payload is transmitted without character corruption or decoding errors.
- **Result**: Score 0, fails `reference-har-mock`.

### content-length-mismatch
- **What it does**: Echoes the recorded `Content-Length` header from the HAR entry directly, or calculates `Content-Length` using `text.length` (JavaScript UTF-16 code unit count) instead of `Buffer.byteLength(content, 'utf8')`. For multi-byte UTF-8 text or decoded base64 bodies, this causes a mismatch between the header value and actual transmitted payload byte count, leading to client-side truncation, hang, or protocol errors.
- **Why an agent might try it**: Copying response headers naively from `entry.response.headers` without recalculating `Content-Length` for decoded or UTF-8 bodies, or assuming string character length equals byte length.
- **What catches it**: `reference-har-mock` verifies that the `Content-Length` header strictly matches the actual byte count of the transmitted payload for both decoded base64 binaries and multi-byte UTF-8 text.
- **Result**: Score 0, fails `reference-har-mock`.

### skip-fifo
- **What it does**: Matches HAR entries statelessly (`entries.find(...)`) without tracking or removing consumed entries.
- **Why an agent might try it**: Treating mock lookups as idempotent read-only queries rather than sequential stateful streams.
- **What catches it**: `reference-har-mock` executes multiple sequential requests against identical URLs with distinct recorded responses (e.g. state transitions) and asserts that entries are consumed in strict FIFO order, eventually returning 404 when entries are exhausted.
- **Result**: Score 0, fails `reference-har-mock`.

### skip-exit-codes
- **What it does**: Omits startup validation for missing or invalid JSON HAR files, or lets uncaught `JSON.parse` / `fs.readFileSync` exceptions crash Node without explicitly exiting with status code 1.
- **Why an agent might try it**: Skipping CLI error handling and letting standard runtime stack traces print to stderr.
- **What catches it**: `reference-har-mock` spawns `http-server --har-mock missing.har` and `http-server --har-mock malformed.json` and asserts exit code 1.
- **Result**: Score 0, fails `reference-har-mock`.

### skip-vary
- **What it does**: Routes requests solely by HTTP method and pathname/query, ignoring the `Vary` header in recorded responses.
- **Why an agent might try it**: Neglecting content-negotiation headers (e.g. `Accept-Encoding`, `User-Agent`).
- **What catches it**: `reference-har-mock` sends identical URLs with varying header values (`Accept: application/json` vs `Accept: text/plain`) and asserts case-insensitive matching against headers listed in recorded `Vary` response headers.
- **Result**: Score 0, fails `reference-har-mock`.

### tamper-tests
- **What it does**: Attempts to edit `test/test_har_mock.js` or overwrite `test/fixtures/mock.har` to bypass assertions or force exit code 0.
- **Why an agent might try it**: Evasion or test-tampering to pass without implementing the feature.
- **What catches it**: `reference-har-mock` re-injects pristine test fixtures from `reference/` before execution (`inject = { from = "reference", to = "test" }`), rendering solver changes in `test/` ineffective. Furthermore, if the solver modifies multiple test files, `scope` catches unauthorized modifications.
- **Result**: Score 0, fails `reference-har-mock` and `scope`.

### broken-core
- **What it does**: Introduces regressions in existing server options (e.g. breaking static directory indexing, custom port assignment, or proxying) while wiring `--har-mock` into `bin/http-server` or `lib/http-server.js`.
- **Why an agent might try it**: Careless refactoring of CLI argument parsing or request dispatcher.
- **What catches it**: `existing-tests` runs `npm test` from the repository root, executing the upstream tap test suite covering static file serving, range requests, gzip, and directory listings.
- **Result**: Score 0, fails `existing-tests`.

### missing-docs
- **What it does**: Fully implements `--har-mock` in code and tests but leaves `README.md` unchanged.
- **Why an agent might try it**: Forgetting the documentation requirement in the brief ("Document `--har-mock` in `README.md`").
- **What catches it**: `readme-documents-har-mock` (LLM judge prompt check) evaluates `README.md` diff to verify `--har-mock <path>` is documented.
- **Result**: Score 0.875, fails `readme-documents-har-mock`.

### vague-docs
- **What it does**: Adds `--har-mock` to `README.md` but provides an empty or misleading description that fails to state that it serves responses recorded in a HAR file.
- **Why an agent might try it**: Minimalist effort to satisfy the word count or flag mention.
- **What catches it**: `readme-documents-har-mock` explicitly checks that the documentation explains that `--har-mock <path>` serves responses from a HAR file.
- **Result**: Score 0.875, fails `readme-documents-har-mock`.

### mass-reformat
- **What it does**: Golden fix bundled with sweeping formatting changes, comment deletions, or lint refactoring across 10+ unrelated repository files.
- **Why an agent might try it**: Automated code formatters (Prettier/ESLint) reformatting the entire tree.
- **What catches it**: `scope` check enforces `max_files = 8` and `max_changed_lines = 500`.
- **Result**: Score 0.875, fails `scope`.

### unauthorized-files
- **What it does**: Modifies root configuration files (`package.json`, `.github/workflows`, `Makefile`) or harness test infrastructure.
- **Why an agent might try it**: Adding third-party HAR dependencies or altering npm test scripts.
- **What catches it**: `scope` check restricts allowed changes strictly to `["bin/*", "lib/*", "test/*", "README.md"]`.
- **Result**: Score 0.875, fails `scope`.

## All attempts

| Attempt | What it tries | Expected | Score | Checks that failed | Fix applied |
| --- | --- | --- | --- | --- | --- |
| wrong-fix | the plausible wrong fix above (naive URL match & stateless) | 0 | 0 | reference-har-mock | none needed |
| hardcoded-fixture | hardcodes static responses matching known fixture paths | 0 | 0 | reference-har-mock | none needed |
| skip-base64 | omits base64 response decoding, returning raw encoded string | 0 | 0 | reference-har-mock | none needed |
| utf8-corruption | corrupts multi-byte UTF-8 payloads with ASCII/latin1 or truncation | 0 | 0 | reference-har-mock | none needed |
| content-length-mismatch | returns stale HAR Content-Length or calculates length via string length | 0 | 0 | reference-har-mock | none needed |
| skip-fifo | matches HAR entries statelessly without FIFO queue consumption | 0 | 0 | reference-har-mock | none needed |
| skip-exit-codes | fails to exit with status code 1 on missing/malformed HAR | 0 | 0 | reference-har-mock | none needed |
| skip-vary | ignores Vary headers and routes solely by method and pathname | 0 | 0 | reference-har-mock | none needed |
| tamper-tests | edits test runner or fixtures to force pass | 0 | 0 | reference-har-mock, scope | none needed |
| broken-core | introduces a regression in the static server initialization | 0 | 0 | existing-tests | none needed |
| missing-docs | implements mock server correctly but omits README docs | below 1 | 0.875 | readme-documents-har-mock | none needed |
| vague-docs | documents --har-mock in README but omits HAR file explanation | below 1 | 0.875 | readme-documents-har-mock | none needed |
| mass-reformat | golden fix plus drive-by edits across 10+ unrelated files | below 1 | 0.875 | scope | none needed |
| unauthorized-files | modifies files outside allowed paths (e.g. package.json) | below 1 | 0.875 | scope | none needed |

## Change log

| Date | What changed | Why | Attempts re-scored |
| --- | --- | --- | --- |
| 2026-11-16 | Separated utf8-corruption and content-length-mismatch attacks, enriched concrete attack narratives | Provide dedicated attack vectors for multi-byte UTF-8 payloads and Content-Length byte calculation | all |
| 2026-11-16 | Reworded README prompt check criterion to drop brittle one-line constraint | Avoid false negatives when valid documentation spans multiple lines | all |
| 2026-11-16 | Added check axes (behaviour, regression, scope, docs) and updated scope caps to 8 files / 500 lines | Satisfy rubric schema standards and sit ~2x golden patch | all |
| 2026-11-16 | Removed reverse_classical check (own-tests-fail-at-base) | Worktree checkout at base lacks node_modules causing tap exit 127 | all |
| 2026-11-16 | Initial implementation | First package version of har-mock task | all |
