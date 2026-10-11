# Officer Ohm's voice (ElevenLabs)

The site speaks with `assets/voice/voice.js`. For each line of text it plays `assets/voice/en/<id>.mp3`, where `<id>`
is a fingerprint of the text. If that file does not exist yet, the browser's own voice reads the line instead, so
nothing breaks while files are missing. Sound only starts when the visitor asks for it (🔊 Sound on in the story,
🔊 Listen or "Read every step to me" in a lesson).

- `node tools/voice/collect.mjs` lists every line the site says in `assets/voice/lines.json`
  (`done: false` = no voice file yet). Lessons with a voice are listed in `VOICED` in that script.
- The MP3 files are made with ElevenLabs through the ElevenLabs connector in Claude (a cloud session with the connector
  enabled works, as does Claude Code with the ElevenLabs MCP server). The prompt below describes the steps.
- **The course voice:** "Naledi – Clear and Concise" (ElevenLabs voice library, voice id `OcBcxJXlaNwru6LlLs4L`, a calm,
  clear woman's voice), model `eleven_multilingual_v2`, one take per line. Keep the same voice and model for new lines
  so the course always sounds the same. (The first version used "Frank – Professional Educator", `yH7WW3zeKrRMuKt6sg5a`.)
- After re-making existing MP3s with a new voice, change `VOICE_V` in `assets/voice/voice.js` (and the `?v=` on the
  lesson's voice.js script tag) so browsers don't keep playing the old files from their cache.
- Files are saved as 64 kbps mono MP3 (about 8 KB per second) so they load quickly on mobile data:
  `ffmpeg -i in.mp3 -map_metadata -1 -ac 1 -ar 44100 -b:a 64k assets/voice/en/<id>.mp3`.
- Cost: 1 credit per character. The 18 story + Lesson 0 lines use 2,575 credits per voice.
- When a sentence changes, its fingerprint changes: run the collector again and only the new lines need files.

## Prompt for Claude Code with the ElevenLabs MCP

```
In the iot-kids-course repository: git checkout main && git pull, then create a branch voice/elevenlabs.
Run: node tools/voice/collect.mjs
Read assets/voice/lines.json. Every entry with "done": false needs an MP3 at its "file" path.

1. The course voice is already chosen: "Naledi – Clear and Concise" (voice id OcBcxJXlaNwru6LlLs4L). Use it and
   skip to step 2. Only if I ask for a new voice: the narrator teaches kids aged 10–15 in Rwanda: warm, clear,
   unhurried, encouraging. Use the ElevenLabs tools to find 3 good English
   voices (search my voices and the voice library; an East African English accent is a plus). Make this sample with
   each: "Hi, I'm Officer Ohm! Today we'll build a real traffic light, one wire at a time." Save the samples in
   /tmp/ohm-samples, tell me which file is which voice, and wait for me to choose.
2. With the course voice, make one MP3 per "done": false line, using the line's "text" exactly as written. Use
   model eleven_multilingual_v2, one take per line. Save each one, convert it to 64 kbps mono with the ffmpeg command
   above and move it to exactly the "file" path from lines.json (assets/voice/en/<id>.mp3).
3. Run node tools/voice/collect.mjs again: it must say "0 still need a voice file".
4. Commit only assets/voice/ (MP3s and lines.json) with the message "Officer Ohm's voice: ElevenLabs narration (<voice name>)",
   push the branch voice/elevenlabs, and tell me the voice name and how many characters were used.
Never print or commit my ElevenLabs API key.
```
