/* ============================================================
   engine.js — the "brain" of the calculator.
   No DOM manipulation happens here. Every function takes plain
   data in and returns plain data out. This makes it independently
   testable and means ui.js can change completely without ever
   touching this file.
   ============================================================ */

const Engine = (() => {

  const ABILS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  // 3.5e standard point-buy cost table (score -> cumulative cost from 8)
  const PB_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16 };

  function abilityModifier(score) {
    return Math.floor((score - 10) / 2);
  }

  function pointBuyCost(score) {
    return PB_COST[score] ?? 0;
  }

  // ---- Race / ability scores ----

  function raceAbilityMods(racesData, raceGroup, subrace) {
    const grp = racesData.raceGroups[raceGroup];
    if (!grp) return {};
    const sr = grp.subraces[subrace];
    if (!sr) return {};
    return sr.mods || {};
  }

  function finalAbilityScores(baseScores, racesData, raceGroup, subrace, overrides = {}) {
    const mods = raceAbilityMods(racesData, raceGroup, subrace);
    const out = {};
    ABILS.forEach(a => {
      out[a] = baseScores[a] + (mods[a] || 0) + (overrides[a] || 0);
    });
    return out;
  }

  // ---- BAB / saves ----

  function babForLevel(babType, classLevel) {
    if (babType === 'full') return classLevel;
    if (babType === '3/4') return Math.floor(classLevel * 3 / 4);
    if (babType === '1/2') return Math.floor(classLevel / 2);
    return 0;
  }

  function saveForLevel(kind, classLevel) {
    // kind: 'g' (good) or 'p' (poor)
    return kind === 'g' ? 2 + Math.floor(classLevel / 2) : Math.floor(classLevel / 3);
  }

  /**
   * Walks a 6-level plan (array of class names, one per character level)
   * and returns per-level cumulative BAB/saves/HP/skill points.
   * classesData = the parsed classes.json .classes object
   * levelPlan = ["Fighter","Fighter","Rogue","Rogue","Rogue","Rogue"] etc (length 6)
   * isHuman = whether the character gets the human bonus feat at level 1
   */
  function computeProgression(classesData, levelPlan, isHuman) {
    const rows = [];
    const classLevelCount = {};

    for (let i = 0; i < levelPlan.length; i++) {
      const charLevel = i + 1;
      const cls = levelPlan[i];
      const def = classesData[cls];
      if (!def) throw new Error(`Unknown class: ${cls}`);

      classLevelCount[cls] = (classLevelCount[cls] || 0) + 1;
      const clsLvl = classLevelCount[cls];

      // Sum contribution of every class at its own level-count so far
      // (standard 3.5 multiclass rule: each class contributes based on
      // how many levels you've taken IN that class, not your total level)
      let bab = 0, fort = 0, ref = 0, will = 0;
      Object.keys(classLevelCount).forEach(c => {
        const n = classLevelCount[c];
        const d = classesData[c];
        bab += babForLevel(d.bab, n);
        fort += saveForLevel(d.saves.fort, n);
        ref += saveForLevel(d.saves.ref, n);
        will += saveForLevel(d.saves.will, n);
      });

      const avgHD = Math.floor(def.hitDie / 2) + 1;
      const hpThisLevel = charLevel === 1 ? def.hitDie : avgHD;

      const skillMultiplier = charLevel === 1 ? 4 : 1;
      const skillPtsThisLevel = def.skillPoints; // + INT mod, applied by caller once final abilities are known

      // Bonus feat slots granted at this class-level
      const bonusFeatSlots = [];
      if (def.bonusFeatLevels && def.bonusFeatLevels.levels.includes(clsLvl)) {
        bonusFeatSlots.push({ pool: def.bonusFeatLevels.pool, class: cls, classLevel: clsLvl });
      }

      // General feat slots: every character level 1, 3, 6 + human bonus at 1
      const generalFeatSlots = [];
      if (charLevel === 1 || charLevel === 3 || charLevel === 6) {
        generalFeatSlots.push({ pool: 'general', charLevel });
      }
      if (charLevel === 1 && isHuman) {
        generalFeatSlots.push({ pool: 'general', charLevel, source: 'human' });
      }

      rows.push({
        charLevel, cls, clsLvl,
        bab, fort, ref, will,
        hitDie: def.hitDie, hpThisLevel,
        skillPtsBase: skillPtsThisLevel, skillMultiplier,
        featSlots: [...generalFeatSlots, ...bonusFeatSlots],
      });
    }
    return rows;
  }

  // ---- Skills ----

  function skillPointsForRow(row, intMod) {
    return Math.max(1, row.skillPtsBase + intMod) * row.skillMultiplier;
  }

  function totalSkillPoints(progression, intMod) {
    return progression.reduce((sum, r) => sum + skillPointsForRow(r, intMod), 0);
  }

  function maxRanks(characterLevel, isClassSkill) {
    return isClassSkill ? characterLevel + 3 : Math.floor((characterLevel + 3) / 2);
  }

  function classSkillSet(classesData, levelPlan) {
    const set = new Set();
    new Set(levelPlan).forEach(cls => {
      const def = classesData[cls];
      if (def && def.classSkills) def.classSkills.forEach(s => set.add(s));
    });
    return set;
  }

  // ---- Feats ----

  /**
   * Checks whether a feat's structured prereqs (from feats.json, matching
   * the raw Haze API shape) are satisfied given a build state.
   * state = {
   *   bab: number,
   *   finalAbilities: {STR,DEX,CON,INT,WIS,CHA},
   *   classLevels: {ClassName: level, ...},
   *   featIdsTaken: Set<number>,
   *   skillRanks: {SkillName: ranks, ...}
   * }
   */
  function meetsPrereqs(feat, state) {
    const pr = feat.prereqs;
    if (!pr) return true;

    if (pr.abilities) {
      for (const [abil, min] of Object.entries(pr.abilities)) {
        if ((state.finalAbilities[abil] || 0) < min) return false;
      }
    }
    if (pr.bab != null && state.bab < pr.bab) return false;

    if (pr.level_class) {
      const have = state.classLevels[pr.level_class] || 0;
      if (pr.level != null && have < pr.level) return false;
      if (pr.max_level != null && have > pr.max_level) return false;
    } else if (pr.level != null) {
      const totalLevel = Object.values(state.classLevels).reduce((a, b) => a + b, 0);
      if (totalLevel < pr.level) return false;
    }

    if (pr.feats_all && pr.feats_all.length) {
      for (const f of pr.feats_all) {
        if (!state.featIdsTaken.has(f.id)) return false;
      }
    }
    if (pr.feats_or && pr.feats_or.length) {
      const any = pr.feats_or.some(f => state.featIdsTaken.has(f.id));
      if (!any) return false;
    }
    if (pr.skills && pr.skills.length) {
      for (const s of pr.skills) {
        const have = (state.skillRanks && state.skillRanks[s.name]) || 0;
        if (have < s.ranks) return false;
      }
    }
    return true;
  }

  /**
   * Filters the full feats list down to what's eligible for a given slot.
   * featsData = the .feats array from feats.json
   * slotPool = the "pool" string from a featSlot (e.g. 'general', 'fighterCombat', 'clericDivine')
   * Pool-to-category mapping is intentionally loose right now — see poolMatchesCategory.
   */
  function eligibleFeatsForSlot(featsData, slotPool, state) {
    return featsData.filter(f => {
      if (f.isGroup) return false;   // groups are headers; their members are separate entries
      if (f.isE6Only) return false;  // not available during 1-6 leveling
      if (state.featIdsTaken.has(f.id)) return false;
      if (!poolMatchesCategory(slotPool, f)) return false;
      return meetsPrereqs(f, state);
    });
  }

  function poolMatchesCategory(pool, feat) {
    if (pool === 'general') return true; // any non-E6 feat can fill a general slot
    // Everything else: caller should further narrow using feat.category / feat.name
    // as needed for the specific bonus-feat pool (rage list, divine list, etc.)
    // This is deliberately permissive — tighten per-pool as you confirm exact lists.
    return true;
  }

  return {
    ABILS, PB_COST,
    abilityModifier, pointBuyCost,
    raceAbilityMods, finalAbilityScores,
    babForLevel, saveForLevel, computeProgression,
    skillPointsForRow, totalSkillPoints, maxRanks, classSkillSet,
    meetsPrereqs, eligibleFeatsForSlot,
  };
})();
