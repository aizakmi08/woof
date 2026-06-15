-- Re-run the product_data ingredient contract on every update, not only when
-- ingredient columns are present in the UPDATE statement. This prevents any
-- direct service-role update to metadata such as expires_at/source/image_url
-- from preserving or reviving a row that no longer satisfies the searchable
-- ingredient contract.

DROP TRIGGER IF EXISTS trg_product_data_ingredient_contract
  ON public.product_data;

CREATE TRIGGER trg_product_data_ingredient_contract
  BEFORE INSERT OR UPDATE
  ON public.product_data
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_data_ingredient_contract();
