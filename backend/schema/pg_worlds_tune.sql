-- Connection budget via PgBouncer (127.0.0.1:6432, transaction pool):
--   Node pool: 8 client conns
--   30 sidecars × 4 pool = 120 client conns
--   PgBouncer default_pool_size = 25 server conns to PostgreSQL
--
-- Apply with: sudo -u postgres psql -d owot_worlds -f pg_worlds_tune.sql

ALTER TABLE tile SET (
    fillfactor = 85,
    autovacuum_vacuum_threshold = 1000,
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_threshold = 100000,
    autovacuum_analyze_scale_factor = 0.2,
    autovacuum_vacuum_cost_delay = 2,
    autovacuum_vacuum_cost_limit = 1000
);

ALTER TABLE world SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.025
);

-- Optional one-time cleanup during low traffic (do NOT run during peak load):
-- VACUUM (ANALYZE) tile;
-- VACUUM ANALYZE world;
