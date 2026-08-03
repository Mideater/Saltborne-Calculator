# The Saltborne Ledger

A build calculator for **Haze: Saltborne**'s E6 ruleset (character levels 1–6).
Plan out a race, class progression, feats, and skills before you commit to a
build in-game — all the math (BAB, saves, skill points, feat eligibility) is
done for you.

This is a fan-made tool, built from the wiki and the server's own feat data.
It isn't official and isn't affiliated with the Haze team. Always
double-check anything important against the live wiki or in-game before you
spend real character build points on it.

## Using it

Open `index.html` in the repo (or your GitHub Pages link, if the person who
gave you this has one set up) — it runs entirely in your browser, nothing to
install. Everything updates live as you make choices.

**Character** — name, alignment, and (if you're building a Cleric) a deity
and domain pair. Picking a deity filters the domain list down to only what
that deity actually offers.

**Race & Subrace** — pick a race group, then a subrace. The info box below
shows ability score modifiers, ECL cost, EP cost (if it's an Eminence-Point
locked subrace), and racial traits. Subraces marked "Check in-game" have
ability scores that weren't fully confirmed against the wiki — verify before
you commit to one. If your subrace is eligible, a checkbox appears letting
you apply the **Saltborne** template on top of it (only available on Human
(unspecified), Moon Elf, Shield Dwarf, Rock Gnome, Lightfoot Halfling,
Half-Orc, and the three non-EP Half-Elf variants).

**Ability Scores** — standard point-buy, with a pool you can adjust if your
server uses a different total than 30. Use the +/− buttons on each stat.
The "Final" column already includes your racial (and Saltborne, if applied)
modifiers.

**Classes & Level Progression** — pick a class for each of your six
character levels. The table fills in BAB, saves, HP, and skill points as you
go, using proper 3.5-style multiclass stacking (each class contributes based
on how many levels you've taken in it, not your total character level).

*HP works like this:* levels 1–3 always give you maximum hit points
automatically. From level 4 on, you roll in-game — type what you rolled
into the box, and if it comes in under half your hit die (rounded up), the
calculator raises it to that guaranteed floor for you, matching the
server's actual rule. Leave it blank and it assumes the floor.

**Feats** — every feat slot you've earned (general feats at levels 1/3/6,
plus each class's own bonus-feat slots) shows a dropdown of everything you
currently qualify for, checked against real prerequisites — ability scores,
BAB, class level, and required prior feats. Racial traits, other classes'
automatic features, and stuff you already have for free (like armor
proficiencies your class grants automatically) won't clutter the list.

**Skills** — ranks are tracked as one pool against your total earned skill
points. Max ranks and point cost both depend on whether a skill is a class
skill for anything you've taken.

**Summary** — sits in the sidebar the whole time so you don't have to
scroll back up to check your totals.