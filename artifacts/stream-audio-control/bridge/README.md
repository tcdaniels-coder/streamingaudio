# Local bridge for macOS and Windows

The hardware bridge runs on the computer connected to the X32 and ATEM network.
It listens on loopback only (`127.0.0.1`) and will not accept control requests
from the hosted preview or other websites.

## Requirements

- Node.js 24 LTS and pnpm 10.
- The operator computer and both devices must be reachable on the same private
  production network.
- Connect the ATEM Production Studio 4K over Ethernet. The ATEM connection
  library used here does not support USB control.
- If prompted, allow Node.js through the macOS or Windows firewall on the
  private network.

The `atem-connection` library reports that it is tested on switcher models from
every generation and aims to support all models. This exact Production Studio
4K unit and its firmware have not been tested with this app. See the
[library's device-support notes](https://www.npmjs.com/package/atem-connection#device-support)
and the [Blackmagic ATEM Production Studio resources](https://www.blackmagicdesign.com/developer/products/atem/resources).

## Install and run

Install Node.js 24 LTS, then install pnpm 10:

```sh
npm install --global pnpm@10
```

On the operator computer, download or clone the full project. In Terminal
(macOS) or PowerShell (Windows), change to the project root and run:

```sh
pnpm install
pnpm --filter "@workspace/stream-audio-control" run build
pnpm --filter "@workspace/stream-audio-control" run local
```

Keep that terminal open and visit `http://127.0.0.1:4179` on the same computer.
Enter the private IPv4 addresses of the X32 and ATEM, then choose the bus
already routed to the stream. Stop the bridge with `Ctrl+C`.

Connection only performs read requests. Level and mute changes are limited to
the selected X32 bus and require confirmation in the console. No ATEM settings
are changed. Peak metering is reported as unavailable until a verified meter
subscription is enabled for the installed X32 firmware/model.

The app has not been tested against physical hardware. Confirm the selected bus
and current show routing on the console before sending any level or mute command.
