#!/usr/bin/env python3
"""Generate a 3D-printable GU Energy Gel container as a STEP file.

Open-top box with mesh (perforated) side walls, matching the Moria Phase 1
Jetson case outer dimensions (130x130x98mm) but without any Jetson-specific
cutouts.
"""

import os
import cadquery as cq

# --- Parameters ---
OUTER_X = 130.0        # mm
OUTER_Y = 130.0        # mm
OUTER_Z = 98.0         # mm
WALL = 2.5             # mm wall thickness
CORNER_R = 4.0         # mm corner fillet radius

HOLE_D = 8.0           # mm hole diameter
HOLE_SPACING = 12.0    # mm center-to-center
MARGIN_SIDE = 15.0     # mm margin from vertical edges of each face
MARGIN_BOTTOM = 15.0   # mm margin from bottom edge
MARGIN_TOP = 10.0      # mm margin from top edge

OUTPUT = os.path.expanduser("~/Downloads/gu_gel_container.stl")


def make_box():
    """Create an open-top rounded box (shelled)."""
    box = (
        cq.Workplane("XY")
        .box(OUTER_X, OUTER_Y, OUTER_Z, centered=(True, True, False))
        .edges("|Z")
        .fillet(CORNER_R)
    )
    box = box.faces(">Z").shell(-WALL)
    return box


def hole_grid(face_width, face_height):
    """Calculate grid of (u, v) positions relative to face center."""
    u_min = -face_width / 2 + MARGIN_SIDE
    u_max = face_width / 2 - MARGIN_SIDE
    v_min = -face_height / 2 + MARGIN_BOTTOM
    v_max = face_height / 2 - MARGIN_TOP

    cu = (u_min + u_max) / 2
    cv = (v_min + v_max) / 2

    nu = int((u_max - u_min) / HOLE_SPACING) + 1
    nv = int((v_max - v_min) / HOLE_SPACING) + 1

    start_u = cu - (nu - 1) * HOLE_SPACING / 2
    start_v = cv - (nv - 1) * HOLE_SPACING / 2

    positions = []
    for i in range(nu):
        for j in range(nv):
            u = start_u + i * HOLE_SPACING
            v = start_v + j * HOLE_SPACING
            if (u - HOLE_D / 2 >= u_min and u + HOLE_D / 2 <= u_max and
                    v - HOLE_D / 2 >= v_min and v + HOLE_D / 2 <= v_max):
                positions.append((u, v))
    return positions


def cut_mesh(box):
    """Cut mesh holes into all 4 side walls."""
    face_height = OUTER_Z
    r = HOLE_D / 2
    clearance = 1.0  # extra depth beyond wall to ensure clean cut

    # Hole positions for Y-normal faces (front/back)
    # u = along X, v = along Z (relative to face center vertically)
    positions_y = hole_grid(OUTER_X, face_height)
    # Convert to workplane coordinates: (x, z_absolute)
    pts_y = [(u, OUTER_Z / 2 + v) for u, v in positions_y]

    # Hole positions for X-normal faces (left/right)
    positions_x = hole_grid(OUTER_Y, face_height)
    pts_x = [(u, OUTER_Z / 2 + v) for u, v in positions_x]

    print(f"  Y-face holes: {len(pts_y)} each (front & back)")
    print(f"  X-face holes: {len(pts_x)} each (left & right)")
    print(f"  Total: {(len(pts_y) + len(pts_x)) * 2}")

    extrude_len = WALL + 2 * clearance

    # Front face (+Y): wall spans Y from OUTER_Y/2-WALL to OUTER_Y/2
    # XZ workplane normal = +Y, so extrude goes in +Y direction
    print("  Cutting front face (+Y)...")
    front = (
        cq.Workplane("XZ", origin=(0, OUTER_Y / 2 - WALL - clearance, 0))
        .pushPoints(pts_y)
        .circle(r)
        .extrude(extrude_len)
    )
    box = box.cut(front)

    # Back face (-Y): wall spans Y from -OUTER_Y/2 to -OUTER_Y/2+WALL
    print("  Cutting back face (-Y)...")
    back = (
        cq.Workplane("XZ", origin=(0, -OUTER_Y / 2 - clearance, 0))
        .pushPoints(pts_y)
        .circle(r)
        .extrude(extrude_len)
    )
    box = box.cut(back)

    # Right face (+X): wall spans X from OUTER_X/2-WALL to OUTER_X/2
    # YZ workplane normal = +X, so extrude goes in +X direction
    print("  Cutting right face (+X)...")
    right = (
        cq.Workplane("YZ", origin=(OUTER_X / 2 - WALL - clearance, 0, 0))
        .pushPoints(pts_x)
        .circle(r)
        .extrude(extrude_len)
    )
    box = box.cut(right)

    # Left face (-X): wall spans X from -OUTER_X/2 to -OUTER_X/2+WALL
    print("  Cutting left face (-X)...")
    left = (
        cq.Workplane("YZ", origin=(-OUTER_X / 2 - clearance, 0, 0))
        .pushPoints(pts_x)
        .circle(r)
        .extrude(extrude_len)
    )
    box = box.cut(left)

    return box


def main():
    print("Building open-top box...")
    box = make_box()

    print("Cutting mesh holes...")
    try:
        box = cut_mesh(box)
        print("Mesh cut successfully.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"WARNING: Mesh cutting failed ({e}), exporting solid walls instead.")

    print(f"Exporting STEP to {OUTPUT} ...")
    cq.exporters.export(box, OUTPUT)
    print("Done!")


if __name__ == "__main__":
    main()
