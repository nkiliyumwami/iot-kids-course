/* IoT for Young Makers: the list of lessons, shared by the home page and every lesson.
   To add a lesson: add its folder under lessons/, then set its status here to 'ready'. */
(function () {
  'use strict';
  const lessons = [
    { n: 0, slug: '00-meet-esp32', skills: ['Named the main parts of an ESP32 DevKit', 'Found the GND, power and GPIO pins', 'Learned that Pin(25) means GPIO 25, printed D25'], title: 'Pin Detective: Meet Your ESP32', unit: 0, status: 'ready', minutes: 15,
      idea: 'Explore the board before you build: what each part and pin is for, and the real words engineers use.',
      hardware: 'Nothing yet: it all happens on the 3D board',
      code: 'Pin(2, Pin.OUT), led.value(1)' },
    { n: null, label: 'Circuit Lab 1', short: 'L1', badge: 'lab1', slug: 'lab1-light-it-up', skills: ['Found the hidden strips inside a breadboard', 'Placed an LED the right way round with a resistor', 'Built and debugged a complete circuit'], title: 'Light It Up', unit: 0, status: 'ready', minutes: 30,
      idea: 'Your first real circuit: one LED, one resistor and three wires. Build it on the 3D breadboard, then for real. No code yet!',
      hardware: 'Breadboard, 1 red LED, 1 × 330 Ω resistor, 3 jumper wires',
      code: 'No code: 3V3 powers the LED' },
    { n: null, label: 'Circuit Lab 2', short: 'L2', badge: 'lab2', slug: 'lab2-code-switch', skills: ['Moved the power wire to a GPIO pin', 'Switched an LED on and off with code', 'Made an LED blink on a real ESP32'], title: 'Let Code Switch It', unit: 0, status: 'ready', minutes: 30,
      idea: 'Move one wire from 3V3 to D25, and your code becomes the switch.',
      hardware: 'Nothing new',
      code: 'Pin(25, Pin.OUT), led.value(1) / led.value(0), a blink' },
    { n: 1, slug: '01-traffic-light', skills: ['Wired three LEDs to an ESP32 on a breadboard', 'Used 330 Ω resistors to protect each LED', 'Wrote a MicroPython loop that runs a traffic light'], title: 'My First Traffic Light', unit: 1, status: 'ready', minutes: 35,
      idea: 'Three LEDs, wired just like your Circuit Lab light, become a traffic light that runs on its own.',
      hardware: 'ESP32 DevKit, breadboard, 3 LEDs, 3 × 330 Ω resistors, jumper wires',
      code: 'Pin(…, Pin.OUT), value(1) / value(0), while True:, time.sleep()' },
    { n: 2, slug: '02-patterns', skills: ['Named numbers with variables', 'Wrote a set_lights() function', 'Used print() to see what a program is doing'], title: 'Make It Yours: Light Patterns', unit: 1, status: 'ready', minutes: 40,
      idea: 'Same circuit, smarter code: name things and reuse them.',
      hardware: 'Nothing new',
      code: 'variables, a set_lights() function, print()' },
    { n: 3, slug: '03-pedestrian-button', skills: ['Wired a push button to an input pin', 'Used a pull-up resistor', 'Made decisions with if'], title: 'The Pedestrian Button', unit: 1, status: 'ready', minutes: 45,
      idea: 'Inputs: the ESP32 listens to a button.',
      hardware: 'Push button',
      code: 'Pin.IN with a pull-up, if / else' },
    { n: 4, slug: '04-fair-crossing', skills: ['Remembered a button press in a variable', 'Learned why buttons bounce', 'Made a crossing that waits for a safe moment'], title: 'A Fair Crossing', unit: 1, status: 'ready', minutes: 40,
      idea: 'Remember a button press and wait for a safe moment.',
      hardware: 'Nothing new',
      code: 'a "button was pressed" variable, why buttons bounce' },
    { n: 5, slug: '05-crossing-sound', skills: ['Wired a buzzer', 'Made sound with PWM', 'Changed pitch with frequency'], title: 'Beep Beep: Crossing Sound', unit: 1, status: 'ready', minutes: 40,
      idea: 'Sound is just switching very fast.',
      hardware: 'Passive buzzer (+ the 330 Ω resistor you already have)',
      code: 'PWM: frequency and on/off time' },
    { n: 6, slug: '06-measuring-light', skills: ['Built a light sensor voltage divider', 'Read analog values from 0 to 4095', 'Told analog and digital apart'], title: 'Measuring Light', unit: 1, status: 'ready', minutes: 45,
      idea: 'Analog inputs: reading "how much", not just on or off.',
      hardware: 'Light sensor (LDR) + 10 kΩ resistor',
      code: 'ADC readings from 0 to 4095' },
    { n: 7, slug: '07-night-mode', skills: ['Used a threshold to make a decision', 'Built a flashing night mode', 'Combined a sensor with outputs'], title: 'Night Mode', unit: 1, status: 'ready', minutes: 40,
      idea: 'Make a decision from a sensor reading.',
      hardware: 'Nothing new',
      code: 'a threshold, if / else on a sensor reading, a flashing-yellow mode' },
    { n: 8, slug: '08-hello-wifi', skills: ['Connected the ESP32 to Wi-Fi', 'Learned what an IP address is', 'Kept passwords out of shared code'], title: 'Hello, Wi-Fi', unit: 2, status: 'ready', minutes: 45,
      idea: 'What a network and an IP address are.',
      hardware: 'Nothing new (the ESP32 has Wi-Fi built in)',
      code: 'network.WLAN, connecting and printing the IP address' },
    { n: 9, slug: '09-status-page', skills: ['Ran a tiny web server on the ESP32', 'Showed live status on a phone', 'Learned how browsers ask for pages'], title: 'Your Traffic Light’s Web Page', unit: 2, status: 'ready', minutes: 45,
      idea: 'The ESP32 serves a web page your phone can open.',
      hardware: 'Nothing new',
      code: 'a tiny web server, showing the current light' },
    { n: 10, slug: '10-phone-control', skills: ['Added a button to a web page', 'Read the path of a web request', 'Kept safety rules in charge'], title: 'Control It From Your Phone', unit: 2, status: 'ready', minutes: 50,
      idea: 'Your phone sends commands, but safety rules still win.',
      hardware: 'Nothing new',
      code: 'reading the request path, a crossing flag, safety rules in the program' },
  ];
  const units = {
    0: { name: 'Start here', blurb: 'Meet your board, then build your first circuits by hand. You’ll know every wire, LED and resistor before Part 1.' },
    1: { name: 'Build the thing', blurb: 'Lights, buttons, sound and sensors: a traffic light that works on its own.' },
    2: { name: 'Connect it', blurb: 'Put your traffic light on Wi-Fi and talk to it from a phone. This is the “Internet” in Internet of Things.' },
  };
  // Optional extras: practice activities shown beside a lesson. They are not lessons: they never change the lesson
  // order, the "Next" links, badges or certificates, and no lesson waits for them. Each saves its progress in the same
  // store under its own id, which must never be a lesson slug.
  const extras = [
    { id: 'circuit-challenge-lab', after: '01-traffic-light', href: 'labs/virtual-traffic-light/index.html', minutes: 45,
      label: 'Circuit Challenge Lab', title: 'Experiment & Fix It',
      idea: 'An optional challenge after Lesson 1: build the whole traffic light yourself on a 3D bench, then break it on purpose and find out why.',
      can: ['Build a full three-LED circuit', 'Make wiring mistakes safely and see why a circuit fails', 'Spot wrong GPIO pins, reversed LEDs and missing parts, and fix them',
        'Experiment with the traffic-light timing', 'Solve troubleshooting challenges on your own'] },
  ];
  // Sensor modules: standalone projects that unlock after Lesson 7 and can be done in any order. Each starts from a bare
  // board with one new sensor and one output the learner already knows. They are not lessons: they never change the
  // lesson order or the "Next" links, but each earns a badge (assets/badges/m-<slug>.svg) and counts for the course
  // certificate once it is 'ready'. `uses` lists modules to finish first. Pages live in lessons/m-<slug>/.
  const modules = [
    { slug: 'm-servo', badge: 'm-servo', title: 'Servo Says Hello', sensor: 'None (an output module)', output: 'SG90 servo', needs: '07-night-mode', uses: [], status: 'planned', minutes: 40,
      idea: 'Meet a motor that turns to the angle you choose: wave hello with a servo arm.',
      skills: ['Powered a servo safely from VIN', 'Set a servo angle with a 50 Hz PWM signal', 'Turned a number of degrees into a pulse'] },
    { slug: 'm-parking-gate', badge: 'm-parking-gate', title: 'The Parking Gate', sensor: 'HC-SR04 distance sensor', output: 'SG90 servo', needs: '07-night-mode', uses: ['m-servo'], status: 'planned', minutes: 45,
      idea: 'A car drives up, the gate lifts. Measure distance with sound and open a servo gate.',
      skills: ['Measured distance with an ultrasonic echo', 'Turned echo time into centimetres', 'Opened a gate when something came close'] },
    { slug: 'm-thirsty-plant', badge: 'm-thirsty-plant', title: 'The Thirsty Plant', sensor: 'Soil moisture probe', output: 'LED', needs: '07-night-mode', uses: [], status: 'planned', minutes: 40,
      idea: 'Your plant can’t talk, so give it a light that says “water me!” when the soil gets dry.',
      skills: ['Read a soil moisture probe on an analog pin', 'Chose a “too dry” threshold from real readings', 'Lit a warning LED when the soil dried out'] },
    { slug: 'm-rain-roof', badge: 'm-rain-roof', title: 'Rain, Rain, Go Away', sensor: 'Raindrop sensor', output: 'SG90 servo', needs: '07-night-mode', uses: ['m-servo'], status: 'planned', minutes: 45,
      idea: 'The washing is drying outside and the sky turns grey. A rain sensor feels the first drops and a servo swings the roof over the clothes.',
      skills: ['Read a raindrop sensor on an analog pin', 'Learned why wet means a smaller number', 'Moved a servo roof when rain started'] },
    { slug: 'm-door', badge: 'm-door', title: 'Who’s at the Door?', sensor: 'IR obstacle sensor', output: 'Buzzer', needs: '07-night-mode', uses: [], status: 'planned', minutes: 40,
      idea: 'An invisible beam of infrared light watches the door. When someone comes close, the buzzer tells you.',
      skills: ['Wired an IR obstacle sensor to a digital input', 'Turned the sensor’s little knob to set its range', 'Sounded a buzzer when someone came close'] },
    { slug: 'm-joystick', badge: 'm-joystick', title: 'Follow My Hand', sensor: 'Joystick', output: 'SG90 servo', needs: '07-night-mode', uses: ['m-servo'], status: 'planned', minutes: 40,
      idea: 'Push the stick left and right and the servo arm follows your hand, like the controls of a crane.',
      skills: ['Read a joystick on an analog pin', 'Turned a reading into an angle', 'Made a servo follow a hand movement'] },
    { slug: 'm-too-hot', badge: 'm-too-hot', title: 'Too Hot in Here', sensor: 'DHT11 temperature sensor', output: 'LED', needs: '07-night-mode', uses: [], status: 'planned', minutes: 40,
      idea: 'Is the kitchen getting too hot? A temperature sensor checks the air and a warning light comes on.',
      skills: ['Read temperature and humidity from a DHT11', 'Used a library with import dht', 'Lit a warning light above a temperature'] },
    { slug: 'm-touch-fence', badge: 'm-touch-fence', title: 'Don’t Touch the Fence', sensor: 'ESP32 touch pin (no extra sensor!)', output: 'Buzzer', needs: '07-night-mode', uses: [], status: 'planned', minutes: 35,
      idea: 'Protect the garden with a pretend fence made of foil. Your ESP32 can feel a touch by itself, and the buzzer sounds the alarm.',
      skills: ['Used the ESP32’s built-in touch sensing', 'Chose a touch threshold from real readings', 'Sounded an alarm when the fence was touched'] },
    { slug: 'm-radar', badge: 'm-radar', title: 'Radar Scanner', sensor: 'HC-SR04 distance sensor on a servo', output: 'SG90 servo + Shell map', needs: '07-night-mode', uses: ['m-parking-gate'], status: 'planned', minutes: 50,
      idea: 'Put the distance sensor on top of the servo and sweep it from side to side, like a ship’s radar, to find the closest thing in the room.',
      skills: ['Swept a servo with a for loop', 'Measured distance at every angle', 'Found the closest object and pointed at it'] },
  ];
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
  // the next lesson that is ready to open
  function nextLesson(slug) {
    const i = lessons.findIndex((l) => l.slug === slug);
    return i >= 0 ? lessons.slice(i + 1).find((l) => l.status === 'ready') || null : null;
  }
  // "Lesson 3", "Circuit Lab 1" or a module's title, and the short form for the little number circle
  const name = (l) => l.label || (l.n == null ? l.title : 'Lesson ' + l.n);
  const short = (l) => l.short || (l.n == null ? 'M' : String(l.n));
  function lessonBySlug(slug) { return lessons.find((l) => l.slug === slug) || null; }
  function moduleBySlug(slug) { return modules.find((m) => m.slug === slug) || null; }
  // anything that earns a badge and a certificate: a lesson or a sensor module
  const itemBySlug = (slug) => lessonBySlug(slug) || moduleBySlug(slug);
  // modules open once Lesson 7 (Night Mode) is finished
  function moduleUnlocked() { return !!(readProgress()['07-night-mode'] || {}).done; }
  // what the course certificate asks for: every lesson, plus every module that is ready
  const certItems = () => lessons.concat(modules.filter((m) => m.status === 'ready'));
  function badgeSrc(lesson, prefix) { return (prefix || '') + 'assets/badges/' + (lesson.badge || String(lesson.n).padStart(2, '0')) + '.svg'; }
  const extrasAfter = (slug) => extras.filter((x) => x.after === slug);
  // an extra's "start over": removes only that extra's own entry, never a lesson's
  function forgetExtra(id) {
    if (!extras.some((x) => x.id === id) || itemBySlug(id)) return;
    try { const all = readProgress(); delete all[id]; localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* nothing saved */ }
  }
  window.COURSE = { title: 'IoT for Young Makers', lessons, units, extras, extrasAfter, forgetExtra, modules, moduleBySlug, moduleUnlocked, itemBySlug, certItems,
    readProgress, saveProgress, nextLesson, lessonBySlug, badgeSrc, name, short };
})();
