/**
 * Tool system exports
 * @module formagent-sdk/tools
 */

// Tool registry
export { ToolRegistry } from "./registry"

// Tool helper
export { tool, simpleTool, zodToJsonSchema } from "./tool"
export type { ToolHelperOptions } from "./tool"

// MCP server support
export {
  createMCPToolName,
  parseMCPToolName,
  isMCPTool,
  MCPServerWrapper,
  createSdkMcpServer,
  MCPServerManager,
  defaultMCPServerManager,
  MCP_NAMESPACE_SEPARATOR,
} from "./mcp"

// Tool manager
export {
  ToolManager,
  createToolManager,
  defaultToolManager,
} from "./manager"
export type { ToolManagerOptions, ToolFilter, AllowedToolsSpec } from "./manager"

// Built-in tools
export {
  // Tool collections
  builtinTools,
  fileTools,
  createBuiltinTools,
  createFileTools,
  // Individual tools
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  GlobTool,
  GrepTool,
  WebFetchTool,
  TodoWriteTool,
  // Tool factories
  createBashTool,
  createReadTool,
  createWriteTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createWebFetchTool,
  createTodoWriteTool,
  // Todo utilities
  getTodos,
  clearTodos,
  setTodoChangeCallback,
} from "./builtin"

// Skill tool
export {
  createSkillTool,
  skillTool,
  DEFAULT_USER_SKILLS_PATH,
  getProjectSkillsPath,
} from "./skill"
export type { SkillToolConfig } from "./skill"

// Built-in tool types
export type {
  BuiltinToolContext,
  BuiltinToolOptions,
  BashInput,
  ReadInput,
  WriteInput,
  EditInput,
  GlobInput,
  GrepInput,
  WebFetchInput,
  TodoItem,
  TodoWriteInput,
} from "./builtin"
