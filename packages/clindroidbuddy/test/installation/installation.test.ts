import { describe, expect, test } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Installation } from "../../src/installation"
import { InstallationVersion } from "../../src/installation/version"

function mockHttpClient(handler: (request: HttpClientRequest.HttpClientRequest) => Response) {
  const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))))
  return Layer.succeed(HttpClient.HttpClient, client)
}

function mockSpawner(handler: (cmd: string, args: readonly string[]) => string = () => "") {
  const spawner = ChildProcessSpawner.make((command) => {
    const std = ChildProcess.isStandardCommand(command) ? command : undefined
    const output = handler(std?.command ?? "", std?.args ?? [])
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: { [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") } as any,
        stdout: output ? Stream.make(new TextEncoder().encode(output)) : Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => ({ [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") }) as any,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    )
  })
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
}

// The HTTP client is never actually invoked anymore (latest/upgrade are disabled),
// but the layer's type still declares it as a requirement, so a mock is provided
// purely to satisfy `Layer.provide`.
function testLayer(spawnHandler?: (cmd: string, args: readonly string[]) => string) {
  return Installation.layer.pipe(
    Layer.provide(mockHttpClient(() => new Response("should not be called", { status: 500 }))),
    Layer.provide(mockSpawner(spawnHandler)),
  )
}

describe("installation", () => {
  describe("latest", () => {
    test("returns the current version without any network or process calls, regardless of method", async () => {
      const layer = testLayer()

      for (const method of [undefined, "npm", "brew", "choco", "scoop", "curl", "unknown"] as const) {
        const result = await Effect.runPromise(
          Installation.Service.use((svc) => svc.latest(method)).pipe(Effect.provide(layer)),
        )
        expect(result).toBe(InstallationVersion)
      }
    })
  })

  describe("upgrade", () => {
    test("always fails since automatic updates are disabled", async () => {
      const layer = testLayer()

      const exit = await Effect.runPromiseExit(
        Installation.Service.use((svc) => svc.upgrade("npm", "9.9.9")).pipe(Effect.provide(layer)),
      )
      expect(exit._tag).toBe("Failure")
    })
  })
})
