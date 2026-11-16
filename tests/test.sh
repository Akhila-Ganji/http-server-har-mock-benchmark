#!/bin/bash
# Test script verifying CLI har-mock option availability
set -euo pipefail

cd /root/repos/http-server
node ./bin/http-server --help | grep -q -- "--har-mock"
