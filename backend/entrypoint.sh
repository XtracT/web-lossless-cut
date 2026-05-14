#!/bin/sh
# Fix permissions for PUID/PGID users at runtime
# Docker volume mounts can reset directory ownership to root
mkdir -p /input /output 2>/dev/null || true
chmod 777 /input /output 2>/dev/null || true

exec node index.js
