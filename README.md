# MAVLink.ts

A minimal, type-safe TypeScript library for MAVLink v1 and v2.

## Generating Schema

Use the CLI to generate a TypeScript schema from MAVLink XML definitions.

```bash
npx mavlink-generate --out src/schema.ts https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/common.xml
```

## Usage

```typescript
import { createMavlinkChannel } from "mavlink.ts";
import { schema } from "./schema";

const mavlink = createMavlinkChannel({
  receive: (_: (data: Uint8Array) => void) => {},
  send: (data: Uint8Array) => {}
}, schema);

// Type-safe message reception
mavlink.receive(({ message, systemId, componentId }) => {
  if (message.type === "HEARTBEAT") {
    console.log(`Heartbeat from ${systemId}: ${message.autopilot}`);
  }
});

// Type-safe message sending
mavlink.send({
  systemId: 1,
  componentId: 1,
  message: {
    type: "HEARTBEAT",
    type_: "GCS",
    autopilot: "GENERIC",
    baseMode: ["MANUAL_INPUT_ENABLED", "SAFETY_ARMED"],
    systemStatus: "ACTIVE",
    customMode: 0,
    mavlinkVersion: 3,
  },
});
```

## Architecture

- No dependencies for serialization/deserialization.
- Generated schemas provide full TypeScript autocomplete for all messages and enums.
