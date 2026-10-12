# 3D models in the home page story

These files are used by `assets/story/future-world.js`, the opening flight of the story (a future town in the hills).
Everything else (the hills, fields, trees, village houses, road and zebra crossing) is modelled in `future-world.js`;
the drone, the pupils, the smart home and the banana plants are built in Blender by `tools/blender/`. The outdoor light reuses `assets/projects/sky/park.exr` (see `assets/projects/CREDITS.md`).

| File | What it is | Source | Licence |
|---|---|---|---|
| `models/robot.glb` | The friendly robot that walks and waves | "RobotExpressive" by Tomás Laulhé (Quaternius), modified by Don McCurdy, as shipped in the three.js examples (Draco compressed) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `models/drone.glb`, `models/child_a.glb`, `models/child_b.glb`, `models/smart_house.glb`, `models/banana.glb` | The delivery drone, two pupils, the smart home and banana plants | Made for this course in Blender by the scripts in `tools/blender/` (modelled and textured in code) | Same licence as this repository |
| `models/car.glb` | The self-driving car | "CarConcept", © 2024 Eric Chadwick and Darmstadt Graphics Group GmbH, Khronos glTF Sample Assets (textures shrunk, mesh simplified, Draco compressed; paint recoloured and number plate hidden in code) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Khronos glTF Sample Assets: https://github.com/KhronosGroup/glTF-Sample-Assets
three.js examples: https://github.com/mrdoob/three.js/tree/r128/examples
