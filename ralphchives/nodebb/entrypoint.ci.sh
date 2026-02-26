#!/bin/bash
# CI entrypoint for NodeBB — non-interactive setup + start.
# Runs admin account setup on first boot, then starts the forum.
set -e

cd /usr/src/app

# Copy the seed config so NodeBB can write to it during setup
mkdir -p /opt/config
cp /tmp/config.ci.json /opt/config/config.json

# Run non-interactive setup (creates admin account, initializes DB, builds assets)
./nodebb setup --config=/opt/config/config.json '{"admin:username":"admin","admin:password":"RalphAdmin123!","admin:password:confirm":"RalphAdmin123!","admin:email":"admin@ralphchives.local"}'

# Start NodeBB in foreground (uses same config)
node app --config=/opt/config/config.json
