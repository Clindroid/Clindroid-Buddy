import { createBunWebSocket } from "hono/bun"
import type { Adapter } from "./adapter"

export const adapter: Adapter = {
  create() {
    const ws = createBunWebSocket()
    return {
      upgradeWebSocket: ws.upgradeWebSocket,
    }
  },
}
