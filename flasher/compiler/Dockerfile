# PlatformIO compile image for the KundaKode web flasher (Step 1).
# Build:  docker build -t kundakode-pio flasher/compiler
FROM python:3.12-slim
RUN pip install --no-cache-dir platformio && apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /work
# Pre-warm the ESP32 platform so the first compile is not 5 minutes
RUN mkdir -p warm/src && cd warm && printf '[env:esp32dev]\nplatform = espressif32\nboard = esp32dev\nframework = arduino\n' > platformio.ini \
 && printf '#include <Arduino.h>\nvoid setup(){}\nvoid loop(){}\n' > src/main.cpp && pio run && cd .. && rm -rf warm
COPY build.sh collect.py /opt/kundakode/
RUN chmod +x /opt/kundakode/build.sh
# The project to compile is mounted at /work/project; results are written to /work/project/out
ENTRYPOINT ["/opt/kundakode/build.sh"]
