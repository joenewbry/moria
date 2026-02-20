// ============================================================
// CUBE Phase 1 — PLA Prototype Enclosure
// ============================================================
// Parametric enclosure for the CUBE personal AI server.
// Designed for FDM 3D printing in PLA or PETG.
//
// Board: NVIDIA Jetson Orin Nano Super Dev Kit
// Board footprint: 100mm × 79mm (mounting holes: 86mm × 58mm)
//
// Usage:
//   1. Open in OpenSCAD (openscad.org)
//   2. Adjust parameters below as needed
//   3. Render (F6) then export as STL
//   4. Print: 0.2mm layer, 20% infill, no supports needed
//      (except for lid snap-fit tabs if using snap_lid=true)
//
// Parts: render BODY and LID separately.
//   Set render_part = "body" or "lid"
// ============================================================

// ── RENDER CONTROL ───────────────────────────────────────────
render_part = "body";  // "body", "lid", "both"

// ── MAIN DIMENSIONS ──────────────────────────────────────────
outer_w  = 130;   // [mm] outer width  (X)
outer_d  = 130;   // [mm] outer depth  (Y / front-to-back)
outer_h  = 80;    // [mm] outer height (Z)
wall     = 2.5;   // [mm] shell wall thickness
corner_r = 4;     // [mm] corner fillet radius

// ── LID OPTION ───────────────────────────────────────────────
lid_h          = 12;    // [mm] lid depth (removes from body height)
snap_lid       = true;  // true = snap-fit tabs; false = M3 screws
snap_tab_count = 4;     // tabs per long side (snap_lid=true)
screw_dia      = 3.4;   // [mm] M3 clearance hole (snap_lid=false)

// ── VENTILATION ──────────────────────────────────────────────
vent_w       = 2.0;   // [mm] louver slot width
vent_h       = 30;    // [mm] louver slot height
vent_spacing = 4.0;   // [mm] center-to-center slot spacing
vent_cols    = 8;     // slots per vent panel
vent_offset  = 10;    // [mm] from top of side panel

// ── CAMERA CUTOUT ────────────────────────────────────────────
cam_dia      = 38;    // [mm] camera lens cutout diameter (front)
cam_x_offset = -15;  // [mm] X offset from center (negative = left)
cam_y_offset = 10;   // [mm] Y offset from center (positive = up)

// ── SPEAKER GRILLE ───────────────────────────────────────────
spk_dot_dia  = 3.0;  // [mm] speaker grille hole diameter
spk_rows     = 5;
spk_cols     = 5;
spk_spacing  = 6.0;  // [mm] center-to-center
spk_x_offset = 0;    // [mm] center of grille pattern, X
spk_y_offset = 0;    // [mm] center of grille pattern, Y

// ── FAN MOUNT (top) ──────────────────────────────────────────
fan_size        = 40;    // [mm] 40mm fan
fan_screw_pitch = 32;    // [mm] M3 mounting hole spacing
fan_center_x    = 0;     // [mm] fan center X from top-center
fan_center_y    = 0;     // [mm] fan center Y from top-center

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

// Ethernet cutout
eth_w  = 18;
eth_h  = 14;
eth_y  = 6;

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
    rounded_box(outer_w, outer_d, outer_h - lid_h, corner_r);
    // Hollow inside
    translate([0, 0, wall])
      rounded_box(
        outer_w - 2*wall,
        outer_d - 2*wall,
        outer_h - lid_h,
        max(corner_r - wall, 1)
      );
    // Open top
    translate([0, 0, (outer_h - lid_h)/2 + 0.1])
      cube([outer_w, outer_d, outer_h], center=true);

    // Camera cutout (front face, -Y)
    translate([cam_x_offset, -(outer_d/2 + 1), cam_y_offset])
      rotate([90, 0, 0])
        cylinder(d=cam_dia, h=wall*3, center=true);

    // LED slot (front face)
    translate([0, -(outer_d/2 + 1), led_y_offset])
      rotate([90, 0, 0])
        cube([led_slot_w, led_slot_h, wall*3], center=true);

    // Vent slots (right face, +X)
    for (i = [0:vent_cols-1]) {
      x_pos = -(vent_cols * vent_spacing / 2) + i * vent_spacing + vent_spacing/2;
      translate([outer_w/2 + 1, x_pos, (outer_h - lid_h)/2 - vent_offset - vent_h/2])
        rotate([0, 90, 0])
          cube([vent_h, vent_w, wall*3], center=true);
    }

    // Vent slots (left face, -X, mirrored)
    for (i = [0:vent_cols-1]) {
      x_pos = -(vent_cols * vent_spacing / 2) + i * vent_spacing + vent_spacing/2;
      translate([-(outer_w/2 + 1), x_pos, (outer_h - lid_h)/2 - vent_offset - vent_h/2])
        rotate([0, 90, 0])
          cube([vent_h, vent_w, wall*3], center=true);
    }

    // Speaker grille (left face, -X)
    for (r = [0:spk_rows-1]) for (c = [0:spk_cols-1]) {
      sx = spk_x_offset + (c - (spk_cols-1)/2) * spk_spacing;
      sy = spk_y_offset + (r - (spk_rows-1)/2) * spk_spacing;
      translate([-(outer_w/2 + 1), sx, sy - (outer_h-lid_h)/4])
        rotate([0, 90, 0])
          cylinder(d=spk_dot_dia, h=wall*3, center=true);
    }

    // Power/USB-C rear cutout (+Y)
    translate([-(outer_w/4), outer_d/2 + 1, pwr_y])
      rotate([90, 0, 0])
        cube([pwr_w, pwr_h, wall*3], center=true);

    // Ethernet rear cutout
    translate([(outer_w/4), outer_d/2 + 1, eth_y])
      rotate([90, 0, 0])
        cube([eth_w, eth_h, wall*3], center=true);
  }
}

module standoffs() {
  z_bottom = -(outer_h - lid_h)/2 + wall;
  for (pos = standoff_pos) {
    translate([pos[0], pos[1], z_bottom])
      difference() {
        cylinder(d=standoff_dia, h=standoff_h);
        cylinder(d=standoff_id, h=standoff_h + 1);
      }
  }
}

module fan_mount() {
  // Fan opening in top panel
  translate([fan_center_x, fan_center_y, (outer_h - lid_h)/2])
    cylinder(d=fan_size - 4, h=wall*2 + 2, center=true);
  // Screw holes
  for (dx = [-1,1]) for (dy = [-1,1]) {
    translate([fan_center_x + dx*fan_screw_pitch/2,
               fan_center_y + dy*fan_screw_pitch/2,
               (outer_h - lid_h)/2])
      cylinder(d=3.4, h=wall*2 + 2, center=true);
  }
}

module snap_tabs() {
  tab_l = 12; tab_h = 3; tab_t = 1.5;
  z = (outer_h - lid_h)/2;
  // Front and back
  for (sign = [-1, 1]) {
    translate([sign * outer_w/2 - sign * (wall + tab_t/2), 0, z - tab_h/2])
      cube([tab_t, tab_l, tab_h], center=true);
  }
}

module screw_posts() {
  z = (outer_h - lid_h)/2;
  for (dx = [-1,1]) for (dy = [-1,1]) {
    translate([dx*(outer_w/2 - wall - 4), dy*(outer_d/2 - wall - 4), z - 5])
      difference() {
        cylinder(d=7, h=5);
        cylinder(d=screw_dia, h=5 + 1);
      }
  }
}

module lid() {
  difference() {
    // Lid shell
    union() {
      translate([0, 0, 0])
        rounded_box(outer_w, outer_d, lid_h, corner_r);
      // Fan cutout cover (mesh pattern on lid top) - just solid here
    }
    // Hollow inside (skirt that fits into body)
    translate([0, 0, -lid_h/2 + wall])
      rounded_box(
        outer_w - 2*wall - 0.4,
        outer_d - 2*wall - 0.4,
        lid_h,
        max(corner_r - wall, 1)
      );
    // Fan opening
    cylinder(d=fan_size - 4, h=lid_h + 2, center=true);
    // Fan screws
    for (dx = [-1,1]) for (dy = [-1,1])
      translate([fan_center_x + dx*fan_screw_pitch/2,
                 fan_center_y + dy*fan_screw_pitch/2, 0])
        cylinder(d=3.4, h=lid_h + 2, center=true);
  }
}

// ── MAIN OUTPUT ──────────────────────────────────────────────
if (render_part == "body" || render_part == "both") {
  difference() {
    union() {
      shell_body();
      standoffs();
      if (snap_lid) snap_tabs();
      else screw_posts();
    }
    // fan/vent in top — removed from body if lid covers it
  }
}

if (render_part == "lid") {
  translate([0, 0, outer_h])
    lid();
}

if (render_part == "both") {
  translate([0, 0, outer_h + 10])
    lid();
}
