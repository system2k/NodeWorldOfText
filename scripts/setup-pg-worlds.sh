#!/bin/bash
# Creates the dedicated owot_worlds database and role.
# Does NOT modify or drop any existing PostgreSQL databases.

set -euo pipefail

DB_NAME="${OWOT_PG_DATABASE:-owot_worlds}"
DB_USER="${OWOT_PG_USER:-owot_worlds}"
DB_PASS="${OWOT_PG_PASSWORD:-}"
SCHEMA_FILE="$(dirname "$0")/../backend/schema/pg_worlds.sql"

exists() {
	sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1
}

role_exists() {
	sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1
}

if ! role_exists; then
	if [ -n "$DB_PASS" ]; then
		sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';"
	else
		sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN;"
	fi
	echo "Created role ${DB_USER}"
else
	echo "Role ${DB_USER} already exists"
fi

if ! exists; then
	sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
	echo "Created database ${DB_NAME}"
else
	echo "Database ${DB_NAME} already exists"
fi

sudo -u postgres psql -d "${DB_NAME}" -f "${SCHEMA_FILE}"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};"

echo "owot_worlds schema ready."
