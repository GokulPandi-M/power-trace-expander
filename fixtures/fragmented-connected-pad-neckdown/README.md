# Fragmented connected pad neckdown

This fixture isolates a terminal-width regression at the power trace expander's
SRJ boundary. Three adjacent obstacle rectangles share the same
`pcb_smtpad_fragmented` identity and therefore represent one physical copper
pad. Their union is 0.30 mm tall, so the configured 0.15 mm minimum trace fits
around the terminal at `(0, 0.01)`.

The current clearance repair measures only the 0.10 mm-tall rectangle that
contains the terminal. Because the terminal is 0.01 mm off that fragment's
centerline, the calculated diameter is 0.08 mm and the expander applies that
width even though the adjacent fragments are continuous same-pad copper.

This is synthetic, board-independent SRJ, so the reproduction does not depend
on a TSX component, imported footprint, or the autorouter pipeline. The input
matches Core's SRJ encoding for a non-axis-aligned polygon pad: the polygon is
filled with 0.10 mm-tall rectangles and every rectangle keeps the original
`pcb_smtpad_id` in `connectedTo`.
