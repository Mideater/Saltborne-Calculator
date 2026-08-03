# The Saltborne Ledger — Build Calculator

A fan-made E6 (level 1–6) character build calculator for Haze: Saltborne.

## What's in this folder

```
index.html          <- the page itself (structure only, no data, no logic)
css/
  style.css         <- all visual styling
js/
  data.js           <- loads the JSON files, hands them to everything else
  engine.js         <- all the MATH (BAB, saves, skill points, feat prereqs).
                        No DOM code lives here at all.
  ui.js             <- the ONLY file that touches the page. Renders things,
                        listens for clicks/typing, calls Engine for numbers.
data/
  races.json        <- every race/subrace, ability mods, traits
  classes.json       <- every class, BAB/save progression, skill points, features,
                        proficiencyGrants + autoFeatures (what's auto-granted, not chosen)
  feats.json         <- all 626 feats from the real game data, with real
                        prerequisites (this is the good stuff you found)
  bonus-pools.json    <- which feats are eligible for each class's bonus-feat
                        slot (Fighter combat feats, Cleric divine feats, etc.)
                        — this is what stops a Fighter from seeing Ranger feats
  skills.json         <- skill list + what changed from vanilla NWN
  domains.json        <- cleric domains + deity list
  invocations.json     <- warlock invocations
```

**The rule to remember:** data changes go in `/data/*.json`. Math changes go
in `engine.js`. Visual/layout changes go in `index.html` or `style.css`.
You will very rarely need to touch `ui.js` unless you're adding a whole new
section to the calculator.

---

## Part 1 — Testing it on your own computer

Because the page loads the JSON files with `fetch()`, you **can't** just
double-click `index.html` anymore — browsers block that for local files as
a security measure. You need a tiny local server. Two easy options:

**Option A — VS Code (easiest if you don't like typing commands)**
1. Install [VS Code](https://code.visualstudio.com/) if you don't have it.
2. Install the "Live Server" extension (search for it in the Extensions
   panel, the icon with 4 squares on the left sidebar).
3. Open this folder in VS Code (File → Open Folder).
4. Right-click `index.html` → "Open with Live Server."
5. It opens in your browser and auto-refreshes whenever you save a file.

**Option B — a one-line terminal command**
1. Install [Python](https://www.python.org/downloads/) if you don't have it
   (VS Code will nag you to, or just grab it from python.org — any recent
   version works).
2. Open a terminal in this folder (in VS Code: Terminal → New Terminal).
3. Run: `python -m http.server 8000`
4. Open `http://localhost:8000` in your browser.

Either way, you should see the calculator load. If it shows a red error box
instead, that means a data file didn't load — the box will tell you why.

---

## Part 2 — Getting it on the internet with GitHub Pages

You don't need to know Git for this. GitHub's website lets you upload files
by dragging and dropping, like any other file upload.

### Step 1 — Make a GitHub account
Go to [github.com](https://github.com) and sign up. Free.

### Step 2 — Create a new repository
1. Click the **+** in the top-right corner → **New repository**.
2. Name it something like `saltborne-calc`.
3. Set it to **Public** (Pages needs this on the free tier).
4. Don't check any of the "initialize with..." boxes.
5. Click **Create repository**.

### Step 3 — Upload the files
1. On the new (empty) repo page, click **uploading an existing file**.
2. Drag the **contents** of this folder in — not the folder itself, but
   `index.html`, the `css` folder, the `js` folder, and the `data` folder,
   all at once, so they land at the top level of the repo.
3. Scroll down, write a short message like "first upload," click
   **Commit changes**.

### Step 4 — Turn on Pages
1. In your repo, click **Settings** (top menu).
2. Click **Pages** in the left sidebar.
3. Under "Build and deployment" → "Source," choose **Deploy from a branch**.
4. Branch: `main`, folder: `/ (root)`. Click **Save**.
5. Wait about a minute, then refresh — GitHub will show you a URL like
   `https://yourusername.github.io/saltborne-calc/`. That's your live site.

### Making changes later
Simplest path: on GitHub, open the file you want to edit (e.g.
`data/feats.json`), click the pencil icon to edit it right in the browser,
make your change, and commit. The live site updates automatically within
a minute or two, no re-upload needed.

For bigger changes (like replacing a whole JSON file), use **Add file →
Upload files** again and drop the new version in — GitHub will ask if you
want to replace the existing one.

---

## What's solid vs. what still needs work

**Solid:** the math engine (BAB, saves, skill points, point-buy, ability
scores) is tested against the real data and works correctly for any
combination of the 13 classes across 6 levels, including multiclassing.
The feat prerequisite checker uses the *actual* game data — abilities, BAB,
class+level, required feats, skill ranks — pulled straight from the API
export. Bonus-feat pools are now curated per class (`bonus-pools.json`), so
a Fighter no longer sees Ranger-only feats, and racial/chassis features
(like Barbarian Fast Movement) don't show up as fake "choices." Auto-granted
class features (proficiencies, Turn Undead, etc.) correctly satisfy OTHER
feats' prerequisites even though they were never explicitly picked — e.g. a
Paladin's auto-granted Turn Undead now correctly unlocks Divine Might.
Human has all 25 regional subraces. Saltborne is a proper overlay template
that can apply to any of its 9 eligible base subraces (not a separate race).
Deity and Cleric domain selection are wired to the real domain/deity data.

**Needs work, in rough priority order:**

1. **`bonus-pools.json` is hand-curated and may have gaps.** I built each
   pool from what we'd already confirmed in the Classes doc, cross-checked
   against real feat names — but if a class's bonus feat list is missing
   something, that's the file to fix. Same format either way: add a name to
   `names`, or a prefix to `namePrefixes` for chains like Monk Paths.
2. **Some source data has real gaps, not bugs on this end.** A few Cleric/
   Paladin feats reference "domain power" feats in their prerequisites that
   were never included as standalone entries in the export — those can
   currently never be satisfied. Worth fixing by teaching the engine to
   check domain membership against `domains.json` directly instead.
3. **Races and classes still have some `verified: false` spots** — flagged
   in the JSON with notes about what to check in-game.
4. **No spell system** — deliberately skipped per your earlier call.
5. **Skills list may be incomplete** — a few skills are marked
   `unconfirmed: true` since they were never directly verified as changed
   or unchanged from vanilla.

None of these block the calculator from working today — they're refinement
passes for later, and every one of them is a data-file or engine-function
change, not a rewrite.
