// RFL Catalog updater v2 — Node 18+ (kono extra dependency lagbe na)
// Kaj:
//  1. categories.json-er 126 ta leaf page (item_listing/<leaf-slug>) theke
//     product_details/<slug>_<id> link khuje sokol product ber kore.
//     Group slug (jemon "container") diye khujle RFL site-ei kichu dekhay na,
//     tai shudhu leaf slug-i use kora hoy.
//  2. Notun product-er product_details page theke ney: nam, mul chobi,
//     additional chobi (thakle), size (L*W*H, thakle). Dam/biboron RFL site-ei
//     onek product-e khali thake — na pele banano dam/biboron jog kora hoy NA.
//  3. Chobi images/-e download kore (sharp thakle 900px-e choto kore,
//     format bodlay na, na thakle asol file-i rakhe).
//  4. Purono product-er rack/stock_note kokhono muchbe na.
//  5. Site-e pouchano na gele BA notun kichu na pele: purono file bodlay NA,
//     exit code 0 diye shesh hoy — jate khali catalog kokhono na hoy.
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

async function fetchBuffer(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return Buffer.from(await res.arrayBuffer());
  } finally { clearTimeout(t); }
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

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

async function saveImage(remoteUrl, localName) {
  try {
    const buf = await fetchBuffer(remoteUrl);
    fs.mkdirSync(path.join(ROOT, "images"), { recursive: true });
    const dest = path.join(ROOT, "images", localName);
    try {
      const sharp = (await import("sharp")).default;
      const ext = localName.toLowerCase();
      let pipe = sharp(buf).resize({ width: 900, withoutEnlargement: true });
      if (ext.endsWith(".jpg") || ext.endsWith(".jpeg")) pipe = pipe.jpeg({ quality: 78 });
      else if (ext.endsWith(".png")) pipe = pipe.png({ compressionLevel: 9 });
      else if (ext.endsWith(".webp")) pipe = pipe.webp({ quality: 78 });
      await pipe.toFile(dest);
      return true;
    } catch {
      fs.writeFileSync(dest, buf);
      return false;
    }
  } catch (e) {
    console.log("  chobi download hoyni:", remoteUrl, e.message);
    return null;
  }
}

async function main() {
  const jsonPath = path.join(ROOT, "products.json");
  const catPath = path.join(ROOT, "categories.json");
  if (!fs.existsSync(jsonPath)) { console.log("products.json pai ni — kichu bodlano holo na."); return; }
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const byId = new Map(data.products.map((p) => [Number(p.id), p]));
  const cats = fs.existsSync(catPath) ? JSON.parse(fs.readFileSync(catPath, "utf8")) : { leaves: [] };
  const leaves = (cats.leaves || []).slice(0, MAX_LEAVES);
  console.log("Leaf page cholbe:", leaves.length);

  const found = new Map(); // id -> {id, slug, leaf, group, category}
  // 1) Homepage — notun arrival-er jonno
  try {
    const home = await fetchText(BASE);
    for (const d of discover(home)) found.set(d.id, { ...d, leaf: "New arrivals", group: "Latest additions", category: "New arrivals" });
    console.log("Homepage theke pelam:", found.size);
  } catch (e) { console.log("Homepage khola jayni:", e.message); }

  // 2) Prottek leaf page
  let okLeaves = 0;
  for (const leaf of leaves) {
    try {
      const html = await fetchText(BASE + "item_listing/" + leaf.slug);
      let n = 0;
      for (const d of discover(html)) {
        if (!found.has(d.id)) found.set(d.id, { ...d, leaf: leaf.leaf, group: leaf.group, category: leaf.category });
        n++;
      }
      if (n) okLeaves++;
      await sleep(400);
    } catch (e) { /* ei leaf skip — purono data thakbe */ }
  }
  console.log("Leaf page theke product pelam:", okLeaves, "ta leaf-e | mot candidate:", found.size);

  const fresh = [...found.values()].filter((d) => !byId.has(d.id)).slice(0, MAX_NEW);
  console.log("Age chilo:", byId.size, "| Notun:", fresh.length);
  if (!fresh.length) { console.log("Notun kichu nei — file bodlano holo na."); return; }

  let added = 0;
  for (const d of fresh) {
    try {
      const page = await fetchText(BASE + "product_details/" + d.slug + "_" + d.id);
      const name = cleanTitle(page) || d.slug.replace(/-/g, " ");
      const files = imagesFromPage(page);
      const localImgs = [];
      const remoteImgs = [];
      for (const f of files) {
        const remote = BASE + "uploads/" + f;
        remoteImgs.push(remote);
        if (!DRY) {
          const saved = await saveImage(remote, f);
          localImgs.push(saved === null ? "" : "images/" + f);
        } else {
          localImgs.push("images/" + f);
        }
      }
      const cap = (name.match(/(\d+(?:\.\d+)?)\s?L\b/) || [])[1];
      const variant = name.includes(" - ") ? name.split(" - ")[1] : "";
      data.products.push({
        id: d.id, name, code: String(d.id),
        category: d.category, group: d.group, leaf: d.leaf,
        image: localImgs[0] || "", remote_image: remoteImgs[0] || "",
        images: localImgs.filter(Boolean), remote_images: remoteImgs,
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
  data.products.sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));
  data.version = "2.0.0";
  data.updated = new Date().toISOString().slice(0, 10);
  if (DRY) { console.log("[DRY] Jog hoto:", added, "ta"); return; }
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
  console.log("products.json update holo. Mot:", data.products.length, "| Notun:", added);
}

main().catch((e) => { console.log("Updater thamlo, purono file bodlayni:", e.message); });
