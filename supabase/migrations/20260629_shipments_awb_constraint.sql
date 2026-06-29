-- Fix shipments AWB unique constraint for upsert compatibility.
-- The previous partial index (WHERE awb_code IS NOT NULL) is not usable
-- with Supabase's .upsert({ onConflict: "awb_code" }) which generates
-- ON CONFLICT (awb_code) without a WHERE clause.
-- PostgreSQL UNIQUE allows multiple NULLs (NULL != NULL), so this is safe.

DROP INDEX IF EXISTS shipments_awb_idx;
ALTER TABLE shipments ADD CONSTRAINT shipments_awb_unique UNIQUE (awb_code);
