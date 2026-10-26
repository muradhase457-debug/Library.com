// RFL Catalog updater v4 — Node 18+ (kono extra dependency lagbe na)
// v3-er cheye ja notun:
//  1. CHOBI AR GITHUB-E JABE NA. v3 prottek notun product-er chobi images/-e
//     download korto — tai repo-te 1371 ta chobi jomechilo, ar GitHub-er
//     folder view 1000 tar beshi dekhay na (baki gulo "omitted" bole lukay
//     rakhe — file gulo thik-i thake, kintu dekhte/bujhte osubidha hoy).
//     v4-e chobi download/compress/upload — kichui hobe na. Notun product-er
//     products.json-e sudhu RFL-er server-er chobi-r link (remote_image)
//     thakbe, ar site local chobi na pele nijei oi link-er chobi dekhay
//     (hero + card duto jaygatei local-na-pele-remote fallback ache).
//     Tai repo-te sudhu products.json (lekha) barbe, chobi-r limit-er
//     proshnoi thakbe na, ar sync-o onek taratari hobe. Purono product-er
//     local chobi jemon chilo temon-i thakbe, segulo bodlano hobe na.
//  2. FULL SWEEP: v3-er pagination (sob page, ?page=2..60) + leaf/group/
//     category page walk to achhei, tar upor homepage-er menu thekeo sob
//     item_listing/<slug> ber kore alada kore ghora hoy — jate categories.json-er
//     baire kono leaf thakleo bad na jay. Prothom assignment-i thake.
//  3. PLASTIC AGE: crawl ar final sort — dutoi plastic-besi category age
//     rakhe: Household, Furniture, Toys, Pet Items, New arrivals, tarpor
//     Industrial, Cookware. RFL site-e material-er alada field nei, tai
//     "plastic" alada kore chena jay na — kintu ei category gulotei pray
//     sob plastic ponno thake, ar full sweep-e baki gulo-o chole asbe.
//  4. Purono surakha eki: rack/stock_note kokhono muchbe na, site na pele
//     ba notun kichu na pele purono file bodlay NA, dam/biboron banano hoy NA.
//
// Cholano:  node scripts/scrape-rfl.mjs
//           node scripts/scrape-rfl.mjs --dry
//           node scripts/scrape-rfl.mjs --max-leaves 10 --max-new 20  (choto test)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://rflhouseware.com/";
const DRY = process.argv.includes("--dry");
const UA = "Mozilla/5.0 (RFL-Catalog-Updater; +https://rflhouseware.com/)";
const argVal = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? Number(process.argv[i + 1]) : 0; };
const MAX_LEAVES = argVal("--max-leaves") || Infinity;
const MAX_NEW = argVal("--max-new") || Infinity;
const MAX_PAGES = 60; // ekta listing-e 60 page-er beshi howar kotha na (12 kore = 720 product)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

const CAT_PRIO = { Household: 0, Furniture: 1, Toys: 2, "Pet Items": 3, "New arrivals": 4, Industrial: 5, Cookware: 6 };
function pretty(s) { return String(s).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function discoverListings(html) {
  const out = [];
  const seen = new Set();
  const re = /item_listing\/([a-z0-9\-]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) { if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); } }
  return out;
}

function discover(html) {
  const out = new Map();
  const re = /product_details\/([a-z0-9\-]+)_(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = Number(m[2]);
    if (!out.has(id)) out.set(id, { id, slug: m[1] });
  }
  return [...out.values()];
}

// categories.json duto rup-ei thakte pare: flat "leaves" array (slug soho),
// ba nested categories/groups/leaves (string). Duto thekei eki list banano hoy.
function flattenCats(cats) {
  const leaves = [];
  const groups = new Map();
  const categories = [];
  if (Array.isArray(cats.leaves) && cats.leaves.length) {
    for (const l of cats.leaves) leaves.push({ leaf: l.leaf, slug: l.slug || slug(l.leaf), group: l.group, category: l.category });
    for (const l of leaves) if (!groups.has(slug(l.group))) groups.set(slug(l.group), { group: l.group, slug: slug(l.group), category: l.category });
    for (const l of leaves) if (!categories.includes(l.category)) categories.push(l.category);
    return { leaves, groups: [...groups.values()], categories };
  }
  for (const c of (cats.categories || [])) {
    const catName = c.category || c.name;
    if (catName && !categories.includes(catName)) categories.push(catName);
    for (const g of (c.groups || [])) {
      const gName = g.group || g.name;
      if (gName && !groups.has(slug(gName))) groups.set(slug(gName), { group: gName, slug: slug(gName), category: catName });
      for (const leafName of (g.leaves || [])) {
        leaves.push({ leaf: leafName, slug: slug(leafName), group: gName, category: catName });
      }
    }
  }
  return { leaves, groups: [...groups.values()], categories };
}

// Ekta listing (leaf/group/category) -er sob page ghure product jog kore.
// Prothom assignment-i thake (leaf age, pore group, sob sheshe category),
// tai leaf-er thik nam kokhono group/category nam diye bodle jabe na.
async function walkListing(listingSlug, assign, found) {
  let pages = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = BASE + "item_listing/" + listingSlug + (page > 1 ? "?page=" + page : "");
    let html;
    try { html = await fetchText(url); } catch { break; }
    const ds = discover(html);
    if (!ds.length) break;
    let added = 0;
    for (const d of ds) {
      if (!found.has(d.id)) { found.set(d.id, { ...d, ...assign }); added++; }
    }
    pages++;
    if (!added) break; // ei page-e notun kichu nei: hoy shesh, noy site ?page ignore koreche
    await sleep(250);
  }
  return pages;
}

function cleanTitle(page) {
  const h1 = page.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  let t = (h1 ? h1[1] : (page.match(/<title>([^<]+)<\/title>/i) || [])[1] || "");
  return t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    .replace(/\s*\|\s*RFL.*$/i, "").replace(/\s*-\s*RFL.*$/i, "");
}

function imagesFromPage(page) {
  const seen = new Set();
  const list = [];
  const re = /uploads\/([A-Za-z0-9_\-]+\.(?:png|jpe?g|webp))/gi;
  let m;
  while ((m = re.exec(page)) !== null) {
    const f = m[1];
    if (/logo|icon|banner|outlet|pattern/i.test(f)) continue;
    if (!seen.has(f)) { seen.add(f); list.push(f); }
  }
  // Mul chobi age, additional chobi pore — 2 tar beshi lagbe na.
  list.sort((a, b) => (a.startsWith("additional_image_") ? 1 : 0) - (b.startsWith("additional_image_") ? 1 : 0));
  return list.slice(0, 2);
}

function sizeFromPage(page) {
  const text = page.replace(/<[^>]+>/g, " ");
  const m = text.match(/L[-\s]*(\d+(?:\.\d+)?)\s*X\s*W[-\s]*(\d+(?:\.\d+)?)\s*X\s*H[-\s]*(\d+(?:\.\d+)?)\s*cm/i);
  return m ? "L-" + m[1] + " X W-" + m[2] + " X H-" + m[3] + " cm" : "";
}

async function main() {
  const jsonPath = path.join(ROOT, "products.json");
  const catPath = path.join(ROOT, "categories.json");
  if (!fs.existsSync(jsonPath)) { console.log("products.json pai ni — kichu bodlano holo na."); return; }
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const byId = new Map(data.products.map((p) => [Number(p.id), p]));
  const cats = fs.existsSync(catPath) ? JSON.parse(fs.readFileSync(catPath, "utf8")) : { leaves: [] };
  const { leaves, groups, categories } = flattenCats(cats);
  const leafList = leaves.slice(0, MAX_LEAVES).sort((a, b) => (CAT_PRIO[a.category] ?? 9) - (CAT_PRIO[b.category] ?? 9));
  console.log("Leaf:", leafList.length, "| Group:", groups.length, "| Category:", categories.length);

  const found = new Map(); // id -> {id, slug, leaf, group, category}
  // 1) Homepage — notun arrival-er jonno + menu theke listing slug ber kora
  let menuListings = [];
  try {
    const home = await fetchText(BASE);
    for (const d of discover(home)) found.set(d.id, { ...d, leaf: "New arrivals", group: "Latest additions", category: "New arrivals" });
    menuListings = discoverListings(home);
    console.log("Homepage theke pelam:", found.size, "| menu listing:", menuListings.length);
  } catch (e) { console.log("Homepage khola jayni:", e.message); }

  // 2) Prottek leaf-er sob page (pagination)
  let leafPages = 0;
  for (const leaf of leafList) {
    leafPages += await walkListing(leaf.slug, { leaf: leaf.leaf, group: leaf.group, category: leaf.category }, found);
    await sleep(100);
  }
  console.log("Leaf page theke mot candidate:", found.size, "| page ghora holo:", leafPages);

  // 2.5) Homepage menu theke pawa listing (categories.json-e na thakleo)
  const walkedSlugs = new Set(leafList.map((l) => l.slug));
  for (const mslug of menuListings) {
    if (walkedSlugs.has(mslug)) continue;
    walkedSlugs.add(mslug);
    await walkListing(mslug, { leaf: pretty(mslug), group: "RFL site menu", category: "RFL site menu" }, found);
    await sleep(100);
  }
  console.log("Menu listing-er por mot candidate:", found.size);

  // 3) Group page-er sob page (leaf-e na pawa product-er jonno)
  for (const g of groups) {
    await walkListing(g.slug, { leaf: g.group, group: g.group, category: g.category }, found);
    await sleep(100);
  }
  console.log("Group page-er por mot candidate:", found.size);

  // 4) Category page-er sob page (Pet Items-er moto leaf-slug na mela product-er jonno)
  for (const catName of categories) {
    await walkListing(slug(catName), { leaf: catName, group: catName, category: catName }, found);
    await sleep(100);
  }
  console.log("Category page-er por mot candidate:", found.size);

  const fresh = [...found.values()].filter((d) => !byId.has(d.id)).slice(0, MAX_NEW);
  console.log("Age chilo:", byId.size, "| Notun:", fresh.length);
  if (!fresh.length) { console.log("Notun kichu nei — file bodlano holo na."); return; }

  let added = 0;
  for (const d of fresh) {
    try {
      const page = await fetchText(BASE + "product_details/" + d.slug + "_" + d.id);
      const name = cleanTitle(page) || d.slug.replace(/-/g, " ");
      const files = imagesFromPage(page);
      // v4: chobi download hoy NA — sudhu RFL-er link thakbe (site nijei dekhay).
      const remoteImgs = files.map((f) => BASE + "uploads/" + f);
      const cap = (name.match(/(\d+(?:\.\d+)?)\s?L\b/) || [])[1];
      const variant = name.includes(" - ") ? name.split(" - ")[1] : "";
      data.products.push({
        id: d.id, name, code: String(d.id),
        category: d.category, group: d.group, leaf: d.leaf,
        image: "", remote_image: remoteImgs[0] || "",
        images: [], remote_images: remoteImgs,
        url: BASE + "product_details/" + d.slug + "_" + d.id,
        capacity: cap ? cap + " L" : "", variant,
        size: sizeFromPage(page), price: "",
        rack: "", stock_note: "",
        description: "",
      });
      added++;
      await sleep(400);
    } catch (e) { console.log("  details khola jayni (" + d.id + "):", e.message); }
  }

  if (!added) { console.log("Notun product-er details paoa jayni — purono file-i thaklo."); return; }
  data.products.sort((a, b) => ((CAT_PRIO[a.category] ?? 9) - (CAT_PRIO[b.category] ?? 9)) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  data.version = "4.0.0";
  data.updated = new Date().toISOString().slice(0, 10);
  if (DRY) { console.log("[DRY] Jog hoto:", added, "ta"); return; }
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
  console.log("products.json update holo. Mot:", data.products.length, "| Notun:", added);
}

main().catch((e) => { console.log("Updater thamlo, purono file bodlayni:", e.message); });
