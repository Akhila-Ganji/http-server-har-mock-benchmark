# Check rationale

One `## <check-id>` section per check in `tests/checks.toml`, with these fields:

- **Catches**: what a wrong or lazy solution does that this check notices.
- **Blocker**: `yes` or `no` (must match `checks.toml`), then why.
- **Brief sentence**: the quote from `instruction.md` this check serves.
- **Kills**: the attempts in `docs/hack-report.md` that fail this check, comma-separated.
- Blockers also say why a maintainer would block the merge (**Mergeability**), why a valid
  solution that differs from the golden still passes (**Not over-fit**) and why it gives the same
  result every run (**Reliable**).

`test-sh`, the blocker the verifier adds for your own `tests/test.sh`, needs no section.

## reference-har-mock
- Catches: Naive exact string URL matching (`entry.request.url === req.url`), failure to normalize or URL-decode query parameters in order-independent fashion, failure to match request headers specified in the recorded response `Vary` header (case-insensitively), stateless `.find()` lookup that does not consume matching entries in sequential FIFO order, failure to decode base64 response bodies (`encoding: "base64"`), corrupting multi-byte UTF-8 payloads with naive ASCII/latin1 conversions, inaccurate `Content-Length` headers calculated via string character length instead of byte count, failure to exit with status code 1 on startup when the HAR file is missing or invalid JSON, returning incorrect status or body on unmatched requests (not returning HTTP 404 with JSON body `{"error":"HAR_ENTRY_NOT_FOUND"}`), hardcoding canned responses to match known fixture paths, or attempting to tamper with test files or fixtures.
- Blocker: yes. This tests the primary end-state behavior specified in the task description. An upstream maintainer would block any PR that fails core functional requirements of the HAR 1.2 mock server mode.
- Brief sentence: "Add a `--har-mock <path>` CLI option to `http-server` that serves HTTP responses recorded in a HAR 1.2 JSON file instead of static files." "If the HAR file is missing or contains invalid JSON, exit with status code 1 on startup." "Match incoming requests against HAR entries by HTTP method, URL pathname, order-independent URL-decoded query parameters, and any request headers named in the HAR entry's response `Vary` header (case-insensitively)." "Sequential matching requests must consume entries in FIFO order." "Return recorded status codes, response headers, accurate `Content-Length`, and body content (decoding base64 content when `encoding` is `\"base64\"`)." "Return HTTP 404 with JSON body `{\"error\":\"HAR_ENTRY_NOT_FOUND\"}` when no matching entry remains."
- Kills: wrong-fix, hardcoded-fixture, skip-base64, utf8-corruption, content-length-mismatch, skip-fifo, skip-exit-codes, skip-vary, tamper-tests
- Mergeability: Core correctness and contract adherence of the requested feature.
- Not over-fit: Asserts only observable HTTP request/response behavior over the wire (status codes, headers, response body bytes, and CLI process exit codes); any internal routing or matching architecture passes.
- Reliable: Completely deterministic local offline HTTP test against fixed static fixtures; no network, timers, or random state.

## existing-tests
- Catches: Regressions in pre-existing static file serving, directory indexing, range requests, gzip compression, proxy configuration, or standard CLI options caused by modifications to `bin/http-server` or `lib/http-server.js`.
- Blocker: yes. The brief explicitly instructs to run `npm test` under Test guidelines. In open-source maintainership, regression prevention is a mandatory merge gate; any pull request that breaks pre-existing unit or integration tests is immediately blocked from merging.
- Brief sentence: "Run `npm test` from the repository root."
- Kills: broken-core
- Mergeability: Regression prevention for existing stable server features.
- Not over-fit: Runs the repository's pre-existing upstream test suite (`tap test/*`); does not assert new or implementation-specific internal details.
- Reliable: Runs existing offline Node tap test suite deterministically.

## scope
- Catches: Drive-by refactoring across unrelated codebase files, mass formatting or cosmetic whitespace churn across 10+ files, modifications to root package scripts or dependency manifests (`package.json`, `package-lock.json`), modifications to CI workflows or harness infrastructure, or attempts to modify test runner files to bypass assertions.
- Blocker: no. Caps sit at ~2x the golden patch (max 8 files, max 500 changed lines, compared to golden patch's 5 files and 243 changed lines). This provides generous headroom for alternative clean architectures while blocking excessive sprawl, unwanted refactoring, and evasive file tampering.
- Brief sentence: "Add a `--har-mock <path>` CLI option to `http-server` that serves HTTP responses recorded in a HAR 1.2 JSON file instead of static files." and "Document `--har-mock` in `README.md`."
- Kills: mass-reformat, unauthorized-files, tamper-tests

## readme-documents-har-mock
- Catches: Lazy or incomplete implementations where the developer adds the CLI option to code but fails to update user documentation in `README.md`, or adds a stub/vague description that fails to state that `--har-mock <path>` serves responses from a HAR file.
- Blocker: no. Documentation is a quality signal rather than a hard operational blocker; evaluated by an LLM prompt judge.
- Brief sentence: "Document `--har-mock` in `README.md`."
- Kills: missing-docs, vague-docs
