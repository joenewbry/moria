SCAD = design/cube-phase1.scad
OPENSCAD = openscad

all: stl/cube-body.stl

stl:
	mkdir -p stl

stl/cube-body.stl: $(SCAD) | stl
	$(OPENSCAD) -o $@ -D 'render_part="body"' $<

clean:
	rm -rf stl

.PHONY: all clean
