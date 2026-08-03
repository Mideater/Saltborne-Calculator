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

  function finalAbilityScores(baseScores, racesData, raceGroup, subrace, overrides = {}, saltborneApplied = false) {
    const raceMods = raceAbilityMods(racesData, raceGroup, subrace);
    const saltMods = (saltborneApplied && racesData.saltborneTemplate) ? racesData.saltborneTemplate.mods : {};
    const out = {};
    ABILS.forEach(a => {
      out[a] = baseScores[a] + (raceMods[a] || 0) + (saltMods[a] || 0) + (overrides[a] || 0);
    });
    // Saltborne's STR bonus is explicitly capped at 20 total "at creation" per the wiki.
    if (saltborneApplied && saltMods.STR && out.STR > 20) {
      out.STR = 20;
    }
    return out;
  }

  /**
   * How much of Saltborne's STR bonus (if any) gets wasted by the 20 cap.
   * Returns 0 if not applicable or nothing is wasted.
   */
  function saltborneWastedStr(baseScores, racesData, raceGroup, subrace, overrides = {}) {
    if (!racesData.saltborneTemplate || !racesData.saltborneTemplate.mods.STR) return 0;
    const raceMods = raceAbilityMods(racesData, raceGroup, subrace);
    const preSaltborneStr = baseScores.STR + (raceMods.STR || 0) + (overrides.STR || 0);
    const uncappedWithSalt = preSaltborneStr + racesData.saltborneTemplate.mods.STR;
    return uncappedWithSalt > 20 ? uncappedWithSalt - 20 : 0;
  }

  function totalEcl(racesData, raceGroup, subrace, saltborneApplied) {
    const grp = racesData.raceGroups[raceGroup];
    const sr = grp ? grp.subraces[subrace] : null;
    const baseEcl = sr ? (sr.ecl || 0) : 0;
    const saltEcl = (saltborneApplied && racesData.saltborneTemplate) ? (racesData.saltborneTemplate.ecl || 0) : 0;
    return baseEcl + saltEcl;
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
   * Haze's HP rule: character levels 1-3 (not class levels — character
   * levels) always get MAXIMUM hit die. From character level 4 onward you
   * roll, but if the roll comes in under half the die (rounded up), you get
   * that half-value instead — so a d10 can never give you less than 5, a
   * d12 never less than 6, etc.
   * rolledValue: the value the player entered for this level, or null/undefined
   * if they haven't entered one yet (falls back to the guaranteed floor).
   */
  function hpForCharacterLevel(charLevel, hitDie, rolledValue) {
    if (charLevel <= 3) return hitDie;
    const floor = Math.ceil(hitDie / 2);
    if (rolledValue == null || rolledValue === '') return floor;
    const clamped = Math.max(1, Math.min(hitDie, rolledValue));
    return Math.max(clamped, floor);
  }

  function hpFloor(hitDie) {
    return Math.ceil(hitDie / 2);
  }

  /**
   * Walks a 6-level plan (array of class names, one per character level)
   * and returns per-level cumulative BAB/saves/HP/skill points.
   * classesData = the parsed classes.json .classes object
   * levelPlan = ["Fighter","Fighter","Rogue","Rogue","Rogue","Rogue"] etc (length 6)
   * isHuman = whether the character gets the human bonus feat at level 1
   * hpRolls = { 4: 7, 5: null, 6: 3 } — player-entered rolls for levels 4-6
   */
  function computeProgression(classesData, levelPlan, isHuman, hpRolls = {}) {
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

      const hpThisLevel = hpForCharacterLevel(charLevel, def.hitDie, hpRolls[charLevel]);

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
      if (have < 1) return false; // must have AT LEAST 1 level in that class, even if no specific level number given
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
   * bonusPoolsData = the parsed bonus-pools.json
   * state = same shape as meetsPrereqs expects, PLUS:
   *   state.grantedProficiencies: Set<string> of feat names already auto-granted
   *   by classes taken so far (so they don't show up as "new" choices)
   */
  function eligibleFeatsForSlot(featsData, slotPool, state, bonusPoolsData) {
    // Auto-granted features (proficiencies, Turn Undead, etc.) count toward
    // OTHER feats' prerequisites even though they were never picked from a slot.
    const effectiveFeatIds = state.grantedProficiencies
      ? new Set([...state.featIdsTaken, ...autoGrantedFeatIds(featsData, state.grantedProficiencies)])
      : state.featIdsTaken;
    const effectiveState = { ...state, featIdsTaken: effectiveFeatIds };

    return featsData.filter(f => {
      if (f.isGroup) return false;   // groups are headers; their members are separate entries
      if (f.isE6Only) return false;  // not available during 1-6 leveling
      if (effectiveFeatIds.has(f.id)) return false; // already have it (picked OR auto-granted)
      if (state.grantedProficiencies && state.grantedProficiencies.has(f.name)) return false;
      if (!poolMatchesCategory(slotPool, f, bonusPoolsData)) return false;
      return meetsPrereqs(f, effectiveState);
    });
  }

  function poolMatchesCategory(pool, feat, bonusPoolsData) {
    if (!bonusPoolsData) return true; // safety fallback if data failed to load
    if (bonusPoolsData.neverPickable && bonusPoolsData.neverPickable.names.includes(feat.name)) return false;

    if (pool === 'general') {
      return bonusPoolsData.generalPoolCategories.includes(feat.category);
    }

    const def = bonusPoolsData.pools[pool];
    if (!def) return false; // unknown pool -> show nothing rather than everything

    if (def.categories && def.categories.includes(feat.category)) return true;
    if (def.names && def.names.includes(feat.name)) return true;
    if (def.namePrefixes && def.namePrefixes.some(p => feat.name.startsWith(p))) return true;
    return false;
  }

  /**
   * Every feat name that's already automatically granted (not chosen) by the
   * classes taken so far — proficiencies AND automatic class features like
   * Turn Undead, Barbarian Fast Movement, Monk AC Bonus, etc. Union across
   * ALL classes in the level plan taken up to this point.
   */
  function autoGrantedFeatureNames(classesData, levelPlan, upToCharLevel) {
    const set = new Set();
    levelPlan.slice(0, upToCharLevel).forEach(cls => {
      const def = classesData[cls];
      if (!def) return;
      (def.proficiencyGrants || []).forEach(name => set.add(name));
      (def.autoFeatures || []).forEach(name => set.add(name));
    });
    return set;
  }
  // Old name kept as an alias so nothing else has to change.
  const grantedProficiencies = autoGrantedFeatureNames;

  /**
   * Looks up feat ids by name for every auto-granted feature, so they can be
   * merged into featIdsTaken — an auto-granted Turn Undead should satisfy
   * another feat's "requires Turn Undead" prerequisite exactly as if it had
   * been picked from a slot.
   */
  function autoGrantedFeatIds(featsData, autoGrantedNames) {
    const ids = new Set();
    featsData.forEach(f => { if (autoGrantedNames.has(f.name)) ids.add(f.id); });
    return ids;
  }

  return {
    ABILS, PB_COST,
    abilityModifier, pointBuyCost,
    raceAbilityMods, finalAbilityScores, totalEcl, saltborneWastedStr,
    babForLevel, saveForLevel, computeProgression, hpForCharacterLevel, hpFloor,
    skillPointsForRow, totalSkillPoints, maxRanks, classSkillSet,
    meetsPrereqs, eligibleFeatsForSlot, poolMatchesCategory, autoGrantedFeatureNames, autoGrantedFeatIds, grantedProficiencies,
  };
})();
