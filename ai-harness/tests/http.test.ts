import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { llmFetch, withCause } from "../src/llm/http.js";

describe("llmFetch", () => {
  it("keeps reading a response body that pauses mid-stream", async () => {
    const server = createServer((_req, res) => {
      res.write("first\n");
      setTimeout(() => res.end("late\n"), 300);
    }).listen(0);
    const { port } = server.address() as AddressInfo;
    try {
      const res = await llmFetch(`http://localhost:${port}`, {});
      expect(await res.text()).toBe("first\nlate\n");
    } finally {
      server.close();
    }
  });

  it("adds the cause to opaque network errors but leaves aborts alone", async () => {
    const err = new TypeError("terminated", { cause: { code: "UND_ERR_BODY_TIMEOUT", message: "Body Timeout Error" } });
    expect((withCause(err) as Error).message).toBe("terminated (UND_ERR_BODY_TIMEOUT: Body Timeout Error)");
    const abort = new DOMException("aborted", "AbortError");
    expect(withCause(abort)).toBe(abort);
  });
});
