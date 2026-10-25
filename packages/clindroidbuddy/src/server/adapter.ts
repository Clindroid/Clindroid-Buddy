import type { UpgradeWebSocket } from "hono/ws"

export interface Runtime {
  upgradeWebSocket: UpgradeWebSocket
}

export interface Adapter {
  create(): Runtime
}
