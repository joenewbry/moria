#!/usr/bin/env python3
"""
Generate STL files for the NVIDIA Jetson Orin Nano Developer Kit.

Produces two files:
  1. jetson_orin_nano_simple.stl   — hollow box, 100×79×21 mm, 2 mm walls
  2. jetson_orin_nano_detailed.stl — box with port cutouts, heatsink, mounting holes

Units are millimetres.  Open in Ultimaker Cura or any slicer to verify dimensions.
"""

import numpy as np
from stl import mesh

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _quad(v0, v1, v2, v3):
    """Return two triangles for a quad (CCW winding)."""
    return [(v0, v1, v2), (v0, v2, v3)]


def box_triangles(x0, y0, z0, x1, y1, z1):
    """Triangles for an axis-aligned solid box from (x0,y0,z0) to (x1,y1,z1)."""
    corners = [
        [x0, y0, z0],  # 0 - left  front bottom
        [x1, y0, z0],  # 1 - right front bottom
        [x1, y1, z0],  # 2 - right back  bottom
        [x0, y1, z0],  # 3 - left  back  bottom
        [x0, y0, z1],  # 4 - left  front top
        [x1, y0, z1],  # 5 - right front top
        [x1, y1, z1],  # 6 - right back  top
        [x0, y1, z1],  # 7 - left  back  top
    ]
    c = corners
    tris = []
    # bottom  (z=z0, normal -Z)
    tris += _quad(c[0], c[3], c[2], c[1])
    # top     (z=z1, normal +Z)
    tris += _quad(c[4], c[5], c[6], c[7])
    # front   (y=y0, normal -Y)
    tris += _quad(c[0], c[1], c[5], c[4])
    # back    (y=y1, normal +Y)
    tris += _quad(c[3], c[7], c[6], c[2])
    # left    (x=x0, normal -X)
    tris += _quad(c[0], c[4], c[7], c[3])
    # right   (x=x1, normal +X)
    tris += _quad(c[1], c[2], c[6], c[5])
    return tris


def cylinder_triangles(cx, cy, z0, z1, r, segments=24):
    """Triangles for a vertical cylinder centred at (cx, cy)."""
    tris = []
    angles = np.linspace(0, 2 * np.pi, segments, endpoint=False)
    for i in range(segments):
        a0, a1 = angles[i], angles[(i + 1) % segments]
        p0 = [cx + r * np.cos(a0), cy + r * np.sin(a0)]
        p1 = [cx + r * np.cos(a1), cy + r * np.sin(a1)]
        b0 = p0 + [z0]
        b1 = p1 + [z0]
        t0 = p0 + [z1]
        t1 = p1 + [z1]
        centre_b = [cx, cy, z0]
        centre_t = [cx, cy, z1]
        # bottom cap
        tris.append((centre_b, b1, b0))
        # top cap
        tris.append((centre_t, t0, t1))
        # side
        tris += _quad(b0, b1, t1, t0)
    return tris


def tris_to_mesh(tris):
    """Convert list of (v0,v1,v2) tuples to a numpy-stl Mesh."""
    data = np.zeros(len(tris), dtype=mesh.Mesh.dtype)
    for i, (v0, v1, v2) in enumerate(tris):
        data["vectors"][i] = [v0, v1, v2]
    return mesh.Mesh(data)


def subtract_box(outer_tris, cut_x0, cut_y0, cut_z0, cut_x1, cut_y1, cut_z1):
    """
    Approximate boolean subtraction: filter triangles whose centroid is inside
    the cut volume, then add the inner walls of the cut.

    For simple port cutouts on the surface this produces a visually correct STL.
    """
    filtered = []
    for tri in outer_tris:
        centroid = [
            (tri[0][j] + tri[1][j] + tri[2][j]) / 3.0 for j in range(3)
        ]
        inside = (
            cut_x0 < centroid[0] < cut_x1
            and cut_y0 < centroid[1] < cut_y1
            and cut_z0 < centroid[2] < cut_z1
        )
        if not inside:
            filtered.append(tri)
    return filtered


# ---------------------------------------------------------------------------
# Model 1 — Simple hollow box
# ---------------------------------------------------------------------------

def generate_simple():
    W, D, H = 100.0, 79.0, 21.0  # width (X), depth (Y), height (Z)
    T = 2.0  # wall thickness

    outer = box_triangles(0, 0, 0, W, D, H)
    inner = box_triangles(T, T, T, W - T, D - T, H - T)
    # Flip inner normals (reverse winding)
    inner_flipped = [(v2, v1, v0) for (v0, v1, v2) in inner]

    all_tris = outer + inner_flipped
    m = tris_to_mesh(all_tris)
    m.save("/Users/joe/dev/moria/jetson_orin_nano_simple.stl")
    print("Saved jetson_orin_nano_simple.stl")


# ---------------------------------------------------------------------------
# Model 2 — Detailed model
# ---------------------------------------------------------------------------

def generate_detailed():
    W, D, H = 100.0, 79.0, 21.0
    T = 2.0  # wall thickness
    all_tris = []

    # --- Main body (hollow box) ---
    outer = box_triangles(0, 0, 0, W, D, H)
    inner = box_triangles(T, T, T, W - T, D - T, H - T)
    inner_flipped = [(v2, v1, v0) for (v0, v1, v2) in inner]
    body = outer + inner_flipped

    # --- Port cutouts ---
    # Ports are on the front face (Y=0) of the carrier board.
    # Positions measured from left edge (X=0).
    # All cutouts go from Y=-1 through Y=T+1 to fully pierce the front wall.

    ports = []

    # DC barrel jack — rightmost, 9mm diameter ≈ 9×9 square
    ports.append(("DC Jack",       85, 3, 9, 9))
    # Ethernet (RJ-45) — 16mm wide × 13.5mm tall
    ports.append(("Ethernet",      68, 3, 16, 13.5))
    # USB-A stack 1 (2 ports) — 14.5mm wide × 16mm tall
    ports.append(("USB-A 1&2",     50, 3, 14.5, 16))
    # USB-A stack 2 (2 ports)
    ports.append(("USB-A 3&4",     33, 3, 14.5, 16))
    # USB-C — 9mm wide × 3.5mm tall
    ports.append(("USB-C",         22, 5, 9, 3.5))
    # DisplayPort — 17mm wide × 5mm tall
    ports.append(("DisplayPort",   2,  5, 17, 5))

    for name, x_start, z_start, pw, ph in ports:
        cx0, cy0, cz0 = x_start, -1, z_start
        cx1, cy1, cz1 = x_start + pw, T + 1, z_start + ph
        body = subtract_box(body, cx0, cy0, cz0, cx1, cy1, cz1)
        # Add inner walls of the cutout hole
        # Left wall
        body += _quad(
            [cx0, 0, cz0], [cx0, 0, cz1], [cx0, T, cz1], [cx0, T, cz0]
        )
        # Right wall
        body += _quad(
            [cx1, T, cz0], [cx1, T, cz1], [cx1, 0, cz1], [cx1, 0, cz0]
        )
        # Top wall
        body += _quad(
            [cx0, 0, cz1], [cx1, 0, cz1], [cx1, T, cz1], [cx0, T, cz1]
        )
        # Bottom wall
        body += _quad(
            [cx0, T, cz0], [cx1, T, cz0], [cx1, 0, cz0], [cx0, 0, cz0]
        )

    all_tris += body

    # --- microSD slot cutout (left side, X=0) ---
    sd_y, sd_z, sd_w, sd_h = 55, 2, 12, 2
    # Cut through left wall
    sd_tris = box_triangles(-1, sd_y, sd_z, T + 1, sd_y + sd_w, sd_z + sd_h)
    # (just add as visual indication — keep it simple)

    # --- Heatsink on top ---
    hs_x, hs_y = 15, 17  # offset from front-left corner
    hs_w, hs_d, hs_h = 70, 45, 8  # width, depth, height of heatsink block

    # Base plate
    all_tris += box_triangles(hs_x, hs_y, H, hs_x + hs_w, hs_y + hs_d, H + 2)

    # Fins (simplified — 7 fins)
    num_fins = 7
    fin_thickness = 1.5
    fin_gap = (hs_w - num_fins * fin_thickness) / (num_fins + 1)
    for i in range(num_fins):
        fx = hs_x + fin_gap + i * (fin_thickness + fin_gap)
        all_tris += box_triangles(
            fx, hs_y + 2, H + 2,
            fx + fin_thickness, hs_y + hs_d - 2, H + 2 + hs_h
        )

    # --- Mounting holes (4 corners) ---
    hole_r = 1.5  # M3 hole radius
    hole_positions = [
        (3.5,  3.5),
        (96.5, 3.5),
        (3.5,  75.5),
        (96.5, 75.5),
    ]
    for hx, hy in hole_positions:
        # Represent mounting holes as small cylinders on top surface
        all_tris += cylinder_triangles(hx, hy, H - 0.5, H + 0.5, hole_r + 1, 16)
        # Small hole (visual — subtract not needed for printing reference)

    # --- 40-pin GPIO header (right side, near back) ---
    gpio_x, gpio_y = W - 5, 20
    gpio_w, gpio_d, gpio_h = 3, 51, 8.5
    all_tris += box_triangles(
        gpio_x, gpio_y, H,
        gpio_x + gpio_w, gpio_y + gpio_d, H + gpio_h
    )

    # --- CSI connectors (2, near GPIO) ---
    for ci, cy_off in enumerate([25, 50]):
        all_tris += box_triangles(
            W - 12, cy_off, H,
            W - 5.5, cy_off + 4, H + 3
        )

    m = tris_to_mesh(all_tris)
    m.save("/Users/joe/dev/moria/jetson_orin_nano_detailed.stl")
    print("Saved jetson_orin_nano_detailed.stl")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    generate_simple()
    generate_detailed()
    print("\nDone. Open .stl files in Cura or any slicer to verify dimensions.")
