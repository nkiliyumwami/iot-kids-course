# Blender models

These scripts build the story's opening models (and the module models in `assets/models/modules/`) in headless Blender (the `bpy` Python module).
Everything is modelled in code: no downloads. The results are in `assets/story/models/`.

| Script | Model | What it is |
|---|---|---|
| `drone.py` | `drone.glb` | Delivery quadcopter: smooth shell, folding-arm hinges, finned motors, twisted props (`Prop_FL/FR/RL/RR`), gimbal camera, skids, a parcel on a winch line (`Hang`) |
| `child.py` | `child_a.glb`, `child_b.glb` | Two primary-school pupils, jointed (`Body`, `Torso`, `Head`, `Shoulder_L/R`, `Elbow_L/R`, `Hip_L/R`, `Knee_L/R`) so the scene code walks and waves them |
| `house.py` | `smart_house.glb` | The smart home: hip roof of corrugated iron, solar panels, recessed windows with burglar bars (`Window_L/R` light up), panelled door, porch lamp (`Porch_Lamp`), camera, smart meter, rainwater tank |
| `servo.py` | `sg90-servo.glb` → `assets/models/modules/` | SG90 micro servo in a plywood bracket for Servo Says Hello: real sizes, `Horn` (pivot on the shaft, turn its local Z; `Hand` child), `Servo_Case`, `Servo_Shaft`, `Wire_Signal/Power/Ground`, `Connector`, `Sock_*` empties, `Stand`. Draco from Blender itself. Build: `blender -b --factory-startup -P servo.py -- out/sg90-servo.glb` |
| `ky023.py` | `ky023-joystick.glb` → `assets/models/modules/` | KY-023 thumb joystick for Follow My Hand: real sizes, blue PCB with silkscreen, two pots, switch, metal cage, `Stick` (pivot in the gimbal, tilt its local Z), `Board`, `Pin_GND/5V/VRx/VRy/SW` empties at the header tips. Draco. Build: `blender -b --factory-startup -P ky023.py -- out/ky023-joystick.glb` |
| `crane.py` | `joystick-crane.glb` → `assets/models/modules/` | Tabletop crane for Follow My Hand: plywood tower with the imported SG90 shaft-up, `Boom` (lattice jib, counterweight, cab, trolley, hook and crate; turn its local Y), `Tray_Left/Right`, `Paddle` with the servo cable and plug, `Joystick_Mount`, `ESP32_Mount`, `Sock_*`. Needs `out/sg90-servo.glb` (or the one in assets). Build: `blender -b --factory-startup -P crane.py -- out/joystick-crane.glb` |
| `banana.py` | `banana.glb` | Two banana plants (`Banana_A` with a bunch and a flower bud, `Banana_B`) with torn, alpha-cut leaves |

Shared: `lib.py` (materials, shapes, baked contact shadows in the vertex colours, glTF export, preview render)
and `textures.py` (plaster, wood, tin, solar cells, banana leaves, cardboard, painted with Pillow).

### Sensor-module models ("Pick a sensor")

`parts.py` builds the small parts for the wiring desks, one GLB each in `assets/models/modules/`, at real sizes with header pins pointing to -X and a `Pin_<NAME>` empty at each pin tip: `dht11`, `soil-probe`, `raindrop`, `ir-obstacle`, `buzzer`, `hc-sr04p`, `breadboard` (LEDs, resistors, `Hole_A/B/Rail`) and `foil-card`. Build: `blender -b --factory-startup -P parts.py -- out/ [names...]`.
Each module's story scene has its own script (run the same way, `-- out/<name>.glb`); the docstring at the top lists the nodes the page animates:

| Script | Model | Module |
|---|---|---|
| `kitchen.py` | `too-hot-kitchen.glb` | Too Hot in Here: tiled kitchen, hob ring, pot, project box with two lamps, the DHT11 on the wall |
| `radar.py` | `radar-room.glb` | Radar Scanner: the sensor on its servo, a radar screen on a desk, three things to find |
| `garden.py` | `plant-garden.glb` | The Thirsty Plant: raised bed with plants that wilt, the soil probe, the LED box |
| `fence.py` | `goat-garden.glb` | Don't Touch the Fence: vegetable patch, foil fence, a goat, the buzzer |
| `porch.py` | `front-porch.glb` | Who's at the Door?: front porch at night, the IR sensor and buzzer by the door |
| `washing.py` | `rain-yard.glb` | Rain, Rain, Go Away: house, washing line, sliding roof, raindrop sensor |

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
