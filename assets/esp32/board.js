/* ESP32 DevKit V1 (30 pins): pin facts, maker words and a reusable 3D board viewer.
   Shared by pins.html (the Pin Explorer) and lessons/00-meet-esp32 (the first mission).
   Needs three.js r128 + OrbitControls + GLTFLoader loaded first. Exposes window.ESP32.

   Teaching idea: every professional word is a tappable "maker word". Plain words come first, then the real
   name, how to say it, and how engineers use it. Tapped words are saved in the learner's word book. */
(function () {
  'use strict';
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- maker words (plain words first, then the pro name) ---------- */
  const WORDS = {
    microcontroller: { term: 'Microcontroller', say: 'MY-kro-con-TROLL-er', kid: 'A tiny computer on one chip. It runs one program over and over to control lights, motors and sensors.', pro: 'The ESP32 is a microcontroller with Wi-Fi built in.' },
    devkit: { term: 'DevKit (development kit)', say: 'dev kit', kid: 'The ESP32 chip on a handy board with pins, a USB port and buttons, so makers can try ideas quickly.', pro: 'I’m building a prototype on an ESP32 DevKit.' },
    module: { term: 'Module (ESP-WROOM-32)', say: 'E-S-P room thirty-two', kid: 'The metal box. Inside are the ESP32 chip, its memory and its radio. The metal lid is a shield that blocks electrical noise.', pro: 'The WROOM module is soldered onto the DevKit.' },
    antenna: { term: 'Antenna', say: 'an-TEN-uh', kid: 'The zig-zag copper line. It sends and catches the invisible radio waves of Wi-Fi and Bluetooth.', pro: 'Keep wires away from the antenna for a strong signal.' },
    iot: { term: 'IoT (Internet of Things)', say: 'I-O-T', kid: 'Everyday things that connect to the internet: lights, doorbells, plant sensors. Your traffic light will become one!', pro: 'We’re building an IoT traffic light.' },
    usb: { term: 'USB port', say: 'U-S-B', kid: 'Where the cable plugs in. It brings power to the board and carries your code from the computer.', pro: 'Use a USB data cable. Some cables only charge.' },
    pin: { term: 'Pin', say: 'pin', kid: 'A metal leg that connects the board to wires. Each pin has its own name and its own job.', pro: 'Connect the red wire to pin D25.' },
    header: { term: 'Header', say: 'HED-er', kid: 'A row of pins. This board has two headers of 15 pins: 30 pins in all.', pro: 'Push the DevKit into the breadboard with one header on each side.' },
    gnd: { term: 'GND (ground)', say: 'ground', kid: 'The road home, at 0 volts. Electricity leaves a pin, does its job, then must come back to GND. No road home, no light.', pro: 'Connect the LED’s short leg to GND.' },
    voltage: { term: 'Voltage (volts, V)', say: 'VOLE-tij', kid: 'How hard electricity pushes, like water pressure in a pipe. The ESP32 works at 3.3 volts.', pro: 'The pins give out 3.3 V.' },
    v33: { term: '3V3 (3.3 volts)', say: 'three-point-three volts', kid: 'Engineers write 3V3 instead of 3.3V because a tiny dot is easy to miss on a small board.', pro: 'Power the sensor from 3V3.' },
    vin: { term: 'VIN (voltage in)', say: 'V-in', kid: 'About 5 volts coming from the USB cable, for parts that need more push.', pro: 'The buzzer module runs from VIN.' },
    short: { term: 'Short circuit', say: 'short SUR-kit', kid: 'Power going straight back to GND with nothing in the way. Too much flows and parts get hot. Never wire 3V3 or VIN straight to GND.', pro: 'Check for shorts before you plug in.' },
    gpio: { term: 'GPIO', say: 'G-P-I-O', kid: 'General-Purpose Input/Output: a pin your program controls. It can switch things on and off, or listen.', pro: 'The blue LED is on GPIO 2.' },
    output: { term: 'Output', say: 'OUT-put', kid: 'A pin that sends electricity out, to light an LED or beep a buzzer.', pro: 'Pin(25, Pin.OUT) makes GPIO 25 an output.' },
    input: { term: 'Input', say: 'IN-put', kid: 'A pin that listens, to a button or a sensor.', pro: 'The button is wired to an input pin.' },
    led: { term: 'LED', say: 'L-E-D', kid: 'Light-Emitting Diode: a tiny light that needs very little power. Electricity can only go through it one way.', pro: 'The LED’s long leg is the anode (+).' },
    gpionum: { term: 'GPIO number', say: 'G-P-I-O number', kid: 'The number the chip uses for a pin. In code, Pin(25) means GPIO 25, which the board prints as D25. It is not the 25th pin!', pro: 'D25 is GPIO 25.' },
    adc: { term: 'ADC (analog input)', say: 'A-D-C', kid: 'Analog-to-Digital Converter. It turns “how much” (how bright, how warm) into a number from 0 to 4095.', pro: 'Read the light sensor with the ADC on GPIO 34.' },
    pwm: { term: 'PWM', say: 'P-W-M', kid: 'Pulse-Width Modulation: switching a pin on and off very fast. Your eyes see a dimmer light, and a buzzer sings a note.', pro: 'Dim the LED with PWM.' },
    dac: { term: 'DAC', say: 'dack', kid: 'Digital-to-Analog Converter: makes an in-between voltage, not just on or off. Only D25 and D26 have one.', pro: 'The DAC on GPIO 25 outputs 1.65 V.' },
    touch: { term: 'Touch pin', say: 'touch pin', kid: 'Some pins can feel your finger, no button needed!', pro: 'GPIO 4 is touch pad T0.' },
    serial: { term: 'Serial (TX / RX)', say: 'TX = transmit, RX = receive', kid: 'Sending a message one tiny piece at a time down a wire. TX0 and RX0 carry your code and print() messages over USB.', pro: 'Leave TX0 and RX0 free for serial.' },
    boot: { term: 'Strapping pin (start-up pin)', say: 'STRAP-ing pin', kid: 'A pin the chip checks the moment it starts (boots) to decide how to start. The wrong thing connected here can stop the board starting.', pro: 'Avoid strapping pins like GPIO 12 for buttons.' },
    reset: { term: 'Reset (EN)', say: 'ree-SET, E-N', kid: 'Restarts the board so your program runs again from the top. EN stands for enable.', pro: 'Press EN to reset the board.' },
    pullup: { term: 'Pull-up resistor', say: 'pull-up', kid: 'A resistor that gently holds an input at 1 until a button pulls it to 0, so the pin never has to guess.', pro: 'Use Pin.PULL_UP for the button.' },
    i2c: { term: 'I²C', say: 'I-squared-C', kid: 'A way to connect sensors and small screens with just two wires, called SDA and SCL.', pro: 'The screen is on I²C: SDA 21, SCL 22.' },
    spi: { term: 'SPI', say: 'S-P-I', kid: 'A fast way to talk to screens and memory cards using four wires.', pro: 'The SD card reader uses SPI.' },
    micropython: { term: 'MicroPython', say: 'MY-kro PIE-thon', kid: 'A small version of the Python programming language, made to run on microcontrollers.', pro: 'The ESP32 runs MicroPython firmware.' },
  };
  // Words that are linked automatically when they appear in pin descriptions (first match only).
  const ALIASES = [
    [/\banalog\b/i, 'adc'], [/\bDAC\b/, 'dac'], [/\bSPI\b/, 'spi'], [/I²C/, 'i2c'], [/pull-up resistor/i, 'pullup'],
    [/start-up pin/i, 'boot'], [/short circuit/i, 'short'], [/\btouch\b/i, 'touch'], [/\bprint\(\)/, 'serial'],
    [/\bGND\b/, 'gnd'], [/\bvolts?\b/i, 'voltage'], [/\bLEDs?\b/, 'led'],
  ];

  /* ---------- pin groups ---------- */
  // Kid view: four groups. Pro view: the seven groups engineers use.
  const GROUPS = {
    power:   { name: 'Power',        css: '#D9443A', blurb: 'Gives electricity to run things. Never wire it straight to GND.' },
    gnd:     { name: 'Ground',       css: '#3D4148', blurb: 'The road home, 0 volts. Every circuit ends here.' },
    gpio:    { name: 'Free to use',  css: '#2E9E57', blurb: 'Yours for projects: LEDs, buttons, sensors.' },
    special: { name: 'Special job',  css: '#D9821A', blurb: 'Already has a job (restart, USB, start-up, listening only). Read its card first.' },
  };
  const TYPES = {
    power:  { name: 'Power',         css: '#D9443A', blurb: 'Supply pins: 3V3 out, VIN (about 5 V) in.' },
    gnd:    { name: 'Ground',        css: '#3D4148', blurb: '0 V reference. All GND pins are joined.' },
    gpio:   { name: 'GPIO',          css: '#2E9E57', blurb: 'General-purpose input/output, safe for projects.' },
    inonly: { name: 'Input only',    css: '#1F9C93', blurb: 'GPIO 34–39: inputs and ADC only, no pull-ups.' },
    comm:   { name: 'Serial (UART0)', css: '#3B6FD8', blurb: 'USB serial: uploads and print(). Leave free.' },
    care:   { name: 'Strapping',     css: '#D9821A', blurb: 'Checked at boot. Usable, with care.' },
    ctrl:   { name: 'Reset (EN)',    css: '#8A5CD6', blurb: 'Pull low to reset the chip.' },
  };
  const groupOf = (p) => (p.type === 'power' || p.type === 'gnd' || p.type === 'gpio') ? p.type : 'special';

  /* ---------- the 30 pins ---------- */
  const TOUCH = { 4: 'T0', 2: 'T2', 15: 'T3', 13: 'T4', 12: 'T5', 14: 'T6', 27: 'T7', 33: 'T8', 32: 'T9' };
  const ADC1 = [32, 33, 34, 35, 36, 39], ADC2 = [4, 2, 15, 13, 12, 14, 27, 25, 26];
  const P = (node, side, pos, printed, gpio, type, text, extra) => ({ node, side, pos, printed, gpio, type, text, extra: extra || '' });
  const PINS = [
    P('L01_EN', 'L', 1, 'EN', null, 'ctrl', 'The restart pin. Connect it to GND, or press the EN button, and the ESP32 restarts, like switching it off and on again.'),
    P('L02_GPIO36', 'L', 2, 'VP', 36, 'inonly', 'A listening-only pin. Great for a sensor that measures “how much” (analog), but it can’t light an LED.', 'It has no built-in pull-up resistor, so a button here needs its own resistor.'),
    P('L03_GPIO39', 'L', 3, 'VN', 39, 'inonly', 'A listening-only pin, good for analog sensors like a light sensor.', 'It has no built-in pull-up resistor.'),
    P('L04_GPIO34', 'L', 4, 'D34', 34, 'inonly', 'A listening-only pin. A great choice for an analog sensor, even while Wi-Fi is on.', 'It has no built-in pull-up resistor.'),
    P('L05_GPIO35', 'L', 5, 'D35', 35, 'inonly', 'A listening-only pin. A great choice for an analog sensor, even while Wi-Fi is on.', 'It has no built-in pull-up resistor.'),
    P('L06_GPIO32', 'L', 6, 'D32', 32, 'gpio', 'A free pin for almost anything: LEDs, buttons, analog sensors (even with Wi-Fi on) and touch.'),
    P('L07_GPIO33', 'L', 7, 'D33', 33, 'gpio', 'A free pin: LEDs, buttons, analog sensors (even with Wi-Fi on) and touch.'),
    P('L08_GPIO25', 'L', 8, 'D25', 25, 'gpio', 'A free pin, and the red light of our traffic light in Lesson 1! It can also make in-between voltages with its DAC.', 'Its analog reading stops working while Wi-Fi is on.'),
    P('L09_GPIO26', 'L', 9, 'D26', 26, 'gpio', 'A free pin, and the yellow light in Lesson 1. It has a DAC too.', 'Its analog reading stops working while Wi-Fi is on.'),
    P('L10_GPIO27', 'L', 10, 'D27', 27, 'gpio', 'A free pin, and the green light in Lesson 1. It can also feel a touch.', 'Its analog reading stops working while Wi-Fi is on.'),
    P('L11_GPIO14', 'L', 11, 'D14', 14, 'gpio', 'A free pin that can also feel a touch.', 'It sends a few quick pulses while the board starts, so an LED here may flicker for a moment.'),
    P('L12_GPIO12', 'L', 12, 'D12', 12, 'care', 'Works as a normal pin, but it’s a start-up pin: if something holds it HIGH while the ESP32 starts, the board may not start.', 'Leave it unconnected when you plug the board in, or pick another pin.'),
    P('L13_GPIO13', 'L', 13, 'D13', 13, 'gpio', 'A free pin that can also feel a touch.'),
    P('L14_GND', 'L', 14, 'GND', null, 'gnd', 'Ground, 0 volts: the road home for every circuit. In Lesson 1 the breadboard’s ground rail connects here.'),
    P('L15_VIN', 'L', 15, 'VIN', null, 'power', 'Power in: about 5 volts from the USB cable, for parts that need more push.', 'Never connect VIN straight to 3V3 or GND.'),
    P('R01_GPIO23', 'R', 1, 'D23', 23, 'gpio', 'A free pin. Engineers often use it for SPI, a fast way to talk to screens and memory cards.'),
    P('R02_GPIO22', 'R', 2, 'D22', 22, 'gpio', 'A free pin. Engineers often use it as SCL, one of the two I²C wires for sensors and small screens.'),
    P('R03_GPIO1', 'R', 3, 'TX0', 1, 'comm', 'Sends messages to your computer over USB (TX means transmit). This is how print() messages reach you.', 'Connect things here and uploading code or print() can stop working. Leave it free.'),
    P('R04_GPIO3', 'R', 4, 'RX0', 3, 'comm', 'Receives messages from your computer over USB (RX means receive). Your code arrives this way.', 'Leave it free, or uploading code may fail.'),
    P('R05_GPIO21', 'R', 5, 'D21', 21, 'gpio', 'A free pin. Engineers often use it as SDA, the other I²C wire.'),
    P('R06_GPIO19', 'R', 6, 'D19', 19, 'gpio', 'A free pin. Often used for SPI devices.'),
    P('R07_GPIO18', 'R', 7, 'D18', 18, 'gpio', 'A free pin. Often used for SPI devices.'),
    P('R08_GPIO5', 'R', 8, 'D5', 5, 'care', 'A start-up pin. Fine for an LED once the board is running, but it blinks a little while the board starts.', 'Don’t hold it LOW while the board starts.'),
    P('R09_GPIO17', 'R', 9, 'TX2', 17, 'gpio', 'A free pin. It can also be the “send” wire of a second serial port.'),
    P('R10_GPIO16', 'R', 10, 'RX2', 16, 'gpio', 'A free pin. It can also be the “receive” wire of a second serial port.'),
    P('R11_GPIO4', 'R', 11, 'D4', 4, 'gpio', 'A free pin that can also feel a touch.', 'Its analog reading stops working while Wi-Fi is on.'),
    P('R12_GPIO2', 'R', 12, 'D2', 2, 'care', 'Wired to the little blue LED on the board, so it’s perfect for your first blink! It’s also a start-up pin.', 'It must be LOW or unconnected while you upload code.'),
    P('R13_GPIO15', 'R', 13, 'D15', 15, 'care', 'A start-up pin that controls the messages printed when the board starts. Fine for LEDs.', 'Don’t hold it LOW while the board starts.'),
    P('R14_GND', 'R', 14, 'GND', null, 'gnd', 'Another ground pin, 0 volts. All GND pins are joined inside the board.'),
    P('R15_3V3', 'R', 15, '3V3', null, 'power', 'Gives out 3.3 volts to power small sensors.', 'Never connect 3V3 straight to GND: that’s a short circuit.'),
  ];
  const findPin = (q) => {
    if (q == null) return null;
    const s = String(q).trim().toLowerCase();
    return PINS.find((p) => p.printed.toLowerCase() === s || (p.gpio != null && ('gpio' + p.gpio === s || 'pin(' + p.gpio + ')' === s))) || null;
  };

  /* ---------- what a pin can do ---------- */
  const ABILITIES = {
    out:   { kid: '💡 Light an LED', pro: 'output', word: 'output' },
    in:    { kid: '🔘 Read a button', pro: 'input', word: 'input' },
    adc:   { kid: '🌡️ Measure “how much”', pro: 'ADC', word: 'adc' },
    touch: { kid: '👆 Feel a touch', pro: 'touch', word: 'touch' },
    pwm:   { kid: '🎵 Dim a light or beep', pro: 'PWM', word: 'pwm' },
    dac:   { kid: '〰️ Make in-between voltages', pro: 'DAC', word: 'dac' },
  };
  function abilities(p) {
    if (p.gpio == null) return [];
    const g = p.gpio, inOnly = g >= 34, a = [];
    if (!inOnly) a.push('out');
    a.push('in');
    if (ADC1.includes(g) || ADC2.includes(g)) a.push('adc');
    if (TOUCH[g]) a.push('touch');
    if (!inOnly) a.push('pwm');
    if (g === 25 || g === 26) a.push('dac');
    return a;
  }
  function examples(p) {
    const g = p.gpio, a = abilities(p), out = [];
    if (a.includes('out')) out.push(['Blink an LED', `from machine import Pin\nimport time\n\nled = Pin(${g}, Pin.OUT)   # GPIO ${g} is an output\nwhile True:\n    led.value(1)   # on\n    time.sleep(0.5)\n    led.value(0)   # off\n    time.sleep(0.5)`]);
    if (a.includes('in')) out.push(['Read a button', g >= 34
      ? `from machine import Pin\n\n# no built-in pull-up here: add a 10 kΩ resistor to 3V3\nbutton = Pin(${g}, Pin.IN)\nprint(button.value())   # 1 or 0`
      : `from machine import Pin\n\nbutton = Pin(${g}, Pin.IN, Pin.PULL_UP)\nprint(button.value())   # 0 while pressed`]);
    if (a.includes('adc')) out.push(['Measure a sensor (ADC)', `from machine import ADC, Pin\n\nsensor = ADC(Pin(${g}))\nsensor.atten(ADC.ATTN_11DB)   # read the full 0-3.3 V\nprint(sensor.read())          # 0 to 4095`]);
    if (a.includes('touch')) out.push(['Feel a touch', `from machine import TouchPad, Pin\n\npad = TouchPad(Pin(${g}))\nprint(pad.read())   # smaller number when touched`]);
    if (a.includes('pwm')) out.push(['Dim an LED (PWM)', `from machine import Pin, PWM\n\nled = PWM(Pin(${g}), freq=1000)\nled.duty(256)   # 0 = off ... 1023 = full`]);
    if (a.includes('dac')) out.push(['Make a voltage (DAC)', `from machine import DAC, Pin\n\ndac = DAC(Pin(${g}))\ndac.write(128)   # about 1.65 V (0-255)`]);
    return out;
  }

  /* ---------- board parts ---------- */
  const PARTS = {
    esp_wroom_32_module: { title: 'The brain: ESP-WROOM-32 module', text: 'Under the metal lid live the ESP32 chip, its memory and its radio. Your program runs in here.', words: ['module', 'microcontroller'] },
    pcb_antenna: { title: 'The Wi-Fi antenna', text: 'The zig-zag copper line sends and catches Wi-Fi and Bluetooth signals. Keep wires away from it.', words: ['antenna', 'iot'] },
    micro_usb: { title: 'The USB port', text: 'Power and your code come in here. Boards have a micro-USB or a USB-C socket. Use a data cable, not a charge-only one.', words: ['usb'] },
    button_en: { title: 'EN button (restart)', text: 'Press it to restart your program from the top. Same as connecting the EN pin to GND.', words: ['reset'] },
    button_boot: { title: 'BOOT button', text: 'Hold it while installing new firmware if your computer can’t connect. Most tools press it for you.', words: ['micropython'] },
    power_led: { title: 'Red power LED', text: 'Lights up whenever the board has power. A quick check that the cable works!', words: ['led'] },
    blue_led_gpio2: { title: 'Blue LED (on GPIO 2)', text: 'Wired to GPIO 2. Your first program can switch it on with Pin(2, Pin.OUT).value(1).', words: ['gpio', 'led'] },
    ams1117_regulator: { title: 'Voltage regulator (AMS1117)', text: 'Turns the 5 volts from USB into the 3.3 volts the ESP32 needs, so the chip isn’t pushed too hard.', words: ['voltage', 'v33'] },
    cp2102_bridge: { title: 'USB-to-serial chip (CP2102)', text: 'A translator between USB and the ESP32’s serial pins (TX0 and RX0), so your computer and the board can talk.', words: ['serial'] },
    pcb: { title: 'The circuit board (PCB)', text: 'The board holds every part and joins them with thin copper tracks. PCB means printed circuit board.', words: [] },
  };

  /* ---------- word chips, word card and word book ---------- */
  const BOOK_KEY = 'iotkids.words';
  const book = {
    list() { try { return JSON.parse(localStorage.getItem(BOOK_KEY) || '[]').filter((k) => WORDS[k]); } catch (e) { return []; } },
    has(k) { return this.list().includes(k); },
    add(k) {
      if (!WORDS[k] || this.has(k)) return false;
      try { localStorage.setItem(BOOK_KEY, JSON.stringify(this.list().concat(k))); } catch (e) { /* not remembered */ }
      document.dispatchEvent(new CustomEvent('makerword', { detail: { key: k } }));
      return true;
    },
  };
  const chip = (key, text) => `<button type="button" class="w" data-w="${key}">${esc(text || WORDS[key].term)}</button>`;
  function linkWords(text) {
    let html = esc(text);
    const used = new Set();
    ALIASES.forEach(([re, key]) => {
      if (used.has(key)) return;
      html = html.replace(re, (m) => { used.add(key); return chip(key, m); });
    });
    return html;
  }
  let card = null;
  function showWord(key) {
    const w = WORDS[key]; if (!w) return;
    const isNew = book.add(key);
    if (!card) {
      card = document.createElement('div');
      card.className = 'wcard'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
      document.body.appendChild(card);
      card.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) card.hidden = true; });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) card.hidden = true; });
    }
    card.innerHTML = `<div class="wc-top"><span>🔑 Maker word</span><button type="button" data-close aria-label="Close">✕</button></div>
      <div class="wc-term">${esc(w.term)}</div><div class="wc-say">Say it: “${esc(w.say)}”</div>
      <p><b>In plain words:</b> ${esc(w.kid)}</p><p class="wc-pro"><b>Engineers say:</b> “${esc(w.pro)}”</p>
      <div class="wc-foot">${isNew ? '✨ New! ' : ''}Saved in your word book (${book.list().length} of ${Object.keys(WORDS).length} words)</div>`;
    card.hidden = false;
  }
  function showBook() {
    const have = book.list();
    const dlg = document.createElement('div');
    dlg.className = 'wbook'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-label', 'My word book');
    dlg.innerHTML = `<div class="wb-inner"><div class="wc-top"><span>📖 My word book: ${have.length} of ${Object.keys(WORDS).length} words</span><button type="button" data-close aria-label="Close">✕</button></div>
      <p class="wb-tip">These are the real words engineers use. Tap one to read it again. Grey ones are still waiting to be found!</p>
      <div class="wb-grid">${Object.keys(WORDS).map((k) => have.includes(k) ? chip(k) : `<span class="w locked">？？？</span>`).join('')}</div></div>`;
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.remove(); });
    document.body.appendChild(dlg);
  }
  function initWords() {
    const css = document.createElement('style');
    css.textContent = `
.w{display:inline;border:0;background:#FFF1BF;color:#5A4300;font:inherit;font-weight:800;padding:0 4px;border-radius:5px;cursor:pointer;border-bottom:2px dotted #C99600}
.w:hover{background:#FFE58A}.w.locked{cursor:default;background:#E7ECEF;color:#9AA6B0;border-color:#C9D2D8}
.wcard{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(420px,calc(100vw - 32px));z-index:50;background:#fff;border:2px solid #F2B705;border-radius:18px;padding:12px 16px 14px;box-shadow:0 18px 40px rgba(21,32,42,.25);animation:wIn .25s ease-out}
.wc-top{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:13px;color:#7A5B00;text-transform:uppercase;letter-spacing:.05em}
.wc-top button{border:0;background:#F1F5F8;border-radius:50%;width:30px;height:30px;cursor:pointer;font-weight:800}
.wc-term{font-family:'Baloo 2','Trebuchet MS',sans-serif;font-weight:800;font-size:28px;line-height:1.1;margin-top:4px}
.wc-say{color:#526170;font-size:14px;font-style:italic}.wcard p{margin:8px 0 0;font-size:15px}.wc-pro{background:#DAEEF0;border-radius:10px;padding:6px 10px}
.wc-foot{margin-top:10px;font-size:13px;font-weight:800;color:#0A7480}
.wbook{position:fixed;inset:0;z-index:60;background:rgba(21,32,42,.45);display:grid;place-items:center;padding:16px}
.wb-inner{background:#fff;border-radius:18px;padding:14px 16px;width:min(560px,100%);max-height:85vh;overflow:auto}
.wb-tip{color:#526170;font-size:14px}.wb-grid{display:flex;flex-wrap:wrap;gap:8px}.wb-grid .w{padding:4px 10px;border-radius:999px}
@keyframes wIn{from{transform:translate(-50%,20px);opacity:0}to{transform:translateX(-50%);opacity:1}}
@media (prefers-reduced-motion: reduce){.wcard{animation:none}}`;
    document.head.appendChild(css);
    document.addEventListener('click', (e) => {
      const w = e.target.closest('.w[data-w]'); if (w) { e.preventDefault(); showWord(w.dataset.w); return; }
      if (e.target.closest('[data-wordbook]')) showBook();
    });
  }

  /* ---------- the 3D board viewer ---------- */
  // opts: host, layer (label container), model (GLB url), onPin(p), onPart(key),
  //       label(p) -> { text, color, show, cls }  (called on refresh())
  function createViewer(opts) {
    const host = opts.host;
    if (!window.THREE || !THREE.GLTFLoader || !THREE.OrbitControls) {
      host.innerHTML = '<div class="fail">The 3D board could not load. Check your internet connection and reload the page.</div>';
      return null;
    }
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f7fa);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 2000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.minDistance = 25; controls.maxDistance = 220;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4cc, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(40, 90, 60); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-50, 30, -40); scene.add(fill);
    const HOME = { p: new THREE.Vector3(0, 82, 46), t: new THREE.Vector3(0, 0, 1) };
    let fly = null;
    function home(animate) { flyTo(HOME.p, HOME.t, animate ? 700 : 0); }
    function flyTo(pos, target, ms) {
      if (!ms) { camera.position.copy(pos); controls.target.copy(target); fly = null; return; }
      fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now(), ms };
    }
    home();

    const pads = {}, padBase = {}, labels = [], pickables = [], frameFns = [];
    const ledMats = { blue: null, power: null }, glows = {}, ledBase = {};
    function makeGlow(rgb) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const ctx = cv.getContext('2d'), gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.set(9, 9, 1); return sp;
    }
    function ledLook(k, on) {
      const m = ledMats[k]; if (!m) return;
      if (ledBase[k]) m.color.copy(ledBase[k]).multiplyScalar(on ? 1 : 0.3);
      m.emissive = new THREE.Color(on ? (k === 'blue' ? 0x3aa0ff : 0xff2a1a) : 0x000000);
      m.emissiveIntensity = on ? 2.4 : 0;
      if (glows[k]) glows[k].visible = on;
    }
    let blueOn = false, blinkUntil = 0, powerOn = true;

    const api = { camera, controls, scene, home, flyTo, pads, labels, ready: null,
      refresh, setPadColor, setPadGlow, setBlue, blink, setPower, onFrame: (f) => frameFns.push(f), partCenter };

    api.ready = new Promise((resolve, reject) => {
      new THREE.GLTFLoader().load(opts.model, (gltf) => {
        const root = gltf.scene;
        root.scale.setScalar(1000); // the model is in metres; work in millimetres
        scene.add(root);
        root.traverse((o) => {
          if (o.name && o.name.startsWith('pad_') && o.material) {
            o.material = o.material.clone();
            pads[o.name.slice(4)] = o; padBase[o.name.slice(4)] = o.material.color.clone();
          }
          if (o.name === 'blue_led_body' && o.material) { o.material = o.material.clone(); ledMats.blue = o.material; }
          if (o.name === 'power_led_body' && o.material) { o.material = o.material.clone(); ledMats.power = o.material; }
          if (o.isMesh) pickables.push(o);
        });
        // thin or tiny parts get a bigger invisible tap zone, so a tap between the antenna lines still counts
        root.updateMatrixWorld(true);
        ['pcb_antenna', 'power_led', 'blue_led_gpio2', 'button_en', 'button_boot', 'micro_usb'].forEach((name) => {
          const part = root.getObjectByName(name); if (!part) return;
          const bb = new THREE.Box3().setFromObject(part).expandByVector(new THREE.Vector3(1.2, 0, 1.2));
          bb.max.y += 1;
          const size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
          const zone = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
          zone.position.copy(mid); zone.userData.part = name; scene.add(zone); pickables.push(zone);
        });
        // a soft glow and a dimmed "off" colour make the two board LEDs easy to see
        ['blue', 'power'].forEach((k) => {
          const m = ledMats[k]; if (!m) return;
          const part = root.getObjectByName(k === 'blue' ? 'blue_led_gpio2' : 'power_led');
          const c = new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3());
          const g = makeGlow(k === 'blue' ? '58,160,255' : '255,60,40');
          g.position.set(c.x, c.y + 0.6, c.z); g.visible = false; scene.add(g);
          glows[k] = g; ledBase[k] = m.color.clone();
        });
        buildLabels();
        setPower(powerOn);
        resolve(api);
      }, undefined, (err) => {
        host.innerHTML = '<div class="fail">The board model could not load. Please reload the page.</div>';
        reject(err);
      });
    });

    function buildLabels() {
      PINS.forEach((p) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pl ' + (p.side === 'L' ? 'left' : 'right');
        el.addEventListener('click', () => opts.onPin && opts.onPin(p, el));
        opts.layer.appendChild(el);
        labels.push({ el, p });
      });
      refresh();
    }
    function refresh() {
      labels.forEach(({ el, p }) => {
        const l = opts.label(p);
        el.textContent = l.text;
        el.style.background = l.color;
        el.hidden = l.show === false;
        el.className = 'pl ' + (p.side === 'L' ? 'left' : 'right') + (l.cls ? ' ' + l.cls : '');
        el.setAttribute('aria-label', l.aria || l.text);
      });
    }
    function setPadColor(node, hex) {
      const m = pads[node]; if (!m) return;
      if (hex == null) m.material.color.copy(padBase[node]); else m.material.color.set(hex);
    }
    function setPadGlow(node, on) {
      const m = pads[node]; if (!m) return;
      m.material.emissive = new THREE.Color(on ? 0xF2B705 : 0x000000);
      m.material.emissiveIntensity = on ? 0.9 : 0;
    }
    function setBlue(on) { blueOn = !!on; }
    function blink(ms) { blinkUntil = performance.now() + (ms || 4000); }
    function setPower(on) {
      powerOn = !!on;
      ledLook('power', powerOn);
    }
    function partCenter(name) {
      let found = null; scene.traverse((o) => { if (!found && o.name === name) found = o; });
      if (!found) return null;
      return new THREE.Box3().setFromObject(found).getCenter(new THREE.Vector3());
    }

    const v = new THREE.Vector3();
    function placeLabels() {
      const w = host.clientWidth, h = host.clientHeight;
      labels.forEach(({ el, p }) => {
        const m = pads[p.node]; if (!m || el.hidden) return;
        m.getWorldPosition(v); v.project(camera);
        if (v.z >= 1) { el.style.visibility = 'hidden'; return; }
        el.style.visibility = '';
        el.style.left = ((v.x + 1) / 2 * w).toFixed(1) + 'px';
        el.style.top = ((1 - v.y) / 2 * h).toFixed(1) + 'px';
      });
    }

    /* picking: a click (not a drag) on a pin or a board part */
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables, false)[0];
      if (!hit) return;
      if (hit.object.userData.part && opts.onPart) return opts.onPart(hit.object.userData.part);
      for (let o = hit.object; o; o = o.parent) {
        const m = (o.name || '').match(/^(?:pad|pin)_(.+)$/);
        if (m) { const p = PINS.find((x) => x.node === m[1]); if (p && opts.onPin) { const l = labels.find((x) => x.p === p); return opts.onPin(p, l && l.el); } }
        if (PARTS[o.name] && opts.onPart) return opts.onPart(o.name);
      }
    });

    function resize() {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(host); resize();
    (function frame(now) {
      if (fly) {
        const k = Math.min(1, (now - fly.start) / fly.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
        if (k >= 1) fly = null;
      }
      controls.update();
      ledLook('blue', blueOn || (now < blinkUntil && Math.floor(now / 350) % 2 === 0));
      frameFns.forEach((f) => f(now));
      renderer.render(scene, camera);
      placeLabels();
      requestAnimationFrame(frame);
    })(performance.now());
    return api;
  }

  /* shared label + panel styles for both pages */
  const baseCss = document.createElement('style');
  baseCss.textContent = `
.pl{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;white-space:nowrap;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:600;font-size:11.5px;line-height:1;padding:4px 7px;border-radius:6px;color:#fff;border:2px solid transparent;box-shadow:0 1px 4px rgba(21,32,42,.25);transition:opacity .15s,background .3s}
.pl.left{transform:translate(calc(-100% - 10px),-50%)}.pl.right{transform:translate(10px,-50%)}
.pl.sel{border-color:#F2B705;box-shadow:0 0 0 3px rgba(242,183,5,.55)}.pl.dim{opacity:.18}
.pl.good{animation:plGood .6s ease-out}.pl.bad{animation:plBad .4s ease-out}
@keyframes plGood{0%{box-shadow:0 0 0 0 rgba(46,158,87,.9)}100%{box-shadow:0 0 0 14px rgba(46,158,87,0)}}
@keyframes plBad{0%,100%{margin-left:0}25%{margin-left:-5px}75%{margin-left:5px}}
@media (prefers-reduced-motion: reduce){.pl.good,.pl.bad{animation:none}}
.fail{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font-weight:700}`;
  document.head.appendChild(baseCss);

  window.ESP32 = { WORDS, GROUPS, TYPES, PINS, PARTS, ABILITIES, TOUCH, groupOf, findPin, abilities, examples,
    book, chip, linkWords, showWord, initWords, createViewer, esc };
})();
