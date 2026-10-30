# Local bridge

The hardware bridge runs on the computer connected to the X32 and ATEM network.
It listens on loopback only (`127.0.0.1`) and will not accept control requests
from the hosted preview or other websites.

1. Install Node.js 24 and pnpm on the operator computer.
2. From the project root, run `pnpm install`.
3. Build the console with `pnpm --filter @workspace/stream-audio-control run build`.
4. Start the local bridge with `pnpm --filter @workspace/stream-audio-control run local`.
5. Open `http://127.0.0.1:4179` on that same computer.
6. Enter the private IPv4 addresses of the X32 and ATEM, then choose the bus
   already routed to the stream.

Connection only performs read requests. Level and mute changes are limited to
the selected X32 bus and require confirmation in the console. No ATEM settings
are changed. Peak metering is reported as unavailable until a verified meter
subscription is enabled for the installed X32 firmware/model.

The app has not been tested against physical hardware. Confirm the selected bus
and current show routing on the console before sending any level or mute command.
