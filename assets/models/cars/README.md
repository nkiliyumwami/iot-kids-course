# Car models for the model road

`sedan.glb`, `suv.glb`, `hatchback.glb`, `taxi.glb` and `van.glb` are real-size cars made in Blender for this course
(credits in `../CREDITS.md`). They are listed in `CAR_MODELS` in the "optional car models" part of
`assets/road/model-road.js`. If they fail to load, the road falls back to its code-drawn cars.

To add another model, follow the same pattern:

- Point the nose along -x, put the wheels on the ground (y = 0) and centre the car on x = 0, z = 0.
- Give each wheel its own node named `wheel-…`, with its origin at the hub so it spins around z.
- Use glass with alpha blending, and put "tail" in the name of the rear-light material so the brake lights work.
- Keep each file under 400 KB, so lessons load fast on school Chromebooks.
- Only use models with CC0 or CC-BY licences, and add the author, licence and link to `../CREDITS.md`.
