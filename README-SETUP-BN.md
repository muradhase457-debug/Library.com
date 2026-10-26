# RFL — Sob Product (v2) — Setup (Phone diyei hobe)

## Eta ki?

Personal reference library — RFL-er sokol product ek jaygay, nam/code likhe khujun, boro chobi-soho details dekhun. **Bikri, order, ba store-hisab er jonno noy.** RFL site-ei onek product-er dam/biboron khali thake, tai ekhaneo segulo khali dekhabe — banano dam/biboron jog kora hoy na. Chobi halka ghurano/tilt shudhu dekhte sundor korar jonno; asol 3D model file RFL site-e nei.

## File gulo kothay jabe (repo: rfl-catalog)

| File | GitHub-e kothay |
|---|---|
| `index.html` | Repo root-e |
| `products.json` | Repo root-e |
| `categories.json` | Repo root-e (6 category, 126 leaf — scraper ei list diyei khuje) |
| `sw.js` | Repo root-e |
| `scripts/scrape-rfl.mjs` | `scripts/` folder-er bhitore |
| `.github/workflows/update-catalog.yml` | `.github/workflows/` folder-er bhitore |
| `images/` | Khali folder hisebe upload kora lagbe na — prothom update-e auto toiri hobe. Totokkhon chobi RFL site thekei asbe. |

Upload korar somoy: GitHub-e repo khule **Add file → Upload files** use korun (copy-paste noy — boro file phone-e kat-te pare).

## Live korar dhap

1. GitHub-e notun repo khulun: nam `rfl-catalog`, Public rakhun.
2. Uporer file gulo upload korun.
3. Repo-te **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main, Folder: / (root) → Save**.
4. 2–3 minute por link paben: `https://<apnar-username>.github.io/rfl-catalog/`.

## Sokor product kivabe asbe? (1 bar chalatei hobe)

Upload-er por shudhu 23 ta product thakbe (Jug + New arrivals). Sokor product anar jonno:

1. Repo-te **Actions tab → Update RFL Catalog → Run workflow → Run workflow** chap din.
2. Eta 126 ta leaf page ghure notun product khujbe — prothom bar kichu minute somoy lagte pare, eta normal. Ses hole `products.json` ar `images/`-e notun product jog hobe.
3. Tarpor theke proti Sombar sokal 9ta (Dhaka) auto cholbe, ar chaile Run workflow chepe ekhoni chalano jabe.
4. Site-er kono page na khulle sei leaf-er product sei bar jog hobe na — purono data thakbe, khali hobe na.

**Ekta dorkari sotyi kotha:** Browser theke sorasori RFL site-e data tante gele cross-origin-e atke jay, tai "second-er moddhe live" mane holo — apnar site-e joma data theke search second-er moddhei cholbe, ar notun product Actions diye niyomito sync hobe. RFL site-er gothon bodle gele script-er oi ongsho thik korte hote pare.

## Rack / stock note (optional, shudhu apni)

Page-e kono edit button nei. Chaile `products.json`-e kono product-er `rack` / `stock_note` likhe Commit korle card-er details-e dekhabe. Eta mul uddeshyo noy, shudhu optional note. Bodlanor age file-ta download kore backup rakhun — comma/quote muche gele page cholbe na.

## Firebase lagbe kina?

**Na.** Shudhu apni dekhben/bodlaben, ar data GitHub-ei thakbe — Firebase jog korle login/rules/console jhamela barbe, labh nei.
