# MAVLink.ts

Minimal, type-safe MAVLink for TypeScript. Parses MAVLink v1 and v2; encodes MAVLink v2.

## Install

```bash
npm install mavlink.ts
```

## Generate Schema

Use the CLI to generate a TypeScript schema from one or more MAVLink XML definitions.

```bash
npx mavlink-generate --out src/gen/schema.ts \
  https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/common.xml
```

This generates `schema`, message types, and enum maps for bitmasks and enums.

## Usage

```typescript
import { createMavlinkChannel } from "mavlink.ts";
import { schema } from "./gen/schema";

const channel = {
  receive: (handler: (data: Uint8Array) => void) => {}
  send: (data: Uint8Array) => {}
  close: () => {}
};

const mavlink = createMavlinkChannel(channel, schema);

// Type-safe message reception
mavlink.receive(({ type, message, systemId, componentId }) => {
  if (type === "HEARTBEAT") {
    console.log(`Heartbeat from ${systemId}: ${message.autopilot}`);
  }
});

// Type-safe message sending (MAVLink v2 frame)
mavlink.send({
  systemId: 1,
  componentId: 1,
  type: "HEARTBEAT",
  message: {
    type: "GCS",
    autopilot: "GENERIC",
    baseMode: ["MANUAL_INPUT_ENABLED", "SAFETY_ARMED"],
    systemStatus: "ACTIVE",
    customMode: 0,
    mavlinkVersion: 3,
  },
});
```

## Architecture

- Zero runtime dependencies for parsing/encoding; the CLI uses `fast-xml-parser` to generate code.
- Generated schemas provide full TypeScript autocomplete for messages and enums.
