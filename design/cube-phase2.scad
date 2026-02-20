// ============================================================
// CUBE Phase 2 — Aluminum / Stainless Steel Production Geometry
// ============================================================
// Parametric enclosure for the CUBE Phase 2 production unit.
// Intended for:
//   • CNC machining in 6061-T6 aluminum (primary)
//   • DMLS metal 3D printing in 316L stainless steel (premium)
//
// Manufacturing notes:
//   CNC aluminum (6061-T6):
//     - Min internal corner radius: 1mm (adjust corner_r accordingly)
//     - Camera aperture: bore with 0.01mm tolerance for sapphire seat
//     - LED ring channel: 1mm ball end mill, 3mm wide × 1mm deep
//     - M3 screw posts: tapped M3×0.5, 6mm depth minimum
//     - Surface: bead blast then Type III hard anodize or brushed
//
//   DMLS stainless (316L):
//     - Min wall: 0.8mm (we use 2mm for rigidity)
//     - Support removal: LED ring channel may need EDM finishing
//     - Surface: tumble polish then mirror electropolish
//     - Heat treat: stress relieve at 650°C before finish machining
//
// Board: Jetson Orin Nano SOM on custom 50×50mm carrier PCB
// PCB mounting: M3 screws, 35×35mm square pattern
// ============================================================

// ── RENDER CONTROL ───────────────────────────────────────────
render_part = "body";   // "body", "body_bottom", "both_halves"
// Note: Phase 2 is a clamshell — top and bottom halves

// ── MAIN DIMENSIONS ──────────────────────────────────────────
size         = 50.0;   // [mm] cube outer dimension (all sides equal)
wall         = 2.0;    // [mm] wall thickness
chamfer      = 2.0;    // [mm] chamfer size on all 12 edges
split_z      = 25.0;   // [mm] Z height of clamshell split line

// ── CAMERA APERTURE (front face) ─────────────────────────────
cam_dia       = 12.0;  // [mm] lens clear aperture diameter
cam_glass_dia = 12.4;  // [mm] sapphire glass seat outer diameter
cam_glass_d   = 0.8;   // [mm] sapphire glass thickness seat depth
cam_x         = -5.0;  // [mm] X offset from face center
cam_y         = 5.0;   // [mm] Y offset from face center (positive = up)

// ── LED RING CHANNEL ─────────────────────────────────────────
// Circular channel around the camera aperture for LED ring
led_r         = 8.0;   // [mm] LED ring center radius from cam center
led_channel_w = 3.0;   // [mm] channel width
led_channel_d = 1.0;   // [mm] channel depth into front face

// ── PCB MOUNTING (internal) ──────────────────────────────────
// 35×35mm M3 bolt circle, on interior floor
pcb_mount_pitch = 35.0;  // [mm] square bolt pattern pitch
pcb_standoff_h  = 4.0;   // [mm] standoff height from floor
pcb_standoff_od = 5.0;   // [mm] standoff outer diameter
pcb_thread_d    = 2.5;   // [mm] M3 tap drill diameter (tap M3×0.5)

// ── ALIGNMENT PINS (clamshell) ────────────────────────────────
pin_dia    = 2.0;   // [mm] alignment dowel pin diameter
pin_depth  = 5.0;   // [mm] depth of pin hole per half
pin_offset = 15.0;  // [mm] from center along edge

// ── CLAMSHELL FASTENERS ──────────────────────────────────────
// M3 flathead screws through bottom half into top half
clamp_screw_d     = 3.4;   // [mm] clearance hole for M3
clamp_screw_head  = 6.0;   // [mm] M3 flathead countersink diameter
clamp_screw_angle = 90;    // degrees (standard flathead)
clamp_pos = [              // [x, y] positions (relative to cube center)
  [ 18,  18],
  [-18,  18],
  [ 18, -18],
  [-18, -18],
];

// ── THERMAL VENTING ──────────────────────────────────────────
// Micro-perforations on rear face for passive convection
// (CNC: drill array; DMLS: printed-in holes)
vent_dia     = 1.5;   // [mm] vent hole diameter
vent_rows    = 6;
vent_cols    = 6;
vent_pitch   = 4.0;   // [mm] center-to-center
vent_enabled = true;

// ── RENDERING ────────────────────────────────────────────────

$fn = 96;

// Chamfered cube via hull of smaller cubes at corners
module chamfered_cube(s, c) {
  hull() {
    for (dx=[-1,1]) for (dy=[-1,1]) for (dz=[-1,1])
      translate([dx*(s/2-c), dy*(s/2-c), dz*(s/2-c)])
        sphere(r=c);
  }
}

module body_top() {
  difference() {
    // Upper half of chamfered cube
    intersection() {
      chamfered_cube(size, chamfer);
      translate([0, 0, split_z/2])
        cube([size+2, size+2, split_z], center=true);
    }

    // Hollow inside
    translate([0, 0, wall])
      cube([size - 2*wall, size - 2*wall, size], center=true);

    // Camera aperture (front face, -Y)
    // Through-bore at full diameter
    translate([cam_x, -(size/2 + 1), cam_y])
      rotate([90, 0, 0])
        cylinder(d=cam_dia, h=wall*2 + 2, center=true);

    // Sapphire glass seat (shallow counterbore)
    translate([cam_x, -(size/2) + cam_glass_d/2, cam_y])
      rotate([90, 0, 0])
        cylinder(d=cam_glass_dia, h=cam_glass_d + 0.01, center=true);

    // LED ring channel (concentric with camera)
    translate([cam_x, -(size/2) + led_channel_d/2, cam_y])
      rotate([90, 0, 0])
        difference() {
          cylinder(r=led_r + led_channel_w/2, h=led_channel_d + 0.01, center=true);
          cylinder(r=led_r - led_channel_w/2, h=led_channel_d + 1.0, center=true);
        }

    // Alignment pin holes (front and back edges of split plane)
    for (sign = [-1, 1]) {
      // Front edge pins
      translate([sign * pin_offset, -(size/2 - wall), 0])
        cylinder(d=pin_dia + 0.05, h=pin_depth * 2, center=true);
      // Back edge pins
      translate([sign * pin_offset, (size/2 - wall), 0])
        cylinder(d=pin_dia + 0.05, h=pin_depth * 2, center=true);
    }
  }
}

module body_bottom() {
  difference() {
    // Lower half of chamfered cube
    intersection() {
      chamfered_cube(size, chamfer);
      translate([0, 0, -(size - split_z)/2])
        cube([size+2, size+2, size - split_z], center=true);
    }

    // Hollow inside
    translate([0, 0, -wall])
      cube([size - 2*wall, size - 2*wall, size], center=true);

    // Clamshell screw clearance holes (countersunk from bottom)
    for (pos = clamp_pos) {
      translate([pos[0], pos[1], -(size/2)])
        union() {
          cylinder(d=clamp_screw_d, h=size);
          cylinder(d1=clamp_screw_head, d2=clamp_screw_d,
                   h=clamp_screw_head/2);
        }
    }

    // Alignment pin holes
    for (sign = [-1, 1]) {
      translate([sign * pin_offset, -(size/2 - wall), 0])
        cylinder(d=pin_dia + 0.05, h=pin_depth * 2, center=true);
      translate([sign * pin_offset, (size/2 - wall), 0])
        cylinder(d=pin_dia + 0.05, h=pin_depth * 2, center=true);
    }

    // Rear vent array (back face, +Y)
    if (vent_enabled) {
      for (r = [0:vent_rows-1]) for (c = [0:vent_cols-1]) {
        vx = (c - (vent_cols-1)/2) * vent_pitch;
        vz = -5 + (r - (vent_rows-1)/2) * vent_pitch;
        translate([vx, size/2 + 1, vz])
          rotate([90, 0, 0])
            cylinder(d=vent_dia, h=wall*2 + 2, center=true);
      }
    }

    // USB-C / power cutout (right side)
    translate([size/2 + 1, 0, -6])
      rotate([0, 90, 0])
        hull() {
          for (dx=[-1,1]) for (dy=[-1,1])
            translate([dx*4, dy*2.5, 0])
              cylinder(d=2.0, h=wall*2+2, center=true);
        }
  }

  // PCB standoffs on floor of bottom half
  z_floor = -(size/2 - wall);
  for (sign_x = [-1,1]) for (sign_y = [-1,1]) {
    translate([sign_x * pcb_mount_pitch/2,
               sign_y * pcb_mount_pitch/2,
               z_floor]) {
      difference() {
        cylinder(d=pcb_standoff_od, h=pcb_standoff_h);
        cylinder(d=pcb_thread_d, h=pcb_standoff_h + 0.5);
      }
    }
  }
}

// Tapped M3 screw bosses in top half (receive clamshell screws)
module screw_bosses() {
  boss_h = 8;
  boss_od = 6;
  boss_id = 2.5;  // tap drill for M3
  z = -(split_z/2);
  for (pos = clamp_pos) {
    translate([pos[0], pos[1], z])
      difference() {
        cylinder(d=boss_od, h=boss_h);
        cylinder(d=boss_id, h=boss_h + 0.5);
      }
  }
}

// ── MAIN OUTPUT ──────────────────────────────────────────────
if (render_part == "body") {
  union() {
    body_top();
    screw_bosses();
  }
}

if (render_part == "body_bottom") {
  body_bottom();
}

if (render_part == "both_halves") {
  // Top half in place
  union() {
    body_top();
    screw_bosses();
  }
  // Bottom half offset for display
  translate([0, 0, -(size + 10)])
    body_bottom();
}

// ── MANUFACTURING NOTES ─────────────────────────────────────
// (displayed as comments only — not rendered)
//
// CNC ALUMINUM (6061-T6):
//   - Machine top and bottom halves separately
//   - 3-axis CNC sufficient for basic geometry
//   - 5-axis recommended for cam aperture bore and LED ring
//   - Tolerance on split plane: ±0.05mm (lapping finish)
//   - Camera aperture: ream to H7 tolerance for sapphire press fit
//   - Thread all M3 holes: M3×0.5 × 6mm deep minimum
//   - Alignment pins: 2mm reamed holes, ±0.01mm tolerance
//   - Finish: bead blast (120 grit) then hard anodize Type III
//             or brushed (320 grit lineal) then clear anodize
//
// DMLS STAINLESS (316L):
//   - Print both halves in orientation shown
//   - Support removal: EDM or abrasive for internal channels
//   - Post-process: HIP (hot isostatic pressing) for density
//   - Machining after print: bore cam aperture + LED ring to tolerance
//   - Surface: tumble/vibratory polish → electropolish for mirror finish
//   - Note: DMLS steel will be ~2.7× heavier than aluminum version
//
// SAPPHIRE GLASS (camera aperture):
//   - Spec: 12.4mm OD × 0.7mm thick, VIS AR coated (both sides)
//   - Seat: 12.40 +0.00/-0.02mm bore, 0.8mm deep
//   - Adhesive: UV-cure optical adhesive (e.g. Norland NOA81)
//   - Alternative: sapphire window, Mohs 9, scratch-resistant
