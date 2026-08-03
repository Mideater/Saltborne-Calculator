/* ============================================================
   data.js — loads every JSON file in /data and hands back one
   object. This is the ONLY file that knows the filenames/paths.
   If you rename or move a JSON file, this is the only place to fix.
   ============================================================ */

async function loadAllData() {
  const files = {
    races: 'data/races.json',
    classes: 'data/classes.json',
    feats: 'data/feats.json',
    skills: 'data/skills.json',
    domains: 'data/domains.json',
    invocations: 'data/invocations.json',
    bonusPools: 'data/bonus-pools.json',
  };

  const entries = await Promise.all(
    Object.entries(files).map(async ([key, path]) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
      return [key, await res.json()];
    })
  );

  return Object.fromEntries(entries);
}
