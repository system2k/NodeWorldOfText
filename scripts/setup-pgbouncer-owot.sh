#!/bin/bash
# PgBouncer in front of owot_worlds (transaction pooling).
# Multiplexes many sidecar/Node clients onto a small PG connection pool.
set -euo pipefail

DB_NAME="${OWOT_PG_DATABASE:-owot_worlds}"
DB_USER="${OWOT_PG_USER:-owot_worlds}"
DB_PASS="${OWOT_PG_PASSWORD:-}"
PG_HOST="${OWOT_PG_HOST:-127.0.0.1}"
PG_PORT="${OWOT_PG_PORT:-5432}"
BOUNCER_PORT="${OWOT_PGBOUNCER_PORT:-6432}"
POOL_SIZE="${OWOT_PGBOUNCER_POOL_SIZE:-35}"
MAX_CLIENT_CONN="${OWOT_PGBOUNCER_MAX_CLIENT_CONN:-256}"

AUTH_HASH="$(sudo -u postgres psql -tAc "SELECT rolpassword FROM pg_authid WHERE rolname='${DB_USER}'" | tr -d '[:space:]')"
if [ -z "${AUTH_HASH}" ]; then
	echo "Role ${DB_USER} not found in PostgreSQL" >&2
	exit 1
fi

install -d -m 0750 -o postgres -g postgres /etc/pgbouncer

cat > /etc/pgbouncer/pgbouncer.ini <<EOF
;; OWOT worlds — dedicated PgBouncer (see NodeWorldOfText/scripts/setup-pgbouncer-owot.sh)

[databases]
${DB_NAME} = host=${PG_HOST} port=${PG_PORT} dbname=${DB_NAME}

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = ${BOUNCER_PORT}
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
admin_users = postgres
pool_mode = transaction
max_client_conn = ${MAX_CLIENT_CONN}
default_pool_size = ${POOL_SIZE}
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
server_connect_timeout = 5
query_timeout = 120
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits
log_connections = 0
log_disconnections = 0
stats_period = 60
EOF

printf '"%s" "%s"\n' "${DB_USER}" "${AUTH_HASH}" > /etc/pgbouncer/userlist.txt
chown postgres:postgres /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/userlist.txt
chmod 0640 /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/userlist.txt

systemctl enable pgbouncer
systemctl restart pgbouncer
echo "PgBouncer listening on 127.0.0.1:${BOUNCER_PORT} -> ${DB_NAME}"
