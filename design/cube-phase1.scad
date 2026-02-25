// ============================================================
// CUBE Phase 1 — PLA Prototype Enclosure (Simplified)
// ============================================================
// Parametric open-top enclosure for the CUBE personal AI server.
// Designed for FDM 3D printing in PLA or PETG.
//
// Board: NVIDIA Jetson Orin Nano Super Dev Kit
// Board footprint: 100mm × 79mm (mounting holes: 86mm × 58mm)
//
// Cutouts: fisheye camera (front), LED slot (front),
//          speaker grilles (both sides), USB-C power (rear)
//
// Usage:
//   1. Open in OpenSCAD (openscad.org)
//   2. Adjust parameters below as needed
//   3. Render (F6) then export as STL
//   4. Print: 0.2mm layer, 20% infill, no supports needed
// ============================================================

// ── RENDER CONTROL ───────────────────────────────────────────
render_part = "body";  // "body", "both"

// ── MAIN DIMENSIONS ──────────────────────────────────────────
outer_w  = 130;   // [mm] outer width  (X)
outer_d  = 130;   // [mm] outer depth  (Y / front-to-back)
outer_h  = 98;    // [mm] outer height (Z) — open-top box
wall     = 2.5;   // [mm] shell wall thickness
corner_r = 4;     // [mm] corner fillet radius

// ── CAMERA CUTOUT ────────────────────────────────────────────
cam_dia      = 30;    // [mm] fisheye lens cutout diameter (front)
cam_x_offset = -15;  // [mm] X offset from center (negative = left)
cam_y_offset = 10;   // [mm] Y offset from center (positive = up)

// ── SPEAKER GRILLE ───────────────────────────────────────────
spk_dot_dia  = 3.0;  // [mm] speaker grille hole diameter
spk_rows     = 5;
spk_cols     = 5;
spk_spacing  = 6.0;  // [mm] center-to-center
spk_x_offset = 0;    // [mm] center of grille pattern, X
spk_y_offset = 0;    // [mm] center of grille pattern, Y

// ── LED SLOT (front bottom) ──────────────────────────────────
led_slot_w   = 60;   // [mm] width of LED strip slot
led_slot_h   = 2.5;  // [mm] height of slot opening
led_y_offset = -25;  // [mm] from front face center (negative = down)

// ── BOARD STANDOFFS ──────────────────────────────────────────
// Jetson Orin Nano Dev Kit mounting holes
// Pattern origin: centered in the enclosure floor
standoff_h   = 6.0;   // [mm] standoff height
standoff_dia = 6.0;   // [mm] standoff outer diameter
standoff_id  = 3.2;   // [mm] M3 hole inner diameter
// Hole positions [x, y] relative to board center
standoff_pos = [
  [ 43,  29],   // front-right
  [-43,  29],   // front-left
  [ 43, -29],   // back-right
  [-43, -29],   // back-left
];

// ── POWER / USB CUTOUT (rear) ────────────────────────────────
// USB-C PD port opening in rear panel
pwr_w  = 12;   // [mm] cutout width
pwr_h  = 8;    // [mm] cutout height
pwr_y  = -12;  // [mm] from rear face center (up/down)

// ── RENDERING ────────────────────────────────────────────────

$fn = 64;

module rounded_box(w, d, h, r) {
  hull() {
    for (dx = [-1,1]) for (dy = [-1,1])
      translate([dx*(w/2-r), dy*(d/2-r), 0])
        cylinder(r=r, h=h, center=true);
  }
}

module shell_body() {
  difference() {
    rounded_box(outer_w, outer_d, outer_h, corner_r);
    // Hollow inside
    translate([0, 0, wall])
      rounded_box(
        outer_w - 2*wall,
        outer_d - 2*wall,
        outer_h,
        max(corner_r - wall, 1)
      );
    // Camera cutout (front face, -Y)
    translate([cam_x_offset, -(outer_d/2 + 1), cam_y_offset])
      rotate([90, 0, 0])
        cylinder(d=cam_dia, h=wall*3, center=true);

    // LED slot (front face)
    translate([0, -(outer_d/2 + 1), led_y_offset])
      rotate([90, 0, 0])
        cube([led_slot_w, led_slot_h, wall*3], center=true);

    // Speaker grille (left face, -X)
    for (r = [0:spk_rows-1]) for (c = [0:spk_cols-1]) {
      sx = spk_x_offset + (c - (spk_cols-1)/2) * spk_spacing;
      sy = spk_y_offset + (r - (spk_rows-1)/2) * spk_spacing;
      translate([-(outer_w/2 + 1), sx, sy - outer_h/4])
        rotate([0, 90, 0])
          cylinder(d=spk_dot_dia, h=wall*3, center=true);
    }

    // Speaker grille (right face, +X)
    for (r = [0:spk_rows-1]) for (c = [0:spk_cols-1]) {
      sx = spk_x_offset + (c - (spk_cols-1)/2) * spk_spacing;
      sy = spk_y_offset + (r - (spk_rows-1)/2) * spk_spacing;
      translate([(outer_w/2 + 1), sx, sy - outer_h/4])
        rotate([0, 90, 0])
          cylinder(d=spk_dot_dia, h=wall*3, center=true);
    }

    // Power/USB-C rear cutout (+Y)
    translate([-(outer_w/4), outer_d/2 + 1, pwr_y])
      rotate([90, 0, 0])
        cube([pwr_w, pwr_h, wall*3], center=true);
  }
}

module standoffs() {
  z_bottom = -(outer_h)/2 + wall;
  for (pos = standoff_pos) {
    translate([pos[0], pos[1], z_bottom])
      difference() {
        cylinder(d=standoff_dia, h=standoff_h);
        cylinder(d=standoff_id, h=standoff_h + 1);
      }
  }
}

// ── HELPER ───────────────────────────────────────────────────
module body_assembly() {
  shell_body();
  standoffs();
}

// ── MAIN OUTPUT ──────────────────────────────────────────────
// Body: centered geometry spans z = -outer_h/2 .. +outer_h/2
// For printing, shift so floor sits at z=0.
if (render_part == "body") {
  translate([0, 0, (outer_h)/2])
    body_assembly();
}

// Both: visual preview, unshifted (body centered)
if (render_part == "both") {
  body_assembly();
}
