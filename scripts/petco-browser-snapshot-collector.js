/*
 * Petco rendered snapshot collector.
 *
 * Usage:
 * 1. Open a Petco product page in a normal browser.
 * 2. Open DevTools Console.
 * 3. Paste this file's contents and press Enter.
 * 4. Save the copied JSON into a .json file.
 * 5. Run:
 *    npm run catalog:petco-snapshot-import-batch -- --snapshot <file.json>
 */
(() => {
  const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const html = document.documentElement?.outerHTML || "";
  const text = document.body?.innerText || "";
  const imageMatch = html.match(/https?:\/\/assets\.petco\.com\/petco\/image\/upload\/[^\s"'<>\\)]+/i)
    || html.match(/\/\/assets\.petco\.com\/petco\/image\/upload\/[^\s"'<>\\)]+/i);
  const imageUrl = imageMatch?.[0]?.startsWith("//") ? `https:${imageMatch[0]}` : imageMatch?.[0] || "";
  const snapshot = {
    source_url: window.location.href,
    product_image_url: compact(imageUrl),
    html,
    text,
  };
  const json = JSON.stringify(snapshot, null, 2);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).then(() => {
      console.log("Woof Petco snapshot copied to clipboard.");
    }).catch(() => {
      console.log(json);
    });
  } else {
    console.log(json);
  }
})();
