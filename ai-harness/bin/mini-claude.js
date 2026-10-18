#!/usr/bin/env node
// Lets you run `mini-claude` from any directory after `npm link`, without a build step.
import { register } from "tsx/esm/api";

register();
await import("../src/index.ts");
