/**
 * Save manually verified ingredient lists to the database.
 * These were looked up from manufacturer and retailer websites.
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function normKey(brand, name) {
  const full = `${brand || ""} ${name}`.toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return full;
}

async function save(name, brand, ingredientText) {
  const ingredients = ingredientText.split(",").map(i => i.trim()).filter(i => i.length > 0);
  const key = normKey(brand, name);
  const r = await fetch(`${SB_URL}/rest/v1/rpc/save_product_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({
      p_cache_key: key, p_product_name: name, p_brand: brand,
      p_ingredients: ingredients, p_ingredient_text: ingredientText,
      p_ingredient_count: ingredients.length, p_source: "web_verified",
    }),
  });
  return { ok: r.ok, count: ingredients.length };
}

const PRODUCTS = [
  // ── Batch 1: Incomplete dry kibble fixes ──
  {
    name: "Crave High Protein Chicken Grain Free Dog Food",
    brand: "Crave",
    ingredients: "Chicken, Chicken Meal, Split Peas, Lentils, Pork Meal, Chicken Fat (preserved with Mixed Tocopherols), Pea Starch, Dried Plain Beet Pulp, Flaxseed, Natural Flavor, Dehydrated Alfalfa Meal, Choline Chloride, Potassium Chloride, Citric Acid (preservative), Mixed Tocopherols (preservative), DL-Methionine, Salt, Vitamin E Supplement, Ferrous Sulfate, Zinc Oxide, Sodium Selenite, Ascorbic Acid (Vitamin C), D-Calcium Pantothenate, Manganese Sulfate, Copper Sulfate, Biotin, Thiamine Mononitrate (Vitamin B1), Vitamin B12 Supplement, Vitamin A Supplement, Niacin Supplement, Riboflavin Supplement (Vitamin B2), Pyridoxine Hydrochloride (Vitamin B6), Vitamin D3 Supplement, Manganous Oxide, Potassium Iodide, Folic Acid, Rosemary Extract"
  },
  {
    name: "Diamond Naturals Adult Chicken and Rice",
    brand: "Diamond Naturals",
    ingredients: "Chicken, Chicken Meal, Whole Grain Brown Rice, Cracked Pearled Barley, Chicken Fat (preserved with Mixed Tocopherols), Grain Sorghum, Dried Yeast, Dried Beet Pulp, Egg Product, Natural Flavor, Flaxseed, Salmon Oil (source of DHA), Potassium Chloride, Salt, DL-Methionine, Choline Chloride, Dried Chicory Root, Kale, Chia Seed, Pumpkin, Blueberries, Oranges, Quinoa, Dried Kelp, Coconut, Spinach, Carrots, Papaya, Yucca Schidigera Extract, Dried Lactobacillus Plantarum Fermentation Product, Dried Bacillus Subtilis Fermentation Product, Dried Lactobacillus Acidophilus Fermentation Product, Dried Enterococcus Faecium Fermentation Product, Dried Bifidobacterium Animalis Fermentation Product, Vitamin E Supplement, Beta Carotene, Iron Proteinate, Zinc Proteinate, Copper Proteinate, Ferrous Sulfate, Zinc Sulfate, Copper Sulfate, Potassium Iodide, Thiamine Mononitrate, Manganese Proteinate, Manganous Oxide, Ascorbic Acid, Vitamin A Supplement, Biotin, Niacin, Calcium Pantothenate, Manganese Sulfate, Sodium Selenite, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Riboflavin, Vitamin D Supplement, Folic Acid"
  },
  {
    name: "Iams ProActive Health Indoor Weight Hairball Care Cat Food",
    brand: "Iams",
    ingredients: "Chicken, Chicken By-Product Meal, Corn Grits, Corn Gluten Meal, Ground Whole Grain Sorghum, Ground Whole Grain Corn, Dried Beet Pulp, Turkey, Powdered Cellulose, Dried Peas, Natural Flavor, Salt, Brewers Dried Yeast, Dried Egg Product, Caramel Color, Sodium Bisulfate, Potassium Chloride, Choline Chloride, Fish Oil (preserved with Mixed Tocopherols), Carrots, Dried Apple Pomace, Calcium Carbonate, Fructooligosaccharides, Spinach, Tomato, Vitamin E Supplement, Niacin, Ascorbic Acid, Vitamin A Acetate, Calcium Pantothenate, Biotin, Thiamine Mononitrate, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Riboflavin Supplement, Inositol, Vitamin D3 Supplement, Folic Acid, Zinc Oxide, Manganese Sulfate, Copper Sulfate, Potassium Iodide, Taurine, L-Carnitine, Silicon Dioxide, Citric Acid, Mixed Tocopherols, Rosemary Extract"
  },
  {
    name: "Iams ProActive Health Kitten Chicken Cat Food",
    brand: "Iams",
    ingredients: "Chicken, Chicken By-Product Meal, Ground Whole Grain Corn, Ground Sorghum, Chicken Fat (preserved with Mixed Tocopherols), Corn Gluten Meal, Dried Plain Beet Pulp, Natural Flavor, Dried Egg Product, Potassium Chloride, Fish Oil (preserved with Mixed Tocopherols), Choline Chloride, Dried Brewers Yeast, Salt, Calcium Carbonate, DL-Methionine, Fructooligosaccharides, Vitamin E Supplement, Niacin, Ascorbic Acid, Vitamin A Acetate, Calcium Pantothenate, Biotin, Thiamine Mononitrate, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Riboflavin Supplement, Inositol, Vitamin D3 Supplement, Folic Acid, Taurine, Zinc Oxide, Manganese Sulfate, Copper Sulfate, Potassium Iodide, Rosemary Extract"
  },
  {
    name: "Nutro Ultra Adult Dry Dog Food",
    brand: "Nutro",
    ingredients: "Chicken, Chicken Meal, Whole Brown Rice, Brewers Rice, Rice Bran, Lamb Meal, Natural Flavor, Salmon Meal, Chicken Fat (preserved with Mixed Tocopherols), Sunflower Oil (preserved with Mixed Tocopherols), Whole Grain Oatmeal, Whole Flaxseed, Dried Plain Beet Pulp, Potassium Chloride, Choline Chloride, DL-Methionine, Salt, Mixed Tocopherols (preservative), Citric Acid (preservative), Whole Chia Seed, Dried Coconut, Dried Egg Product, Tomato Pomace, Dried Kale, Dried Pumpkin, Dried Spinach, Dried Blueberries, Dried Apples, Dried Carrots, Zinc Sulfate, Niacin Supplement, Biotin, Vitamin E Supplement, Iron Amino Acid Chelate, D-Calcium Pantothenate, Riboflavin Supplement (Vitamin B2), Selenium Yeast, Vitamin B12 Supplement, Copper Amino Acid Chelate, Pyridoxine Hydrochloride (Vitamin B6), Manganese Amino Acid Chelate, Vitamin A Supplement, Thiamine Mononitrate (Vitamin B1), Vitamin D3 Supplement, Folic Acid, Rosemary Extract"
  },
  {
    name: "Nutro Wholesome Essentials Large Breed Chicken Dog Food",
    brand: "Nutro",
    ingredients: "Chicken, Whole Grain Brown Rice, Whole Grain Sorghum, Brewers Rice, Chicken Meal (source of Glucosamine and Chondroitin Sulfate), Split Peas, Whole Grain Oatmeal, Chicken Fat (preserved with Mixed Tocopherols), Natural Flavor, Whole Flaxseed, Dried Plain Beet Pulp, Whole Grain Barley, Potassium Chloride, Choline Chloride, DL-Methionine, Salt, Citric Acid (preservative), Mixed Tocopherols (preservative), Chia Seed, Dried Coconut, Dried Tomato Pomace, Dried Egg Product, Dried Pumpkin, Dried Kale, Dried Spinach, Vitamin E Supplement, Ferrous Sulfate, Zinc Oxide, Sodium Selenite, Ascorbic Acid (Vitamin C), Manganese Sulfate, Copper Sulfate, D-Calcium Pantothenate, Biotin, Thiamine Mononitrate (Vitamin B1), Vitamin B12 Supplement, Vitamin A Supplement, Niacin Supplement, Riboflavin Supplement (Vitamin B2), Pyridoxine Hydrochloride (Vitamin B6), Vitamin D3 Supplement, Manganous Oxide, Potassium Iodide, Folic Acid, Rosemary Extract"
  },
  {
    name: "Purina ONE Tender Selects Chicken Cat Food",
    brand: "Purina ONE",
    ingredients: "Chicken, Rice Flour, Corn Gluten Meal, Chicken By-Product Meal (Source of Glucosamine), Beef Fat Naturally Preserved with Mixed-Tocopherols, Soybean Meal, Whole Grain Corn, Wheat Flour, Liver Flavor, Soy Protein Isolate, Soy Protein Concentrate, Glycerin, Phosphoric Acid, Calcium Carbonate, Salt, Potassium Chloride, Caramel Color, Dried Carrots, Dried Peas, Choline Chloride, Sodium Bisulfate, Vitamin E Supplement, Niacin (Vitamin B-3), Vitamin A Supplement, Calcium Pantothenate (Vitamin B-5), Thiamine Mononitrate (Vitamin B-1), Riboflavin Supplement (Vitamin B-2), Vitamin B-12 Supplement, Pyridoxine Hydrochloride (Vitamin B-6), Folic Acid (Vitamin B-9), Vitamin D-3 Supplement, Biotin (Vitamin B-7), Menadione Sodium Bisulfite Complex (Vitamin K), Taurine, Zinc Sulfate, Ferrous Sulfate, Manganese Sulfate, Copper Sulfate, Calcium Iodate, Sodium Selenite, L-Cysteine, L-Lysine Monohydrochloride, DL-Methionine"
  },
  {
    name: "Rachael Ray Nutrish Real Chicken and Veggies",
    brand: "Rachael Ray Nutrish",
    ingredients: "Chicken, Soybean Meal, Whole Corn, Whole Grain Wheat, Dried Peas, Grain Sorghum, Chicken Fat (Preserved with Mixed Tocopherols), Corn Protein Concentrate, Canola Meal, Carrots, Brown Rice, Dicalcium Phosphate, Calcium Carbonate, Salt, Fish Oil (Preserved with Mixed Tocopherols), Natural Flavor, Malted Barley Flour, Taurine, Vitamin E Supplement, L-Ascorbyl-2-Polyphosphate (source of Vitamin C), Niacin Supplement, Vitamin A Supplement, Thiamine Mononitrate, D-Calcium Pantothenate, Riboflavin Supplement, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Folic Acid, Biotin, Vitamin D3 Supplement, Choline Chloride, Ferrous Sulfate, Zinc Sulfate, Copper Sulfate, Sodium Selenite, Manganese Sulfate, Calcium Iodate, Lactic Acid, Mixed Tocopherols (Preservative), Carmine (Color), Citric Acid (Preservative), Rosemary Extract"
  },
  // ── Batch 2: Taste of the Wild, Temptations, Greenies, Natural Balance, Beneful ──
  {
    name: "Taste of the Wild Ancient Prairie Puppy Dog Food",
    brand: "Taste of the Wild",
    ingredients: "Water Buffalo, Pork, Chicken Meal, Grain Sorghum, Millet, Chicken Fat (preserved with mixed tocopherols), Cracked Pearled Barley, Dried Yeast, Roasted Bison, Roasted Venison, Natural Flavor, Flaxseed, Beef, Quinoa, Chia Seed, Dried Tomato Pomace, Salmon Oil (a source of DHA), Dicalcium Phosphate, Calcium Carbonate, Salt, Potassium Chloride, DL-Methionine, Choline Chloride, Taurine, Dried Chicory Root, Tomatoes, Blueberries, Raspberries, Yucca Schidigera Extract, L-Carnitine, Dried Lactobacillus Plantarum Fermentation Product, Dried Bacillus Subtilis Fermentation Product, Dried Lactobacillus Acidophilus Fermentation Product, Dried Enterococcus Faecium Fermentation Product, Dried Bifidobacterium Animalis Fermentation Product, Vitamin E Supplement, Iron Proteinate, Zinc Proteinate, Copper Proteinate, Ferrous Sulfate, Zinc Sulfate, Manganese Sulfate, Copper Sulfate, Potassium Iodide, Thiamine Mononitrate, Manganese Proteinate, Vitamin A Supplement, Biotin, Niacin, Calcium Pantothenate, Sodium Selenite, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Riboflavin, Vitamin D3 Supplement, Folic Acid"
  },
  {
    name: "Taste of the Wild Canyon River Trout Cat Food",
    brand: "Taste of the Wild",
    ingredients: "Trout, Ocean Fish Meal, Salmon Meal, Sweet Potatoes, Lentils, Peas, Canola Oil (preserved with mixed tocopherols), Smoke-Flavored Salmon, Natural Flavor, DL-Methionine, Potassium Chloride, Salt, Choline Chloride, Taurine, Dried Chicory Root, Tomatoes, Blueberries, Raspberries, Yucca Schidigera Extract, Dried Lactobacillus Plantarum Fermentation Product, Dried Bacillus Subtilis Fermentation Product, Dried Lactobacillus Acidophilus Fermentation Product, Dried Enterococcus Faecium Fermentation Product, Dried Bifidobacterium Animalis Fermentation Product, Zinc Proteinate, Vitamin E Supplement, Niacin, Manganese Proteinate, Copper Proteinate, Zinc Sulfate, Manganese Sulfate, Copper Sulfate, Thiamine Mononitrate, Vitamin A Supplement, Biotin, Potassium Iodide, Calcium Pantothenate, Riboflavin, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Sodium Selenite, Vitamin D3 Supplement, Folic Acid"
  },
  {
    name: "Taste of the Wild Rocky Mountain Venison Cat Food",
    brand: "Taste of the Wild",
    ingredients: "Chicken Meal, Peas, Sweet Potatoes, Chicken Fat (preserved with mixed tocopherols), Pea Protein, Potato Protein, Roasted Venison, Smoked Salmon, Natural Flavor, Ocean Fish Meal, DL-Methionine, Potassium Chloride, Taurine, Choline Chloride, Dried Chicory Root, Tomatoes, Blueberries, Raspberries, Yucca Schidigera Extract, Dried Lactobacillus Plantarum Fermentation Product, Dried Bacillus Subtilis Fermentation Product, Dried Lactobacillus Acidophilus Fermentation Product, Dried Enterococcus Faecium Fermentation Product, Dried Bifidobacterium Animalis Fermentation Product, Zinc Proteinate, Vitamin E Supplement, Niacin, Manganese Proteinate, Copper Proteinate, Zinc Sulfate, Manganese Sulfate, Copper Sulfate, Thiamine Mononitrate, Vitamin A Supplement, Biotin, Potassium Iodide, Calcium Pantothenate, Riboflavin, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Manganous Oxide, Sodium Selenite, Vitamin D Supplement, Folic Acid"
  },
  {
    name: "Temptations Classic Tasty Chicken Cat Treats",
    brand: "Temptations",
    ingredients: "Chicken By-Product Meal, Ground Corn, Animal Fat (preserved with Mixed Tocopherols), Rice, Dried Meat By-Products, Wheat Flour, Natural Flavors, Corn Gluten Meal, Potassium Chloride, Choline Chloride, Salt, Calcium Carbonate, Taurine, DL-Methionine, dl-Alpha Tocopherol Acetate (Source of Vitamin E), Vitamin A Acetate, Niacin Supplement, Vitamin B12 Supplement, Riboflavin Supplement, Thiamine Mononitrate, d-Calcium Pantothenate, Vitamin D3 Supplement, Biotin Supplement, Pyridoxine Hydrochloride (Vitamin B6), Folic Acid Supplement, Zinc Sulfate, Copper Sulfate, Manganese Sulfate, Potassium Iodide, Dried Cheese"
  },
  {
    name: "Temptations Classic Seafood Medley Cat Treats",
    brand: "Temptations",
    ingredients: "Chicken By-Product Meal, Ground Corn, Animal Fat (preserved with Mixed Tocopherols), Rice, Dried Meat By-Products, Wheat Flour, Natural Flavors, Corn Gluten Meal, Potassium Chloride, Choline Chloride, Salt, Salmon Meal, Calcium Carbonate, DL-Methionine, Taurine, dl-Alpha Tocopherol Acetate (Source of Vitamin E), Vitamin A Acetate, Niacin Supplement, Vitamin B12 Supplement, Riboflavin Supplement, Thiamine Mononitrate, d-Calcium Pantothenate, Vitamin D3 Supplement, Biotin Supplement, Pyridoxine Hydrochloride (Vitamin B6), Folic Acid Supplement, Zinc Sulfate, Copper Sulfate, Manganese Sulfate, Potassium Iodide, Iron Oxide, Dried Cheese, Shrimp Meal"
  },
  {
    name: "Greenies Original Large Dog Dental Treats",
    brand: "Greenies",
    ingredients: "Wheat Flour, Glycerin, Wheat Gluten, Gelatin, Water, Powdered Cellulose, Lecithin, Natural Poultry Flavor, Dicalcium Phosphate, Calcium Carbonate, Potassium Chloride, Choline Chloride, Magnesium Amino Acid Chelate, Zinc Amino Acid Chelate, Iron Amino Acid Chelate, Copper Amino Acid Chelate, Manganese Amino Acid Chelate, Sodium Selenite, Potassium Iodide, Fruit Juice Color, Vitamin E Supplement, Vitamin B12 Supplement, d-Calcium Pantothenate, Niacin Supplement, Riboflavin Supplement, Vitamin A Supplement, Vitamin D3 Supplement, Biotin, Thiamine Mononitrate, Pyridoxine Hydrochloride, Folic Acid, Turmeric Color"
  },
  {
    name: "Natural Balance Limited Ingredient Chicken Sweet Potato",
    brand: "Natural Balance",
    ingredients: "Chicken, Chicken Meal, Sweet Potatoes, Cassava Flour, Potatoes, Chicken Fat (preserved with Mixed Tocopherols), Brewers Dried Yeast, Flaxseed, Natural Flavor, Potato Protein, Menhaden Fish Oil (preserved with Mixed Tocopherols), Salt, Potassium Chloride, Taurine, DL-Methionine, Choline Chloride, Vitamin E Supplement, Ascorbic Acid, Niacin, Vitamin A Supplement, Thiamine Mononitrate, d-Calcium Pantothenate, Riboflavin Supplement, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Folic Acid, Biotin, Vitamin D3 Supplement, Zinc Proteinate, Zinc Sulfate, Ferrous Sulfate, Iron Proteinate, Copper Sulfate, Copper Proteinate, Manganese Sulfate, Manganese Proteinate, Sodium Selenite, Calcium Iodate, Dicalcium Phosphate, Citric Acid (preservative), Rosemary Extract"
  },
  {
    name: "Beneful Healthy Weight Chicken",
    brand: "Beneful",
    ingredients: "Chicken, Whole Grain Corn, Chicken By-Product Meal, Barley, Whole Grain Wheat, Soybean Meal, Soybean Hulls, Rice, Corn Protein Meal, Egg and Chicken Flavor, Oat Meal, Beef Fat (preserved with Mixed Tocopherols), Natural Flavor, Calcium Carbonate, Mono and Dicalcium Phosphate, Glycerin, Dried Apples, Dried Carrots, Dried Green Beans, Salt, Annatto Color, Vegetable Juice Color, Choline Chloride, DL-Methionine, Potassium Chloride, Zinc Sulfate, Ferrous Sulfate, Manganese Sulfate, Copper Sulfate, Calcium Iodate, Sodium Selenite, Vitamin E Supplement, Niacin, Vitamin A Supplement, Calcium Pantothenate, Thiamine Mononitrate, Pyridoxine Hydrochloride, Riboflavin Supplement, Vitamin B12 Supplement, Folic Acid, Menadione Sodium Bisulfite Complex (Vitamin K), Biotin, Vitamin D3 Supplement, Carmine"
  },
  // ── Batch 3: Fancy Feast, JFFD, Wag, Pro Plan variants, Meow Mix, Purina ONE ──
  {
    name: "Fancy Feast Gems Mousse Pate Chicken",
    brand: "Fancy Feast",
    ingredients: "Chicken Broth, Chicken, Liver, Meat By-Product, Tapioca Starch-Modified, Glycine, Sodium Tripolyphosphate, Natural Flavors, Potassium Chloride, Magnesium Sulfate, Zinc Sulfate, Iron Sulfate, Manganese Sulfate, Copper Sulfate, Calcium Iodate, Locust Bean Gum, Guar Gum, Caramel Color, Carrageenan, Taurine, Methyl Cellulose, L-Ascorbic Acid, Vitamin E Supplement, Niacin (Vitamin B-3), Thiamine Mononitrate (Vitamin B-1), Calcium Pantothenate (Vitamin B-5), Riboflavin Supplement (Vitamin B-2), Pyridoxine Hydrochloride (Vitamin B-6), Folic Acid (Vitamin B-9), Vitamin A Supplement, Menadione Sodium Bisulfite Complex (Vitamin K), Biotin (Vitamin B-7), Vitamin B-12 Supplement, Vitamin D-3 Supplement, Choline Chloride"
  },
  {
    name: "Fancy Feast Gravy Lovers Chicken Feast",
    brand: "Fancy Feast",
    ingredients: "Chicken Broth, Chicken, Wheat Gluten, Meat By-Products, Liver, Fish, Corn Starch-Modified, Soy Flour, Glycine, Salt, Natural Flavor, Tricalcium Phosphate, Potassium Chloride, Zinc Sulfate, Ferrous Sulfate, Manganese Sulfate, Copper Sulfate, Potassium Iodide, Taurine, Choline Chloride, Thiamine Mononitrate (Vitamin B-1), Vitamin E Supplement, Niacin (Vitamin B-3), Calcium Pantothenate (Vitamin B-5), Vitamin A Supplement, Menadione Sodium Bisulfite Complex (Vitamin K), Pyridoxine Hydrochloride (Vitamin B-6), Riboflavin Supplement (Vitamin B-2), Vitamin B-12 Supplement, Biotin (Vitamin B-7), Folic Acid (Vitamin B-9), Vitamin D-3 Supplement"
  },
  {
    name: "Just Food For Dogs Chicken and White Rice",
    brand: "Just Food For Dogs",
    ingredients: "Chicken Thighs, Long-Grain White Rice, Long-Grain Brown Rice, Chicken Liver, Kale, Carrots, Apples, Sunflower Oil, Flaxseed Oil, Omega Marine Microalgae Oil, Dicalcium Phosphate, Calcium Carbonate, Salt, Choline Bitartrate, Potassium Iodide, Zinc Amino Acid Chelate, Magnesium Amino Acid Chelate, Vitamin E Supplement, Ferrous Amino Acid Chelate, Copper Amino Acid Chelate, Cholecalciferol (source of Vitamin D3), d-Calcium Pantothenate, Riboflavin, Vitamin B12 Supplement"
  },
  {
    name: "Wag Dry Dog Food Salmon Sweet Potato",
    brand: "Wag",
    ingredients: "Salmon, Chicken Meal, Sweet Potatoes, Peas, Dried Yeast, Chicken Fat (Preserved with Mixed Tocopherols), Fish Meal, Dried Plain Beet Pulp, Natural Flavor, Salmon Oil, Flaxseed, Salt, DL-Methionine, Potassium Chloride, Choline Chloride, Taurine, Dried Chicory Root, Yucca Schidigera Extract, Dried Lactobacillus Plantarum Fermentation Product, Dried Enterococcus Faecium Fermentation Product, Dried Lactobacillus Acidophilus Fermentation Product, Dried Bacillus Subtilis Fermentation Product, Dried Bifidobacterium Animalis Fermentation Product, Vitamin E Supplement, Iron Proteinate, Zinc Proteinate, Copper Proteinate, Ferrous Sulfate, Zinc Sulfate, Copper Sulfate, Potassium Iodide, Thiamine Mononitrate (Source of Vitamin B1), Manganese Proteinate, Manganous Oxide, Ascorbic Acid (Preservative), Vitamin A Supplement, Biotin, Niacin, Calcium Pantothenate, Manganese Sulfate, Sodium Selenite, Pyridoxine Hydrochloride (Source of Vitamin B6), Vitamin B12 Supplement, Riboflavin (Vitamin B2), Vitamin D3 Supplement, Folic Acid"
  },
  {
    name: "Purina Pro Plan Small Breed Adult Chicken Rice",
    brand: "Purina Pro Plan",
    ingredients: "Chicken, Rice, Poultry By-Product Meal, Beef Fat Preserved with Mixed-Tocopherols, Corn Protein Meal, Soybean Meal, Whole Grain Corn, Whole Grain Wheat, Corn Germ Meal, Dried Egg Product, Natural Flavor, Dried Yeast, Glycerin, Calcium Carbonate, Wheat Bran, Fish Meal, Salt, Mono and Dicalcium Phosphate, Potassium Chloride, Zinc Proteinate, Manganese Proteinate, Ferrous Sulfate, Copper Proteinate, Calcium Iodate, Sodium Selenite, Vitamin E Supplement, Niacin (Vitamin B-3), Vitamin A Supplement, Calcium Pantothenate (Vitamin B-5), Thiamine Mononitrate (Vitamin B-1), Vitamin B-12 Supplement, Riboflavin Supplement (Vitamin B-2), Pyridoxine Hydrochloride (Vitamin B-6), Folic Acid (Vitamin B-9), Vitamin D-3 Supplement, Menadione Sodium Bisulfite Complex (Vitamin K), Biotin (Vitamin B-7), Choline Chloride, L-Lysine Monohydrochloride, L-Ascorbyl-2-Polyphosphate (Vitamin C), Dried Bacillus Coagulans Fermentation Product, Garlic Oil"
  },
  {
    name: "Purina Pro Plan Weight Management Chicken Rice",
    brand: "Purina Pro Plan",
    ingredients: "Chicken, Rice, Whole Grain Corn, Poultry By-Product Meal, Corn Germ Meal, Soybean Meal, Whole Grain Wheat, Corn Protein Meal, Wheat Flour, Beef Fat Preserved with Mixed-Tocopherols, Fish Meal, Natural Flavor, Glycerin, Calcium Carbonate, Wheat Bran, Soybean Oil, Salt, Mono and Dicalcium Phosphate, Potassium Chloride, Zinc Proteinate, Ferrous Sulfate, Manganese Proteinate, Copper Proteinate, Calcium Iodate, Sodium Selenite, Vitamin E Supplement, Niacin (Vitamin B-3), Vitamin A Supplement, Calcium Pantothenate (Vitamin B-5), Thiamine Mononitrate (Vitamin B-1), Vitamin B-12 Supplement, Riboflavin Supplement (Vitamin B-2), Pyridoxine Hydrochloride (Vitamin B-6), Folic Acid (Vitamin B-9), Vitamin D-3 Supplement, Menadione Sodium Bisulfite Complex (Vitamin K), Biotin (Vitamin B-7), Choline Chloride, DL-Methionine, L-Lysine Monohydrochloride, L-Ascorbyl-2-Polyphosphate (Vitamin C), Dried Bacillus Coagulans Fermentation Product, Garlic Oil"
  },
  {
    name: "Meow Mix Indoor Health Dry Cat Food",
    brand: "Meow Mix",
    ingredients: "Ground Corn, Chicken By-Product Meal, Soybean Meal, Corn Protein Meal, Beef Tallow (Mixed Tocopherols Used As A Preservative), Ground Soybean Hulls, Brewers Rice, Natural Flavor, Turkey By-Product Meal, Salmon Meal, Ocean Fish Meal (Ethoxyquin Used As A Preservative), Phosphoric Acid, Calcium Carbonate, Dehydrated Alfalfa Meal, Choline Chloride, Salt, Grain Distillers Dried Yeast, Vitamin E Supplement, Niacin Supplement, Vitamin A Supplement, Thiamine Mononitrate, Pyridoxine Hydrochloride, D-Calcium Pantothenate, Riboflavin Supplement, Vitamin B12 Supplement, Folic Acid, Biotin, Vitamin D3 Supplement, Taurine, DL-Methionine, Ferrous Sulfate, Zinc Oxide, Manganous Oxide, Copper Sulfate, Sodium Selenite, Calcium Iodate, Lactic Acid, Yellow 6, Red 40, Yellow 5, Blue 2, Rosemary Extract"
  },
  {
    name: "Purina ONE Healthy Kitten Formula Cat Food",
    brand: "Purina ONE",
    ingredients: "Chicken, Liver, Chicken Broth, Pork Lungs, Salmon, Natural Flavors, Potassium Chloride, Magnesium Sulfate, Mono and Dicalcium Phosphate, Zinc Sulfate, Ferrous Sulfate, Copper Sulfate, Manganese Sulfate, Potassium Iodide, Guar Gum, Taurine, Vitamin E Supplement, Thiamine Mononitrate (Vitamin B-1), Niacin (Vitamin B-3), Calcium Pantothenate (Vitamin B-5), Vitamin A Supplement, Menadione Sodium Bisulfite Complex (Vitamin K), Pyridoxine Hydrochloride (Vitamin B-6), Riboflavin Supplement (Vitamin B-2), Vitamin B-12 Supplement, Biotin (Vitamin B-7), Folic Acid (Vitamin B-9), Vitamin D-3 Supplement, Salt, Choline Chloride"
  },
  {
    name: "Delectables Squeeze Up Chicken Cat Treats",
    brand: "Delectables",
    ingredients: "Water, Tuna, Chicken, Tapioca Starch, Natural Flavor, Guar Gum, Natural Tuna Flavor"
  },
];

async function main() {
  console.log(`\n=== SAVING ${PRODUCTS.length} VERIFIED PRODUCTS ===\n`);

  let ok = 0, fail = 0;

  for (const p of PRODUCTS) {
    const result = await save(p.name, p.brand, p.ingredients);
    const status = result.ok ? "✓" : "✗";
    console.log(`${status} ${p.name.substring(0, 55).padEnd(55)} ${result.count} ingredients`);
    if (result.ok) ok++; else fail++;
  }

  console.log(`\n=== DONE: ${ok} saved, ${fail} failed ===`);
}

main().catch(console.error);
