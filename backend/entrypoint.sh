#!/bin/sh
chmod 777 /input /output 2>/dev/null || true
exec node index.js
