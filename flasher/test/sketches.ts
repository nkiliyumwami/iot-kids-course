export const BLINK = `#include <Arduino.h>
// Blink the blue LED on GPIO 2 and say hello on the serial port.
void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
}
void loop() {
  digitalWrite(2, HIGH);
  Serial.println("on");
  delay(500);
  digitalWrite(2, LOW);
  Serial.println("off");
  delay(500);
}
`;
export const BROKEN = `#include <Arduino.h>
void setup() { pinMode(2, OUTPUT) }   // missing semicolon
void loop() { digitalWrit(2, HIGH); }
`;
