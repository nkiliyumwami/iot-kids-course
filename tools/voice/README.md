# Officer Ohm's voice (ElevenLabs)

The site speaks with `assets/voice/voice.js`. For each line of text it plays `assets/voice/en/<id>.mp3`, where `<id>`
is a fingerprint of the text. If that file does not exist yet, the browser's own voice reads the line instead, so
nothing breaks while files are missing. Sound only starts when the visitor asks for it (🔊 Sound on in the story,
🔊 Listen or "Read every step to me" in a lesson).

- `node tools/voice/collect.mjs` lists every line the site says in `assets/voice/lines.json`
  (`done: false` = no voice file yet). Lessons with a voice are listed in `VOICED` in that script.
- The MP3 files are made with ElevenLabs from a computer that has the ElevenLabs MCP server connected to Claude Code
  (the cloud sessions cannot reach ElevenLabs). Paste the prompt below into Claude Code there.
- When a sentence changes, its fingerprint changes: run the collector again and only the new lines need files.

## Prompt for Claude Code with the ElevenLabs MCP

```
In the iot-kids-course repository: git checkout main && git pull, then create a branch voice/elevenlabs.
Run: node tools/voice/collect.mjs
Read assets/voice/lines.json. Every entry with "done": false needs an MP3 at its "file" path.

1. Choose Officer Ohm's voice with me first. Officer Ohm is a friendly traffic officer who teaches kids aged 10–15
   in Rwanda: warm, clear, unhurried, encouraging, an adult man. Use the ElevenLabs tools to find 3 good English
   voices (search my voices and the voice library; an East African English accent is a plus). Make this sample with
   each: "Hi, I'm Officer Ohm! Today we'll build a real traffic light, one wire at a time." Save the samples in
   /tmp/ohm-samples, tell me which file is which voice, and wait for me to choose.
2. With the chosen voice, make one MP3 per "done": false line, using the line's "text" exactly as written. Use
   model eleven_multilingual_v2 and MP3 output (mp3_44100_64 if you can choose; otherwise the default). Save each one,
   then rename/move it to exactly the "file" path from lines.json (assets/voice/en/<id>.mp3).
3. Run node tools/voice/collect.mjs again: it must say "0 still need a voice file".
4. Commit only assets/voice/ with the message "Officer Ohm's voice: ElevenLabs narration (<voice name>)",
   push the branch voice/elevenlabs, and tell me the voice name and how many characters were used.
Never print or commit my ElevenLabs API key.
```
