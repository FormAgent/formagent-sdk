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
export type { ToolManagerOptions, ToolFilter, AllowedToolsSpec, ToolRepairResult } from "./manager"

// Built-in tools
export {
  // Tool collections
  builtinTools,
  fileTools,
  webTools,
  createBuiltinTools,
  createFileTools,
  createWebTools,
  // Individual tools
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  GlobTool,
  GrepTool,
  WebFetchTool,
  WebSearchTool,
  TodoWriteTool,
  // Tool factories
  createBashTool,
  createReadTool,
  createWriteTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createWebFetchTool,
  createWebSearchTool,
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
  WebSearchInput,
  TodoItem,
  TodoWriteInput,
} from "./builtin"
