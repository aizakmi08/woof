-- Preserve Purina Kitten Chow Year One Essentials label code M453025 as an
-- exact source-versioned formula. Purina's current PDP ingredient carousel
-- still exposes an older formula while its June 2026 official label deck and
-- matching package asset expose this formula. Reused GTINs therefore abstain.

CREATE OR REPLACE FUNCTION public.catalog_sync_product_formula_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tier TEXT;
  v_provenance JSONB;
BEGIN
  v_tier := CASE
    WHEN NEW.formula_evidence_tier = 'conflicted'
      THEN 'conflicted'
    -- Preserve an explicit source-version tier when exact verified evidence
    -- says the package is not equivalent to the current manufacturer formula.
    -- This prevents a historical manufacturer page from being relabeled as
    -- current while still requiring complete, conflict-safe provenance.
    WHEN NEW.formula_evidence_tier IN (
        'retailer_web_version', 'web_label_version'
      )
      AND NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.source_quality IN (
        'manufacturer', 'official', 'gdsn', 'retailer_verified'
      )
      AND NEW.ingredient_verification_status IN (
        'manufacturer', 'official', 'gdsn', 'retailer_verified',
        'label_ocr_verified'
      )
      AND NEW.image_verification_status IN (
        'manufacturer', 'official', 'retailer_verified'
      )
      AND NULLIF(btrim(COALESCE(NEW.ingredient_text, '')), '') IS NOT NULL
      AND NULLIF(btrim(COALESCE(NEW.image_url, '')), '') IS NOT NULL
      AND COALESCE(
        NEW.formula_version_provenance->>'manufacturer_current_equivalence',
        'true'
      ) = 'false'
      AND NULLIF(
        btrim(NEW.formula_version_provenance->>'version_status'),
        ''
      ) IS NOT NULL
      AND NEW.formula_version_provenance->>'gtin_resolution_policy' =
        'abstain_on_version_conflict'
      THEN NEW.formula_evidence_tier
    WHEN NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.source_quality IN ('manufacturer', 'official', 'gdsn')
      AND NEW.ingredient_verification_status IN (
        'manufacturer', 'official', 'gdsn'
      )
      AND NEW.image_verification_status IN ('manufacturer', 'official')
      THEN 'manufacturer_current_exact'
    WHEN NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.source_quality = 'retailer_verified'
      AND NEW.ingredient_verification_status = 'retailer_verified'
      AND NEW.image_verification_status = 'retailer_verified'
      THEN 'retailer_web_version'
    WHEN NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.ingredient_verification_status = 'label_ocr_verified'
      AND NEW.image_verification_status IN (
        'manufacturer', 'official', 'retailer_verified'
      )
      THEN 'web_label_version'
    ELSE 'unverified'
  END;

  v_provenance :=
    COALESCE(NEW.formula_version_provenance, '{}'::JSONB) ||
    jsonb_strip_nulls(jsonb_build_object(
      'source_url', NULLIF(trim(NEW.source_url), ''),
      'source', NEW.source,
      'captured_at', COALESCE(NEW.verified_at, NEW.scraped_at),
      'package_gtin', NULLIF(trim(NEW.gtin), ''),
      'package_size', NULLIF(trim(NEW.package_size), ''),
      'ingredient_text_hash', CASE
        WHEN COALESCE(NULLIF(trim(NEW.ingredient_text), ''), '') = ''
          THEN NULL
        ELSE encode(extensions.digest(
          public.catalog_normalize_ingredient_evidence(NEW.ingredient_text),
          'sha256'
        ), 'hex')
      END
    ));

  NEW.formula_evidence_tier := v_tier;
  NEW.formula_version_provenance := v_provenance;
  NEW.nutritional_info :=
    COALESCE(NEW.nutritional_info, '{}'::JSONB) ||
    jsonb_build_object(
      'formula_evidence_tier', v_tier,
      'formula_version_provenance', v_provenance
    );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_catalog_sku_formula_ingredient_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_formula_ingredients TEXT;
  v_formula_tier TEXT;
  v_formula_provenance JSONB;
  v_formula_key TEXT;
  v_formula_source_url TEXT;
  v_formula_brand TEXT;
  v_formula_pet_type TEXT;
  v_formula_food_form TEXT;
  v_formula_image_url TEXT;
BEGIN
  IF NOT COALESCE(NEW.active, FALSE)
     OR NULLIF(regexp_replace(COALESCE(NEW.gtin, ''), '\D', '', 'g'), '') IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT
    ingredient_text,
    formula_evidence_tier,
    formula_version_provenance,
    formula_key,
    source_url,
    brand,
    pet_type,
    food_form,
    front_image_url
  INTO
    v_formula_ingredients,
    v_formula_tier,
    v_formula_provenance,
    v_formula_key,
    v_formula_source_url,
    v_formula_brand,
    v_formula_pet_type,
    v_formula_food_form,
    v_formula_image_url
  FROM public.catalog_formulas
  WHERE id = NEW.formula_id;

  IF NULLIF(btrim(COALESCE(v_formula_ingredients, '')), '') IS NULL THEN
    RAISE EXCEPTION
      'catalog_sku_gtin_formula_missing_ingredients: GTIN % formula %',
      NEW.gtin,
      NEW.formula_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE serving.gtin = NEW.gtin
      AND NULLIF(btrim(COALESCE(serving.ingredient_text, '')), '') IS NOT NULL
      AND serving.ingredient_verification_status IN (
        'gdsn', 'official', 'manufacturer', 'retailer_verified',
        'label_ocr_verified'
      )
      AND public.catalog_normalize_ingredient_evidence(serving.ingredient_text)
          <> public.catalog_normalize_ingredient_evidence(v_formula_ingredients)
  ) THEN
    IF (
      v_formula_tier IN ('retailer_web_version', 'web_label_version')
      AND COALESCE(
        v_formula_provenance->>'allow_reused_gtin_version',
        'false'
      ) = 'true'
      AND v_formula_provenance->>'gtin_resolution_policy' =
        'abstain_on_version_conflict'
      AND EXISTS (
        SELECT 1
        FROM public.product_data exact_version
        WHERE exact_version.gtin = NEW.gtin
          AND exact_version.formula_evidence_tier = v_formula_tier
          AND exact_version.source_url = v_formula_source_url
          AND exact_version.formula_version_provenance
                ->>'canonical_formula_key' = v_formula_key
          AND exact_version.formula_version_provenance
                ->>'gtin_resolution_policy' = 'abstain_on_version_conflict'
          AND exact_version.ingredient_verification_status IN (
            'retailer_verified', 'label_ocr_verified'
          )
          AND exact_version.image_verification_status IN (
            'retailer_verified', 'manufacturer', 'official'
          )
          AND lower(btrim(COALESCE(exact_version.brand, ''))) =
              lower(btrim(COALESCE(v_formula_brand, '')))
          AND lower(btrim(COALESCE(exact_version.pet_type, ''))) =
              lower(btrim(COALESCE(v_formula_pet_type, '')))
          AND lower(btrim(COALESCE(exact_version.food_form, ''))) =
              lower(btrim(COALESCE(v_formula_food_form, '')))
          AND exact_version.image_url = v_formula_image_url
          AND public.catalog_normalize_ingredient_evidence(
                exact_version.ingredient_text
              ) = public.catalog_normalize_ingredient_evidence(
                v_formula_ingredients
              )
      )
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'catalog_sku_gtin_formula_ingredient_conflict: GTIN % cannot link to formula %',
      NEW.gtin,
      NEW.formula_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TEMP TABLE catalog_kitten_chow_legacy_version ON COMMIT DROP AS
SELECT *
FROM public.product_data
WHERE cache_key = 'nestle-purina-cat-chow:017800150200';

-- Canonical bounded-evidence staging call generated from the reviewed CSV.
SELECT public.stage_catalog_census_batch(
  convert_from(decode('eyJydW5fa2V5IjoibmVzdGxlLXB1cmluYS1jYXQtY2hvdzpib3VuZGVkLWV4YWN0LWV2aWRlbmNlOmI4MTQzZWJjZWM1MmY2YWMyZWI1NzY1MSIsInNvdXJjZV9zbHVnIjoibmVzdGxlLXB1cmluYS1jYXQtY2hvdyIsInNvdXJjZV90eXBlIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2Vfcm9sZSI6InZlcmlmaWNhdGlvbiIsInN0YXR1cyI6ImNvbXBsZXRlZCIsInN0YXJ0ZWRfYXQiOiIyMDI2LTA4LTA0VDExOjMyOjM0LjkyM1oiLCJleHBlY3RlZF9jb3VudCI6MSwicGFnaW5hdGlvbl9jb21wbGV0ZSI6ZmFsc2UsInRydW5jYXRlZCI6ZmFsc2UsImNhcF9yZWFjaGVkIjpmYWxzZSwic291cmNlX2NvbnRlbnRfaGFzaCI6ImI4MTQzZWJjZWM1MmY2YWMyZWI1NzY1MWZmYWM0ZWI1MGRlNjkxZTY1NjRiMmViODE2ZTk5YThhMWMxMzU4ODIiLCJjaGVja3BvaW50Ijp7ImZlZWRfcm93X2NvdW50IjoxLCJhY2NlcHRlZF9vYnNlcnZhdGlvbl9jb3VudCI6MSwiY2Fub25pY2FsX2Zvcm11bGFfY291bnQiOjF9LCJtZXRhZGF0YSI6eyJicmFuZCI6IlB1cmluYSBDYXQgQ2hvdyIsIm1hbnVmYWN0dXJlciI6Ik5lc3Rsw6kgUHVyaW5hIFBldENhcmUgQ29tcGFueSIsInNvdXJjZV9hdXRob3JpdHkiOiJtYW51ZmFjdHVyZXIiLCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlLCJwYWNrYWdlX3NpemVfaXNfc2t1X29ubHkiOnRydWUsInF1YXJhbnRpbmVkX2NvdW50IjowLCJzY29wZV9leGNsdWRlZF9ub25fY29tcGxldGVfY291bnQiOjAsInNvdXJjZV9mZWVkX3Jvd19jb3VudCI6MywiYnJhbmRfc2NvcGVkX2ZlZWRfcm93X2NvdW50IjozLCJzb3VyY2VfZmVlZF9vdXRfb2Zfc2NvcGVfY291bnQiOjAsInNvdXJjZV9mZWVkX291dF9vZl9zY29wZV9icmFuZHMiOltdLCJzZXJ2aW5nX2V2aWRlbmNlX2luY2x1ZGVfY291bnQiOjEsInNlcnZpbmdfZXZpZGVuY2VfcHJlZmxpZ2h0X2V4Y2x1ZGVkX2NvdW50IjowLCJzZXJ2aW5nX2V2aWRlbmNlX3ByZWZsaWdodF9leGNsdWRlZF9jYWNoZV9rZXlzIjpbXSwic2t1X29ubHlfb2JzZXJ2YXRpb25fY291bnQiOjAsInNrdV9vbmx5X29ic2VydmF0aW9uX2NhY2hlX2tleXMiOltdLCJyZXZpZXdlZF9zZXJ2aW5nX2lkZW50aXR5X2NvdW50IjowLCJyZXZpZXdlZF9zZXJ2aW5nX2lkZW50aXR5X2NhY2hlX2tleXMiOltdLCJzZXJ2aW5nX2NhY2hlX2tleV9tYXBwaW5nX2NvdW50IjowLCJzZXJ2aW5nX2NhY2hlX2tleV9tb2RlIjoiYnJhbmQtdGl0bGUtdXJsIiwib2ZmaWNpYWxfaW52ZW50b3J5X2Z1bGwiOmZhbHNlLCJib3VuZGVkX2V4YWN0X2V2aWRlbmNlIjp0cnVlLCJjdXJyZW50X29mZmljaWFsX3NrdV9jYWNoZV9rZXlzIjpbIm5lc3RsZS1wdXJpbmEtY2F0LWNob3c6MDE3ODAwMTUwMjI0Il0sImN1cnJlbnRfc2VydmluZ19jYWNoZV9rZXlzIjpbIm5lc3RsZS1wdXJpbmEtY2F0LWNob3c6MDE3ODAwMTUwMjI0Il19fQ==', 'base64'), 'UTF8')::jsonb,
  convert_from(decode('W3siZm9ybXVsYV9rZXkiOiJuZXN0bGUgcHVyaW5hIHBldGNhcmUgY29tcGFueXxwdXJpbmEgY2F0IGNob3d8cHVyaW5hIGtpdHRlbiBjaG93IHllYXIgb25lIGVzc2VudGlhbHMgd2l0aCByZWFsIGNoaWNrZW58Y2F0fGtpdHRlbnxkcnl8cmVhbCBjaGlja2VufCIsImlkZW50aXR5X2hhc2giOiJlNjgwMTJlNGNmMTM5OTViNDhiOGUzMWRjYWU0MmI2YzliMGM1ZWJhMmM2YTQ0ZmZmZjU5NGI2ZmFjMzJiZmZlIiwibWFudWZhY3R1cmVyIjoiTmVzdGzDqSBQdXJpbmEgUGV0Q2FyZSBDb21wYW55IiwiYnJhbmQiOiJQdXJpbmEgQ2F0IENob3ciLCJwcm9kdWN0X25hbWUiOiJQdXJpbmEgS2l0dGVuIENob3cgWWVhciBPbmUgRXNzZW50aWFscyB3aXRoIFJlYWwgQ2hpY2tlbiIsInByb2R1Y3RfbGluZSI6IktpdHRlbiBDaG93IFllYXIgT25lIEVzc2VudGlhbHMiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJraXR0ZW4iLCJmb29kX2Zvcm0iOiJkcnkiLCJmbGF2b3IiOiJSZWFsIENoaWNrZW4iLCJkaWV0X2NvbmRpdGlvbiI6IiIsInNvdXJjZV9zbHVnIjoibmVzdGxlLXB1cmluYS1jYXQtY2hvdyIsInNvdXJjZV9leHRlcm5hbF9pZCI6Im5lc3RsZS1wdXJpbmEtY2F0LWNob3c6MDE3ODAwMTUwMjI0Iiwic291cmNlX3VybCI6Imh0dHBzOi8vd3d3LnB1cmluYS5jb20vY2F0cy9zaG9wL2NhdC1jaG93LWtpdHRlbi1jaG93LW11c2NsZS1icmFpbi1kZXZlbG9wbWVudC1jaGlja2VuLWRyeS1jYXQtZm9vZCIsInNvdXJjZV9hdXRob3JpdHkiOiJtYW51ZmFjdHVyZXIiLCJndGluIjoiMDE3ODAwMTUwMjI0IiwicGFja2FnZV9zaXplIjoiNi4zIGxiIiwiaW5ncmVkaWVudF90ZXh0IjoiUG91bHRyeSBieS1wcm9kdWN0IG1lYWwsIGNvcm4gcHJvdGVpbiBtZWFsLCByaWNlLCBzb3liZWFuIG1lYWwsIGFuaW1hbCBmYXQgcHJlc2VydmVkIHdpdGggbWl4ZWQgdG9jb3BoZXJvbHMsIGdyb3VuZCB3aG9sZSB3aGVhdCwgY2hpY2tlbiwgZmlzaCBtZWFsLCBsaXZlciBmbGF2b3IsIGRyaWVkIHllYXN0LCBwaG9zcGhvcmljIGFjaWQsIGNhbGNpdW0gY2FyYm9uYXRlLCBzYWx0LCBjaG9saW5lIGNobG9yaWRlLCBNSU5FUkFMUyBbemluYyBzdWxmYXRlLCBmZXJyb3VzIHN1bGZhdGUsIG1hbmdhbmVzZSBzdWxmYXRlLCBjb3BwZXIgc3VsZmF0ZSwgY2FsY2l1bSBpb2RhdGUsIHNvZGl1bSBzZWxlbml0ZV0sIFZJVEFNSU5TIFtWaXRhbWluIEUgc3VwcGxlbWVudCwgbmlhY2luIChWaXRhbWluIEItMyksIHRoaWFtaW5lIG1vbm9uaXRyYXRlIChWaXRhbWluIEItMSksIGNhbGNpdW0gcGFudG90aGVuYXRlIChWaXRhbWluIEItNSksIHJpYm9mbGF2aW4gc3VwcGxlbWVudCAoVml0YW1pbiBCLTIpLCBWaXRhbWluIEEgc3VwcGxlbWVudCwgcHlyaWRveGluZSBoeWRyb2NobG9yaWRlIChWaXRhbWluIEItNiksIFZpdGFtaW4gQi0xMiBzdXBwbGVtZW50LCBmb2xpYyBhY2lkIChWaXRhbWluIEItOSksIGJpb3RpbiAoVml0YW1pbiBCLTcpLCBWaXRhbWluIEQtMyBzdXBwbGVtZW50LCBtZW5hZGlvbmUgc29kaXVtIGJpc3VsZml0ZSBjb21wbGV4IChWaXRhbWluIEspXSwgdGF1cmluZSwgcG90YXNzaXVtIGNobG9yaWRlLiIsImluZ3JlZGllbnRzIjpbIlBvdWx0cnkgYnktcHJvZHVjdCBtZWFsIiwiY29ybiBwcm90ZWluIG1lYWwiLCJyaWNlIiwic295YmVhbiBtZWFsIiwiYW5pbWFsIGZhdCBwcmVzZXJ2ZWQgd2l0aCBtaXhlZCB0b2NvcGhlcm9scyIsImdyb3VuZCB3aG9sZSB3aGVhdCIsImNoaWNrZW4iLCJmaXNoIG1lYWwiLCJsaXZlciBmbGF2b3IiLCJkcmllZCB5ZWFzdCIsInBob3NwaG9yaWMgYWNpZCIsImNhbGNpdW0gY2FyYm9uYXRlIiwic2FsdCIsImNob2xpbmUgY2hsb3JpZGUiLCJ6aW5jIHN1bGZhdGUiLCJmZXJyb3VzIHN1bGZhdGUiLCJtYW5nYW5lc2Ugc3VsZmF0ZSIsImNvcHBlciBzdWxmYXRlIiwiY2FsY2l1bSBpb2RhdGUiLCJzb2RpdW0gc2VsZW5pdGUiLCJWaXRhbWluIEUgc3VwcGxlbWVudCIsIm5pYWNpbiAoVml0YW1pbiBCLTMpIiwidGhpYW1pbmUgbW9ub25pdHJhdGUgKFZpdGFtaW4gQi0xKSIsImNhbGNpdW0gcGFudG90aGVuYXRlIChWaXRhbWluIEItNSkiLCJyaWJvZmxhdmluIHN1cHBsZW1lbnQgKFZpdGFtaW4gQi0yKSIsIlZpdGFtaW4gQSBzdXBwbGVtZW50IiwicHlyaWRveGluZSBoeWRyb2NobG9yaWRlIChWaXRhbWluIEItNikiLCJWaXRhbWluIEItMTIgc3VwcGxlbWVudCIsImZvbGljIGFjaWQgKFZpdGFtaW4gQi05KSIsImJpb3RpbiAoVml0YW1pbiBCLTcpIiwiVml0YW1pbiBELTMgc3VwcGxlbWVudCIsIm1lbmFkaW9uZSBzb2RpdW0gYmlzdWxmaXRlIGNvbXBsZXggKFZpdGFtaW4gSykiLCJ0YXVyaW5lIiwicG90YXNzaXVtIGNobG9yaWRlIl0sImZyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LnB1cmluYS5jb20vc2l0ZXMvZGVmYXVsdC9maWxlcy9wcm9kdWN0cy8yMDI2LTA2L2tpdHRlbl9jaG93X3llYXJfb25lX2Vzc2VudGlhbHNfcGFja2FnZS5wbmciLCJpc19jb21wbGV0ZV9mb29kIjp0cnVlLCJhdmFpbGFibGVfaW5fdXMiOnRydWUsInByb3RlY3RlZF90ZXJtcyI6WyJQdXJpbmEgQ2F0IENob3ciLCJLaXR0ZW4gQ2hvdyBZZWFyIE9uZSBFc3NlbnRpYWxzIiwiUmVhbCBDaGlja2VuIiwiY2F0Iiwia2l0dGVuIiwiZHJ5Il0sIm9ic2VydmVkX2F0IjoiMjAyNi0wOC0wNFQxMTozMjozNC45MjNaIiwiY29udGVudF9oYXNoIjoiYTVkYzBkNzM2YmM0MmM3MGQ1OWExMzg4OTBmMDhhNjAyMTQ4ZjI4N2Q1Y2U0ZWNiNjkzY2ZjMzVlZmZlOWU2YiIsInZhbGlkYXRpb25fc3RhdHVzIjoiYWNjZXB0ZWQiLCJ2YWxpZGF0aW9uX3JlYXNvbnMiOltdLCJpbmdyZWRpZW50X3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJsYWJlbF9vY3JfdmVyaWZpZWQiLCJpbWFnZV92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2VfdGllciI6InRpZXJfMV91c19yZXRhaWwiLCJyYXdfcGF5bG9hZCI6eyJjYWNoZV9rZXkiOiJuZXN0bGUtcHVyaW5hLWNhdC1jaG93OjAxNzgwMDE1MDIyNCIsImluZ3JlZGllbnRfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LnB1cmluYS5jb20vc2l0ZXMvZGVmYXVsdC9maWxlcy9wcm9kdWN0LWxhYmVsLWRlY2stZmlsZS8yMDI2LTA2LzQ1MzBfbTQ1MzAyNV9raXR0ZW5fY2hvd195ZWFyX29uZV9lc3NlbnRpYWxzX3dfcmVhbF9jaGlja2VuX2RyeV9raXR0ZW5fZm9vZF9jYjVfMS5wZGYiLCJpbWFnZV9zb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cucHVyaW5hLmNvbS9zaXRlcy9kZWZhdWx0L2ZpbGVzL3Byb2R1Y3RzLzIwMjYtMDYva2l0dGVuX2Nob3dfeWVhcl9vbmVfZXNzZW50aWFsc19wYWNrYWdlLnBuZyIsImNhbm9uaWNhbF9mb3JtdWxhX2lkZW50aXR5Ijp7Im1hbnVmYWN0dXJlciI6Im5lc3RsZSBwdXJpbmEgcGV0Y2FyZSBjb21wYW55IiwiYnJhbmQiOiJwdXJpbmEgY2F0IGNob3ciLCJwcm9kdWN0X2xpbmUiOiJwdXJpbmEga2l0dGVuIGNob3cgeWVhciBvbmUgZXNzZW50aWFscyB3aXRoIHJlYWwgY2hpY2tlbiIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6ImtpdHRlbiIsImZvb2RfZm9ybSI6ImRyeSIsImZsYXZvciI6InJlYWwgY2hpY2tlbiIsImRpZXRfY29uZGl0aW9uIjoiIn0sImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWUsInBhY2thZ2Vfc2l6ZV9pc19za3Vfb25seSI6dHJ1ZX19XQ==', 'base64'), 'UTF8')::jsonb
) AS stage_result;

DO $$
DECLARE
  v_formula_id BIGINT;
  v_run_id BIGINT;
  v_primary_cache_key TEXT;
  v_formula_key TEXT :=
    'nestle purina petcare company|purina cat chow|purina kitten chow year one essentials with real chicken|cat|kitten|dry|real chicken|';
  v_run_key TEXT :=
    'nestle-purina-cat-chow:bounded-exact-evidence:b8143ebcec52f6ac2eb57651';
  v_pdp_url TEXT :=
    'https://www.purina.com/cats/shop/cat-chow-kitten-chow-muscle-brain-development-chicken-dry-cat-food';
  v_label_url TEXT :=
    'https://www.purina.com/sites/default/files/product-label-deck-file/2026-06/4530_m453025_kitten_chow_year_one_essentials_w_real_chicken_dry_kitten_food_cb5_1.pdf';
  v_image_url TEXT :=
    'https://www.purina.com/sites/default/files/products/2026-06/kitten_chow_year_one_essentials_package.png';
  v_observed_at TIMESTAMPTZ := '2026-08-04T11:32:34.923Z';
  v_ingredients TEXT :=
    'Poultry by-product meal, corn protein meal, rice, soybean meal, animal fat preserved with mixed tocopherols, ground whole wheat, chicken, fish meal, liver flavor, dried yeast, phosphoric acid, calcium carbonate, salt, choline chloride, MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate, calcium iodate, sodium selenite], VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), thiamine mononitrate (Vitamin B-1), calcium pantothenate (Vitamin B-5), riboflavin supplement (Vitamin B-2), Vitamin A supplement, pyridoxine hydrochloride (Vitamin B-6), Vitamin B-12 supplement, folic acid (Vitamin B-9), biotin (Vitamin B-7), Vitamin D-3 supplement, menadione sodium bisulfite complex (Vitamin K)], taurine, potassium chloride.';
  v_ingredient_hash TEXT;
  v_provenance JSONB;
  v_extra_cache_315 TEXT;
  v_extra_cache_14 TEXT;
  v_legacy_version public.product_data%ROWTYPE;
BEGIN
  v_ingredient_hash := encode(
    digest(public.catalog_normalize_ingredient_evidence(v_ingredients), 'sha256'),
    'hex'
  );
  v_extra_cache_315 := 'census-version:' || md5(
    v_formula_key || ':017800150200:' || v_pdp_url || ':' ||
    v_ingredients || ':' || v_image_url
  );
  v_extra_cache_14 := 'census-version:' || md5(
    v_formula_key || ':017800106252:' || v_pdp_url || ':' ||
    v_ingredients || ':' || v_image_url
  );
  v_provenance := jsonb_build_object(
    'version_status', 'source_versioned_official_label',
    'manufacturer_current_equivalence', FALSE,
    'manufacturer_pdp_ingredient_conflict', TRUE,
    'source', 'Purina official June 2026 package label deck',
    'source_url', v_pdp_url,
    'ingredient_source_url', v_label_url,
    'image_source_url', v_image_url,
    'captured_at', v_observed_at,
    'label_code', 'M453025',
    'ingredient_text_hash', v_ingredient_hash,
    'canonical_formula_key', v_formula_key,
    'package_size_is_sku_only', TRUE,
    'allow_reused_gtin_version', TRUE,
    'gtin_resolution_policy', 'abstain_on_version_conflict'
  );

  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = v_run_key;

  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key;

  SELECT * INTO STRICT v_legacy_version
  FROM catalog_kitten_chow_legacy_version old_version
  WHERE old_version.cache_key = 'nestle-purina-cat-chow:017800150200'
    AND old_version.gtin = '017800150200'
    AND old_version.source_url = v_pdp_url
    AND public.catalog_normalize_ingredient_evidence(
          old_version.ingredient_text
        ) <> public.catalog_normalize_ingredient_evidence(v_ingredients);

  IF (
    SELECT count(*)
    FROM public.product_data retailer_version
    WHERE retailer_version.gtin IN ('017800150200', '017800106252')
      AND retailer_version.formula_evidence_tier = 'retailer_web_version'
      AND public.catalog_normalize_ingredient_evidence(
            retailer_version.ingredient_text
          ) <> public.catalog_normalize_ingredient_evidence(v_ingredients)
  ) < 2 THEN
    RAISE EXCEPTION
      'Expected conflicting PetSmart Kitten Chow package versions are missing';
  END IF;

  UPDATE public.product_data
  SET formula_evidence_tier = 'web_label_version',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'legacy_manufacturer_page_version',
          'manufacturer_current_equivalence', FALSE,
          'superseded_by_label_code', 'M453025',
          'superseding_ingredient_source_url', v_label_url,
          'gtin_resolution_policy', 'abstain_on_version_conflict'
        ),
      updated_at = now()
  WHERE cache_key = 'nestle-purina-cat-chow:017800150200';

  UPDATE public.catalog_formulas
  SET manufacturer = 'Nestlé Purina PetCare Company',
      brand = 'Purina Cat Chow',
      product_name =
        'Purina Kitten Chow Year One Essentials with Real Chicken',
      product_line = 'Kitten Chow Year One Essentials',
      pet_type = 'cat',
      life_stage = 'kitten',
      food_form = 'dry',
      flavor = 'Real Chicken',
      diet_condition = '',
      is_complete_food = TRUE,
      complete_food_evidence =
        'Purina official label deck M453025 states Complete Kitten Food and an AAFCO all-life-stages adequacy statement.',
      ingredient_text = v_ingredients,
      ingredients = public.catalog_split_ingredient_statement(v_ingredients),
      front_image_url = v_image_url,
      source_url = v_pdp_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'label_ocr_verified',
      image_verification_status = 'manufacturer',
      protected_terms = ARRAY[
        'Purina Cat Chow', 'Kitten Chow', 'Year One Essentials',
        'Real Chicken', 'cat', 'kitten', 'dry', 'M453025'
      ]::TEXT[],
      verification_status = 'verified',
      active = TRUE,
      is_popular_brand = TRUE,
      absent_since = NULL,
      formula_evidence_tier = 'web_label_version',
      formula_version_provenance = v_provenance,
      last_observed_at = v_observed_at,
      updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.catalog_observations
  SET formula_evidence_tier = 'web_label_version',
      formula_version_provenance = v_provenance || jsonb_build_object(
        'package_gtin', '017800150224',
        'package_size', '6.3 lb'
      ),
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'ingredient_source_url', v_label_url,
        'image_source_url', v_image_url,
        'label_code', 'M453025',
        'manufacturer_pdp_ingredient_conflict', TRUE
      )
  WHERE run_id = v_run_id
    AND formula_id = v_formula_id
    AND gtin = '017800150224';

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_formula_id,
    observation.id,
    evidence.field_name,
    evidence.field_value,
    evidence.source_url,
    'manufacturer',
    TRUE,
    v_observed_at,
    encode(digest(
      v_formula_id::TEXT || '|' || evidence.field_name || '|' ||
      evidence.source_url || '|' || evidence.field_value::TEXT,
      'sha256'
    ), 'hex')
  FROM public.catalog_observations observation
  CROSS JOIN LATERAL (VALUES
    ('ingredient_text', to_jsonb(v_ingredients), v_label_url),
    ('front_image_url', to_jsonb(v_image_url), v_image_url),
    ('complete_food_evidence', to_jsonb(
      'Purina official label deck M453025: Complete Kitten Food; AAFCO all life stages.'::TEXT
    ), v_label_url)
  ) AS evidence(field_name, field_value, source_url)
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = v_formula_id
    AND observation.gtin = '017800150224'
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET observation_id = excluded.observation_id,
      field_value = excluded.field_value,
      source_authority = excluded.source_authority,
      accepted = TRUE,
      observed_at = excluded.observed_at;

  PERFORM * FROM public.promote_catalog_formula(v_formula_id);

  SELECT promoted_cache_key INTO STRICT v_primary_cache_key
  FROM public.catalog_formulas
  WHERE id = v_formula_id;

  PERFORM *
  FROM public.upsert_catalog_product_feed(jsonb_build_array(
    jsonb_build_object(
      'cache_key', v_extra_cache_315,
      'product_name', 'Purina Kitten Chow Year One Essentials with Real Chicken',
      'brand', 'Purina Cat Chow',
      'gtin', '017800150200',
      'product_line', 'Kitten Chow Year One Essentials',
      'flavor', 'Real Chicken',
      'life_stage', 'kitten',
      'food_form', 'dry',
      'package_size', '3.15 lb',
      'pet_type', 'cat',
      'ingredients', to_jsonb(public.catalog_split_ingredient_statement(v_ingredients)),
      'ingredient_text', v_ingredients,
      'source', 'nestle-purina-cat-chow',
      'source_quality', 'manufacturer',
      'ingredient_verification_status', 'label_ocr_verified',
      'image_verification_status', 'manufacturer',
      'verified_at', v_observed_at,
      'source_url', v_pdp_url,
      'scraped_at', v_observed_at,
      'expires_at', v_observed_at + INTERVAL '365 days',
      'image_url', v_image_url,
      'is_complete_food', TRUE,
      'formula_evidence_tier', 'web_label_version',
      'formula_version_provenance', v_provenance || jsonb_build_object(
        'package_gtin', '017800150200', 'package_size', '3.15 lb'
      )
    ),
    jsonb_build_object(
      'cache_key', v_extra_cache_14,
      'product_name', 'Purina Kitten Chow Year One Essentials with Real Chicken',
      'brand', 'Purina Cat Chow',
      'gtin', '017800106252',
      'product_line', 'Kitten Chow Year One Essentials',
      'flavor', 'Real Chicken',
      'life_stage', 'kitten',
      'food_form', 'dry',
      'package_size', '14 lb',
      'pet_type', 'cat',
      'ingredients', to_jsonb(public.catalog_split_ingredient_statement(v_ingredients)),
      'ingredient_text', v_ingredients,
      'source', 'nestle-purina-cat-chow',
      'source_quality', 'manufacturer',
      'ingredient_verification_status', 'label_ocr_verified',
      'image_verification_status', 'manufacturer',
      'verified_at', v_observed_at,
      'source_url', v_pdp_url,
      'scraped_at', v_observed_at,
      'expires_at', v_observed_at + INTERVAL '365 days',
      'image_url', v_image_url,
      'is_complete_food', TRUE,
      'formula_evidence_tier', 'web_label_version',
      'formula_version_provenance', v_provenance || jsonb_build_object(
        'package_gtin', '017800106252', 'package_size', '14 lb'
      )
    )
  ));

  -- The generic serving-feed importer intentionally accepts only its legacy
  -- field set. Attach the reviewed version tier and provenance explicitly so
  -- each exact package row can satisfy the reused-GTIN safety guard.
  UPDATE public.product_data serving
  SET formula_evidence_tier = 'web_label_version',
      formula_version_provenance = v_provenance || jsonb_build_object(
        'package_gtin', package.gtin,
        'package_size', package.package_size
      ),
      updated_at = now()
  FROM (VALUES
    (v_primary_cache_key, '017800150224', '6.3 lb'),
    (v_extra_cache_315, '017800150200', '3.15 lb'),
    (v_extra_cache_14, '017800106252', '14 lb')
  ) AS package(cache_key, gtin, package_size)
  WHERE serving.cache_key = package.cache_key
    AND serving.gtin = package.gtin
    AND serving.source_url = v_pdp_url
    AND public.catalog_normalize_ingredient_evidence(
          serving.ingredient_text
        ) = public.catalog_normalize_ingredient_evidence(v_ingredients)
    AND serving.image_url = v_image_url;

  IF (
    SELECT count(*)
    FROM public.product_data serving
    WHERE serving.cache_key IN (
      v_primary_cache_key, v_extra_cache_315, v_extra_cache_14
    )
      AND serving.formula_evidence_tier = 'web_label_version'
      AND serving.formula_version_provenance
            ->>'canonical_formula_key' = v_formula_key
      AND serving.formula_version_provenance
            ->>'gtin_resolution_policy' = 'abstain_on_version_conflict'
  ) <> 3 THEN
    RAISE EXCEPTION
      'Purina Kitten Chow exact package serving versions were not preserved';
  END IF;

  -- The serving importer may replace a stale same-source row while creating
  -- the exact package version. Restore the reviewed legacy evidence as its
  -- own source-versioned serving row so reused barcodes remain ambiguous.
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data legacy
    WHERE legacy.cache_key = v_legacy_version.cache_key
      AND public.catalog_normalize_ingredient_evidence(
            legacy.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            v_legacy_version.ingredient_text
          )
      AND legacy.image_url = v_legacy_version.image_url
  ) THEN
    INSERT INTO public.product_data
    SELECT * FROM catalog_kitten_chow_legacy_version
    ON CONFLICT (cache_key) DO NOTHING;
  END IF;

  UPDATE public.product_data legacy
  SET product_name = v_legacy_version.product_name,
      brand = v_legacy_version.brand,
      ingredients = v_legacy_version.ingredients,
      ingredient_text = v_legacy_version.ingredient_text,
      ingredient_count = v_legacy_version.ingredient_count,
      source = v_legacy_version.source,
      source_url = v_legacy_version.source_url,
      image_url = v_legacy_version.image_url,
      is_complete_food = v_legacy_version.is_complete_food,
      catalog_exclusion_reason = v_legacy_version.catalog_exclusion_reason,
      pet_type = v_legacy_version.pet_type,
      source_quality = v_legacy_version.source_quality,
      ingredient_verification_status =
        v_legacy_version.ingredient_verification_status,
      image_verification_status = v_legacy_version.image_verification_status,
      verified_at = v_legacy_version.verified_at,
      gtin = v_legacy_version.gtin,
      product_line = v_legacy_version.product_line,
      flavor = v_legacy_version.flavor,
      life_stage = v_legacy_version.life_stage,
      food_form = v_legacy_version.food_form,
      package_size = v_legacy_version.package_size,
      formula_evidence_tier = 'web_label_version',
      formula_version_provenance =
        COALESCE(v_legacy_version.formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'legacy_manufacturer_page_version',
          'manufacturer_current_equivalence', FALSE,
          'superseded_by_label_code', 'M453025',
          'superseding_ingredient_source_url', v_label_url,
          'gtin_resolution_policy', 'abstain_on_version_conflict'
        ),
      updated_at = now()
  WHERE legacy.cache_key = v_legacy_version.cache_key
  ;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    formula_evidence_tier, formula_version_provenance, raw_payload
  )
  SELECT
    v_run_id,
    v_formula_id,
    'nestle-purina-cat-chow',
    package.source_external_id,
    v_pdp_url,
    'manufacturer',
    package.gtin,
    'Nestlé Purina PetCare Company',
    'Purina Cat Chow',
    'Purina Kitten Chow Year One Essentials with Real Chicken',
    'Kitten Chow Year One Essentials',
    'cat', 'kitten', 'dry', 'Real Chicken', '', package.package_size,
    v_ingredients,
    v_image_url,
    TRUE,
    TRUE,
    v_observed_at,
    encode(digest(
      v_formula_key || '|' || package.gtin || '|' ||
      v_ingredient_hash || '|' || v_image_url,
      'sha256'
    ), 'hex'),
    'accepted',
    ARRAY[]::TEXT[],
    'web_label_version',
    v_provenance || jsonb_build_object(
      'package_gtin', package.gtin,
      'package_size', package.package_size
    ),
    jsonb_build_object(
      'cache_key', package.cache_key,
      'ingredient_source_url', v_label_url,
      'image_source_url', v_image_url,
      'label_code', 'M453025',
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'manufacturer_pdp_ingredient_conflict', TRUE
    )
  FROM (VALUES
    ('017800150200', '3.15 lb',
      'nestle-purina-cat-chow:017800150200', v_extra_cache_315),
    ('017800106252', '14 lb',
      'nestle-purina-cat-chow:017800106252', v_extra_cache_14)
  ) AS package(gtin, package_size, source_external_id, cache_key)
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
  SET formula_id = excluded.formula_id,
      source_url = excluded.source_url,
      source_authority = excluded.source_authority,
      gtin = excluded.gtin,
      package_size = excluded.package_size,
      ingredient_text = excluded.ingredient_text,
      front_image_url = excluded.front_image_url,
      validation_status = 'accepted',
      validation_reasons = ARRAY[]::TEXT[],
      formula_evidence_tier = excluded.formula_evidence_tier,
      formula_version_provenance = excluded.formula_version_provenance,
      raw_payload = excluded.raw_payload,
      observed_at = excluded.observed_at;

  UPDATE public.catalog_source_runs
  SET expected_count = 3,
      observed_count = 3,
      accepted_count = 3,
      rejected_count = 0,
      checkpoint = COALESCE(checkpoint, '{}'::JSONB) || jsonb_build_object(
        'feed_row_count', 3,
        'accepted_observation_count', 3,
        'canonical_formula_count', 1
      ),
      metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
        'all_published_gtins_staged', TRUE,
        'published_gtins', jsonb_build_array(
          '017800150200', '017800150224', '017800106252'
        ),
        'formula_evidence_tier', 'web_label_version',
        'manufacturer_pdp_ingredient_conflict', TRUE,
        'gtin_resolution_policy', 'abstain_on_version_conflict'
      ),
      updated_at = now()
  WHERE id = v_run_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  )
  SELECT
    v_formula_id,
    package.gtin,
    package.package_size,
    1,
    'nestle-purina-cat-chow',
    'nestle-purina-cat-chow:' || package.gtin,
    v_pdp_url,
    TRUE,
    v_observed_at,
    v_observed_at,
    now()
  FROM (VALUES
    ('017800150200', '3.15 lb'),
    ('017800150224', '6.3 lb'),
    ('017800106252', '14 lb')
  ) AS package(gtin, package_size)
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET formula_id = excluded.formula_id,
      source_url = excluded.source_url,
      active = TRUE,
      last_observed_at = excluded.last_observed_at,
      updated_at = now();

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, created_at, updated_at
  ) VALUES (
    v_primary_cache_key,
    'Purina Kitten Chow Year One Essentials with Real Chicken',
    public.normalize_verified_product_search_query(
      'Purina Kitten Chow Year One Essentials with Real Chicken'
    ),
    v_pdp_url,
    'manufacturer',
    v_observed_at,
    v_provenance,
    TRUE,
    now(),
    now()
  )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = excluded.cache_key,
      alias_text = excluded.alias_text,
      source_url = excluded.source_url,
      source_authority = excluded.source_authority,
      evidence_observed_at = excluded.evidence_observed_at,
      provenance = excluded.provenance,
      updated_at = now();

  INSERT INTO public.catalog_product_evidence (
    cache_key, gtin, product_name, brand, pet_type, source, source_quality,
    source_url, ingredient_source_url, image_source_url,
    ingredient_verification_status, image_verification_status,
    raw_source_hash, content_hash, extractor_version, review_state,
    rejection_reason, evidence, updated_at
  ) VALUES (
    v_primary_cache_key,
    '017800150224',
    'Purina Kitten Chow Year One Essentials with Real Chicken',
    'Purina Cat Chow',
    'cat',
    'nestle-purina-cat-chow',
    'manufacturer',
    v_pdp_url,
    v_label_url,
    v_image_url,
    'label_ocr_verified',
    'manufacturer',
    encode(digest(v_label_url || '|M453025', 'sha256'), 'hex'),
    encode(digest(v_ingredient_hash || '|' || v_image_url, 'sha256'), 'hex'),
    '2026-08-04-official-label-source-version-v1',
    'promoted',
    NULL,
    v_provenance || jsonb_build_object(
      'published_gtins', jsonb_build_array(
        '017800150200', '017800150224', '017800106252'
      )
    ),
    now()
  )
  ON CONFLICT DO NOTHING;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND gtin IN ('017800150200', '017800150224', '017800106252')
  ) <> 3 THEN
    RAISE EXCEPTION 'Purina Kitten Chow current label is missing package SKUs';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('017800150224', 8)
    WHERE cache_key = v_primary_cache_key
      AND nutritional_info->>'formula_evidence_tier' = 'web_label_version'
  ) <> 1 THEN
    RAISE EXCEPTION 'Unique 6.3 lb Kitten Chow GTIN did not resolve current label';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('017800150200', 8)
  ) OR EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('017800106252', 8)
  ) THEN
    RAISE EXCEPTION 'Reused Kitten Chow GTIN did not abstain on version conflict';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Purina Kitten Chow Year One Essentials with Real Chicken',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_primary_cache_key THEN
    RAISE EXCEPTION 'Current Kitten Chow exact-name search did not rank first';
  END IF;

  -- SKU reconciliation can refresh evidence metadata for a shared GTIN.
  -- Reassert the reviewed legacy version classification after those triggers.
  UPDATE public.product_data
  SET formula_evidence_tier = 'web_label_version',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'legacy_manufacturer_page_version',
          'manufacturer_current_equivalence', FALSE,
          'superseded_by_label_code', 'M453025',
          'superseding_ingredient_source_url', v_label_url,
          'gtin_resolution_policy', 'abstain_on_version_conflict'
        ),
      updated_at = now()
  WHERE cache_key = v_legacy_version.cache_key
    AND public.catalog_normalize_ingredient_evidence(ingredient_text) =
        public.catalog_normalize_ingredient_evidence(
          v_legacy_version.ingredient_text
        )
    AND image_url = v_legacy_version.image_url;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'nestle-purina-cat-chow:017800150200'
      AND formula_evidence_tier = 'web_label_version'
      AND public.catalog_normalize_ingredient_evidence(ingredient_text)
          <> public.catalog_normalize_ingredient_evidence(v_ingredients)
  ) THEN
    RAISE EXCEPTION 'Legacy Kitten Chow formula version was not preserved: %',
      (
        SELECT jsonb_agg(jsonb_build_object(
          'cache_key', cache_key,
          'gtin', gtin,
          'tier', formula_evidence_tier,
          'ingredient_hash', encode(digest(
            public.catalog_normalize_ingredient_evidence(ingredient_text),
            'sha256'
          ), 'hex'),
          'image_url', image_url
        ))
        FROM public.product_data
        WHERE gtin = '017800150200'
      );
  END IF;
END;
$$;
