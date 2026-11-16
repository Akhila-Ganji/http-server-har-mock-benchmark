# http-server-har-mock-benchmark

> Harbor evaluation benchmark and reference implementation adding native **HAR 1.2 Mock Server Mode (`--har-mock`)** to [`http-party/http-server`](https://github.com/http-party/http-server).

---

## 📌 Project Overview

This repository provides a reproducible evaluation benchmark, task specification, and reference implementation for extending `http-server` (at upstream commit `0d3b7bb5b6e8a59fd450ae2dca65870009cfcd8b`) with a `--har-mock <path>` command-line option.

When `--har-mock` is specified, `http-server` switches from serving static directory files to replaying recorded HTTP responses from an HTTP Archive (HAR 1.2) JSON specification. This feature is particularly valuable for offline end-to-end integration testing, UI mock testing, and deterministic API simulation.

---

## 🚀 Key Features & Specifications

1. **Order-Independent Query Normalization**
   - Query strings are parsed, URL-decoded, and sorted by parameter keys.
   - Incoming requests match recorded entries regardless of argument ordering (e.g. `?limit=10&page=1` matches recorded `?page=1&limit=10`).

2. **Case-Insensitive `Vary` Header Routing**
   - Supports HTTP content negotiation.
   - When a recorded response contains a `Vary` header (e.g. `Vary: Accept, User-Agent`), incoming requests match against recorded entries only if the named request headers match case-insensitively.

3. **Sequential FIFO Queue Consumption**
   - Enables stateful API simulation (e.g., polling endpoints, state transitions, successive pagination).
   - Identical sequential requests consume matching HAR entries in strict First-In, First-Out (FIFO) order.
   - When all matching recorded entries are exhausted, the server returns HTTP 404 with JSON body:
     ```json
     {"error": "HAR_ENTRY_NOT_FOUND"}
     ```

4. **Binary & Multi-Byte UTF-8 Payload Accuracy**
   - **Base64 Decoding**: Automatically decodes base64-encoded binary assets (e.g., images, binary buffers) when `content.encoding === "base64"`.
   - **Multi-Byte UTF-8 Safety**: Calculates `Content-Length` headers using `Buffer.byteLength(content, 'utf8')` rather than character counts, avoiding truncated transfers and socket hangs on emojis or non-ASCII characters.

5. **Robust Startup Validation & Process Exit Codes**
   - Validates the HAR file existence and JSON syntax before binding the network socket.
   - If the HAR file is missing or contains malformed JSON, the process logs an informative error and exits immediately with process exit code `1`.

---

## 📂 Repository Structure

```
http-server-har-mock-benchmark/
├── README.md                      # Project documentation and usage guide
├── instruction.md                 # Benchmark task specification for coding agents
├── task.toml                      # Harbor benchmark configuration metadata
├── environment/
│   └── Dockerfile                 # Pinned, hermetic Node.js 20 environment
├── solution/
│   ├── golden.patch               # Production reference patch implementing --har-mock
│   └── solve.sh                   # Script applying golden.patch
├── tests/
│   ├── checks.toml                # Harbor automated evaluation rubric
│   ├── test.sh                    # Automated entrypoint CLI test verification
│   └── reference/                 # Hidden evaluation test suite
│       ├── test_har_mock.js       # Comprehensive wire-level HTTP assertions
│       └── fixtures/
│           ├── mock.har           # Multi-entry HAR 1.2 test fixture
│           └── malformed.har      # Malformed JSON fixture for exit code testing
└── docs/
    ├── rationale.md               # Detailed evaluation check justification and rubric design
    └── hack-report.md             # Attack scenarios and evasion analysis
```

---

## 🐳 Docker Setup & Local Reproduction

The benchmark runs inside an isolated, hermetic Docker container pinned to Debian Bookworm on Node.js 20.

### 1. Build the Docker Image

```bash
docker build -t http-server-har-mock -f environment/Dockerfile .
```

### 2. Run the Container Interactively

```bash
docker run -it --rm http-server-har-mock bash
```

Inside the container:
- The base repository is checked out at `/root/repos/http-server` at commit `0d3b7bb5b6e8a59fd450ae2dca65870009cfcd8b`.
- All Node.js dependencies are pre-installed offline in `/root/repos/http-server/node_modules`.

### 3. Apply the Reference Solution

```bash
cd /root/repos/http-server
patch -p1 < /path/to/solution/golden.patch
```

---

## 🧪 Running Tests & Verification

### Running the Reference Suite

The reference test suite (`tests/reference/test_har_mock.js`) exercises all edge cases over the wire:

```bash
cd /root/repos/http-server
node /path/to/tests/reference/test_har_mock.js
```

This verifies:
- ✅ Startup exit code `1` on missing HAR file
- ✅ Startup exit code `1` on invalid JSON in HAR file
- ✅ Reordered query parameter normalization
- ✅ Case-insensitive `Vary` header content negotiation
- ✅ Sequential FIFO state consumption
- ✅ Decoded binary base64 byte accuracy
- ✅ Multi-byte UTF-8 string encoding and `Content-Length` byte length
- ✅ `404` JSON response on unmatched requests

### Running Upstream Regression Tests

Ensure no regressions exist in static file serving or existing CLI options:

```bash
cd /root/repos/http-server
npm test
```

---

## 📄 License & Attribution

- Benchmark design and reference implementation by **Ganji Akhila**.
- Upstream project [`http-party/http-server`](https://github.com/http-party/http-server) is released under the **MIT License**.
