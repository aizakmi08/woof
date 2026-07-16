-- Preserve official Wellness product-family and form evidence that is present
-- in the manufacturer URL and page description but omitted from the page H1.
update public.product_data
set
  product_name = case
    when product_name !~* '\mstews?\M'
      then regexp_replace(product_name, '(?i)Complete Health', 'Complete Health Stews', 'g')
    else product_name
  end,
  product_line = case
    when coalesce(product_line, '') !~* '\mstews?\M'
      then 'Complete Health Stews'
    else product_line
  end,
  food_form = 'wet',
  updated_at = now()
where source = 'wellness-pet-company'
  and source_url ~* 'wellnesspetfood\.com/product-catalog/wellness-complete-health-stews-[^/?]+';
