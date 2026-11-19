-- INDEX PARTITION
CREATE INDEX CONCURRENTLY ON $1:name USING btree (app_name, inserted_at DESC);
-- CREATE INDEX CONCURRENTLY ON util.app_run_logs_2025_05 USING btree (app_name, inserted_at DESC);