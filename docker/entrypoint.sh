#!/bin/sh
set -eu
node backend/dist/db/migrate.js
exec node backend/dist/server.js
