---
layout: ../../layouts/Writeup.astro
title: "Garage Door Left-Open Alert"
description: "A $10 ESP32 that pushes a phone alert when the garage door has been left open — and the engineering case for deliberately scoping it down to monitoring only."
date: "2026-07-24"
tags: ["ESP32", "ESPHome", "IoT", "Embedded"]
---

An ESP32 that watches whether my garage door is open and pushes a notification to my phone if I've left it that way. No hub, no cloud platform, no always-on server — a $10 microcontroller, a magnetic reed switch, and about forty lines of YAML.

---

## The problem

I have a remote-controlled overhead garage door (ATA GDO-9v2 Enduro Gen 2). The failure mode is mundane and entirely human: I open it, unload the car, walk inside, and forget. Sometimes it stays open overnight.

The door itself works perfectly. The gap is **feedback** — once I'm inside the house, the system gives me no indication of its own state. There's no annunciator, no status anywhere I'd naturally look.

So the requirement was never "automate the door." It was narrower than that:

> Tell me when the door has been open longer than it should be, wherever I am.

Worth stating plainly, because it determined most of what follows. An earlier version of this design included a relay wired into the opener's O/S/C terminal so I could close the door remotely from my phone. It worked on paper and I've documented it below as a deliberate non-goal. I dropped it, for two reasons:

1. **It solved a problem I didn't have.** The issue was never that closing the door was hard — it was that I didn't know it was open. Adding an actuator doubled the complexity to address the easy half of the problem.
2. **Anything that can move the door carries real safety weight.** The manufacturer makes photo-electric safety beams compulsory for auto-close operation, and rightly so — an unattended closing door is a hazard to people, pets, and vehicles. Taking the actuator out means this system is, by construction, incapable of causing harm. It can only observe.

Constraining scope to monitoring made the whole thing simpler, cheaper, and safer. That trade is the most interesting engineering decision in the project.

---

## Design

### Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────┐     ┌─────────┐
│ Reed switch │────▶│  ESP32 (ESPHome) │────▶│ Pushover  │────▶│  Phone  │
│  + magnet   │ GPIO│                  │ WiFi│   cloud   │ push│         │
└─────────────┘     └──────────────────┘     └───────────┘     └─────────┘
   door state          state + timers          delivery          alert
```

Three hops. The ESP32 holds all the logic; Pushover handles the push-delivery plumbing (APNs/FCM registration, retry, delivery to a device that may be asleep or off-network) that a microcontroller has no business trying to do itself.

### Why this shape

**Why not Home Assistant?** The obvious route is ESP32 → Home Assistant → Companion app. It's a good architecture and I'd use it if I were building out a wider smart-home setup. But it needs an always-on machine — a Pi, a NUC, a NAS container — running a fairly large piece of software, purely to relay one boolean to my phone. For a single-signal appliance that's a lot of standing infrastructure and a lot of surface area to maintain.

**Why not a bare ESP32 with no service at all?** Because push notification is genuinely hard. Reaching a phone that's asleep, on cellular, behind CGNAT requires a registered app and a persistent connection to Apple's or Google's push infrastructure. Pushover is a thin, cheap, one-time-purchase shim over exactly that. It's the smallest possible dependency that solves the actual hard part.

**Why a reed switch rather than sensing the opener?** The reed reports the physical position of the door, which is the thing I care about. Inferring state from the opener's electronics means inferring — and it means wiring into the opener. A magnet on the door panel is unambiguous and completely passive.

### State model

The reed switch is a plain mechanical contact: closed when the magnet is adjacent (door shut), open otherwise. ESPHome reads it with an internal pull-up on an interrupt-driven GPIO.

| Physical | Contact | Reported state |
|---|---|---|
| Door shut | Closed (magnet near) | `OFF` |
| Door open | Open (magnet away) | `ON` |

A `delayed_on_off: 500ms` filter debounces it, so door rattle and vibration don't produce spurious transitions.

### Alert logic

Three independent behaviours:

- **Open too long** — on the door opening, start a 15-minute timer. If it expires with the door still open, send an alert, then repeat every 15 minutes until it's closed. The script is `mode: restart`, and closing the door stops it outright.
- **Night check** — at 22:00, if the door is open, alert. Catches the specific case that prompted the project: an overnight open door that started before anyone was paying attention.
- **Daily heartbeat** — at 09:00, send a `priority=-2` (silent) message. It arrives in the Pushover history with no sound or banner. Its purpose is negative: a *gap* in the daily run tells me the device has lost power or dropped off Wi-Fi.

That last one matters more than it looks. A monitoring device that fails silently is worse than no device, because you keep trusting it. The heartbeat converts silent failure into something observable.

---

## Bill of materials

| Item | Qty | Cost (AUD) | Notes |
|---|---|---|---|
| ESP32-WROOM-32 dev board | 1 | ~$13 | Any WROOM-32. I used a Freenove board I already had. |
| Magnetic reed switch (door contact) | 1 | $4–8 | Surface-mount type: switch body + separate magnet. A wide-gap "overhead door" variant tolerates panel movement better. |
| 5 V USB power supply + cable | 1 | $0–12 | Any phone charger, 5 V ≥ 500 mA. The board draws well under 250 mA. |
| Hook-up wire | ~3 m | $5 | Two-core, to reach from the board to the door. |
| Screw terminal block or solder | 1 | $2 | See note below — don't skip this. |
| Small enclosure | 1 | $8 | Garages are dusty and damp. |
| Pushover licence | 1 | ~$8 once | Per platform, one-time. No subscription. |

**Total: roughly $30–50**, less if the board and charger come out of a drawer.

> **On the terminal block:** bare stranded wire pushed into a Dupont jumper is fine on a bench and unreliable over months of vibration and temperature swing. This is the connection most likely to fail silently. Use a screw terminal or solder it.

---

## Wiring

The entire circuit is two wires. The reed switch has no polarity — either leg to either connection.

```
        ESP32                          Reed switch
    ┌─────────────┐                  ┌─────────────┐
    │             │                  │             │
    │    GPIO13 ──┼──────────────────┼── leg A     │
    │             │                  │             │
    │       GND ──┼──────────────────┼── leg B     │
    │             │                  │             │
    │    USB-C ◀──┼── 5 V charger    └─────────────┘
    └─────────────┘                    (+ separate
                                        magnet half,
                                        no wires)
```

The ESP32's internal pull-up holds GPIO13 high; closing the reed pulls it to ground. No external resistor, no breadboard, no soldering on the board side — dev board headers come pre-soldered.

**Mounting:** switch body on the fixed frame or track, magnet on the moving door panel, aligned so they sit within the switch's gap spec when the door is fully **closed**.

---

## Build

### 1. Pushover

Install the app, create an account, and collect two values from the dashboard:

- **User Key** — shown on the main dashboard page
- **API Token** — create an application (name it anything) to generate one

### 2. ESPHome

ESPHome runs standalone; it does not require Home Assistant. On macOS:

```bash
brew install esphome
esphome version
```

ESPHome is a **code generator**, not a runtime. It compiles the YAML into C++, builds it with the ESP-IDF toolchain, and flashes a native binary. Nothing of ESPHome remains on the chip, and nothing needs to keep running on your laptop afterwards.

### 3. Flash

Save the [configuration](#configuration) below as `garage-door.yaml`, substituting your Wi-Fi credentials and the two Pushover values (the token/key pair appears in three places).

```bash
esphome run garage-door.yaml
```

Choose the USB serial port for the first flash. On macOS it appears as `/dev/cu.usbserial-XXXX` or `/dev/cu.wchusbserial-XXXX`. If the port doesn't appear, install the [CH340 driver](https://www.wch-ic.com/downloads/CH34XSER_MAC_ZIP.html). If it stalls at "Connecting…", hold the board's BOOT button.

Every subsequent update goes over the air — pick the OTA option instead and the firmware travels over Wi-Fi. The cable is needed exactly once.

### 4. Verify polarity

This is the step worth being careful about, because getting it backwards produces a system that alerts when the door is *closed* and stays silent when it's open — a failure that looks like it's working.

With the reed mounted and the door **shut**, stream the logs:

```bash
esphome logs garage-door.yaml
```

The state must read `OFF`. If it reads `ON`, flip `inverted:` in the pin config and re-flash over the air.

Reed switches come in normally-open and normally-closed varieties, and there's no reliable way to tell by looking. The mounted-door observation settles it regardless of which type you have.

### 5. Bench-test the timers before trusting them

Temporarily set both `delay: 15min` values to `30s`, push over the air, and confirm two things:

- the repeat alerts actually fire, and
- they **stop** the moment the contact closes.

A repeat loop that won't terminate is the failure mode to rule out before this goes on a wall. Then set both back and push again.

---

## Configuration

```yaml
esphome:
  name: garage-door

esp32:
  board: esp32dev

wifi:
  ssid: "YOUR_WIFI_NAME"
  password: "YOUR_WIFI_PASSWORD"

logger:
api:
ota:
  - platform: esphome

http_request:
  useragent: esphome/garage
  timeout: 10s

# ---------- door sensor ----------
binary_sensor:
  - platform: gpio
    id: reed
    name: "Garage Door"
    device_class: garage_door
    pin:
      number: GPIO13
      mode:
        input: true
        pullup: true
      inverted: false
    filters:
      - delayed_on_off: 500ms
    on_press:
      - script.execute: open_timer
    on_release:
      - script.stop: open_timer

# ---------- open too long, repeats until closed ----------
script:
  - id: open_timer
    mode: restart
    then:
      - delay: 15min
      - while:
          condition:
            binary_sensor.is_on: reed
          then:
            - http_request.post:
                url: "https://api.pushover.net/1/messages.json"
                request_headers:
                  Content-Type: application/x-www-form-urlencoded
                body: 'token=YOUR_API_TOKEN&user=YOUR_USER_KEY&title=Garage&message=Door still open'
            - delay: 15min

# ---------- night check + daily silent heartbeat ----------
time:
  - platform: sntp
    on_time:
      # 22:00 — alert if still open
      - seconds: 0
        minutes: 0
        hours: 22
        then:
          - if:
              condition:
                binary_sensor.is_on: reed
              then:
                - http_request.post:
                    url: "https://api.pushover.net/1/messages.json"
                    request_headers:
                      Content-Type: application/x-www-form-urlencoded
                    body: 'token=YOUR_API_TOKEN&user=YOUR_USER_KEY&title=Garage&message=Door still open after 10pm'

      # 09:00 — silent liveness ping
      - seconds: 0
        minutes: 0
        hours: 9
        then:
          - http_request.post:
              url: "https://api.pushover.net/1/messages.json"
              request_headers:
                Content-Type: application/x-www-form-urlencoded
              body: 'token=YOUR_API_TOKEN&user=YOUR_USER_KEY&title=Garage&message=Sensor alive&priority=-2'
```

---

## Notes and possible extensions

**Explicitly not done: remote close.** The opener's terminal block exposes an O/S/C input — a momentary dry contact that a relay could drive, giving remote open/stop/close. I designed it, then removed it. Beyond the safety argument above, there's a subtlety worth recording: the O/S/C input is not a "close" command but a **state-machine toggle**. One pulse from closed opens; a pulse mid-travel stops; the next reverses. Any implementation therefore has to read the door's actual state before acting and confirm the result afterwards, or it can leave the door stopped halfway. That interlock is straightforward to write and easy to get subtly wrong, which is a reasonable argument for not writing it at all when the feature wasn't needed.

**Better liveness monitoring.** The daily heartbeat is self-reported, which means a device that's completely dead can't tell you it's dead — you have to notice the absence yourself. The stronger pattern inverts it: ping an external watchdog (Healthchecks.io or similar) on a schedule and let *that* service alert on a missed check-in. Pushover has this as "Inactivity Monitors" but only on its Teams tier.

**Wi-Fi coverage.** Check signal strength at the actual mounting position, not on the bench. Anything better than about −70 dB is comfortable.

**Power.** No battery backup. A power cut means no alerts until it returns; the board rejoins Wi-Fi automatically when it does. The heartbeat is what surfaces this.

---

## Stack

ESP32-WROOM-32 · ESPHome 2026.7 · ESP-IDF 5.5 · Pushover · magnetic reed switch
