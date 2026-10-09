/* IoT for Young Makers: the list of lessons, shared by the home page and every lesson.
   To add a lesson: add its folder under lessons/, then set its status here to 'ready'. */
(function () {
  'use strict';
  const lessons = [
    { n: 0, slug: '00-meet-esp32', skills: ['Named the main parts of an ESP32 DevKit', 'Found the GND, power and GPIO pins', 'Learned that Pin(25) means GPIO 25, printed D25'], title: 'Pin Detective: Meet Your ESP32', unit: 0, status: 'ready', minutes: 15,
      idea: 'Explore the board before you build: what each part and pin is for, and the real words engineers use.',
      hardware: 'Nothing yet: it all happens on the 3D board',
      code: 'Pin(2, Pin.OUT), led.value(1)' },
    { n: 1, slug: '01-traffic-light', skills: ['Wired three LEDs to an ESP32 on a breadboard', 'Used 330 Ω resistors to protect each LED', 'Wrote a MicroPython loop that runs a traffic light'], title: 'My First Traffic Light', unit: 1, status: 'ready', minutes: 45,
      idea: 'Outputs: the ESP32 switches pins on and off to light three LEDs.',
      hardware: 'ESP32 DevKit, breadboard, 3 LEDs, 3 × 330 Ω resistors, jumper wires',
      code: 'Pin(…, Pin.OUT), value(1) / value(0), while True:, time.sleep()' },
    { n: 2, slug: '02-patterns', skills: ['Named numbers with variables', 'Wrote a set_lights() function', 'Used print() to see what a program is doing'], title: 'Make It Yours: Light Patterns', unit: 1, status: 'ready', minutes: 40,
      idea: 'Same circuit, smarter code: name things and reuse them.',
      hardware: 'Nothing new',
      code: 'variables, a set_lights() function, print()' },
    { n: 3, slug: '03-pedestrian-button', skills: ['Wired a push button to an input pin', 'Used a pull-up resistor', 'Made decisions with if'], title: 'The Pedestrian Button', unit: 1, status: 'planned', minutes: 45,
      idea: 'Inputs: the ESP32 listens to a button.',
      hardware: 'Push button',
      code: 'Pin.IN with a pull-up, if' },
    { n: 4, slug: '04-fair-crossing', skills: ['Remembered a button press in a variable', 'Learned why buttons bounce', 'Made a crossing that waits for a safe moment'], title: 'A Fair Crossing', unit: 1, status: 'planned', minutes: 40,
      idea: 'Remember a button press and wait for a safe moment.',
      hardware: 'Nothing new',
      code: 'a "button was pressed" variable, why buttons bounce' },
    { n: 5, slug: '05-crossing-sound', skills: ['Wired a buzzer', 'Made sound with PWM', 'Changed pitch with frequency'], title: 'Beep Beep: Crossing Sound', unit: 1, status: 'planned', minutes: 40,
      idea: 'Sound is just switching very fast.',
      hardware: 'Buzzer',
      code: 'PWM: frequency and on/off time' },
    { n: 6, slug: '06-measuring-light', skills: ['Built a light sensor voltage divider', 'Read analog values from 0 to 4095', 'Told analog and digital apart'], title: 'Measuring Light', unit: 1, status: 'planned', minutes: 45,
      idea: 'Analog inputs: reading "how much", not just on or off.',
      hardware: 'Light sensor (LDR) + 10 kΩ resistor',
      code: 'ADC readings from 0 to 4095' },
    { n: 7, slug: '07-night-mode', skills: ['Used a threshold to make a decision', 'Built a flashing night mode', 'Combined a sensor with outputs'], title: 'Night Mode', unit: 1, status: 'planned', minutes: 40,
      idea: 'Make a decision from a sensor reading.',
      hardware: 'Nothing new',
      code: 'thresholds, a flashing-yellow mode' },
    { n: 8, slug: '08-hello-wifi', skills: ['Connected the ESP32 to Wi-Fi', 'Learned what an IP address is', 'Kept passwords out of shared code'], title: 'Hello, Wi-Fi', unit: 2, status: 'planned', minutes: 45,
      idea: 'What a network and an IP address are.',
      hardware: 'Nothing new (the ESP32 has Wi-Fi built in)',
      code: 'network.WLAN, connecting and printing the IP address' },
    { n: 9, slug: '09-status-page', skills: ['Ran a tiny web server on the ESP32', 'Showed live status on a phone', 'Learned how browsers ask for pages'], title: 'Your Traffic Light’s Web Page', unit: 2, status: 'planned', minutes: 45,
      idea: 'The ESP32 serves a web page your phone can open.',
      hardware: 'Nothing new',
      code: 'a tiny web server, showing the current light' },
    { n: 10, slug: '10-phone-control', skills: ['Controlled lights from a phone', 'Handled web requests', 'Kept safety rules in charge'], title: 'Control It From Your Phone', unit: 2, status: 'planned', minutes: 50,
      idea: 'Your phone sends commands, but safety rules still win.',
      hardware: 'Nothing new',
      code: 'handling requests, keeping the crossing safe' },
  ];
  const units = {
    0: { name: 'Start here', blurb: 'Meet your board first. Become a pin detective and collect your first maker words.' },
    1: { name: 'Build the thing', blurb: 'Lights, buttons, sound and sensors: a traffic light that works on its own.' },
    2: { name: 'Connect it', blurb: 'Put your traffic light on Wi-Fi and talk to it from a phone. This is the “Internet” in Internet of Things.' },
  };
  const KEY = 'iotkids.progress';
  function readProgress() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveProgress(slug, patch) {
    try {
      const all = readProgress();
      all[slug] = Object.assign({}, all[slug], patch, { at: Date.now() });
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) { /* storage unavailable: progress simply isn't remembered */ }
  }
  function nextLesson(slug) {
    const i = lessons.findIndex((l) => l.slug === slug);
    return i >= 0 ? lessons[i + 1] || null : null;
  }
  function lessonBySlug(slug) { return lessons.find((l) => l.slug === slug) || null; }
  function badgeSrc(lesson, prefix) { return (prefix || '') + 'assets/badges/' + String(lesson.n).padStart(2, '0') + '.svg'; }
  window.COURSE = { title: 'IoT for Young Makers', lessons, units, readProgress, saveProgress, nextLesson, lessonBySlug, badgeSrc };
})();
