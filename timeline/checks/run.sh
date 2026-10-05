#!/usr/bin/env bash
set -e
for f in "$(dirname "$0")"/*.check.ts; do node "$f"; done
