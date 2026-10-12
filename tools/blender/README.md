# Blender models for the home page story

These scripts build the story's opening models in headless Blender (the `bpy` Python module).
Everything is modelled in code: no downloads. The results are in `assets/story/models/`.

| Script | Model | What it is |
|---|---|---|
| `drone.py` | `drone.glb` | Delivery quadcopter: smooth shell, folding-arm hinges, finned motors, twisted props (`Prop_FL/FR/RL/RR`), gimbal camera, skids, a parcel on a winch line (`Hang`) |
| `child.py` | `child_a.glb`, `child_b.glb` | Two primary-school pupils, jointed (`Body`, `Torso`, `Head`, `Shoulder_L/R`, `Elbow_L/R`, `Hip_L/R`, `Knee_L/R`) so the scene code walks and waves them |
| `house.py` | `smart_house.glb` | The smart home: hip roof of corrugated iron, solar panels, recessed windows with burglar bars (`Window_L/R` light up), panelled door, porch lamp (`Porch_Lamp`), camera, smart meter, rainwater tank |
| `banana.py` | `banana.glb` | Two banana plants (`Banana_A` with a bunch and a flower bud, `Banana_B`) with torn, alpha-cut leaves |

Shared: `lib.py` (materials, shapes, baked contact shadows in the vertex colours, glTF export, preview render)
and `textures.py` (plaster, wood, tin, solar cells, banana leaves, cardboard, painted with Pillow).

Rules every model follows: metres, Y up and front facing +Z in three.js (−Y in Blender), clean node names,
PBR materials only, small textures, Draco compression, a triangle budget (about 20k for a hero model).

## Rebuild

```sh
mkdir -p tex && python3 -m venv bpyenv && ./bpyenv/bin/pip install bpy==5.2.2 && pip install pillow
python3 -c "import textures as t; [f(p) for f, p in [(t.plaster,'tex/plaster.jpg'),(t.cells,'tex/cells.jpg'),(t.wood,'tex/wood.jpg'),(t.tin,'tex/tin.jpg'),(t.leaf,'tex/leaf.png'),(t.kraft,'tex/kraft.jpg')]]; t.leaf('tex/leaf_dry.png', seed=9, dry=True)"
mkdir -p tex out
./bpyenv/bin/python child.py out/child_a.glb a     # and: child.py out/child_b.glb b
./bpyenv/bin/python house.py out/smart_house.glb
./bpyenv/bin/python banana.py out/banana.glb
./bpyenv/bin/python drone.py out/drone.glb
# then compress (Draco) with glTF-Transform:  npx @gltf-transform/cli draco out/x.glb ../../assets/story/models/x.glb
```

Each script also renders a `*_preview.png` next to its model, to check it before it goes into the scene.
