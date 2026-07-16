/*
 * Petco rendered batch snapshot collector.
 *
 * Usage:
 * 1. Open a Petco brand/search/category page or product page in Chrome.
 * 2. Open DevTools Console.
 * 3. Optional: set window.WOOF_PETCO_MAX_LINKS = 20 before pasting.
 * 4. Optional: set window.WOOF_PETCO_RENDER_WAIT_MS = 1800 for slower pages.
 * 5. Paste this file's contents and press Enter.
 * 6. Save the copied JSON array into a .json file.
 * 7. Run:
 *    npm run catalog:petco-snapshot-import-batch -- --snapshot <file.json>
 */
(() => {
  const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const normalizeUrl = (value) => {
    try {
      const url = new URL(value, window.location.href);
      url.hash = "";
      return url.toString();
    } catch {
      return "";
    }
  };
  const isProductUrl = (value) => {
    try {
      const url = new URL(value);
      return url.hostname === "www.petco.com" && /^\/product\//i.test(url.pathname);
    } catch {
      return false;
    }
  };
  const assetImageFrom = (html) => {
    const match = String(html || "").match(/https?:\/\/assets\.petco\.com\/petco\/image\/upload\/[^\s"'<>\\)]+/i)
      || String(html || "").match(/\/\/assets\.petco\.com\/petco\/image\/upload\/[^\s"'<>\\)]+/i);
    if (!match?.[0]) return "";
    return compact(match[0].startsWith("//") ? `https:${match[0]}` : match[0]);
  };
  const visibleTextFrom = (doc) => compact(doc?.body?.innerText || "");
  const snapshotFromDocument = (sourceUrl, doc, html) => ({
    source_url: sourceUrl,
    product_image_url: assetImageFrom(html),
    html,
    text: visibleTextFrom(doc),
  });
  const assertUsableSnapshot = (snapshot) => {
    if (!snapshot.text || snapshot.text.length < 1000) {
      throw new Error("Rendered Petco product page did not expose usable product text.");
    }
    if (!/ingredients?\s*&?\s*analysis|ingredients/i.test(snapshot.text)) {
      throw new Error("Rendered Petco product page is missing ingredient text.");
    }
    return snapshot;
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const numericSetting = (key, fallback) => {
    const value = Number(window[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const renderWaitMs = () => numericSetting("WOOF_PETCO_RENDER_WAIT_MS", 1800);
  const tabWaitMs = () => numericSetting("WOOF_PETCO_TAB_WAIT_MS", 1000);
  const currentPageSnapshot = () => snapshotFromDocument(
    window.location.href,
    document,
    document.documentElement?.outerHTML || ""
  );
  const productLinks = () => {
    const links = [...document.querySelectorAll("a[href]")]
      .map((link) => normalizeUrl(link.getAttribute("href")))
      .filter(isProductUrl);
    return [...new Set(links)];
  };
  const tabText = (element) => compact(element?.textContent || "").toUpperCase();
  const findIngredientsTab = (doc) => {
    const candidates = [
      ...doc.querySelectorAll('[role="tab"], button, [aria-controls], a[href]'),
    ];
    return candidates.find((element) => tabText(element) === "INGREDIENTS & ANALYSIS")
      || candidates.find((element) => tabText(element).includes("INGREDIENTS & ANALYSIS"))
      || candidates.find((element) => tabText(element) === "INGREDIENTS");
  };
  const clickIngredientsTab = async (doc) => {
    const tab = findIngredientsTab(doc);
    if (!tab) return false;
    tab.scrollIntoView?.({ block: "center", inline: "center" });
    if (typeof tab.click === "function") {
      tab.click();
    } else {
      tab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: doc.defaultView || window }));
    }
    await wait(tabWaitMs());
    return true;
  };
  const waitForProductWindow = async (popup, url) => {
    const timeoutMs = numericSetting("WOOF_PETCO_POPUP_TIMEOUT_MS", 20000);
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (!popup || popup.closed) {
        throw new Error(`Product snapshot window closed before loading ${url}`);
      }

      try {
        const doc = popup.document;
        const bodyText = visibleTextFrom(doc);
        if (doc?.readyState === "complete" && bodyText.length > 500) {
          return doc;
        }
      } catch {
        // Keep waiting while the popup navigates.
      }

      await wait(250);
    }

    throw new Error(`Timed out waiting for rendered Petco product page: ${url}`);
  };
  const productSnapshot = async (url) => {
    if (normalizeUrl(window.location.href) === url) {
      await clickIngredientsTab(document);
      return assertUsableSnapshot(currentPageSnapshot());
    }

    const popup = window.open(url, "woofPetcoSnapshotCollector", "popup,width=1200,height=900");
    if (!popup) {
      throw new Error("Popup was blocked. Allow popups for petco.com and run the collector again.");
    }

    const doc = await waitForProductWindow(popup, url);
    await wait(renderWaitMs());
    await clickIngredientsTab(doc);
    await wait(tabWaitMs());

    return assertUsableSnapshot(snapshotFromDocument(
      normalizeUrl(popup.location.href || url),
      doc,
      doc.documentElement?.outerHTML || ""
    ));
  };
  const collect = async () => {
    const maxLinks = Number.isFinite(Number(window.WOOF_PETCO_MAX_LINKS))
      ? Math.max(1, Math.floor(Number(window.WOOF_PETCO_MAX_LINKS)))
      : 25;
    const urls = isProductUrl(window.location.href)
      ? [normalizeUrl(window.location.href)]
      : productLinks().slice(0, maxLinks);

    if (urls.length === 0) {
      throw new Error("No Petco product links found on this page.");
    }

    const snapshots = [];

    for (const [index, url] of urls.entries()) {
      console.log(`Woof Petco snapshot ${index + 1}/${urls.length}: ${url}`);
      try {
        snapshots.push(await productSnapshot(url));
      } catch (error) {
        console.warn(`Skipped ${url}: ${error.message || error}`);
        continue;
      }
    }

    if (snapshots.length === 0) {
      throw new Error("No usable Petco product snapshots were collected.");
    }

    const json = JSON.stringify(snapshots, null, 2);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      console.log(`Woof Petco batch copied to clipboard: ${snapshots.length} snapshot(s).`);
    } else {
      console.log(json);
    }
  };

  collect().catch((error) => {
    console.error(error);
  });
})();
