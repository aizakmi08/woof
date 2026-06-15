/**
 * Pre-populate product_data cache with top-selling pet foods.
 *
 * Usage:
 *   SUPABASE_URL=your-supabase-url \
 *   SUPABASE_SERVICE_KEY=your-service-role-key \
 *   node scripts/prepopulate-products.js
 *
 * Cost: ~2 ScrapingBee credits per product (1 Google search + 1 page scrape).
 * 200 products = ~400 credits. Freelance plan gives 250,000.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars");
  process.exit(1);
}

const LOOKUP_URL = `${SUPABASE_URL}/functions/v1/product-lookup`;

const TOP_PRODUCTS = [
  // ═══════════════════════════════════════════════════════════════
  // DOG FOOD — DRY (most scanned category)
  // ═══════════════════════════════════════════════════════════════

  // Purina Pro Plan (market leader)
  { name: "Purina Pro Plan Adult Complete Essentials Chicken Rice", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Sensitive Skin Stomach Salmon Rice", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Sport Performance 30/20 Chicken", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Adult Shredded Blend Chicken Rice", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Puppy Chicken Rice", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Large Breed Adult Chicken Rice", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Small Breed Adult Chicken Rice", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Adult Complete Essentials Beef Rice", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Senior 7+ Chicken Rice", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Purina Pro Plan Weight Management Chicken Rice", brand: "Purina Pro Plan", petType: "dog" },

  // Purina ONE
  { name: "Purina ONE SmartBlend True Instinct Chicken Rice", brand: "Purina ONE", petType: "dog" },
  { name: "Purina ONE Natural SmartBlend Lamb Rice", brand: "Purina ONE", petType: "dog" },
  { name: "Purina ONE SmartBlend Healthy Puppy", brand: "Purina ONE", petType: "dog" },

  // Blue Buffalo
  { name: "Blue Buffalo Life Protection Chicken Brown Rice Adult", brand: "Blue Buffalo", petType: "dog" },
  { name: "Blue Buffalo Life Protection Lamb Brown Rice", brand: "Blue Buffalo", petType: "dog" },
  { name: "Blue Buffalo Life Protection Fish Brown Rice", brand: "Blue Buffalo", petType: "dog" },
  { name: "Blue Buffalo Wilderness High Protein Chicken Adult", brand: "Blue Buffalo", petType: "dog" },
  { name: "Blue Buffalo Wilderness Salmon Recipe", brand: "Blue Buffalo", petType: "dog" },
  { name: "Blue Buffalo Basics Skin Stomach Care Turkey Potato", brand: "Blue Buffalo", petType: "dog" },
  { name: "Blue Buffalo Life Protection Puppy Chicken Brown Rice", brand: "Blue Buffalo", petType: "dog" },
  { name: "Blue Buffalo Life Protection Large Breed Chicken", brand: "Blue Buffalo", petType: "dog" },
  { name: "Blue Buffalo Life Protection Senior Chicken", brand: "Blue Buffalo", petType: "dog" },

  // Royal Canin
  { name: "Royal Canin Medium Adult Dry Dog Food", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin Large Breed Adult", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin Small Breed Adult", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin Medium Puppy", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin Large Breed Puppy", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin Small Breed Puppy", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin German Shepherd Adult", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin French Bulldog Adult", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin Golden Retriever Adult", brand: "Royal Canin", petType: "dog" },
  { name: "Royal Canin Labrador Retriever Adult", brand: "Royal Canin", petType: "dog" },

  // Hill's Science Diet
  { name: "Hill's Science Diet Adult Chicken Barley Recipe", brand: "Hill's Science Diet", petType: "dog" },
  { name: "Hill's Science Diet Sensitive Stomach Skin Chicken", brand: "Hill's Science Diet", petType: "dog" },
  { name: "Hill's Science Diet Large Breed Adult Chicken", brand: "Hill's Science Diet", petType: "dog" },
  { name: "Hill's Science Diet Puppy Chicken Barley", brand: "Hill's Science Diet", petType: "dog" },
  { name: "Hill's Science Diet Adult Perfect Weight Chicken", brand: "Hill's Science Diet", petType: "dog" },
  { name: "Hill's Science Diet Senior 7+ Chicken", brand: "Hill's Science Diet", petType: "dog" },
  { name: "Hill's Science Diet Small Breed Adult Chicken", brand: "Hill's Science Diet", petType: "dog" },

  // Iams
  { name: "Iams ProActive Health Adult MiniChunks", brand: "Iams", petType: "dog" },
  { name: "Iams ProActive Health Adult Large Breed", brand: "Iams", petType: "dog" },
  { name: "Iams ProActive Health Adult Lamb Rice", brand: "Iams", petType: "dog" },
  { name: "Iams ProActive Health Smart Puppy", brand: "Iams", petType: "dog" },
  { name: "Iams ProActive Health Healthy Weight", brand: "Iams", petType: "dog" },

  // Pedigree
  { name: "Pedigree Complete Nutrition Adult Roasted Chicken", brand: "Pedigree", petType: "dog" },
  { name: "Pedigree Complete Nutrition Grilled Steak Vegetable", brand: "Pedigree", petType: "dog" },
  { name: "Pedigree Puppy Growth Protection Chicken Vegetable", brand: "Pedigree", petType: "dog" },
  { name: "Pedigree High Protein Beef Lamb", brand: "Pedigree", petType: "dog" },

  // Taste of the Wild
  { name: "Taste of the Wild High Prairie Canine Bison Venison", brand: "Taste of the Wild", petType: "dog" },
  { name: "Taste of the Wild Pacific Stream Smoked Salmon", brand: "Taste of the Wild", petType: "dog" },
  { name: "Taste of the Wild Sierra Mountain Lamb", brand: "Taste of the Wild", petType: "dog" },
  { name: "Taste of the Wild Wetlands Fowl", brand: "Taste of the Wild", petType: "dog" },
  { name: "Taste of the Wild Ancient Prairie Puppy", brand: "Taste of the Wild", petType: "dog" },

  // Rachael Ray Nutrish
  { name: "Rachael Ray Nutrish Real Chicken Veggies", brand: "Rachael Ray Nutrish", petType: "dog" },
  { name: "Rachael Ray Nutrish Real Beef Pea Brown Rice", brand: "Rachael Ray Nutrish", petType: "dog" },
  { name: "Rachael Ray Nutrish Zero Grain Turkey Potato", brand: "Rachael Ray Nutrish", petType: "dog" },

  // Diamond Naturals
  { name: "Diamond Naturals Adult Dog Chicken Egg", brand: "Diamond Naturals", petType: "dog" },
  { name: "Diamond Naturals Large Breed Adult Lamb", brand: "Diamond Naturals", petType: "dog" },
  { name: "Diamond Naturals All Life Stages Chicken", brand: "Diamond Naturals", petType: "dog" },

  // Wellness
  { name: "Wellness Complete Health Adult Deboned Chicken", brand: "Wellness", petType: "dog" },
  { name: "Wellness CORE Grain Free Original Turkey Chicken", brand: "Wellness", petType: "dog" },
  { name: "Wellness Complete Health Puppy Deboned Chicken", brand: "Wellness", petType: "dog" },
  { name: "Wellness Complete Health Small Breed Turkey Oatmeal", brand: "Wellness", petType: "dog" },

  // Nutro
  { name: "Nutro Wholesome Essentials Adult Farm Raised Chicken", brand: "Nutro", petType: "dog" },
  { name: "Nutro Ultra Adult Dry Dog Food", brand: "Nutro", petType: "dog" },
  { name: "Nutro Wholesome Essentials Puppy Chicken", brand: "Nutro", petType: "dog" },
  { name: "Nutro Wholesome Essentials Large Breed Adult Chicken", brand: "Nutro", petType: "dog" },

  // Premium brands
  { name: "Orijen Original Dog Food", brand: "Orijen", petType: "dog" },
  { name: "Orijen Puppy Dog Food", brand: "Orijen", petType: "dog" },
  { name: "Orijen Six Fish Dog Food", brand: "Orijen", petType: "dog" },
  { name: "Orijen Regional Red Dog Food", brand: "Orijen", petType: "dog" },
  { name: "Acana Red Meat Recipe Grain Free", brand: "Acana", petType: "dog" },
  { name: "Acana Heritage Free Run Poultry", brand: "Acana", petType: "dog" },
  { name: "Acana Wholesome Grains Free Run Poultry", brand: "Acana", petType: "dog" },

  // Other popular dog food
  { name: "Canidae All Life Stages Multi-Protein", brand: "Canidae", petType: "dog" },
  { name: "Canidae Pure Limited Ingredient Salmon", brand: "Canidae", petType: "dog" },
  { name: "Merrick Grain Free Real Texas Beef Sweet Potato", brand: "Merrick", petType: "dog" },
  { name: "Merrick Grain Free Real Chicken Sweet Potato", brand: "Merrick", petType: "dog" },
  { name: "Victor Hi-Pro Plus Dog Food", brand: "Victor", petType: "dog" },
  { name: "Victor Purpose Nutra Pro Dog Food", brand: "Victor", petType: "dog" },
  { name: "American Journey Chicken Sweet Potato", brand: "American Journey", petType: "dog" },
  { name: "American Journey Lamb Sweet Potato", brand: "American Journey", petType: "dog" },
  { name: "American Journey Salmon Sweet Potato", brand: "American Journey", petType: "dog" },
  { name: "Instinct Original Grain Free Chicken Dog", brand: "Instinct", petType: "dog" },
  { name: "Instinct Raw Boost Grain Free Chicken Dog", brand: "Instinct", petType: "dog" },
  { name: "Nulo Freestyle Adult Dog Salmon Peas", brand: "Nulo", petType: "dog" },
  { name: "Nulo Freestyle Adult Turkey Sweet Potato", brand: "Nulo", petType: "dog" },
  { name: "Fromm Gold Adult Dog Food", brand: "Fromm", petType: "dog" },
  { name: "Fromm Four Star Chicken Au Frommage", brand: "Fromm", petType: "dog" },
  { name: "Stella & Chewy's Raw Blend Cage Free Chicken", brand: "Stella & Chewy's", petType: "dog" },
  { name: "Open Farm Homestead Turkey Chicken Dog", brand: "Open Farm", petType: "dog" },
  { name: "Whole Earth Farms Grain Free Chicken Turkey Dog", brand: "Whole Earth Farms", petType: "dog" },
  { name: "Purina Dog Chow Complete Adult Chicken", brand: "Purina Dog Chow", petType: "dog" },
  { name: "Purina Beneful OriginalS Real Beef", brand: "Purina Beneful", petType: "dog" },
  { name: "Purina Beneful Healthy Weight Real Chicken", brand: "Purina Beneful", petType: "dog" },
  { name: "Kibbles 'n Bits Original Savory Beef Chicken", brand: "Kibbles 'n Bits", petType: "dog" },

  // ═══════════════════════════════════════════════════════════════
  // DOG FOOD — WET/CANNED
  // ═══════════════════════════════════════════════════════════════
  { name: "Purina Pro Plan Adult Chicken Rice Entree Wet Dog", brand: "Purina Pro Plan", petType: "dog" },
  { name: "Blue Buffalo Homestyle Recipe Chicken Dinner", brand: "Blue Buffalo", petType: "dog" },
  { name: "Hill's Science Diet Adult Chicken Barley Entree Wet", brand: "Hill's Science Diet", petType: "dog" },
  { name: "Pedigree Chopped Ground Dinner Beef Wet Dog Food", brand: "Pedigree", petType: "dog" },
  { name: "Cesar Classic Loaf Grilled Chicken", brand: "Cesar", petType: "dog" },
  { name: "Cesar Filets in Gravy Variety Pack", brand: "Cesar", petType: "dog" },
  { name: "Rachael Ray Nutrish Wet Dog Food Chicken Paws", brand: "Rachael Ray Nutrish", petType: "dog" },

  // ═══════════════════════════════════════════════════════════════
  // CAT FOOD — DRY
  // ═══════════════════════════════════════════════════════════════

  // Purina (cat)
  { name: "Purina Pro Plan Complete Essentials Chicken Rice Cat", brand: "Purina Pro Plan", petType: "cat" },
  { name: "Purina Pro Plan Sensitive Skin Stomach Cat Lamb Rice", brand: "Purina Pro Plan", petType: "cat" },
  { name: "Purina Pro Plan Indoor Hairball Management Cat", brand: "Purina Pro Plan", petType: "cat" },
  { name: "Purina Pro Plan Kitten Chicken Rice", brand: "Purina Pro Plan", petType: "cat" },
  { name: "Purina ONE Healthy Kitten Formula", brand: "Purina ONE", petType: "cat" },
  { name: "Purina ONE Indoor Advantage Adult Cat", brand: "Purina ONE", petType: "cat" },
  { name: "Purina ONE Tender Selects Blend Chicken", brand: "Purina ONE", petType: "cat" },
  { name: "Purina Cat Chow Complete Dry Cat Food", brand: "Purina Cat Chow", petType: "cat" },
  { name: "Purina Cat Chow Indoor Hairball Healthy Weight", brand: "Purina Cat Chow", petType: "cat" },

  // Blue Buffalo (cat)
  { name: "Blue Buffalo Indoor Health Adult Chicken Brown Rice Cat", brand: "Blue Buffalo", petType: "cat" },
  { name: "Blue Buffalo Wilderness High Protein Chicken Cat", brand: "Blue Buffalo", petType: "cat" },
  { name: "Blue Buffalo Tastefuls Adult Indoor Chicken Cat", brand: "Blue Buffalo", petType: "cat" },
  { name: "Blue Buffalo Life Protection Kitten Chicken", brand: "Blue Buffalo", petType: "cat" },
  { name: "Blue Buffalo Basics Skin Stomach Care Duck Cat", brand: "Blue Buffalo", petType: "cat" },

  // Royal Canin (cat)
  { name: "Royal Canin Indoor Adult Dry Cat Food", brand: "Royal Canin", petType: "cat" },
  { name: "Royal Canin Kitten Dry Cat Food", brand: "Royal Canin", petType: "cat" },
  { name: "Royal Canin Aging 12+ Senior Cat Food", brand: "Royal Canin", petType: "cat" },
  { name: "Royal Canin Digestive Care Cat Food", brand: "Royal Canin", petType: "cat" },
  { name: "Royal Canin Urinary Care Cat Food", brand: "Royal Canin", petType: "cat" },

  // Hill's (cat)
  { name: "Hill's Science Diet Adult Indoor Chicken Recipe Cat", brand: "Hill's Science Diet", petType: "cat" },
  { name: "Hill's Science Diet Adult Sensitive Stomach Skin Cat", brand: "Hill's Science Diet", petType: "cat" },
  { name: "Hill's Science Diet Kitten Chicken Recipe Cat", brand: "Hill's Science Diet", petType: "cat" },
  { name: "Hill's Science Diet Adult Hairball Control Cat", brand: "Hill's Science Diet", petType: "cat" },
  { name: "Hill's Science Diet Adult Optimal Care Chicken Cat", brand: "Hill's Science Diet", petType: "cat" },

  // Iams (cat)
  { name: "Iams ProActive Health Indoor Weight Hairball Care Cat", brand: "Iams", petType: "cat" },
  { name: "Iams ProActive Health Healthy Adult Chicken Cat", brand: "Iams", petType: "cat" },
  { name: "Iams ProActive Health Healthy Kitten Chicken", brand: "Iams", petType: "cat" },

  // Budget cat food
  { name: "Meow Mix Original Choice Dry Cat Food", brand: "Meow Mix", petType: "cat" },
  { name: "Meow Mix Tender Centers Salmon Chicken", brand: "Meow Mix", petType: "cat" },
  { name: "Meow Mix Indoor Health Dry Cat Food", brand: "Meow Mix", petType: "cat" },
  { name: "Friskies Surfin Turfin Favorites Dry Cat Food", brand: "Friskies", petType: "cat" },
  { name: "Friskies Indoor Delights Dry Cat Food", brand: "Friskies", petType: "cat" },
  { name: "9 Lives Daily Essentials Dry Cat Food", brand: "9 Lives", petType: "cat" },
  { name: "Kit & Kaboodle Original Dry Cat Food", brand: "Kit & Kaboodle", petType: "cat" },

  // Premium cat food
  { name: "Wellness Complete Health Indoor Deboned Chicken Cat", brand: "Wellness", petType: "cat" },
  { name: "Wellness CORE Grain Free Indoor Cat", brand: "Wellness", petType: "cat" },
  { name: "Wellness CORE Grain Free Original Turkey Cat", brand: "Wellness", petType: "cat" },
  { name: "Taste of the Wild Canyon River Trout Cat", brand: "Taste of the Wild", petType: "cat" },
  { name: "Taste of the Wild Rocky Mountain Feline Venison", brand: "Taste of the Wild", petType: "cat" },
  { name: "Orijen Cat Kitten Grain Free", brand: "Orijen", petType: "cat" },
  { name: "Orijen Six Fish Cat Food", brand: "Orijen", petType: "cat" },
  { name: "Acana Indoor Entree Cat Food", brand: "Acana", petType: "cat" },
  { name: "Nutro Wholesome Essentials Indoor Chicken Cat", brand: "Nutro", petType: "cat" },
  { name: "Instinct Original Grain Free Real Chicken Cat", brand: "Instinct", petType: "cat" },
  { name: "American Journey Indoor Dry Cat Food Salmon", brand: "American Journey", petType: "cat" },
  { name: "Nulo Freestyle Indoor Cat Chicken Cod Duck", brand: "Nulo", petType: "cat" },
  { name: "Rachael Ray Nutrish Indoor Complete Chicken Cat", brand: "Rachael Ray Nutrish", petType: "cat" },
  { name: "Merrick Purrfect Bistro Grain Free Chicken Cat", brand: "Merrick", petType: "cat" },
  { name: "Fromm Gold Adult Cat Food", brand: "Fromm", petType: "cat" },
  { name: "Open Farm Wild Caught Salmon Cat Food", brand: "Open Farm", petType: "cat" },
  { name: "Whole Earth Farms Grain Free Chicken Turkey Cat", brand: "Whole Earth Farms", petType: "cat" },

  // ═══════════════════════════════════════════════════════════════
  // CAT FOOD — WET/CANNED
  // ═══════════════════════════════════════════════════════════════
  { name: "Fancy Feast Classic Pate Chicken Feast Cat", brand: "Fancy Feast", petType: "cat" },
  { name: "Fancy Feast Classic Pate Seafood Feast Cat", brand: "Fancy Feast", petType: "cat" },
  { name: "Fancy Feast Classic Pate Turkey Giblets Cat", brand: "Fancy Feast", petType: "cat" },
  { name: "Fancy Feast Gravy Lovers Chicken Cat", brand: "Fancy Feast", petType: "cat" },
  { name: "Fancy Feast Medleys Primavera Collection Cat", brand: "Fancy Feast", petType: "cat" },
  { name: "Friskies Shreds Variety Pack Wet Cat Food", brand: "Friskies", petType: "cat" },
  { name: "Friskies Pate Variety Pack Wet Cat Food", brand: "Friskies", petType: "cat" },
  { name: "Sheba Perfect Portions Pate Chicken Cat", brand: "Sheba", petType: "cat" },
  { name: "Sheba Perfect Portions Pate Salmon Cat", brand: "Sheba", petType: "cat" },
  { name: "Tiki Cat Luau Variety Pack Wet Cat Food", brand: "Tiki Cat", petType: "cat" },
  { name: "Purina Pro Plan Complete Essentials Chicken Wet Cat", brand: "Purina Pro Plan", petType: "cat" },
  { name: "Blue Buffalo Tastefuls Pate Chicken Cat", brand: "Blue Buffalo", petType: "cat" },
  { name: "Wellness Complete Health Pate Chicken Cat", brand: "Wellness", petType: "cat" },
  { name: "Royal Canin Feline Health Nutrition Thin Slices", brand: "Royal Canin", petType: "cat" },
  { name: "Hill's Science Diet Adult Tender Chicken Dinner Cat", brand: "Hill's Science Diet", petType: "cat" },
  { name: "9 Lives Pate Favorites Variety Pack Cat", brand: "9 Lives", petType: "cat" },

  // ═══════════════════════════════════════════════════════════════
  // DOG TREATS (frequently scanned)
  // ═══════════════════════════════════════════════════════════════
  { name: "Milk-Bone Original Biscuits Large Dog Treats", brand: "Milk-Bone", petType: "dog" },
  { name: "Milk-Bone MaroSnacks Dog Treats", brand: "Milk-Bone", petType: "dog" },
  { name: "Greenies Regular Dental Dog Treats", brand: "Greenies", petType: "dog" },
  { name: "Greenies Petite Dental Dog Treats", brand: "Greenies", petType: "dog" },
  { name: "Blue Buffalo Blue Bits Chicken Training Treats", brand: "Blue Buffalo", petType: "dog" },
  { name: "Zuke's Mini Naturals Chicken Training Treats", brand: "Zuke's", petType: "dog" },
  { name: "Old Mother Hubbard Classic Biscuits Dog Treats", brand: "Old Mother Hubbard", petType: "dog" },
  { name: "Purina Beggin Strips Bacon Flavor Dog Treats", brand: "Purina Beggin", petType: "dog" },
  { name: "Purina Busy Bone Small Medium Dog Treats", brand: "Purina Busy", petType: "dog" },

  // ═══════════════════════════════════════════════════════════════
  // CAT TREATS
  // ═══════════════════════════════════════════════════════════════
  { name: "Temptations Classic Crunchy Cat Treats Chicken", brand: "Temptations", petType: "cat" },
  { name: "Temptations Classic Cat Treats Seafood Medley", brand: "Temptations", petType: "cat" },
  { name: "Greenies Feline Dental Treats Chicken", brand: "Greenies", petType: "cat" },
  { name: "Delectables Squeeze Up Chicken Cat Treats", brand: "Delectables", petType: "cat" },
  { name: "Churu Chicken Recipe Cat Treats", brand: "Inaba", petType: "cat" },
];

const DELAY_MS = 2000;

async function prepopulate() {
  console.log(`Pre-populating ${TOP_PRODUCTS.length} products...\n`);

  let success = 0;
  let failed = 0;
  let cached = 0;
  const failures = [];

  for (let i = 0; i < TOP_PRODUCTS.length; i++) {
    const { name, brand, petType } = TOP_PRODUCTS[i];
    const progress = `[${i + 1}/${TOP_PRODUCTS.length}]`;

    try {
      console.log(`${progress} [${petType}] ${name}`);

      const response = await fetch(LOOKUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({
          productName: name,
          brand,
          petType,
          searchTerms: [name],
        }),
      });

      const data = await response.json();

      if (data.found) {
        if (data.source === "cache") {
          console.log(`  ↩ Already cached (${data.ingredientCount} ingredients)`);
          cached++;
        } else {
          console.log(`  ✓ ${data.source}: ${data.ingredientCount} ingredients`);
          success++;
        }
      } else {
        console.log(`  ✗ Not found (${data.reason || "unknown"})`);
        failed++;
        failures.push(name);
      }

      if (i < TOP_PRODUCTS.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      failed++;
      failures.push(name);
    }
  }

  console.log("\n══════════════════════════════════");
  console.log("         SUMMARY");
  console.log("══════════════════════════════════");
  console.log(`New:      ${success}`);
  console.log(`Cached:   ${cached}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Total:    ${TOP_PRODUCTS.length}`);
  console.log(`Hit rate: ${Math.round(((success + cached) / TOP_PRODUCTS.length) * 100)}%`);
  console.log(`Credits:  ~${success * 2} used`);

  if (failures.length > 0) {
    console.log(`\nFailed products (${failures.length}):`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
}

prepopulate();
