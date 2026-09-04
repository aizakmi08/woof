-- Remove duplicate indexes left by earlier catalog-coverage reconciliation.

DROP INDEX IF EXISTS public.idx_product_events_name_created;
DROP INDEX IF EXISTS public.idx_product_events_user_created;
