import { createInterface, type Interface } from "node:readline";

/**
 * A line reader that buffers input. `readline.question()` silently drops lines
 * that arrive before it is called (common with piped input), so we queue every
 * line ourselves and hand them out one at a time.
 */
export class LineReader {
  private rl: Interface;
  private queue: string[] = [];
  private waiting: ((line: string | null) => void) | null = null;
  private closed = false;

  constructor(input: NodeJS.ReadableStream = process.stdin, private output: NodeJS.WritableStream = process.stdout) {
    this.rl = createInterface({ input, terminal: false });
    this.rl.on("line", (line) => this.push(line));
    this.rl.on("close", () => {
      this.closed = true;
      this.waiting?.(null);
      this.waiting = null;
    });
  }

  private push(line: string) {
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve(line);
    } else {
      this.queue.push(line);
    }
  }

  /** Resolves with the next line, or null when input has ended. */
  read(prompt = ""): Promise<string | null> {
    if (prompt) this.output.write(prompt);
    if (this.queue.length) return Promise.resolve(this.queue.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => (this.waiting = resolve));
  }

  close() {
    this.rl.close();
  }
}
