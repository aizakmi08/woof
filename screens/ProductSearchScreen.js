import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  FlatList,
  findNodeHandle,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { AppText as Text, AppTextInput as TextInput } from "../components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, Check, ChevronLeft, Search, ScanLine, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  catalogProductToVerifiedProduct,
  collapseRepeatedIdentityText,
  getCatalogProduct,
  labelOcrSearchQueries,
  resolveProduct,
} from "../services/productCatalog";
import { labelOcrIsAvailable, recognizeLabelText } from "../services/labelOcr";
import { productIsVerifiedReady } from "../services/catalogQuality";
import {
  getCachedCatalogSearch,
  saveCachedCatalogSearch,
} from "../services/catalogSearchCache";
import {
  logCatalogLookupEvent,
  logCatalogVerificationGapEvent,
} from "../services/catalogCoverage";
import { trackEvent } from "../services/analytics";
import { createLogger } from "../services/logger";
import {
  LABEL_RESOLUTION_DECISIONS,
  productFormulaKey,
  reconcileLabelOutcomes,
} from "../services/labelResolution";
import { getLabelResolutionConfig } from "../services/runtimeConfig";
import { useTheme, Colors, Spacing, Shadows } from "../theme";
import { BRAND_NAME } from "../config/brand";
import { requestCatalogEvidenceConsent } from "../services/catalogEvidenceConsent";
import { useAuth } from "../services/auth";
import { normalizePetProfile } from "../services/petProfile";
import { logCaptureToResult, navigationTimingParams } from "../services/performanceTimings";
import {
  DEV_QA_DRY_BAG_BOUNDARY_PRODUCTS,
  DEV_QA_PET_RESULT,
  DEV_QA_SEARCH_PRODUCTS,
} from "../services/devQaFixtures";
import { buildVerifiedPetFoodAnalysis } from "../services/verifiedScoring";

const logger = createLogger("PRODUCT_SEARCH");
const MIN_QUERY_LENGTH = 2;
const SEARCH_RESULT_LIMIT = 12;
const SEARCH_UI_TIMEOUT_MS = 8_000;
const AUTOMATIC_LABEL_RECOVERY_TIMEOUT_MS = 6_500;
const EMPTY_OCR_LINES = Object.freeze([]);
const VARIANT_DISPLAY_LABELS = Object.freeze({
  adult: "Adult",
  all_life_stages: "All life stages",
  all_stages: "All life stages",
  cat: "Cat",
  dog: "Dog",
  dry: "Dry",
  freeze_dried: "Freeze-dried",
  freeze_dried_raw: "Freeze-dried raw",
  kitten: "Kitten",
  mature: "Mature",
  puppy: "Puppy",
  raw: "Raw",
  senior: "Senior",
  wet: "Wet",
  young: "Young",
});
const PRODUCT_QUERY_REQUIRED_TERMS = new Set([
  "adult",
  "senior",
  "puppy",
  "kitten",
  "small",
  "toy",
  "large",
  "weight",
  "indoor",
  "hairball",
  "sensitive",
  "digestive",
  "urinary",
  "mobility",
  "joint",
  "skin",
  "coat",
  "ancient",
  "grains",
  "grain",
  "free",
  "95",
  "hydrolyzed",
  "vegetarian",
  "plant",
  "salmon",
  "chicken",
  "beef",
  "turkey",
  "lamb",
  "duck",
  "fish",
  "whitefish",
  "ocean",
  "tuna",
  "trout",
  "venison",
  "insect",
  "bison",
  "broth",
  "crab",
  "pollock",
  "cod",
  "liver",
  "mackerel",
  "mousse",
  "sole",
  "shrimp",
  "prawn",
  "prawns",
  "pumpkin",
  "quail",
  "rabbit",
  "sardine",
  "sardines",
  "seabass",
  "tilapia",
  "cluster",
  "clusters",
  "dehydrated",
  "cuts",
  "gravy",
  "loaf",
  "minced",
  "morsels",
  "oatmeal",
  "pate",
  "pat",
  "paté",
  "rice",
  "shreds",
  "stew",
  "stews",
  "potato",
  "sweet",
  "wholemade",
  "prime",
  "rib",
  "filet",
  "mignon",
  "giblets",
]);
const NON_ADULT_LIFE_STAGE_TERMS = new Set([
  "puppy",
  "kitten",
  "senior",
  "mature",
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function productIdentityText(product = {}) {
  return [
    product.brand,
    product.productLine,
    product.productName,
    product.flavor,
    product.lifeStage,
    product.foodForm,
    product.packageSize,
    product.gtin || product.barcode,
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function productMatchesQueryTerms(product, queryText = "") {
  const queryTokens = tokenSet(queryText);
  const productTokens = tokenSet(productIdentityText(product));

  for (const token of queryTokens) {
    if (!PRODUCT_QUERY_REQUIRED_TERMS.has(token)) continue;
    if (productTokens.has(token)) continue;
    if (token === "adult") {
      const hasNonAdultLifeStage = [...NON_ADULT_LIFE_STAGE_TERMS].some((term) => productTokens.has(term));
      if (!hasNonAdultLifeStage) continue;
    }

    return false;
  }

  return true;
}

function productIsReady(product) {
  return productIsVerifiedReady(product);
}

function ingredientStatusLabel({ exactConfirmed = false, ready = false } = {}) {
  if (exactConfirmed) return "Exact label match";
  return ready ? "Verified" : "Needs ingredients";
}

function productPackageSizeLabel(product) {
  const rawPackageSizes = [
    ...(Array.isArray(product?.availablePackageSizes) ? product.availablePackageSizes : []),
    product?.packageSize,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const packageSizes = rawPackageSizes.flatMap((value) => {
    if (!value.includes(",")) return [value];
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    return parts.length > 1 && parts.every((part) => (
      /^\d+(?:\.\d+)?(?:\s*(?:lb|lbs|oz|kg|g|ct|count))?$/i.test(part)
    )) ? parts : [value];
  }).filter((value, index, values) => (
    values.findIndex((candidate) => normalizeText(candidate) === normalizeText(value)) === index
  ));
  const primaryPackageSize = String(product?.packageSize || "").trim();
  const additionalSizeCount = packageSizes.filter((size) => (
    normalizeText(size) !== normalizeText(primaryPackageSize)
  )).length;
  const packageSize = packageSizes.length > 1 && primaryPackageSize
    ? `${primaryPackageSize} · +${additionalSizeCount} ${additionalSizeCount === 1 ? "size" : "sizes"}`
    : packageSizes.length > 1
      ? "Multiple sizes"
      : packageSizes[0];
  if (!packageSize) return "";
  if (normalizeText(packageSize) === "multiple sizes") return "Multiple sizes";
  return String(packageSize)
    .trim()
    .replace(/\b(LBS?|OZ|KG|G|CT)\b/gi, (unit) => unit.toLowerCase());
}

function formatVariantValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  const dictionaryKey = normalized.replace(/[\s-]+/g, "_");
  if (VARIANT_DISPLAY_LABELS[dictionaryKey]) return VARIANT_DISPLAY_LABELS[dictionaryKey];
  if (normalized === "multiple sizes") return "Multiple sizes";
  return String(value)
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function productDisplayTitle(product = {}) {
  const line = formatVariantValue(product.productLine);
  const recipe = formatVariantValue(product.flavor || product.recipe);
  const productName = collapseRepeatedIdentityText(product.productName);
  if (line && recipe && !normalizeText(line).includes(normalizeText(recipe))) {
    return `${line} · ${recipe}`;
  }
  return line || productName || recipe || "Pet food";
}

function productVariantChips(product = {}) {
  const chips = [
    { key: "size", label: productPackageSizeLabel(product), prominent: true },
    { key: "lifeStage", label: formatVariantValue(product.lifeStage) },
    { key: "form", label: formatVariantValue(product.foodForm || product.form) },
    { key: "species", label: formatVariantValue(product.petType) },
  ].filter((chip) => chip.label);

  return chips.filter((chip, index) => (
    chips.findIndex((candidate) => normalizeText(candidate.label) === normalizeText(chip.label)) === index
  ));
}

function labelSummaryTitle(identification = {}) {
  const brand = collapseRepeatedIdentityText(identification.brand);
  const productName = collapseRepeatedIdentityText(identification.productName);
  const recognizedQuery = collapseRepeatedIdentityText(identification.searchQuery);
  if (!productName) return brand || recognizedQuery || "No readable product label";
  if (brand && !normalizeText(productName).includes(normalizeText(brand))) {
    return collapseRepeatedIdentityText(`${brand} ${productName}`);
  }
  return productName;
}

function recognizedOcrTitle(ocrText, ocrLines = EMPTY_OCR_LINES) {
  const recognizedQuery = labelOcrSearchQueries(ocrText, ocrLines)[0] || "";
  return recognizedQuery ? formatCorrectedQuery(recognizedQuery) : "";
}

function prefetchResolutionImages(result = {}) {
  const urls = [result.selectedProduct, ...(Array.isArray(result.products) ? result.products : [])]
    .map((product) => String(product?.imageUrl || "").trim())
    .filter(Boolean)
    .filter((url, index, values) => values.indexOf(url) === index)
    .slice(0, 3);
  urls.forEach((url) => Image.prefetch(url).catch(() => {}));
}

function ingredientCaptureProduct(product = {}) {
  if (!product) return null;
  return {
    cacheKey: product.cacheKey || null,
    gtin: product.gtin || product.barcode || null,
    productName: product.productName || null,
    brand: product.brand || null,
    productLine: product.productLine || null,
    flavor: product.flavor || null,
    lifeStage: product.lifeStage || null,
    foodForm: product.foodForm || null,
    packageSize: product.packageSize || null,
    petType: product.petType || null,
    source: product.source || null,
    sourceQuality: product.sourceQuality || null,
    sourceUrl: product.sourceUrl || null,
  };
}

async function resolveOnDeviceLabel({
  labelOcrText,
  labelOcrLines,
  labelOcrDurationMs,
  labelImageUri,
  signal,
  onOcrCompleted,
}) {
  let text = String(labelOcrText || "").trim();
  let lines = Array.isArray(labelOcrLines) ? labelOcrLines : EMPTY_OCR_LINES;
  let durationMs = Number(labelOcrDurationMs) || null;
  if (!text && labelImageUri && labelOcrIsAvailable()) {
    const ocr = await recognizeLabelText(labelImageUri);
    text = ocr?.usable ? ocr.text : "";
    lines = ocr?.usable ? ocr.lines : EMPTY_OCR_LINES;
    durationMs = ocr?.durationMs || null;
    onOcrCompleted?.(ocr);
  }

  if (!text || signal?.aborted) return null;
  const result = await resolveProduct({
    type: "label_text",
    query: text,
    ocrLines: lines,
    signal,
    limit: SEARCH_RESULT_LIMIT,
  });

  return { result, path: "on_device_ocr", durationMs };
}

function collectLabelOutcomes({
  visualPromise,
  ocrPromise,
  signal,
  timeoutMs = 7_500,
  onTimeout,
}) {
  const attempts = [
    visualPromise && { path: "cloud_image", promise: visualPromise },
    ocrPromise && { path: "on_device_ocr", promise: ocrPromise },
  ].filter(Boolean);

  if (attempts.length === 0) {
    return Promise.reject(new Error("No readable label image or text was found."));
  }

  return new Promise((resolve, reject) => {
    const outcomes = [];
    let completed = 0;
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const abortError = new Error("Label resolution aborted");
      abortError.name = "AbortError";
      reject(abortError);
    };

    const finish = ({ timedOut = false, cancelPending = false } = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener?.("abort", onAbort);
      if (timedOut) {
        for (const attempt of attempts) {
          if (!outcomes.some((outcome) => outcome.path === attempt.path)) {
            const timeoutError = new Error(`${attempt.path} timed out`);
            timeoutError.name = "TimeoutError";
            outcomes.push({ path: attempt.path, error: timeoutError, latencyMs: timeoutMs });
          }
        }
      }
      if (timedOut || cancelPending) onTimeout?.();
      resolve(outcomes);
    };

    const timeout = setTimeout(() => finish({ timedOut: true }), timeoutMs);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });

    for (const attempt of attempts) {
      attempt.promise
        .then((payload) => {
          if (settled || signal?.aborted) return;
          completed += 1;
          if (payload?.result) {
            outcomes.push({ ...payload, path: payload.path || attempt.path });
            if (
              (payload.path || attempt.path) === "on_device_ocr"
              && payload.result.selectedProduct
            ) {
              finish({ cancelPending: true });
              return;
            }
          }
          if (completed === attempts.length) finish();
        })
        .catch((error) => {
          if (settled || signal?.aborted) return;
          completed += 1;
          outcomes.push({
            path: attempt.path,
            error,
            latencyMs: Number(error?.stageLatencyMs) || null,
          });
          if (completed === attempts.length) finish();
        });
    }
  });
}

function mergeAutomaticLabelRecovery(previousResult, recoveryResult, recognizedQuery) {
  const recoveredProducts = Array.isArray(recoveryResult?.products)
    ? recoveryResult.products
    : [];
  if (recoveredProducts.length === 0) return previousResult;

  const previousEvidence = previousResult?.resolutionEvidence || {};
  return {
    ...previousResult,
    decision: LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT,
    status: recoveryResult.status,
    identification: {
      ...(previousResult?.identification || {}),
      found: true,
      labelRead: true,
      confidence: 0,
      searchQuery: recognizedQuery,
      notes: "The label was read and matching verified formulas were recovered. Choose the exact package variant.",
    },
    products: recoveredProducts,
    confirmedProduct: null,
    selectedProduct: null,
    verificationState: recoveryResult.verificationState,
    resolutionEvidence: {
      ...previousEvidence,
      pathsAvailable: [
        ...new Set([...(previousEvidence.pathsAvailable || []), "recognized_text_recovery"]),
      ],
      reasonCodes: [
        ...new Set([...(previousEvidence.reasonCodes || []), "automatic_recognized_text_recovery"]),
      ],
    },
  };
}

function ProductImage({ product, theme }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (product.imageUrl && !imageFailed) {
    return (
      <Image
        source={{ uri: product.imageUrl }}
        style={styles.productImage}
        resizeMode="contain"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <View style={[styles.productImagePlaceholder, { backgroundColor: theme.fill }]}>
      <ScanLine size={20} color={theme.textTertiary} strokeWidth={1.7} />
    </View>
  );
}

function ProductRow({ product, theme, onPress, exactConfirmed = false }) {
  const ready = productIsReady(product);
  const statusLabel = ingredientStatusLabel({ exactConfirmed, ready });
  const displayTitle = productDisplayTitle(product);
  const variantChips = productVariantChips(product);
  const chipSummary = variantChips.map((chip) => chip.label).join(", ");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.productRow,
        {
          backgroundColor: theme.card,
          borderColor: theme.separator,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${product.brand ? `${product.brand}. ` : ""}${displayTitle}${chipSummary ? `. ${chipSummary}` : ""}. ${statusLabel}`}
      accessibilityHint={ready ? "Opens the product score" : "Shows options to scan ingredient data"}
    >
      <ProductImage product={product} theme={theme} />
      <View style={styles.productCopy}>
        {product.brand ? (
          <Text style={[styles.productBrand, { color: theme.textTertiary }]} numberOfLines={1}>
            {product.brand}
          </Text>
        ) : null}
        <Text style={[styles.productName, { color: theme.textPrimary }]} numberOfLines={3}>
          {displayTitle}
        </Text>
        {variantChips.length > 0 ? (
          <View style={styles.variantChipRow}>
            {variantChips.map((chip) => (
              <View
                key={chip.key}
                style={[
                  styles.variantChip,
                  chip.prominent && styles.variantChipProminent,
                  {
                    backgroundColor: chip.prominent ? theme.surface : theme.fill,
                    borderColor: chip.prominent ? theme.separator : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.variantChipText,
                    chip.prominent && styles.variantChipTextProminent,
                    { color: chip.prominent ? theme.textPrimary : theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {chip.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.verificationRow}>
          <View
            style={[
              styles.verificationBadge,
              { backgroundColor: ready ? Colors.scoreExcellent + "12" : theme.surface },
            ]}
          >
            {ready ? <Check size={12} color={Colors.scoreExcellent} strokeWidth={2.8} /> : null}
            <Text
              style={[
                styles.verificationBadgeText,
                { color: ready ? Colors.scoreExcellent : theme.textTertiary },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function formatCorrectedQuery(value) {
  const brandTerms = new Map([
    ["acana", "ACANA"],
    ["iams", "IAMS"],
    ["nulo", "Nulo"],
    ["purina", "Purina"],
    ["orijen", "ORIJEN"],
    ["ziwi", "ZIWI"],
  ]);

  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((term) => brandTerms.get(term.toLowerCase()) || term
      .split(/([-'])/)
      .map((part) => /^[-']$/.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(""))
    .join(" ");
}

function productStableKey(product = {}) {
  return String(
    product.cacheKey
    || product.gtin
    || product.barcode
    || product.id
    || [product.brand, product.productName, product.packageSize].filter(Boolean).join(":")
  ).trim().toLowerCase();
}

function reconcileSearchProducts(current = [], fresh = []) {
  const freshByKey = new Map(fresh.map((product) => [productStableKey(product), product]));
  const reconciled = current
    .map((product) => {
      const key = productStableKey(product);
      const update = freshByKey.get(key);
      if (!update) return null;
      freshByKey.delete(key);
      return update;
    })
    .filter(Boolean);
  return [...reconciled, ...freshByKey.values()].slice(0, SEARCH_RESULT_LIMIT);
}

function EmptyState({
  theme,
  query,
  identification,
  resolutionDecision,
  onSearchRecognized,
  onSearchByName,
  onRetrySearch,
  onRetryLabel,
  onScanLabel,
  onScanIngredients,
  labelAttempt,
  searchFailureKind,
  noneOfTheseSelected,
}) {
  const hasQuery = query.trim().length >= MIN_QUERY_LENGTH;
  const labelWasRead = identification?.labelRead === true || identification?.found === true;
  const excludedProduct = identification?.excluded === true;
  const hasAcquisitionGap = hasQuery || labelWasRead;
  const cameFromLabel = identification != null;
  const labelTimedOut = resolutionDecision === LABEL_RESOLUTION_DECISIONS.TIMED_OUT;
  const recognizedSearchReady = labelTimedOut && hasQuery;
  const needsLabelRetry = cameFromLabel && (
    [
      LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE,
      LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT,
      LABEL_RESOLUTION_DECISIONS.NOT_READABLE,
    ].includes(resolutionDecision)
    || (labelTimedOut && !recognizedSearchReady)
  );
  const repeatedLabelFailure = needsLabelRetry && labelAttempt >= 2;
  return (
    <View style={styles.emptyState}>
      <Search size={40} color={theme.textTertiary} strokeWidth={1.5} />
      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
        {excludedProduct
          ? "Not a complete pet food"
          : searchFailureKind
            ? searchFailureKind === "timeout" ? "Search timed out" : "Couldn't search the catalog"
          : noneOfTheseSelected
            ? "Scan the ingredients panel"
          : recognizedSearchReady
            ? "Label read — search ready"
            : repeatedLabelFailure
              ? "Try another way"
            : needsLabelRetry
            ? "Exact product not confirmed"
            : hasAcquisitionGap
              ? "No verified match yet"
              : "Find a product"}
      </Text>
      <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
        {excludedProduct
          ? `${identification.exclusionReason || "This item is not a complete dog or cat food."} ${BRAND_NAME} scores complete foods only.`
          : searchFailureKind
            ? "The catalog did not finish this search. Retry the same name before treating it as a catalog gap."
          : noneOfTheseSelected
            ? "The photographed package was not in the list. Scan its ingredients for a private score or catalog review, or try a new front-label photo."
          : recognizedSearchReady
            ? "The catalog took longer than expected, but the product name was saved above. Search it now or edit the wording first."
            : repeatedLabelFailure
              ? "Two front-label photos could not confirm this exact package. Search by name or scan the ingredients panel instead."
            : needsLabelRetry
            ? "Try the photo again with one package in frame. Move closer, reduce glare, and keep the brand and recipe readable. You can also edit the search above."
          : labelWasRead
          ? `${BRAND_NAME} found the product name but not a verified catalog match. Scan the ingredients list so it can be reviewed and added.`
          : hasQuery
            ? "Check the product name, scan the front label, or scan the ingredients list if this product is not verified yet."
            : "Search by product name or scan the front label from the shelf. Barcode pickup is optional, not required."}
      </Text>
      <Pressable
        onPress={
          recognizedSearchReady
            ? onSearchRecognized
            : searchFailureKind
              ? onRetrySearch
            : noneOfTheseSelected
              ? onScanIngredients
            : repeatedLabelFailure
              ? (hasAcquisitionGap && !excludedProduct ? onScanIngredients : onSearchByName)
            : needsLabelRetry
              ? onRetryLabel
              : hasAcquisitionGap && !excludedProduct
                ? onScanIngredients
                : onScanLabel
        }
        style={({ pressed }) => [
          styles.emptyButton,
          { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.84 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          recognizedSearchReady
            ? "Search the recognized product name"
            : searchFailureKind
              ? "Retry product search"
            : noneOfTheseSelected
              ? "Scan ingredients list"
            : repeatedLabelFailure
              ? (hasAcquisitionGap && !excludedProduct ? "Scan ingredients list" : "Search products by name")
            : needsLabelRetry
              ? "Retry the captured front label"
              : hasAcquisitionGap && !excludedProduct
                ? "Scan ingredients list"
                : "Scan a product label"
        }
      >
        {recognizedSearchReady || searchFailureKind || (repeatedLabelFailure && !hasAcquisitionGap)
          ? <Search size={17} color={theme.buttonText} strokeWidth={2} />
          : <Camera size={17} color={theme.buttonText} strokeWidth={2} />}
        <Text style={[styles.emptyButtonText, { color: theme.buttonText }]}>
          {recognizedSearchReady
            ? "Search Recognized Name"
            : searchFailureKind
              ? "Retry Search"
            : noneOfTheseSelected
              ? "Scan Ingredients"
            : repeatedLabelFailure
              ? (hasAcquisitionGap && !excludedProduct ? "Scan Ingredients" : "Search by Name")
            : needsLabelRetry
              ? "Try Photo Again"
              : hasAcquisitionGap && !excludedProduct
                ? "Scan Ingredients"
                : "Scan Front Label"}
        </Text>
      </Pressable>
      {hasAcquisitionGap && !excludedProduct && (noneOfTheseSelected || !needsLabelRetry || recognizedSearchReady || repeatedLabelFailure) ? (
        <Pressable
          onPress={noneOfTheseSelected ? onRetryLabel : (repeatedLabelFailure ? onSearchByName : (recognizedSearchReady ? onRetryLabel : onScanLabel))}
          style={({ pressed }) => [
            styles.emptySecondaryButton,
            { borderColor: theme.separator, opacity: pressed ? 0.78 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={noneOfTheseSelected ? "Try a new front label photo" : (repeatedLabelFailure ? "Search products by name" : (cameFromLabel ? "Try the front label again" : "Scan a product label"))}
        >
          <Text style={[styles.emptySecondaryButtonText, { color: theme.textPrimary }]}>
            {recognizedSearchReady
              ? "Retry Exact Match"
              : noneOfTheseSelected ? "Try Front Label Again"
              : repeatedLabelFailure ? "Search by Name"
              : cameFromLabel ? "Try Front Label Again" : "Scan Front Label"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ProductSearchScreen({ navigation, route }) {
  const theme = useTheme();
  const { profile, canScan, remainingScans } = useAuth();
  const savedPetType = normalizePetProfile(profile?.pet_profile).petType;
  const initialQuery = route.params?.initialQuery || "";
  const labelImageBase64 = route.params?.labelImageBase64 || null;
  const labelImageUri = route.params?.labelImageUri || null;
  const labelOcrText = route.params?.labelOcrText || "";
  const labelOcrLines = route.params?.labelOcrLines ?? EMPTY_OCR_LINES;
  const labelOcrDurationMs = Number(route.params?.labelOcrDurationMs) || null;
  const labelCaptureId = route.params?.labelCaptureId || "";
  const labelCaptureStartedAt = Number(route.params?.labelCaptureStartedAt) || null;
  const labelAttempt = Math.max(1, Number(route.params?.labelAttempt) || 1);
  const devFixture = __DEV__ ? route.params?.devFixture : null;
  const devLiveResolver = __DEV__ && route.params?.devLiveResolver === true;
  const devLoadingMessage = __DEV__ ? route.params?.devLoadingMessage : null;
  const hasLabelLookupInput = Boolean(labelImageBase64 || labelOcrText);
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState([]);
  const [identification, setIdentification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [labelLoading, setLabelLoading] = useState(hasLabelLookupInput);
  const [error, setError] = useState(null);
  const [showingCached, setShowingCached] = useState(false);
  const [searchCorrection, setSearchCorrection] = useState("");
  const [resolutionDecision, setResolutionDecision] = useState(null);
  const [resolutionEvidence, setResolutionEvidence] = useState(null);
  const [confirmedFormulaKey, setConfirmedFormulaKey] = useState("");
  const [searchFailureKind, setSearchFailureKind] = useState(null);
  const [noneOfTheseSelected, setNoneOfTheseSelected] = useState(false);
  const [petTypeFilter, setPetTypeFilter] = useState(
    savedPetType === "dog" || savedPetType === "cat" ? savedPetType : "all"
  );
  const [labelLoadingMessage, setLabelLoadingMessage] = useState(
    labelOcrText ? "Matching exact product..." : "Reading product label..."
  );
  const [searchLoadingMessage, setSearchLoadingMessage] = useState("Searching catalog...");
  const [recognizedIdentityText, setRecognizedIdentityText] = useState(() => (
    recognizedOcrTitle(labelOcrText, labelOcrLines)
  ));
  const searchRunRef = useRef(0);
  const searchAbortRef = useRef(null);
  const labelRunRef = useRef({ key: "", runId: 0 });
  const labelAbortRef = useRef(null);
  const recognizedOcrRef = useRef({
    text: labelOcrText,
    lines: labelOcrLines,
    durationMs: labelOcrDurationMs,
  });
  const statusRef = useRef(null);
  const searchInputRef = useRef(null);
  const lastSubmittedQueryRef = useRef("");
  const petTypeFilterTouchedRef = useRef(false);

  const trimmedQuery = query.trim();
  const title = labelLoading ? "Reading label" : "Find Product";

  useEffect(() => {
    if (petTypeFilterTouchedRef.current) return;
    if (savedPetType === "dog" || savedPetType === "cat") {
      setPetTypeFilter(savedPetType);
    }
  }, [savedPetType]);

  useEffect(() => {
    if (!labelLoading) return undefined;
    if (devFixture && devLoadingMessage) {
      setLabelLoadingMessage(devLoadingMessage);
      return undefined;
    }
    setLabelLoadingMessage(labelOcrText ? "Matching exact product..." : "Reading product label...");
    const matchingTimer = setTimeout(() => setLabelLoadingMessage("Matching exact product..."), 1_200);
    const variantTimer = setTimeout(() => setLabelLoadingMessage("Checking brand and recipe..."), 3_200);
    const finishingTimer = setTimeout(() => setLabelLoadingMessage("Finishing verification..."), 5_200);
    const evidenceTimer = setTimeout(() => setLabelLoadingMessage("Checking exact package details..."), 8_000);
    const recoveryTimer = setTimeout(() => setLabelLoadingMessage("Trying the recognized product name..."), 10_000);
    const longRunningTimer = setTimeout(() => setLabelLoadingMessage("Still matching — you can search by name instead."), 12_000);
    return () => {
      clearTimeout(matchingTimer);
      clearTimeout(variantTimer);
      clearTimeout(finishingTimer);
      clearTimeout(evidenceTimer);
      clearTimeout(recoveryTimer);
      clearTimeout(longRunningTimer);
    };
  }, [devFixture, devLoadingMessage, labelLoading, labelOcrText]);

  useEffect(() => {
    if (!__DEV__ || !devFixture) return;
    setLabelLoading(false);
    setLoading(false);
    setShowingCached(false);
    setSearchCorrection("");
    setSearchFailureKind(null);
    setNoneOfTheseSelected(false);
    setError(null);
    setConfirmedFormulaKey("");

    if (devFixture === "label_loading") {
      setProducts([]);
      setQuery("QA Fixture");
      setLabelLoadingMessage(devLoadingMessage || "Reading product label...");
      setLabelLoading(true);
      return;
    }

    if (devFixture === "multi_candidate") {
      setQuery("QA Small Breed Chicken Recipe");
      setIdentification({ found: true, labelRead: true, searchQuery: "QA Small Breed Chicken Recipe" });
      setResolutionDecision(LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE);
      setProducts(DEV_QA_SEARCH_PRODUCTS);
      return;
    }

    if (devFixture === "dry_bag_boundary") {
      const dryBagProduct = DEV_QA_DRY_BAG_BOUNDARY_PRODUCTS[0];
      setQuery("Purina ONE Chicken & Rice Formula 8 lb");
      setIdentification({
        found: true,
        labelRead: true,
        brand: "Purina ONE",
        productName: "SmartBlend Natural Chicken & Rice Formula",
        packageSize: "8 lb",
        foodForm: "dry",
        searchQuery: "Purina ONE Chicken & Rice Formula 8 lb",
      });
      setResolutionDecision(LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED);
      setConfirmedFormulaKey(productFormulaKey(dryBagProduct));
      setProducts([dryBagProduct]);
      return;
    }

    if (devFixture === "exact_auto_open") {
      setQuery("QA Small Breed Chicken Recipe");
      setIdentification({ found: true, labelRead: true, searchQuery: "QA Small Breed Chicken Recipe" });
      setResolutionDecision(LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED);
      setProducts([DEV_QA_SEARCH_PRODUCTS[0]]);
      const timer = setTimeout(() => {
        trackEvent("dev_qa_exact_match_auto_opened");
        navigation.replace("Results", {
          mode: "catalog",
          devFixtureResult: DEV_QA_PET_RESULT,
        });
      }, 450);
      return () => clearTimeout(timer);
    }

    if (devFixture === "not_readable") {
      setQuery("");
      setIdentification({ found: false, labelRead: false, notes: "No readable product name was found." });
      setResolutionDecision(LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT);
      setProducts([]);
      return;
    }

    if (devFixture === "label_timeout") {
      setQuery("QA recognized product");
      setIdentification({ found: false, labelRead: true, searchQuery: "QA recognized product" });
      setResolutionDecision(LABEL_RESOLUTION_DECISIONS.TIMED_OUT);
      setProducts([]);
      setError("Exact catalog matching took too long. Search the brand or recipe name instead.");
      return;
    }

    setQuery("QA Small Breed Chicken");
    setResolutionDecision(null);
    if (devFixture === "typed_results" || devFixture === "typed_typo") {
      setProducts(DEV_QA_SEARCH_PRODUCTS);
      if (devFixture === "typed_typo") setSearchCorrection("QA Small Breed Chicken");
      return;
    }
    if (devFixture === "typed_timeout") {
      setProducts([]);
      setSearchFailureKind("timeout");
      setError("The catalog is taking longer than expected. Please try again.");
      return;
    }
    setProducts([]);
  }, [devFixture, devLoadingMessage, navigation]);

  useEffect(() => {
    if (!loading || (showingCached && products.length > 0)) return undefined;
    setSearchLoadingMessage("Searching catalog...");
    const timers = [
      setTimeout(() => setSearchLoadingMessage("Checking exact product names..."), 1_500),
      setTimeout(() => setSearchLoadingMessage("Checking recipe and life stage..."), 3_500),
      setTimeout(() => setSearchLoadingMessage("Checking package variants..."), 5_500),
      setTimeout(() => setSearchLoadingMessage("Still searching — you can cancel and retry."), 7_500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [loading, products.length, showingCached]);

  useEffect(() => {
    products.slice(0, 6).forEach((product) => {
      const imageUrl = String(product?.imageUrl || "").trim();
      if (imageUrl) Image.prefetch(imageUrl).catch(() => {});
    });
  }, [products]);

  useEffect(() => () => {
    searchRunRef.current += 1;
    searchAbortRef.current?.abort();
  }, []);

  const labelLookupErrorMessage = useCallback((err) => {
    const message = String(err?.message || "").toLowerCase();
    if (message.includes("timed out") || message.includes("abort")) {
      return "Exact catalog matching took too long. Search the brand or recipe name instead.";
    }
    if (message.includes("rate limit")) {
      return "Label lookup is busy right now. Search the brand or recipe name instead.";
    }
    return "Could not read that label. Try a clearer front-of-package photo or search by name.";
  }, []);

  useEffect(() => {
    if (!error && ![
      LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE,
      LABEL_RESOLUTION_DECISIONS.TIMED_OUT,
      LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT,
    ].includes(resolutionDecision)) return;

    const timer = setTimeout(() => {
      const node = findNodeHandle(statusRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 250);
    return () => clearTimeout(timer);
  }, [error, resolutionDecision]);

  const openProductResult = useCallback(async (product, {
    sourceSurface = "product_search",
    autoOpen = false,
    labelConfidence = null,
    matchQuery = query,
    labelIdentification = identification,
    labelResolutionDecision = resolutionDecision,
    labelResolutionEvidence = resolutionEvidence,
  } = {}) => {
    if (!autoOpen) {
      Haptics.selectionAsync();
    }

    let resolvedProduct = product;
    const needsHydration = Boolean(
      product?.cacheKey
      && Number(product?.ingredientCount || 0) >= 5
      && !String(product?.ingredientsText || "").trim()
      && (!Array.isArray(product?.ingredients) || product.ingredients.length === 0)
    );
    if (needsHydration) {
      const hydrationStartedAt = Date.now();
      const hydrated = await getCatalogProduct(product.cacheKey);
      trackEvent("catalog_product_hydration_completed", {
        source_surface: sourceSurface,
        success: Boolean(hydrated),
        latency_ms: Date.now() - hydrationStartedAt,
      });
      if (!hydrated) {
        Alert.alert(
          "Product details are still loading",
          "The exact formula was identified, but its verified ingredients could not be loaded. Please try again."
        );
        return;
      }
      resolvedProduct = hydrated;
    }

    const recognizedEvidence = labelResolutionEvidence?.recognizedIdentity?.cloudImage?.productName
      ? labelResolutionEvidence.recognizedIdentity.cloudImage
      : labelResolutionEvidence?.recognizedIdentity?.onDeviceOcr;
    const labelSelection = Boolean(
      autoOpen || labelResolutionDecision || labelIdentification?.labelRead
    );
    trackEvent(autoOpen ? "catalog_label_auto_opened" : "catalog_product_opened", {
      source_surface: sourceSurface,
      source: resolvedProduct.source,
      source_kind: resolvedProduct.sourceKind,
      source_quality: resolvedProduct.sourceQuality,
      ingredient_verification_status: resolvedProduct.ingredientVerificationStatus,
      image_verification_status: resolvedProduct.imageVerificationStatus,
      has_image: !!resolvedProduct.imageUrl,
      ready_to_score: productIsReady(resolvedProduct),
      ingredient_count: resolvedProduct.ingredientCount,
      label_confidence: labelConfidence,
      resolution_decision: labelResolutionDecision,
      auto_opened: autoOpen,
      manual_selected: labelSelection && !autoOpen,
      selection_mode: autoOpen
        ? "auto_open"
        : labelSelection
          ? "manual_label_candidate"
          : "manual_search_result",
      recognized_label_identity: recognizedEvidence?.productName || labelSummaryTitle(labelIdentification),
      label_brand: recognizedEvidence?.brand || labelIdentification?.brand || null,
      label_product_line: recognizedEvidence?.productLine || labelIdentification?.productLine || null,
      label_flavor: recognizedEvidence?.flavor || labelIdentification?.flavor || null,
      label_life_stage: recognizedEvidence?.lifeStage || labelIdentification?.lifeStage || null,
      label_food_form: recognizedEvidence?.foodForm || labelIdentification?.foodForm || null,
      label_food_form_evidence: recognizedEvidence?.foodFormEvidence || null,
      label_package_size: recognizedEvidence?.packageSize || labelIdentification?.packageSize || null,
      label_pet_type: recognizedEvidence?.petType || labelIdentification?.petType || null,
      chosen_cache_key: resolvedProduct.cacheKey,
      chosen_brand: resolvedProduct.brand,
      chosen_product_name: resolvedProduct.productName,
      chosen_product_line: resolvedProduct.productLine,
      chosen_flavor: resolvedProduct.flavor,
      chosen_life_stage: resolvedProduct.lifeStage,
      chosen_food_form: resolvedProduct.foodForm,
      chosen_package_size: resolvedProduct.packageSize,
      chosen_pet_type: resolvedProduct.petType,
    });

    if (!productIsReady(resolvedProduct)) {
      logCatalogVerificationGapEvent({
        source: sourceSurface,
        query: matchQuery || query || resolvedProduct.productName,
        products,
        selectedProduct: resolvedProduct,
        trigger: autoOpen ? "auto_open_blocked" : "product_tapped",
      });
      Alert.alert(
        "Ingredient verification needed",
        `${BRAND_NAME} found this product by name, but needs the full ingredients list before it can be reviewed and scored accurately.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Scan Ingredients",
            onPress: async () => {
              if (!canScan()) {
                navigation.navigate("Paywall", {
                  source: "scan_limit",
                  sourceSurface: "product_search_unverified_product",
                  remainingScans: remainingScans(),
                });
                return;
              }
              const catalogEvidenceConsent = await requestCatalogEvidenceConsent();
              if (catalogEvidenceConsent == null) return;
              navigation.navigate("Scanner", {
                mode: "ingredient_capture",
                acquisitionQuery: matchQuery || query || resolvedProduct.productName,
                candidateProduct: ingredientCaptureProduct(resolvedProduct),
                sourceSurface,
                catalogEvidenceConsent,
                ...navigationTimingParams(sourceSurface),
              });
            },
          },
        ],
      );
      return;
    }

    const devFixtureResult = devLiveResolver
      ? buildVerifiedPetFoodAnalysis(catalogProductToVerifiedProduct(resolvedProduct))
      : null;
    navigation.navigate("Results", {
      mode: "catalog",
      cacheKey: resolvedProduct.cacheKey,
      catalogProduct: resolvedProduct,
      uri: labelImageUri || resolvedProduct.imageUrl || null,
      captureStartedAt: labelCaptureStartedAt,
      captureTimingMode: labelCaptureStartedAt ? "label_lookup" : null,
      ...(devFixtureResult ? { devFixtureResult } : {}),
    });
  }, [
    canScan,
    devLiveResolver,
    identification,
    labelCaptureStartedAt,
    labelImageUri,
    navigation,
    products,
    query,
    remainingScans,
    resolutionDecision,
    resolutionEvidence,
  ]);
  const openProductResultRef = useRef(openProductResult);

  useEffect(() => {
    openProductResultRef.current = openProductResult;
  }, [openProductResult]);

  const clearScanContext = useCallback(() => {
    labelAbortRef.current?.abort();
    labelAbortRef.current = null;
    setLabelLoading(false);
    setIdentification(null);
    setResolutionDecision(null);
    setResolutionEvidence(null);
    setConfirmedFormulaKey("");
    setNoneOfTheseSelected(false);
    setRecognizedIdentityText("");
  }, []);

  const runSearch = useCallback(async (nextQuery, source = "typed", filterOverride = petTypeFilter) => {
    const term = nextQuery.trim();
    const requestedPetType = filterOverride === "dog" || filterOverride === "cat"
      ? filterOverride
      : null;
    if (source === "typed" || source === "submit" || source === "recognized_label") {
      clearScanContext();
    }
    if (term.length < MIN_QUERY_LENGTH) {
      setProducts([]);
      setError(null);
      setShowingCached(false);
      setSearchCorrection("");
      setSearchFailureKind(null);
      return;
    }

    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    searchAbortRef.current?.abort();
    setLoading(true);
    setError(null);
    setSearchCorrection("");
    setSearchFailureKind(null);

    const controller = new AbortController();
    searchAbortRef.current = controller;
    const searchTimeout = setTimeout(() => controller.abort(), SEARCH_UI_TIMEOUT_MS);
    const startedAt = Date.now();
    let servedCached = false;
    try {
      const cached = await getCachedCatalogSearch(term, {
        limit: SEARCH_RESULT_LIMIT,
        petType: requestedPetType,
      });
      if (searchRunRef.current !== runId) return;
      if (cached?.products?.length > 0) {
        servedCached = true;
        setProducts(cached.products);
        setShowingCached(true);
        trackEvent("catalog_search_cache_hit", {
          source,
          query_length: term.length,
          result_count: cached.products.length,
          cache_age_ms: Date.now() - cached.cachedAt,
        });
      }

      const result = await resolveProduct({
        type: "search",
        query: term,
        limit: SEARCH_RESULT_LIMIT,
        signal: controller.signal,
        petType: requestedPetType,
      });
      if (searchRunRef.current !== runId) return;
      setProducts((current) => reconcileSearchProducts(current, result.products));
      setShowingCached(false);
      setSearchCorrection(result.queryWasCorrected ? result.searchedQuery : "");
      saveCachedCatalogSearch(term, result.products, { petType: requestedPetType }).catch(() => {});
      logCatalogLookupEvent({
        source,
        query: term,
        products: result.products,
        resolverStatus: result.status,
        verificationState: result.verificationState,
        latencyMs: Date.now() - startedAt,
      });
      logCatalogVerificationGapEvent({
        source,
        query: term,
        products: result.products,
        resolverStatus: result.status,
        verificationState: result.verificationState,
        trigger: "search_results",
        latencyMs: Date.now() - startedAt,
      });
      trackEvent("catalog_search_completed", {
        source,
        resolver_status: result.status,
        query_length: term.length,
        result_count: result.products.length,
        image_result_count: result.products.filter((product) => !!product.imageUrl).length,
        served_cached_before_refresh: servedCached,
      });
    } catch (err) {
      if (searchRunRef.current !== runId) return;
      if (
        (err?.name === "AbortError" && controller.signal.aborted)
        || err?.name === "TimeoutError"
      ) {
        setError(servedCached
          ? "Refresh took too long. Showing the last saved match."
          : "The catalog is taking longer than expected. Please try again.");
        setSearchFailureKind("timeout");
        if (!servedCached) setProducts([]);
        return;
      }
      logger.debug("[PRODUCT_SEARCH] Search failed:", err.message);
      setError(servedCached
        ? "Could not refresh results. Showing the last saved match."
        : "Search failed. Please try again.");
      setSearchFailureKind("error");
      if (!servedCached) {
        setProducts([]);
        setShowingCached(false);
        setSearchCorrection("");
      }
      logCatalogLookupEvent({
        source,
        query: term,
        latencyMs: Date.now() - startedAt,
        errorMessage: err.message,
      });
      trackEvent("catalog_search_failed", {
        source,
        query_length: term.length,
        served_cached_before_failure: servedCached,
        message: err.message,
      });
    } finally {
      clearTimeout(searchTimeout);
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
      if (searchRunRef.current === runId) setLoading(false);
    }
  }, [clearScanContext, petTypeFilter]);

  useEffect(() => {
    if (devFixture) return;
    if (!hasLabelLookupInput) return;
    const lookupKey = labelCaptureId
      || `${labelImageUri || "camera"}:${labelImageBase64?.length || 0}:${labelOcrText.length}`;
    if (labelRunRef.current.key === lookupKey) return;
    const labelRunId = labelRunRef.current.runId + 1;
    labelRunRef.current = { key: lookupKey, runId: labelRunId };
    const lifecycleController = new AbortController();
    const requestController = new AbortController();
    const abortRequests = () => requestController.abort();
    lifecycleController.signal.addEventListener("abort", abortRequests, { once: true });
    labelAbortRef.current = lifecycleController;

    (async () => {
      setLabelLoading(true);
      setError(null);
      setIdentification(null);
      setRecognizedIdentityText(recognizedOcrTitle(labelOcrText, labelOcrLines));
      setProducts([]);
      setShowingCached(false);
      setSearchCorrection("");
      recognizedOcrRef.current = {
        text: labelOcrText,
        lines: labelOcrLines,
        durationMs: labelOcrDurationMs,
      };
      trackEvent("label_lookup_started", {
        has_photo_uri: !!labelImageUri,
        image_base64_length: labelImageBase64?.length || 0,
        on_device_ocr_available: Boolean(labelOcrText || (labelImageUri && labelOcrIsAvailable())),
        on_device_ocr_precomputed: labelOcrText.length > 0,
        on_device_ocr_duration_ms: labelOcrDurationMs,
      });

      const resolverStartedAt = Date.now();
      const startedAt = labelCaptureStartedAt && labelCaptureStartedAt <= resolverStartedAt
        ? labelCaptureStartedAt
        : resolverStartedAt;
      try {
        const runtimeConfigPromise = getLabelResolutionConfig();
        const visualStartedAt = Date.now();
        const visualPromise = labelImageBase64
          ? resolveProduct({
            type: "label",
            imageBase64: labelImageBase64,
            signal: requestController.signal,
            limit: SEARCH_RESULT_LIMIT,
            onIdentification: (recognizedIdentification) => {
              if (lifecycleController.signal.aborted) return;
              const recognizedTitle = labelSummaryTitle(recognizedIdentification);
              if (recognizedTitle && recognizedTitle !== "No readable product label") {
                setRecognizedIdentityText(recognizedTitle);
                setLabelLoadingMessage("Matching exact product...");
              }
            },
          })
            .then((result) => {
              prefetchResolutionImages(result);
              return {
                result,
                path: "cloud_image",
                latencyMs: Date.now() - visualStartedAt,
              };
            })
            .catch((error) => {
              const stageError = error instanceof Error ? error : new Error(String(error));
              stageError.stageLatencyMs = Date.now() - visualStartedAt;
              throw stageError;
            })
          : null;
        const canRunOcr = Boolean(labelOcrText || (labelImageUri && labelOcrIsAvailable()));
        const ocrStartedAt = Date.now();
        const ocrPromise = canRunOcr
          ? resolveOnDeviceLabel({
            labelOcrText,
            labelOcrLines,
            labelOcrDurationMs,
            labelImageUri,
            signal: requestController.signal,
            onOcrCompleted: (ocr) => {
              if (ocr?.usable) {
                recognizedOcrRef.current = {
                  text: ocr.text,
                  lines: ocr.lines,
                  durationMs: ocr.durationMs,
                };
                const recognizedTitle = recognizedOcrTitle(ocr.text, ocr.lines);
                if (recognizedTitle) setRecognizedIdentityText(recognizedTitle);
                setLabelLoadingMessage("Matching exact product...");
              }
              trackEvent("label_ocr_completed", {
                usable: ocr?.usable === true,
                duration_ms: Math.round(ocr?.durationMs || 0),
                line_count: ocr?.lines?.length || 0,
                text_length: ocr?.text?.length || 0,
                stage: "product_search_parallel",
              });
            },
          })
            .then((outcome) => {
              if (outcome?.result) prefetchResolutionImages(outcome.result);
              return outcome ? {
                ...outcome,
                latencyMs: Date.now() - ocrStartedAt,
              } : outcome;
            })
            .catch((error) => {
              const stageError = error instanceof Error ? error : new Error(String(error));
              stageError.stageLatencyMs = Date.now() - ocrStartedAt;
              throw stageError;
            })
          : null;
        trackEvent("label_lookup_parallel_started", {
          visual_started: !!visualPromise,
          ocr_started: !!ocrPromise,
          capture_to_resolver_ms: resolverStartedAt - startedAt,
        });

        // The runtime-config read must not delay useful recognition work. Attach
        // rejection handlers immediately while the config, OCR, and visual paths
        // run together, then spend only the remainder of the total UI budget.
        visualPromise?.catch(() => {});
        ocrPromise?.catch(() => {});
        const runtimeConfig = await runtimeConfigPromise;
        if (lifecycleController.signal.aborted) return;
        const elapsedBeforeReconciliationMs = Date.now() - resolverStartedAt;
        const remainingReconciliationMs = Math.max(
          250,
          runtimeConfig.reconciliationTimeoutMs - elapsedBeforeReconciliationMs
        );

        const outcomesPromise = collectLabelOutcomes({
          visualPromise,
          ocrPromise,
          signal: lifecycleController.signal,
          timeoutMs: remainingReconciliationMs,
          onTimeout: abortRequests,
        });
        const outcomes = await outcomesPromise;
        let result = reconcileLabelOutcomes(outcomes, runtimeConfig);

        if (!result) {
          throw new Error("No readable label text was found.");
        }
        const recognizedOcr = recognizedOcrRef.current;
        const recognizedQuery = labelOcrSearchQueries(
          recognizedOcr.text,
          recognizedOcr.lines
        )[0] || collapseRepeatedIdentityText(recognizedOcr.text);
        let automaticRecoveryAttempted = false;
        let automaticRecoverySucceeded = false;
        let automaticRecoveryLatencyMs = null;
        if (
          result.decision === LABEL_RESOLUTION_DECISIONS.TIMED_OUT
          && recognizedQuery
          && !lifecycleController.signal.aborted
        ) {
          automaticRecoveryAttempted = true;
          setLabelLoadingMessage("Using the recognized product name...");
          const recoveryStartedAt = Date.now();
          const recoveryController = new AbortController();
          const abortRecovery = () => recoveryController.abort();
          lifecycleController.signal.addEventListener("abort", abortRecovery, { once: true });
          const recoveryTimeout = setTimeout(
            () => recoveryController.abort(),
            AUTOMATIC_LABEL_RECOVERY_TIMEOUT_MS
          );
          try {
            const recoveryResult = await resolveProduct({
              type: "search",
              query: recognizedQuery,
              limit: SEARCH_RESULT_LIMIT,
              signal: recoveryController.signal,
            });
            if (lifecycleController.signal.aborted) return;
            result = mergeAutomaticLabelRecovery(result, recoveryResult, recognizedQuery);
            automaticRecoverySucceeded = result.decision
              !== LABEL_RESOLUTION_DECISIONS.TIMED_OUT;
          } catch (recoveryError) {
            logger.debug(
              "[PRODUCT_SEARCH] Automatic recognized-label recovery failed:",
              recoveryError?.message || recoveryError
            );
          } finally {
            automaticRecoveryLatencyMs = Date.now() - recoveryStartedAt;
            clearTimeout(recoveryTimeout);
            lifecycleController.signal.removeEventListener("abort", abortRecovery);
          }
        }
        const recognitionPath = result.resolutionEvidence.pathsAvailable.join("+") || "none";
        const resultIdentification = {
          ...result.identification,
          found: result.identification?.found === true,
          labelRead: result.identification?.labelRead === true || Boolean(recognizedQuery),
          searchQuery: result.identification?.searchQuery || recognizedQuery,
        };
        setIdentification(resultIdentification);
        setRecognizedIdentityText(labelSummaryTitle(resultIdentification));
        setProducts(result.products);
        setResolutionDecision(result.decision);
        setResolutionEvidence(result.resolutionEvidence);
        setConfirmedFormulaKey(
          result.confirmedProduct ? productFormulaKey(result.confirmedProduct) : ""
        );
        setShowingCached(false);
        if (resultIdentification.searchQuery) {
          setQuery(resultIdentification.searchQuery);
          lastSubmittedQueryRef.current = resultIdentification.searchQuery;
          saveCachedCatalogSearch(resultIdentification.searchQuery, result.products).catch(() => {});
          saveCachedCatalogSearch(resultIdentification.searchQuery, result.products, {
            petType: resultIdentification.petType,
          }).catch(() => {});
        }
        logCatalogLookupEvent({
          source: recognitionPath === "on_device_ocr" ? "label_scan_on_device" : "label_scan",
          query: resultIdentification.searchQuery,
          identification: resultIdentification,
          products: result.products,
          resolverStatus: result.status,
          resolutionDecision: result.decision,
          resolutionEvidence: result.resolutionEvidence,
          recognitionPath,
          verificationState: result.verificationState,
          latencyMs: Date.now() - startedAt,
        });
        logCatalogVerificationGapEvent({
          source: recognitionPath === "on_device_ocr" ? "label_scan_on_device" : "label_scan",
          query: resultIdentification.searchQuery,
          identification: resultIdentification,
          products: result.products,
          resolverStatus: result.status,
          verificationState: result.verificationState,
          trigger: result.selectedProduct ? "label_recommendation" : "label_results",
          latencyMs: Date.now() - startedAt,
        });
        trackEvent("label_lookup_completed", {
          found: result.products.length > 0,
          label_read: !!resultIdentification.labelRead,
          match_found: result.products.length > 0,
          timed_out: result.decision === LABEL_RESOLUTION_DECISIONS.TIMED_OUT,
          resolver_status: result.status,
          confidence: resultIdentification.confidence ?? null,
          result_count: result.products.length,
          image_result_count: result.products.filter((product) => !!product.imageUrl).length,
          auto_opened: !!result.selectedProduct,
          recognition_path: recognitionPath,
          resolution_decision: result.decision,
          agreement_fields: result.resolutionEvidence.agreementFields,
          disagreement_fields: result.resolutionEvidence.disagreementFields,
          reason_codes: result.resolutionEvidence.reasonCodes,
          visual_confirmation: result.resolutionEvidence.visualConfirmation,
          recognized_on_device: result.resolutionEvidence.recognizedIdentity.onDeviceOcr,
          recognized_cloud: result.resolutionEvidence.recognizedIdentity.cloudImage,
          top_candidate_cache_key: result.products[0]?.cacheKey || null,
          top_candidate_brand: result.products[0]?.brand || null,
          top_candidate_product_name: result.products[0]?.productName || null,
          top_candidate_food_form: result.products[0]?.foodForm || null,
          top_candidate_package_size: result.products[0]?.packageSize || null,
          confirmed_candidate: result.resolutionEvidence.confirmedCandidate,
          auto_open_fired: result.resolutionEvidence.autoOpenFired,
          manual_selected: false,
          result_mode: result.resolutionEvidence.resultMode,
          runtime_config_source: runtimeConfig.source,
          automatic_recovery_attempted: automaticRecoveryAttempted,
          automatic_recovery_succeeded: automaticRecoverySucceeded,
          automatic_recovery_latency_ms: automaticRecoveryLatencyMs,
          total_latency_ms: Date.now() - startedAt,
          resolver_latency_ms: Date.now() - resolverStartedAt,
          capture_to_resolver_ms: resolverStartedAt - startedAt,
        });
        if (!result.selectedProduct) {
          logCaptureToResult({
            captureStartedAt: labelCaptureStartedAt,
            mode: "label_lookup",
            outcome: result.decision,
          });
        }
        if (result.selectedProduct) {
          if (result.selectedProduct.imageUrl) {
            Image.prefetch(result.selectedProduct.imageUrl).catch(() => {});
          }
          await openProductResultRef.current(result.selectedProduct, {
            sourceSurface: recognitionPath === "on_device_ocr" ? "label_scan_on_device" : "label_scan",
            autoOpen: true,
            labelConfidence: resultIdentification.confidence ?? null,
            matchQuery: resultIdentification.searchQuery || resultIdentification.productName || "",
            labelIdentification: resultIdentification,
            labelResolutionDecision: result.decision,
            labelResolutionEvidence: result.resolutionEvidence,
          });
        }
      } catch (err) {
        if (lifecycleController.signal.aborted) return;
        logger.debug("[PRODUCT_SEARCH] Label lookup failed:", err.message);
        const recognizedOcr = recognizedOcrRef.current;
        const recognizedQuery = labelOcrSearchQueries(
          recognizedOcr.text,
          recognizedOcr.lines
        )[0] || collapseRepeatedIdentityText(recognizedOcr.text);
        if (recognizedQuery) {
          setQuery(recognizedQuery);
          lastSubmittedQueryRef.current = recognizedQuery;
          setIdentification({
            found: false,
            labelRead: true,
            confidence: 0,
            searchQuery: recognizedQuery,
            notes: "The label was read, but exact catalog confirmation took too long.",
          });
          setResolutionDecision(LABEL_RESOLUTION_DECISIONS.TIMED_OUT);
          setError(null);
          setLabelLoadingMessage("Searching by the recognized product name...");
          await runSearch(recognizedQuery, "label_timeout_recovery", petTypeFilter);
        } else {
          setError(labelLookupErrorMessage(err));
        }
        logCatalogLookupEvent({
          source: "label_scan",
          query: recognizedQuery,
          latencyMs: Date.now() - startedAt,
          errorMessage: err.message,
        });
        trackEvent("label_lookup_failed", {
          message: err.message,
          scan_mode: "label_lookup",
          failure_category: /timed out|abort/i.test(String(err.message))
            ? "resolver_timeout"
            : "resolver_error",
          label_read: Boolean(recognizedQuery),
          match_found: false,
        });
        logCaptureToResult({
          captureStartedAt: labelCaptureStartedAt,
          mode: "label_lookup",
          outcome: "error",
        });
      } finally {
        lifecycleController.signal.removeEventListener("abort", abortRequests);
        if (labelAbortRef.current === lifecycleController) labelAbortRef.current = null;
        if (
          !lifecycleController.signal.aborted
          && labelRunRef.current.runId === labelRunId
        ) {
          setLabelLoading(false);
        }
      }
    })();

    return () => {
      lifecycleController.abort();
      requestController.abort();
      if (labelRunRef.current.runId === labelRunId) {
        labelRunRef.current = { key: "", runId: labelRunId };
      }
    };
  }, [
    devFixture,
    hasLabelLookupInput,
    labelCaptureId,
    labelCaptureStartedAt,
    labelImageBase64,
    labelImageUri,
    labelLookupErrorMessage,
    labelOcrDurationMs,
    labelOcrLines,
    labelOcrText,
    petTypeFilter,
    runSearch,
  ]);

  useEffect(() => {
    if (devFixture) return;
    if (labelLoading) return;
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      setProducts([]);
      return;
    }
    if (trimmedQuery === lastSubmittedQueryRef.current) return;

    const timer = setTimeout(() => {
      lastSubmittedQueryRef.current = trimmedQuery;
      runSearch(trimmedQuery, "typed");
    }, 280);

    return () => clearTimeout(timer);
  }, [devFixture, trimmedQuery, labelLoading, runSearch]);

  const handleQueryChange = (value) => {
    if (identification || resolutionDecision || labelLoading) {
      clearScanContext();
      setProducts([]);
      setError(null);
      setShowingCached(false);
      setSearchCorrection("");
      lastSubmittedQueryRef.current = "";
    }
    setQuery(value);
  };

  const handleSubmit = () => {
    Keyboard.dismiss();
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return;
    Haptics.selectionAsync();
    lastSubmittedQueryRef.current = trimmedQuery;
    runSearch(trimmedQuery, "submit");
  };

  const handleSearchRecognized = () => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return;
    Haptics.selectionAsync();
    lastSubmittedQueryRef.current = trimmedQuery;
    runSearch(trimmedQuery, "recognized_label");
  };

  const handleClear = () => {
    Haptics.selectionAsync();
    setQuery("");
    setProducts([]);
    clearScanContext();
    setError(null);
    setShowingCached(false);
    setSearchCorrection("");
    setSearchFailureKind(null);
    setNoneOfTheseSelected(false);
    lastSubmittedQueryRef.current = "";
    trackEvent("catalog_search_cleared");
  };

  const handleRetryCapturedLabel = () => {
    Haptics.selectionAsync();
    trackEvent("catalog_label_retry_tapped", {
      source_surface: "product_search",
      previous_decision: resolutionDecision,
      reused_capture: false,
      label_attempt: labelAttempt + 1,
    });
    if (!canScan()) {
      navigation.navigate("Paywall", {
        source: "scan_limit",
        sourceSurface: "product_search_photo_retry",
        remainingScans: remainingScans(),
      });
      return;
    }
    navigation.navigate("Scanner", {
      mode: "label_lookup",
      returnToProductSearch: true,
      labelAttempt: labelAttempt + 1,
      ...navigationTimingParams("product_search_photo_retry"),
    });
  };

  const handleSearchByName = () => {
    Haptics.selectionAsync();
    searchInputRef.current?.focus?.();
  };

  const handleSearchByNameInstead = () => {
    labelAbortRef.current?.abort();
    labelAbortRef.current = null;
    setLabelLoading(false);
    setResolutionDecision(null);
    setProducts([]);
    setError(null);
    trackEvent("catalog_label_lookup_cancelled", {
      source_surface: "product_search",
      action: "search_by_name",
    });
    setTimeout(() => searchInputRef.current?.focus?.(), 0);
  };

  const handleCancelLabelLookup = () => {
    labelAbortRef.current?.abort();
    labelAbortRef.current = null;
    setLabelLoading(false);
    trackEvent("catalog_label_lookup_cancelled", {
      source_surface: "product_search",
      action: "go_back",
    });
    navigation.goBack();
  };

  const handleRetrySearch = () => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      handleSearchByName();
      return;
    }
    Haptics.selectionAsync();
    runSearch(trimmedQuery, "retry", petTypeFilter);
  };

  const handlePetTypeFilter = (nextFilter) => {
    if (nextFilter === petTypeFilter) return;
    Haptics.selectionAsync();
    petTypeFilterTouchedRef.current = true;
    setPetTypeFilter(nextFilter);
    trackEvent("catalog_species_filter_changed", {
      pet_type: nextFilter,
      query_present: trimmedQuery.length >= MIN_QUERY_LENGTH,
    });
    if (trimmedQuery.length >= MIN_QUERY_LENGTH) {
      runSearch(trimmedQuery, "species_filter", nextFilter);
    }
  };

  const handleNoneOfThese = () => {
    Haptics.selectionAsync();
    setProducts([]);
    setConfirmedFormulaKey("");
    setResolutionDecision(LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT);
    setNoneOfTheseSelected(true);
    setIdentification((current) => current ? {
      ...current,
      notes: "No exact package selected. Search by name or scan a clearer front label.",
    } : current);
    trackEvent("catalog_label_none_of_these", {
      source_surface: "product_search",
      previous_decision: resolutionDecision,
    });
  };

  const handleScanLabel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackEvent("catalog_label_scan_tapped", { source_surface: "product_search" });
    if (!canScan()) {
      navigation.navigate("Paywall", {
        source: "scan_limit",
        sourceSurface: "product_search_camera",
        remainingScans: remainingScans(),
      });
      return;
    }
    navigation.navigate("Scanner", {
      mode: "label_lookup",
      returnToProductSearch: true,
      ...navigationTimingParams("product_search_camera"),
    });
  };

  const handleScanIngredients = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!canScan()) {
      navigation.navigate("Paywall", {
        source: "scan_limit",
        sourceSurface: "product_search_ingredient_capture",
        remainingScans: remainingScans(),
      });
      return;
    }
    const acquisitionQuery = query.trim()
      || identification?.searchQuery
      || [identification?.brand, identification?.productName].filter(Boolean).join(" ");
    const catalogEvidenceConsent = await requestCatalogEvidenceConsent();
    if (catalogEvidenceConsent == null) return;
    trackEvent("catalog_ingredient_capture_tapped", {
      source_surface: "product_search",
      query_present: acquisitionQuery.length > 0,
      label_found: identification?.found === true,
      catalog_evidence_consent: catalogEvidenceConsent,
    });
    navigation.navigate("Scanner", {
      mode: "ingredient_capture",
      acquisitionQuery,
      labelIdentification: identification,
      sourceSurface: "product_search_gap",
      catalogEvidenceConsent,
      ...navigationTimingParams("product_search_ingredient_capture"),
    });
  };

  const handleProductPress = (product) => {
    const labelCandidate = Boolean(resolutionDecision || identification?.labelRead);
    openProductResult(product, {
      sourceSurface: labelCandidate ? "label_candidate_list" : "product_search",
      matchQuery: query,
    });
  };

  const labelFlowActive = Boolean(
    labelLoading
    || identification
    || resolutionDecision
    || recognizedIdentityText
  );
  const showPinnedRecovery = products.length > 0
    && resolutionDecision
    && resolutionDecision !== LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED;

  const labelStatus = useMemo(() => {
    if (!labelFlowActive) return null;
    if (resolutionDecision === LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED) {
      return { message: "Exact package confirmed", badge: "Confirmed", confirmed: true };
    }
    if (products.length > 0) {
      return { message: "Label read — choose your exact package", badge: "Not confirmed" };
    }
    if (recognizedIdentityText || identification?.found) {
      return { message: "Label read — checking the catalog", badge: "Checking" };
    }
    if (labelLoading) return { message: "Reading product label…", badge: "Checking" };
    return null;
  }, [identification?.found, labelFlowActive, labelLoading, products.length, recognizedIdentityText, resolutionDecision]);

  const resultCopy = useMemo(() => {
    if (labelFlowActive) return "";
    if ((loading || labelLoading) && !(showingCached && products.length > 0)) {
      return labelLoading ? labelLoadingMessage : searchLoadingMessage;
    }
    if (products.length === 0) return "";
    if (
      resolutionDecision
      && resolutionDecision !== LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED
    ) {
      const count = products.length === 1 ? "1 similar product" : `${products.length} similar products`;
      return `${count} — not confirmed`;
    }
    if (resolutionDecision === LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED) {
      return "Exact product confirmed";
    }
    const count = products.length === 1 ? "1 matching product" : `${products.length} matching products`;
    return showingCached ? `${count} • refreshing` : count;
  }, [labelFlowActive, labelLoading, labelLoadingMessage, loading, products, resolutionDecision, searchLoadingMessage, showingCached]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
        <Pressable
          onPress={handleScanLabel}
          hitSlop={12}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Scan product label"
        >
          <Camera size={20} color={theme.textPrimary} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.card, borderColor: theme.separator },
          ]}
        >
          <Search size={18} color={theme.textTertiary} strokeWidth={2} />
          <TextInput
            ref={searchInputRef}
            value={query}
            onChangeText={handleQueryChange}
            onSubmitEditing={handleSubmit}
            placeholder="Search name, brand, or flavor"
            placeholderTextColor={theme.textTertiary}
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.textPrimary }]}
            accessibilityLabel="Search products by name"
          />
          {query.length > 0 && (
            <Pressable
              onPress={handleClear}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={17} color={theme.textTertiary} strokeWidth={2} />
            </Pressable>
          )}
        </View>
        {labelStatus ? (
          <View
            ref={statusRef}
            style={styles.labelStatusRow}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${labelStatus.message}. ${labelStatus.badge}`}
          >
            <Text style={[styles.labelStatusText, { color: theme.textSecondary }]} numberOfLines={2}>
              {labelStatus.message}
            </Text>
            <View
              style={[
                styles.labelStatusBadge,
                {
                  backgroundColor: labelStatus.confirmed ? Colors.scoreExcellent + "16" : theme.surface,
                },
              ]}
            >
              {labelStatus.confirmed ? (
                <Check size={11} color={Colors.scoreExcellent} strokeWidth={2.8} />
              ) : null}
              <Text
                style={[
                  styles.labelStatusBadgeText,
                  { color: labelStatus.confirmed ? Colors.scoreExcellent : theme.textTertiary },
                ]}
              >
                {labelStatus.badge}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {!labelFlowActive ? (
        <View
          style={[styles.speciesFilter, { backgroundColor: theme.surface }]}
          accessibilityRole="tablist"
          accessibilityLabel="Filter products by species"
        >
          {[
            { key: "all", label: "All" },
            { key: "dog", label: "Dog" },
            { key: "cat", label: "Cat" },
          ].map((option) => {
            const selected = petTypeFilter === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => handlePetTypeFilter(option.key)}
                style={({ pressed }) => [
                  styles.speciesFilterOption,
                  {
                    backgroundColor: selected ? theme.card : "transparent",
                    borderColor: selected ? theme.separator : "transparent",
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
                accessibilityRole="tab"
                accessibilityLabel={`Show ${option.label.toLowerCase()} products`}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.speciesFilterText, { color: selected ? theme.textPrimary : theme.textSecondary }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <FlatList
        style={styles.resultsList}
        data={products}
        keyExtractor={(item) => `${item.sourceKind}:${productStableKey(item)}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.listContent,
          products.length === 0 && styles.listContentEmpty,
        ]}
        ListHeaderComponent={(
          <View style={styles.listHeader}>
            {resultCopy ? (
              <Text
                ref={statusRef}
                style={[styles.resultCopy, { color: theme.textTertiary }]}
                accessibilityLiveRegion="polite"
              >
                {resultCopy}
              </Text>
            ) : null}
            {searchCorrection ? (
              <Text
                style={[styles.correctionText, { color: theme.textSecondary }]}
                accessibilityLiveRegion="polite"
              >
                {products.length > 0 ? "Showing results for" : "Searched as"} “{formatCorrectedQuery(searchCorrection)}”
              </Text>
            ) : null}
            {error ? (
              <Text
                ref={statusRef}
                style={[styles.errorText, { color: Colors.scoreConcerning }]}
                accessibilityLiveRegion="assertive"
                selectable
              >
                {error}
              </Text>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            theme={theme}
            onPress={() => handleProductPress(item)}
            exactConfirmed={Boolean(
              confirmedFormulaKey
              && productFormulaKey(item) === confirmedFormulaKey
            )}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          loading || labelLoading ? (
            <View style={styles.loadingState}>
              {labelLoading && recognizedIdentityText ? (
                <View style={styles.recognizedLoading}>
                  <Text style={[styles.recognizedLoadingTitle, { color: theme.textPrimary }]} numberOfLines={3}>
                    Found: {recognizedIdentityText}
                  </Text>
                  <View style={[styles.recognizedSkeleton, { backgroundColor: theme.surface }]} />
                  <View style={[styles.recognizedSkeletonShort, { backgroundColor: theme.surface }]} />
                </View>
              ) : (
                <ActivityIndicator color={theme.textPrimary} />
              )}
              <Text style={[styles.loadingText, { color: theme.textTertiary }]}>
                {labelLoading ? labelLoadingMessage : "Searching products..."}
              </Text>
              {labelLoading ? (
                <View style={styles.labelLoadingActions}>
                  <Pressable
                    onPress={handleSearchByNameInstead}
                    style={({ pressed }) => [
                      styles.labelLoadingPrimary,
                      { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.82 : 1 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Search by product name instead"
                  >
                    <Text style={[styles.labelLoadingPrimaryText, { color: theme.buttonText }]}>
                      Search by Name Instead
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCancelLabelLookup}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel label lookup"
                    style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1, padding: 10 })}
                  >
                    <Text style={[styles.labelLoadingCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <EmptyState
              theme={theme}
              query={query}
              identification={identification}
              resolutionDecision={resolutionDecision}
              onSearchRecognized={handleSearchRecognized}
              onSearchByName={handleSearchByName}
              onRetrySearch={handleRetrySearch}
              onRetryLabel={handleRetryCapturedLabel}
              onScanLabel={handleScanLabel}
              onScanIngredients={handleScanIngredients}
              labelAttempt={labelAttempt}
              searchFailureKind={searchFailureKind}
              noneOfTheseSelected={noneOfTheseSelected}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
      {showPinnedRecovery ? (
        <View
          style={[
            styles.pinnedRecovery,
            { backgroundColor: theme.bg, borderTopColor: theme.separator },
          ]}
        >
          <Pressable
            onPress={handleNoneOfThese}
            style={({ pressed }) => [
              styles.pinnedRecoveryButton,
              { backgroundColor: theme.card, borderColor: theme.separator, opacity: pressed ? 0.72 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="None of these products match"
          >
            <Text style={[styles.pinnedRecoveryButtonText, { color: theme.textPrimary }]}>None of these</Text>
          </Pressable>
          <Pressable
            onPress={handleRetryCapturedLabel}
            style={({ pressed }) => [styles.pinnedRetry, { opacity: pressed ? 0.55 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Retry the captured front label"
          >
            <Camera size={15} color={theme.textSecondary} strokeWidth={2} />
            <Text style={[styles.pinnedRetryText, { color: theme.textSecondary }]}>Try photo again</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 60,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0,
  },
  searchWrap: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 12,
  },
  searchBox: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 11,
  },
  labelStatusRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  labelStatusText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  labelStatusBadge: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  labelStatusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  speciesFilter: {
    flexDirection: "row",
    marginHorizontal: Spacing.screenPadding,
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
    gap: 4,
  },
  speciesFilterOption: {
    minHeight: 38,
    flex: 1,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  speciesFilterText: {
    fontSize: 14,
    fontWeight: "700",
  },
  resultsList: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.lg,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listHeader: {
    paddingBottom: 12,
  },
  resultCopy: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  correctionText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 6,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 8,
  },
  productRow: {
    minHeight: 132,
    borderRadius: Spacing.cardRadius,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    gap: 14,
    ...Shadows.card,
  },
  productImage: {
    width: 92,
    height: 104,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: "#FFFFFF",
  },
  productImagePlaceholder: {
    width: 92,
    height: 104,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  productBrand: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
    letterSpacing: 0,
    marginBottom: 6,
  },
  variantChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  variantChip: {
    minHeight: 23,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    justifyContent: "center",
  },
  variantChipProminent: {
    minHeight: 27,
    paddingHorizontal: 9,
  },
  variantChipText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
  },
  variantChipTextProminent: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  verificationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  verificationBadge: {
    minHeight: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 7,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  verificationBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  recognizedLoading: {
    width: "100%",
    maxWidth: 320,
    gap: 10,
    marginBottom: 2,
  },
  recognizedLoadingTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
    textAlign: "center",
  },
  recognizedSkeleton: {
    alignSelf: "center",
    width: "88%",
    height: 14,
    borderRadius: 7,
    opacity: 0.72,
  },
  recognizedSkeletonShort: {
    alignSelf: "center",
    width: "58%",
    height: 14,
    borderRadius: 7,
    opacity: 0.5,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  labelLoadingActions: {
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
  labelLoadingPrimary: {
    minHeight: 46,
    width: "100%",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  labelLoadingPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
  },
  labelLoadingCancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  pinnedRecovery: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: 10,
    paddingBottom: 8,
  },
  pinnedRecoveryButton: {
    minHeight: 46,
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  pinnedRecoveryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  pinnedRetry: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  pinnedRetryText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  emptyButton: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 22,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
  },
  emptySecondaryButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  emptySecondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
  },
});
