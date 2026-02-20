# CUBE

A parametric enclosure for the NVIDIA Jetson Orin Nano — designed as a compact, self-contained personal AI server.

## What is this?

CUBE is a hardware enclosure project with two design phases:

- **Phase 1 — PLA Prototype**: FDM 3D-printable enclosure (130mm cube) designed in OpenSCAD. Snap-fit lid, passive ventilation, full port access. Print at 0.2mm layer height, 20% infill, no supports needed.

- **Phase 2 — Metal Production**: CNC-machined 6061-T6 aluminum or DMLS 316L stainless steel clamshell enclosure for a custom 50x50mm carrier PCB. Designed for bead-blast anodize or mirror electropolish finish.

Both designs are fully parametric — dimensions, wall thickness, port positions, and tolerances are all adjustable.

## Directory Structure

```
moria/
├── design/
│   ├── cube-phase1.scad          # Phase 1 PLA prototype (OpenSCAD)
│   ├── cube-phase2.scad          # Phase 2 metal production (OpenSCAD)
│   └── index.html                # Interactive 3D viewer for OpenSCAD designs
├── generate_jetson_stl.py        # Python STL generator (numpy-stl)
├── index.html                    # Interactive 3D board model viewer
├── jetson_orin_nano_exploded.html # Exploded view with port labels
├── jetson_cube_flythrough.html   # Animated flythrough viewer
├── jetson_orin_nano_simple.stl   # Generated: hollow box (100x79x21mm)
└── jetson_orin_nano_detailed.stl # Generated: box with ports, heatsink, mounting holes
```

## Prerequisites

- [OpenSCAD](https://openscad.org/) — for editing and rendering `.scad` designs
- Python 3.13+ with [numpy-stl](https://pypi.org/project/numpy-stl/) — for the STL generator script

## Usage

### Generate STL files

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install numpy-stl
python generate_jetson_stl.py
```

This produces `jetson_orin_nano_simple.stl` and `jetson_orin_nano_detailed.stl`. Open them in Cura or any slicer to verify dimensions.

### Edit enclosure designs

Open `design/cube-phase1.scad` or `design/cube-phase2.scad` in OpenSCAD. Adjust parameters at the top of the file, render with F6, and export as STL.

### View 3D models

Open any of the HTML files in a browser for interactive 3D visualization — no dependencies required.

## Why "Moria"?

The dwarves carved something extraordinary out of raw stone. We're doing the same with aluminum.
