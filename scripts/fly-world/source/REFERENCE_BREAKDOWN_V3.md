# Fly House v0.3 — Reference Breakdown

## Canonical visual target

The canonical target is the approved people-free illustrated cottage interior. The objective is not a generic rustic room inspired by it. The visible room should read as the same house: the same dominant silhouettes, approximate relative placement, density, textile language and warm worn atmosphere. Unseen geometry may be completed plausibly, but the reference-facing composition takes priority.

The room is intentionally slightly larger than the drawing implies so the observer and later fly simulation have enough navigable volume. This enlargement must not turn the house into a sparse modern room.

## Composition anchors

The following anchors should be recognizable immediately from a wide view:

- left barred window with decorative iron flourishes, white lace curtain, heavy red/brown floral curtain, curtain rail, wall clock and a low cage/water-bottle detail beside the window;
- long reddish carved divan/cabinet wall with green/red/mixed pillows, patchwork textile and a busy cabinet-top still life;
- old CRT/radiogram cabinet on the front-left edge, including a lower shelf/cabinet, cups, lace/doily and a small blue ornament;
- central dark wood stove on a raised hearth, open fire window, kettle, long vertical-to-horizontal flue, tools, hanging laundry and a small suspended ornament;
- layered floor textiles: broad worn green carpet, warm geometric runner and round multicolour rug;
- dense but intentional floor clutter: basket/yarn, blue bag, notebook, small toys, loose yarn, marbles, slippers, orange ball and knitting bag;
- thick dark wood casing around the open bedroom doorway with one small portrait above the opening;
- bedroom visible through the doorway with a red/patchwork bed, pillows, bedside table/lamp, books, plants, rug, basket/folded bedding and continuing storage.

## Main-room object inventory

### Window / left wall

Keep the window opening broad and vertically readable. The iron grille must remain a strong dark graphic layer and should include the diagonal/decorative character visible in the reference rather than reading as a plain square security grid. Use both curtain layers rather than a single flat panel. The old round wall clock sits between the curtain/window area and the long cabinet wall. The cage is a low object beside the window, with a pale-blue water-bottle detail; it should not float high on the wall.

### Divan / carved cabinet wall

The divan and carved wall furniture are the largest reference-specific furniture mass. They must not read as a plain rectangular sofa. Use panel overlays, rosette/carved suggestions, cornice/post rhythm and several mismatched pillows. The cabinet top should carry books, a lace runner, fruit bowl, framed picture, blue decorative ball/globe and smaller household objects. These secondary objects are important because the reference is visually dense.

### CRT / front-left cabinet

The old TV/radiogram area needs a tall wooden cabinet silhouette, CRT screen, knobs/louvers, lower dark open shelf and a few cups or glasses. A lace/doily and small blue ceramic/animal-like ornament sit on top. This corner should no longer look like one box with a screen pasted onto it.

### Stove / flue

The stove is a visual and future sensory landmark. It sits on a light raised hearth. Preserve the dark metal body, visible fire, kettle and unusually long flue path. Add ash pan, poker/tongs and nearby hanging laundry. The white/mustard cloths beside the flue are visible reference details and help the stove zone read correctly.

### Floor / foreground

The reference is not a bare-floor room. A broad muted green carpet sits under much of the living area, with the patterned runner and round textile layered over it. Clutter must be clustered where the drawing places visual activity instead of being scattered randomly. Include recognizable small forms such as notebook, toy/whistle, toy car/block forms, yarn ball, marbles, slippers, blue bag, yarn basket, orange ball and green knitting bag with needles.

### Walls

Use restrained plaster variation, shallow scars and stains. The walls should look old and lived-in, not ruined. The main wall above the long cabinet is mostly bare cracked plaster; do **not** invent a gallery row there. The visible wall art is sparse and specific: the round clock near the window, a small portrait above the bedroom opening, the tulip vase/switch at the right edge, plus bedroom art visible through the doorway. Avoid adding architecture that changes the identity of the room; the v0.2 heavy ceiling beams were removed because the reference reads as a plain low ceiling rather than a timber-hall interior.

## Bedroom continuation

Only part of the adjacent room is visible in the original source, so visible elements remain canonical and unseen portions are plausible continuation rather than asserted reconstruction. Keep the bed and warm patterned quilt dominant from the doorway. The approved secondary extension reference adds a window/curtain, bedside table and warm lamp, clock/small objects, books/shelves, trailing plants, rug, basket with folded bedding and continued storage. The room must share the same worn wood/textile/plaster language as the living room.

## Scale and navigation

The current target footprint is approximately:

- main room: 9.6 m × 8.0 m × 2.85 m;
- connected bedroom: 5.0 m × 6.2 m × 2.85 m.

This is deliberately roomier than v0.1 while keeping the furniture density high. The observer uses collision by default. Walls, glass/window barriers, doorway casing, stove/hearth and major furniture should block the observer. `N` is a debug-only noclip toggle. “Ghost observer” means the human observer is invisible to future fly sensors and does not affect fly physics; it does **not** mean the visitor should pass through walls during normal use.

## Browser / Blender parity

The browser fallback and Blender scene are two representations of the same reference pass:

- browser fallback: `frontend/labs/fly-world/main-v3.js` + `reference-dressing.js`;
- Blender: `scripts/fly-world/build_scene_v3.py` + `detail_pass_v3.py`;
- Blender GLB runtime: `frontend/labs/fly-world/glb-runtime-v3.js`.

Fly World is a Z-up runtime. The v0.3 Blender builder exports with `export_yup=false` so camera, collision and scene coordinates do not silently rotate between fallback and GLB modes.

## Visual approval

A code-valid or strict-validator-green build is not automatically visually approved. Run the Blender pipeline and review all five fixed cameras plus a live walkthrough. The reference-wide view should be compared against the approved illustration first. Specifically reject: a generic wall-gallery treatment, a high/floating cage, missing layered rugs, an empty cabinet top, a simplified TV cube, a stove without hearth/tools/laundry, or a sparse bedroom. If the scene still reads as “a rustic room” rather than this particular illustrated house, continue iterating before adding the fly/connectome simulation.
