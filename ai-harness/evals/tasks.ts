import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface EvalTask {
  id: string;
  /** Files to create in a fresh temp project before the run. */
  files: Record<string, string>;
  prompt: string;
  /** Decide pass/fail from the final project state and the agent's answer. Return a failure reason or null. */
  check(cwd: string, answer: string): string | null;
}

const quiet = { encoding: "utf8" as const, timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"] };
const node = (cwd: string, code: string) => execFileSync("node", ["-e", code], { cwd, ...quiet });
const firstErrorLine = (err: unknown) =>
  String((err as { stderr?: string }).stderr ?? (err as Error).message)
    .split("\n")
    .find((l) => /Error/.test(l))
    ?.trim() ?? (err as Error).message.split("\n")[0];

export const tasks: EvalTask[] = [
  {
    id: "fix-add-bug",
    files: { "math.js": "function add(a, b) {\n  return a - b;\n}\nconsole.log(add(2, 3));\n" },
    prompt: "math.js should print 5 but it does not. Find and fix the bug, then run it to verify.",
    check(cwd) {
      const src = readFileSync(join(cwd, "math.js"), "utf8");
      // Do not just check the printed output: a model can "fix" it by hard-coding console.log(5).
      try {
        const out = node(cwd, `${src.replace(/console\.log\([^)]*\)\)?;?/g, "")}\nprocess.stdout.write(String(add(10, 7)))`);
        return out === "17" ? null : `add(10, 7) returned ${out}`;
      } catch (err) {
        return `math.js no longer runs: ${firstErrorLine(err)}`;
      }
    },
  },
  {
    id: "find-controller",
    files: {
      "routes/web.php":
        "<?php\n\nuse App\\Http\\Controllers\\HomeController;\nuse App\\Http\\Controllers\\ReportController;\n\n" +
        "Route::get('/', [HomeController::class, 'index']);\n" +
        "Route::middleware('auth')->group(function () {\n" +
        "    Route::get('/reports', [ReportController::class, 'index']);\n" +
        "    Route::get('/reports/{id}', [ReportController::class, 'show']);\n});\n",
      "app/Http/Controllers/ReportController.php": "<?php\n\nclass ReportController {\n    public function index() {}\n    public function show($id) {}\n}\n",
    },
    prompt: "Which controller class and method handle GET /reports/{id}? Answer as Class@method.",
    check(_cwd, answer) {
      return /ReportController\s*@\s*show/.test(answer) ? null : `answer was: ${answer.slice(0, 120)}`;
    },
  },
  {
    id: "create-module",
    files: { "package.json": '{ "type": "module" }\n' },
    prompt: "Create greet.js that exports a function greet(name) returning exactly `Hello, <name>!`.",
    check(cwd) {
      try {
        const out = execFileSync(
          "node",
          ["--input-type=module", "-e", "import { greet } from './greet.js'; process.stdout.write(greet('Ada'))"],
          { cwd, ...quiet },
        );
        return out === "Hello, Ada!" ? null : `greet('Ada') returned ${JSON.stringify(out)}`;
      } catch (err) {
        return `import failed: ${firstErrorLine(err)}`;
      }
    },
  },
];
