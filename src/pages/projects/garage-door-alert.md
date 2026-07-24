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

<figure class="diagram">
<svg viewBox="0 0 1040 236" role="img" aria-label="Architecture: reed switch wired to the ESP32, which reaches the phone through the Pushover cloud">
  <defs><marker id="arw-a" markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="context-stroke"/></marker></defs>
  <rect x="24" y="90" width="164" height="86" rx="8" fill="#131824" stroke="#2a3547"/>
  <text x="106" y="125" text-anchor="middle" class="l">Reed switch</text>
  <text x="106" y="145" text-anchor="middle" class="s">on door + magnet</text>
  <text x="106" y="162" text-anchor="middle" class="s">closed = door down</text>
  <rect x="286" y="50" width="248" height="160" rx="8" fill="#0f1922" stroke="#2dd4bf" stroke-width="2"/>
  <text x="410" y="82" text-anchor="middle" class="l">ESP32 · ESPHome</text>
  <line x1="306" y1="96" x2="514" y2="96" stroke="#243244"/>
  <text x="308" y="123" class="s">▹ read reed (GPIO13)</text>
  <text x="308" y="146" class="s">▹ timer: open &gt; 15 min</text>
  <text x="308" y="169" class="s">▹ night check after 22:00</text>
  <text x="308" y="192" class="s">▹ HTTP POST → Pushover</text>
  <rect x="632" y="68" width="184" height="124" rx="8" fill="#1b1710" stroke="#e0a458" stroke-width="1.6"/>
  <text x="724" y="102" text-anchor="middle" class="l">Pushover</text>
  <text x="724" y="124" text-anchor="middle" class="s">cloud push</text>
  <text x="724" y="144" text-anchor="middle" class="s">APNs / FCM</text>
  <text x="724" y="164" text-anchor="middle" class="s">delivery + retry</text>
  <rect x="908" y="80" width="118" height="100" rx="13" fill="#131824" stroke="#2a3547"/>
  <rect x="930" y="96" width="74" height="54" rx="4" fill="#0e2a26" stroke="#2dd4bf"/>
  <text x="967" y="127" text-anchor="middle" class="s">alert</text>
  <line x1="188" y1="130" x2="282" y2="130" stroke="#2dd4bf" stroke-width="2.4" marker-end="url(#arw-a)"/>
  <text x="235" y="120" text-anchor="middle" class="s">wire</text>
  <line x1="534" y1="130" x2="628" y2="130" stroke="#e0a458" stroke-width="2.4" marker-end="url(#arw-a)"/>
  <text x="581" y="120" text-anchor="middle" class="s">Wi-Fi</text>
  <line x1="816" y1="130" x2="904" y2="130" stroke="#e0a458" stroke-width="2.4" marker-end="url(#arw-a)"/>
  <text x="860" y="120" text-anchor="middle" class="s">push</text>
</svg>
<figcaption>Three hops — the ESP32 holds all the logic; Pushover handles delivery to a phone that may be asleep or away from home.</figcaption>
</figure>

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

## Sequence — from open to alert

The logic the ESP32 runs continuously. Two independent triggers fire an alert — the open-too-long timer and the nightly check — and closing the door cancels a pending timer outright.

<figure class="diagram">
<svg viewBox="0 0 1040 400" role="img" aria-label="Sequence: the door opens, the reed reports OPEN, the ESP32 starts a timer and alerts through Pushover if the door is still open">
  <defs><marker id="arw-s" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill="context-stroke"/></marker></defs>
  <text x="120" y="26" text-anchor="middle" class="l">Door</text>
  <text x="360" y="26" text-anchor="middle" class="l">Reed switch</text>
  <text x="620" y="26" text-anchor="middle" class="l">ESP32</text>
  <text x="905" y="26" text-anchor="middle" class="l">Pushover → Phone</text>
  <line x1="120" y1="38" x2="120" y2="384" stroke="#2a3547" stroke-dasharray="4 5"/>
  <line x1="360" y1="38" x2="360" y2="384" stroke="#2a3547" stroke-dasharray="4 5"/>
  <line x1="620" y1="38" x2="620" y2="384" stroke="#2a3547" stroke-dasharray="4 5"/>
  <line x1="905" y1="38" x2="905" y2="384" stroke="#2a3547" stroke-dasharray="4 5"/>
  <text x="120" y="68" text-anchor="middle" class="s">you open it</text>
  <line x1="128" y1="80" x2="352" y2="80" stroke="#2dd4bf" stroke-width="2" marker-end="url(#arw-s)"/>
  <text x="240" y="74" text-anchor="middle" class="s">magnet moves away</text>
  <line x1="368" y1="108" x2="612" y2="108" stroke="#2dd4bf" stroke-width="2" marker-end="url(#arw-s)"/>
  <text x="490" y="102" text-anchor="middle" class="s">contact opens → state = OPEN</text>
  <rect x="558" y="124" width="124" height="44" rx="5" fill="#0e2a26" stroke="#2dd4bf"/>
  <text x="620" y="142" text-anchor="middle" class="s">start 15-min</text>
  <text x="620" y="157" text-anchor="middle" class="s">timer (restart)</text>
  <line x1="368" y1="196" x2="612" y2="196" stroke="#2dd4bf" stroke-width="1.6" stroke-dasharray="6 4" marker-end="url(#arw-s)"/>
  <text x="490" y="190" text-anchor="middle" class="s">closed before 15 min → cancel, no alert</text>
  <rect x="558" y="214" width="124" height="44" rx="5" fill="#241014" stroke="#f2726b"/>
  <text x="620" y="232" text-anchor="middle" class="s">still OPEN</text>
  <text x="620" y="247" text-anchor="middle" class="s">at 15 min</text>
  <line x1="620" y1="282" x2="897" y2="282" stroke="#e0a458" stroke-width="2.4" marker-end="url(#arw-s)"/>
  <text x="762" y="276" text-anchor="middle" class="s">POST “Door open 15 min” — repeats every 15 min</text>
  <rect x="852" y="294" width="106" height="30" rx="5" fill="#131824" stroke="#2a3547"/>
  <text x="905" y="313" text-anchor="middle" class="s">📲 phone buzzes</text>
  <rect x="500" y="346" width="120" height="30" rx="5" fill="#1b1710" stroke="#e0a458"/>
  <text x="560" y="365" text-anchor="middle" class="s">nightly 22:00 check</text>
  <line x1="620" y1="361" x2="897" y2="361" stroke="#e0a458" stroke-width="2.4" marker-end="url(#arw-s)"/>
  <text x="762" y="355" text-anchor="middle" class="s">if still OPEN → second alert</text>
</svg>
<figcaption>Two independent triggers, one cancel path. The <span style="color:#2dd4bf">teal</span> flow is sensing/logic, <span style="color:#e0a458">amber</span> is network/push, and the <span style="color:#f2726b">red</span> state is the one that actually fires.</figcaption>
</figure>

---

## Bill of materials

| Item | Cost (AUD) | Notes & source |
|---|---|---|
| ESP32-WROOM-32 dev board | $0–13 | I used a Freenove board I already had; any WROOM-32 works. [Core Electronics](https://core-electronics.com.au/) |
| Magnetic reed switch (door contact) | $4–8 | Surface-mount body + separate magnet. A wide-gap "overhead door" variant tolerates panel movement better. [Core: door sensor](https://core-electronics.com.au/magnetic-contact-switch-door-sensor.html) · [wide-gap on eBay](https://www.ebay.com.au/sch/i.html?_nkw=wide+gap+garage+reed+switch) |
| 5 V USB supply + cable | $0–12 | Any phone charger, 5 V ≥ 1 A. [Core: USB supplies](https://core-electronics.com.au/raspberry-pi/raspberry-pi-power-supplies.html) |
| Hook-up wire (~3 m) | $5 | Two-core, to reach from the board to the door. [Core: hook-up wire](https://core-electronics.com.au/hook-up-wire.html) |
| Enclosure | $0 | Temporary cardboard box for now; a sealed plastic enclosure is the proper call — garages are dusty and damp. [Core: enclosures](https://core-electronics.com.au/enclosures.html) |
| Pushover licence | ~$8 once | One-time per platform, no subscription. [pushover.net](https://pushover.net/) |

**Total: roughly $20–40**, less if the board and charger come out of a drawer.

> **On the connections:** right now this runs on jumper wires into a cardboard box — fine to prove the idea out, but bare stranded wire in a Dupont jumper is unreliable over months of vibration and temperature swing, and it's the joint most likely to fail silently. For a permanent install, move to a screw terminal or solder the joints, in a sealed enclosure.

---

## Wiring

The entire circuit is two wires. The reed switch has no polarity — either leg to either connection.

<figure class="diagram">
<svg viewBox="0 0 1040 320" role="img" aria-label="Wiring: ESP32 GPIO13 to reed leg A, GND to reed leg B, powered over USB-C">
  <defs><marker id="arw-w" markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="context-stroke"/></marker></defs>
  <rect x="30" y="34" width="164" height="70" rx="6" fill="#131824" stroke="#2a3547"/>
  <text x="112" y="64" text-anchor="middle" class="l">5 V USB charger</text>
  <text x="112" y="84" text-anchor="middle" class="s">any phone plug ≥ 1 A</text>
  <rect x="360" y="76" width="264" height="228" rx="10" fill="#0f1922" stroke="#2dd4bf" stroke-width="2"/>
  <text x="492" y="108" text-anchor="middle" class="l">ESP32-WROOM dev board</text>
  <rect x="472" y="66" width="40" height="14" rx="4" fill="#2a3547"/>
  <text x="492" y="134" text-anchor="middle" class="s">USB-C — power + first flash</text>
  <text x="492" y="272" text-anchor="middle" class="s">internal pull-up enabled in firmware</text>
  <circle cx="360" cy="186" r="5" fill="#e0a458"/><text x="345" y="190" text-anchor="end" class="p">5V / VIN</text>
  <circle cx="360" cy="226" r="5" fill="#8b98ab"/><text x="345" y="230" text-anchor="end" class="p">GND</text>
  <circle cx="624" cy="200" r="5" fill="#2dd4bf"/><text x="639" y="204" class="p">GPIO13</text>
  <circle cx="624" cy="244" r="5" fill="#8b98ab"/><text x="639" y="248" class="p">GND</text>
  <rect x="808" y="150" width="184" height="112" rx="8" fill="#131824" stroke="#2a3547"/>
  <text x="900" y="182" text-anchor="middle" class="l">Reed switch</text>
  <text x="900" y="202" text-anchor="middle" class="s">2 legs · no polarity</text>
  <circle cx="808" cy="224" r="5" fill="#2dd4bf"/><text x="820" y="228" class="p">leg A</text>
  <circle cx="808" cy="248" r="5" fill="#8b98ab"/><text x="820" y="252" class="p">leg B</text>
  <path d="M112 104 L112 138 L472 138 L472 80" fill="none" stroke="#e0a458" stroke-width="2.4" marker-end="url(#arw-w)"/>
  <path d="M629 200 L724 200 L724 224 L803 224" fill="none" stroke="#2dd4bf" stroke-width="2.4"/>
  <path d="M803 248 L700 248 L700 290 L360 290 L360 230" fill="none" stroke="#8b98ab" stroke-width="2.4" marker-end="url(#arw-w)"/>
</svg>
<figcaption>The whole circuit is two signal wires plus USB power — <span style="color:#2dd4bf">signal (GPIO13)</span>, <span style="color:#8b98ab">ground</span>, <span style="color:#e0a458">5 V in</span>.</figcaption>
</figure>

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
