# Handoff: WiwonAnant TRPG Encyclopedia

## ⚠️ READ THIS FIRST — DO NOT REDESIGN

The previous attempt to turn this into a website **changed the design beyond recognition**. That must not happen again.

**Your job is to reproduce this design EXACTLY as-is** — same layout, colors, fonts, spacing, copy, icons, and interactions. This is a **high-fidelity, final design**. Treat every pixel, color hex, and Thai/English string as a spec, not a suggestion.

Rules:
- **Do NOT** invent new layouts, "improve" spacing, swap fonts, restyle components, change colors, or reorganize screens.
- **Do NOT** substitute your own component library's default styling. Match the visuals in the reference file precisely.
- **Do NOT** rewrite copy (Thai and English text is intentional — keep it verbatim).
- If something is ambiguous, open `WiwonAnant.reference.html` in a browser and match what you see. When in doubt, replicate — never reinterpret.
- Keep behavior identical. If you must choose a framework, that's fine — but the **rendered result must look and behave the same**.

## About the Design Files

The files in this bundle are a **design reference created in HTML** — a working prototype showing the intended look and behavior. They are **not** meant to be the final production architecture; the task is to **recreate this exact design** inside your target codebase (React, Vue, SvelteKit, etc.) using its patterns — while preserving the appearance and behavior 1:1.

- `WiwonAnant.reference.html` — **the source of truth.** A single self-contained file. Open it directly in any browser (no server needed) to see and click the real design. Match this exactly.
- `WiwonAnant.dc.html` — the authored source. It is a "Design Component": an HTML template (markup with `{{ }}` holes) plus one JavaScript class (`class Component extends DCLogic`) holding all logic/state. Read this to understand structure, state, and handlers.
- `support.js` — the small runtime that renders the `.dc.html`. You do not need to port this; it only matters if you want to run `WiwonAnant.dc.html` directly. Use it as reference for how the template binding works, nothing more.

### How to read `WiwonAnant.dc.html`
- Everything between `<x-dc>` … `</x-dc>` is the **markup template**. Styling is **all inline `style="..."`** — those inline styles ARE the design spec; copy them.
- `{{ path }}` are data holes; `<sc-for list>` = list loop; `<sc-if value>` = conditional. Handlers like `onClick="{{ fn }}"` map to methods on the logic class.
- The `<script data-dc-script>` block at the bottom is the **logic class** — all state (`this.state`), computed values (`renderVals()`), and event handlers live there. This is your behavior spec.
- Section markers like `<!-- ===== TOP NAV ===== -->`, `<!-- HOME -->`, `<!-- CATALOG -->`, `<!-- PRAY TO THE CREATOR -->` divide the screens.

## Fidelity

**High-fidelity (hifi).** Final colors, typography, spacing, and interactions. Recreate pixel-perfectly.

## Persistence model (important)

The prototype stores ALL data in the browser's **localStorage** (keys prefixed `wiwon_`, e.g. `wiwon_auth`, `wiwon_homebrew`, `wiwon_officialadded`, `wiwon_pray`, `wiwon_comments`, `wiwon_credits`, `wiwon_characters`, `wiwon_docs`). There is **no backend**. Cross-tab sync is done via the `storage` event.

For a real app you will likely replace localStorage with a real backend/DB. That is expected and allowed — but **the UI, screens, and behavior must stay identical**. Keep the same data shapes so the UI logic ports cleanly.

## Screens / Views

All screens live in one app shell with a sticky top nav. Routes are driven by `this.state.route`.

1. **Top Nav** (`<!-- TOP NAV -->`) — sticky header. Left: diamond logo + "WiwonAnant". Center: nav buttons (Home, Core Rules, Wiwon, Characters, Magic & Feature, Equipment & Items, Monster & Organism, Pray to the Creator). Right: search box, notification bell, **Cr. credit badge**, profile avatar (or Login). Active nav item = dark pill (`#15140f` bg, white text). The nav is tuned to fit one line — do not enlarge paddings/fonts.
2. **Home** (`route: 'home'`) — hero, Suggested/Trending/Latest lists, **Our Homebrew** list (only the logged-in user's homebrew), and a **community comments** board (login required to post; author can edit; author or dev can delete).
3. **Category pages** (Core Rules, Wiwon, Characters) — article grids + article reader with a markdown-lite body, editable sticky notes, and editable tables.
4. **Catalog pages** — three catalogs sharing one layout: **Magic & Feature**, **Equipment & Items**, **Monster & Organism**. Left = filter/scope panel + list table (paginated, **15 rows/page**); right = detail card. Magic list shows a **School** front-badge on the name; the Magic Slot cell shows `POE` when the value is "A particle of Ehen". Magic detail card has 3 prominent stat boxes (**Magic Slot / Quality of Life / Knowledge**); Equipment & Monster use the plain stat list.
5. **Character sheet & creation** (`Characters`) — multi-step wizard + full sheet (attributes with Ego dice, skills, Action Points, Ehen, Sanity, inventory, dice roller with memory log, etc.).
6. **Pray to the Creator** (`route: 'pray'`) — two-way mail between users and the developer. Users send requests; devs reply, notify-to-edit, and **approve** homebrew → Official (awards Cr., adds a 🌙 moon badge on the approved item's detail card left edge). Unread badge on the nav.

## Design Tokens (exact)

Colors:
- Ink / primary text & dark buttons: `#15140f`
- Page background: `#f2f1ee`
- Card background: `#ffffff`
- Card border: `#e4e2dc`; hairline divider: `#f0eee9` / `#ece9e3`
- Muted text: `#8d8a82`; faint text: `#a8a59d` / `#cbc8c0`
- Body text: `#46443c` / `#2c2a23`
- Accent coral (avatar, highlights): `#e07a5f`; deep coral text: `#c0432a`
- Purple (dev / official / moon): `#5b3fa0`, light `#ede7f6`, mid `#7c5fc0`
- Green (success/approved/proficiency): `#2f6b4f`, light `#eaf3ed`/`#e8f3ec`
- Blue (fortuity/knowledge): `#2a6fdb`, light `#e5edfb`
- Amber/gold (Cr. credits, sticky notes): `#a8760f` text, `#e6c98a` border, gradient `#fbf0d8→#f6e3b8`; note paper `repeating-linear-gradient(#fffdf2, #fffdf2 29px, #f4eccf 30px)`
- Warn/danger: `#b4513a` / `#cb5a44`, bg `#fbeae6`, border `#f0d3cb`

Typography:
- Body/UI: **Anuphan** (Google Fonts, weights 200–700). Supports Thai + Latin.
- Display/serif headings: **Newsreader** (Google Fonts).
- Common sizes: nav 11.5px; body 13–14px; section headings 17px; card titles 14–18px; hero title ~32px.

Radius: pills 30px; cards 14–16px; inputs/buttons 8–10px; small chips 5–7px.
Shadows: modals `0 24px 60px rgba(0,0,0,.34)`; soft cards `0 6px 18px rgba(180,150,60,.16)` (notes).
Keyframes: `fadeIn` (opacity), `fadeUp` (opacity+translateY 8px).

## Interactions & Behavior
- **Auth / roles**: `user` vs `dev`. Dev mode unlocks editing catalog entries, approving requests, deleting comments/messages. Reproduce the exact gating.
- **Pagination**: catalog tables show 15 rows/page with prev/next + numbered pages; resets to page 1 on search/filter/category change.
- **Read more**: long detail descriptions collapse with a mask + "อ่านเพิ่มเติม ▼ / ย่อกลับ ▲" toggle.
- **Cr. credits**: badge by profile; daily claim (+3, resets at 3 AM local); dev sets an award amount when approving a request → credited to the requester.
- **Approve flow**: dev opens a REQUEST in Pray → sees the submitted item's data → "🌙 อนุมัติ · ลง Official" moves item from homebrew to officialAdded, flags `approved`, auto-messages the user, awards Cr., adds the moon badge (left edge of detail card + beside the list name).
- **Cross-tab sync**: `storage` event listener refreshes `wiwon_pray`, `wiwon_officialadded`, `wiwon_homebrew`.
- All hover states are defined via `style-hover` in the template — match them.

## Assets
- Fonts: Google Fonts **Anuphan** + **Newsreader** (loaded via `<link>` in `<helmet>`). No other external assets required by the design.
- All icons are inline Unicode/emoji or CSS shapes — no icon library.
- User reference PDFs/screenshots (rulesets, content) live in the project's `uploads/` folder (not included here; ask the owner if needed).

## Files in this bundle
- `WiwonAnant.reference.html` — self-contained, browser-openable. **Match this exactly.**
- `WiwonAnant.dc.html` — authored template + logic class (structure & behavior spec).
- `support.js` — the DC runtime (reference only; not required to port).
