#!/bin/bash
set -euo pipefail
cd /root/repos/http-server
git apply /solution/golden.patch
