import { bashTool } from "./bash.js";
import { editFileTool } from "./editFile.js";
import { grepTool } from "./grep.js";
import { listFilesTool } from "./listFiles.js";
import { readFileTool } from "./readFile.js";
import { ToolRegistry } from "./registry.js";
import { writeFileTool } from "./writeFile.js";

export const coreTools = [readFileTool, listFilesTool, grepTool, writeFileTool, editFileTool, bashTool];

export function createCoreRegistry() {
  return new ToolRegistry(coreTools);
}
