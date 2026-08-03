/* ============================================================
   ui.js — renders the app and wires up events. Talks to Engine
   for all math and to `data` (loaded once at startup) for content.
   Never does calculation itself — if you find yourself writing
   BAB or save math in here, it belongs in engine.js instead.
   ============================================================ */

let DATA = null; // set once by init()

const state = {
  charName: '',
  alignment: 'Lawful Neutral',
  deity: '',
  clericDomains: [],
  raceGroup: 'Human',
  subrace: 'Human (unspecified)',
  raceOverride: {},
  saltborneApplied: false,
  pointPool: 30,
  base: { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 },
  levels: ['Fighter', 'Fighter', 'Fighter', 'Fighter', 'Fighter', 'Fighter'],
  hpRolls: {}, // charLevel (4,5,6) -> rolled value, or absent = "use the guaranteed floor"
  featChoices: {},   // slotKey -> feat id
  skillRanks: {},    // skill name -> ranks
};

function fmt(n) { return (n >= 0 ? '+' : '') + n; }

async function init() {
  try {
    DATA = await loadAllData();
  } catch (err) {
    document.getElementById('loadError').style.display = 'block';
    document.getElementById('loadError').textContent =
      'Could not load data files. If you just opened this file directly (double-click), that won\'t work — ' +
      'browsers block local file loading for security. Run a local server instead (see README.md), or view it via GitHub Pages.\n\n' +
      'Technical error: ' + err.message;
    return;
  }

  document.getElementById('raceGroup').innerHTML = Object.keys(DATA.races.raceGroups)
    .map(r => `<option value="${r}">${r}</option>`).join('');

  bindStaticEvents();
  renderAll();
}

function bindStaticEvents() {
  document.getElementById('raceGroup').addEventListener('change', e => {
    state.raceGroup = e.target.value;
    const firstSub = Object.keys(DATA.races.raceGroups[state.raceGroup].subraces)[0];
    state.subrace = firstSub;
    state.raceOverride = {};
    renderAll();
  });
  document.getElementById('subrace').addEventListener('change', e => {
    state.subrace = e.target.value;
    state.raceOverride = {};
    renderAll();
  });
  document.getElementById('pointPool').addEventListener('input', e => {
    state.pointPool = parseInt(e.target.value || '30', 10);
    renderAbilities();
  });
}

function currentSubraceDef() {
  const grp = DATA.races.raceGroups[state.raceGroup];
  return grp ? grp.subraces[state.subrace] : null;
}

function finalAbilities() {
  return Engine.finalAbilityScores(state.base, DATA.races, state.raceGroup, state.subrace, state.raceOverride, state.saltborneApplied);
}

/* ---------------- CHARACTER (deity / domains) ---------------- */

function renderCharacter() {
  const deitySelect = document.getElementById('deity');
  if (!deitySelect.dataset.populated) {
    deitySelect.innerHTML = '<option value="">— none —</option>' +
      DATA.domains.deities.map(([name]) => `<option value="${name}">${name}</option>`).join('');
    deitySelect.dataset.populated = '1';
    deitySelect.addEventListener('change', e => {
      state.deity = e.target.value;
      state.clericDomains = []; // reset domain picks when deity changes
      renderAll();
    });
  }
  deitySelect.value = state.deity;

  const isCleric = state.levels.includes('Cleric');
  const box = document.getElementById('domainBox');
  if (!isCleric) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = 'block';

  if (!state.deity) {
    box.innerHTML = '<p class="h-note">Pick a deity above to choose this Cleric\'s domains.</p>';
    return;
  }
  const deityEntry = DATA.domains.deities.find(([name]) => name === state.deity);
  const allowedDomains = deityEntry ? deityEntry[2].split(',').map(s => s.trim()) : [];

  box.innerHTML = `<label>Cleric Domains (pick up to 2, matching ${state.deity})</label>
    <div class="grid grid-3" id="domainChecks"></div>`;
  const container = document.getElementById('domainChecks');
  container.innerHTML = allowedDomains.map(d => {
    const domainInfo = DATA.domains.domains.find(x => x.name === d.replace(/\s*\(.*\)/, ''));
    const checked = state.clericDomains.includes(d) ? 'checked' : '';
    const disabled = (!checked && state.clericDomains.length >= 2) ? 'disabled' : '';
    return `<label style="display:flex; gap:6px; align-items:flex-start; text-transform:none; letter-spacing:0; font-size:13px; cursor:pointer;">
      <input type="checkbox" data-domain="${d}" ${checked} ${disabled} style="margin-top:3px;">
      <span>${d}${domainInfo ? `<br><span style="color:var(--muted); font-size:11.5px;">${domainInfo.specialAbility}</span>` : ''}</span>
    </label>`;
  }).join('');
  container.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', e => {
      const d = e.target.dataset.domain;
      if (e.target.checked) {
        if (state.clericDomains.length < 2) state.clericDomains.push(d);
      } else {
        state.clericDomains = state.clericDomains.filter(x => x !== d);
      }
      renderAll();
    });
  });
}

/* ---------------- RACE ---------------- */

function renderRace() {
  const grp = DATA.races.raceGroups[state.raceGroup];
  const subSelect = document.getElementById('subrace');
  const keys = Object.keys(grp.subraces);
  if (!keys.includes(state.subrace)) state.subrace = keys[0];
  subSelect.innerHTML = keys.map(k => `<option value="${k}">${k}</option>`).join('');
  subSelect.value = state.subrace;

  const sr = currentSubraceDef();
  const box = document.getElementById('raceInfo');

  if (!sr.saltborneEligible) state.saltborneApplied = false;
  const totalEcl = Engine.totalEcl(DATA.races, state.raceGroup, state.subrace, state.saltborneApplied);

  const verified = sr.verified !== false;
  const modsText = Object.entries(sr.mods || {}).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || 'None';
  const epText = sr.ep ? `<span class="pill warn">${sr.ep} EP</span> ` : '';
  const verifiedTag = verified ? '' : '<span class="pill warn">Check in-game</span> ';
  const eclText = totalEcl ? `<span class="pill brass">ECL +${totalEcl}</span> ` : '';
  box.innerHTML = `${eclText}${epText}${verifiedTag}<b>Ability mods:</b> ${modsText}<br><br>` +
    (sr.traits || []).map(t => `• ${t}`).join('<br>') +
    (sr.notes ? `<br><br><i>${sr.notes}</i>` : '');

  // Saltborne overlay checkbox — only shown when the current subrace qualifies
  const saltBox = document.getElementById('saltborneBox');
  if (sr.saltborneEligible) {
    const st = DATA.races.saltborneTemplate;
    const stMods = Object.entries(st.mods).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
    const wasted = Engine.saltborneWastedStr(state.base, DATA.races, state.raceGroup, state.subrace, state.raceOverride);
    const wasteWarning = wasted > 0
      ? `<div class="warn-line bad mt8">Heads up: ${wasted} point${wasted > 1 ? 's' : ''} of Saltborne's +2 STR would be wasted here — STR is capped at 20, and your base + racial STR is already high enough to hit that cap on its own.</div>`
      : '';
    saltBox.style.display = 'block';
    saltBox.innerHTML = `
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; text-transform:none; letter-spacing:0;">
        <input type="checkbox" id="saltborneCheck" ${state.saltborneApplied ? 'checked' : ''} style="width:16px;height:16px;">
        <span>Apply <b>Saltborne</b> template (+${st.ecl} ECL, ${st.ep} EP) — adds ${stMods} on top of the base subrace above (capped at 20 STR total)</span>
      </label>
      ${state.saltborneApplied ? `<div class="h-note" style="margin-top:8px;">${st.traits.map(t => '• ' + t).join('<br>')}<br><br><i>${st.notes}</i></div>` : ''}
      ${wasteWarning}
    `;
    document.getElementById('saltborneCheck').addEventListener('change', e => {
      state.saltborneApplied = e.target.checked;
      renderAll();
    });
  } else {
    saltBox.style.display = 'none';
    saltBox.innerHTML = '';
  }

  const ov = document.getElementById('raceOverrides');
  ov.innerHTML = Engine.ABILS.map(a => `
    <div><label>${a} override</label>
    <input type="number" data-ov="${a}" value="${state.raceOverride[a] || 0}"></div>`).join('');
  ov.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', e => {
      state.raceOverride[e.target.dataset.ov] = parseInt(e.target.value || '0', 10);
      renderAll();
    });
  });
}

/* ---------------- ABILITIES ---------------- */

function renderAbilities() {
  const finals = finalAbilities();
  const mods = Engine.raceAbilityMods(DATA.races, state.raceGroup, state.subrace);
  let spent = 0;
  Engine.ABILS.forEach(a => spent += Engine.pointBuyCost(state.base[a]));
  document.getElementById('pointsRemaining').value = state.pointPool - spent;

  const rows = document.getElementById('abilityRows');
  rows.innerHTML = Engine.ABILS.map(a => {
    const f = finals[a];
    const m = Engine.abilityModifier(f);
    const base = state.base[a];
    return `<div class="grid" style="grid-template-columns:80px 32px 60px 32px 40px 50px 50px; align-items:center; padding:6px 0; gap:6px;">
      <b>${a}</b>
      <button type="button" class="btn small" data-step="-1" data-abil="${a}" ${base <= 8 ? 'disabled' : ''}>−</button>
      <span class="num" style="font-size:16px;">${base}</span>
      <button type="button" class="btn small" data-step="1" data-abil="${a}" ${base >= 18 ? 'disabled' : ''}>+</button>
      <span class="num">${mods[a] ? fmt(mods[a]) : '—'}</span>
      <span class="num" style="color:var(--brass-bright); font-weight:600;">${f}</span>
      <span class="num">${fmt(m)}</span>
    </div>`;
  }).join('');
  rows.querySelectorAll('button[data-step]').forEach(btn => {
    btn.addEventListener('click', e => {
      const a = e.target.dataset.abil;
      const delta = parseInt(e.target.dataset.step, 10);
      const next = state.base[a] + delta;
      if (next >= 8 && next <= 18) {
        state.base[a] = next;
        renderAll();
      }
    });
  });

  const warn = document.getElementById('abilityWarnings');
  const below10 = Engine.ABILS.filter(a => finals[a] < 10).length;
  const maxAllowed = state.raceGroup === 'Half-Orc' ? 2 : 1;
  let w = '';
  if (below10 > maxAllowed) w += `<div class="warn-line bad">${below10} scores below 10 — house rule allows at most ${maxAllowed} for this race.</div>`;
  if (spent > state.pointPool) w += `<div class="warn-line bad">Spent ${spent} points but your pool is ${state.pointPool}.</div>`;
  warn.innerHTML = w;
}

/* ---------------- LEVEL TABLE ---------------- */

function renderLevels() {
  const isHuman = state.raceGroup === 'Human';
  const prog = Engine.computeProgression(DATA.classes.classes, state.levels, isHuman, state.hpRolls);
  const finals = finalAbilities();
  const intMod = Engine.abilityModifier(finals.INT);

  const body = document.getElementById('levelBody');
  body.innerHTML = prog.map((r, i) => {
    const clsOptions = Object.keys(DATA.classes.classes)
      .map(c => `<option value="${c}" ${c === r.cls ? 'selected' : ''}>${c}</option>`).join('');
    const skillPts = Engine.skillPointsForRow(r, intMod);
    const chips = r.featSlots.map(s =>
      `<div class="feat-slot"><span class="tag">${s.pool}${s.source === 'human' ? ' (human)' : ''}</span></div>`
    ).join('');
    const hpCell = r.charLevel <= 3
      ? `<span class="num">${r.hpThisLevel}</span> <span class="h-note" style="margin:0;">(max)</span>`
      : `<input type="number" min="1" max="${r.hitDie}" placeholder="${Engine.hpFloor(r.hitDie)}+"
           data-hproll="${r.charLevel}" value="${state.hpRolls[r.charLevel] ?? ''}"
           style="width:44px; text-align:center; padding:4px;" title="Roll a d${r.hitDie}. Enter it here — anything under ${Engine.hpFloor(r.hitDie)} is automatically raised to ${Engine.hpFloor(r.hitDie)}.">
         <span class="num" style="color:var(--brass-bright); font-weight:600;">= ${r.hpThisLevel}</span>`;
    return `<tr class="stripe">
      <td><span class="lvl-badge">${r.charLevel}</span></td>
      <td><select data-lvl="${i}" class="clsSel">${clsOptions}</select></td>
      <td class="num">${fmt(r.bab)}</td>
      <td class="num">${fmt(r.fort)}</td>
      <td class="num">${fmt(r.ref)}</td>
      <td class="num">${fmt(r.will)}</td>
      <td class="num">d${r.hitDie}</td>
      <td class="num">${hpCell}</td>
      <td class="num">${skillPts}</td>
      <td>${chips || '<span style="color:var(--muted)">—</span>'}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('.clsSel').forEach(sel => {
    sel.addEventListener('change', e => {
      state.levels[parseInt(e.target.dataset.lvl, 10)] = e.target.value;
      renderAll();
    });
  });
  body.querySelectorAll('input[data-hproll]').forEach(inp => {
    inp.addEventListener('input', e => {
      const lvl = parseInt(e.target.dataset.hproll, 10);
      const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
      if (val == null) delete state.hpRolls[lvl];
      else state.hpRolls[lvl] = val;
      renderAll();
    });
  });

  return prog;
}

/* ---------------- FEATS ---------------- */

function buildFeatState(prog, upToCharLevel) {
  const classLevels = {};
  let bab = 0;
  prog.forEach(r => {
    if (r.charLevel <= upToCharLevel) {
      classLevels[r.cls] = (classLevels[r.cls] || 0) + 1;
      bab = r.bab;
    }
  });
  const featIdsTaken = new Set();
  Object.values(state.featChoices).forEach(id => { if (id) featIdsTaken.add(parseInt(id, 10)); });
  const grantedProficiencies = Engine.autoGrantedFeatureNames(DATA.classes.classes, state.levels, upToCharLevel);
  return { bab, classLevels, finalAbilities: finalAbilities(), featIdsTaken, skillRanks: state.skillRanks, grantedProficiencies };
}

function renderFeats(prog) {
  const container = document.getElementById('featSlots');
  let html = '';
  prog.forEach(r => {
    if (!r.featSlots.length) return;
    html += `<div class="mt8"><span class="pill brass">Level ${r.charLevel}</span></div>`;
    r.featSlots.forEach((slot, idx) => {
      const slotKey = `L${r.charLevel}-${slot.pool}-${idx}`;
      const fstate = buildFeatState(prog, r.charLevel);
      const eligible = Engine.eligibleFeatsForSlot(DATA.feats.feats, slot.pool, fstate, DATA.bonusPools)
        .sort((a, b) => a.name.localeCompare(b.name));
      const current = state.featChoices[slotKey] || '';
      const opts = `<option value="">— choose (${eligible.length} eligible) —</option>` +
        eligible.map(f => `<option value="${f.id}" ${String(f.id) === String(current) ? 'selected' : ''}>${f.name}</option>`).join('');
      const chosen = eligible.find(f => String(f.id) === String(current)) ||
        DATA.feats.feats.find(f => String(f.id) === String(current));
      html += `<div class="feat-slot">
        <div class="tag">${slot.pool}${slot.source === 'human' ? ' — human bonus' : ''}</div>
        <select data-slot="${slotKey}" class="featSel mt8">${opts}</select>
        ${chosen ? `<div class="h-note" style="white-space:pre-wrap; margin:6px 0 0 0;">${chosen.description}</div>` : ''}
      </div>`;
    });
  });
  container.innerHTML = html || '<p class="h-note">No feat slots yet — set up your level table above.</p>';
  container.querySelectorAll('.featSel').forEach(sel => {
    sel.addEventListener('change', e => {
      state.featChoices[e.target.dataset.slot] = e.target.value;
      renderAll();
    });
  });
}

/* ---------------- SKILLS ---------------- */

function renderSkills(prog) {
  const finals = finalAbilities();
  const intMod = Engine.abilityModifier(finals.INT);
  const totalPts = Engine.totalSkillPoints(prog, intMod);
  const classSkills = Engine.classSkillSet(DATA.classes.classes, state.levels);
  const charLevel = state.levels.length;

  let spent = 0;
  const body = document.getElementById('skillBody');
  body.innerHTML = DATA.skills.skills.map(sk => {
    const isClass = classSkills.has(sk.name);
    const max = Engine.maxRanks(charLevel, isClass);
    const ranks = Math.min(state.skillRanks[sk.name] || 0, max);
    state.skillRanks[sk.name] = ranks;
    spent += isClass ? ranks : ranks * 2;
    const abilMod = Engine.abilityModifier(finals[sk.keyAbility]);
    return `<tr class="stripe">
      <td>${sk.name}${sk.unconfirmed ? ' <span class="pill warn">unconfirmed</span>' : ''}</td>
      <td class="num">${sk.keyAbility}</td>
      <td class="num">${isClass ? 'Class' : 'Cross'}</td>
      <td class="num"><input type="number" min="0" max="${max}" value="${ranks}" data-skill="${sk.name}" style="width:50px;text-align:center;"></td>
      <td class="num">${max}</td>
      <td class="num">${fmt(abilMod)}</td>
      <td class="num" style="color:var(--brass-bright);font-weight:600;">${fmt(ranks + abilMod)}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('input[data-skill]').forEach(inp => {
    inp.addEventListener('input', e => {
      state.skillRanks[e.target.dataset.skill] = parseInt(e.target.value || '0', 10);
      renderAll();
    });
  });

  document.getElementById('skillPtsTotal').textContent = totalPts;
  document.getElementById('skillPtsSpent').textContent = spent;
  const rem = totalPts - spent;
  const remEl = document.getElementById('skillPtsRemaining');
  remEl.textContent = rem;
  remEl.style.color = rem < 0 ? 'var(--bad)' : 'var(--brass-bright)';
}

/* ---------------- SUMMARY ---------------- */

function renderSummary(prog) {
  const last = prog[prog.length - 1];
  const finals = finalAbilities();
  document.getElementById('sumBAB').textContent = fmt(last.bab);
  document.getElementById('sumFort').textContent = fmt(last.fort);
  document.getElementById('sumRef').textContent = fmt(last.ref);
  document.getElementById('sumWill').textContent = fmt(last.will);

  const conMod = Engine.abilityModifier(finals.CON);
  const totalHP = prog.reduce((s, r) => s + r.hpThisLevel + conMod, 0);
  document.getElementById('sumHP').textContent = totalHP;
  document.getElementById('sumAC').textContent = 10 + Engine.abilityModifier(finals.DEX);

  const totalEcl = Engine.totalEcl(DATA.races, state.raceGroup, state.subrace, state.saltborneApplied);
  document.getElementById('sumECL').textContent = 6 + totalEcl;
  document.getElementById('sumFeats').textContent = Object.values(state.featChoices).filter(Boolean).length;
}

/* ---------------- MASTER RENDER ---------------- */

function renderAll() {
  renderCharacter();
  renderRace();
  renderAbilities();
  const prog = renderLevels();
  renderFeats(prog);
  renderSkills(prog);
  renderSummary(prog);
}

window.addEventListener('DOMContentLoaded', init);
