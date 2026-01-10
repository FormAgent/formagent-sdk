/**
 * System prompt module exports
 * @module formagent-sdk/prompt
 */

// Builder
export {
  SystemPromptBuilderImpl,
  createSystemPromptBuilder,
  defaultSystemPromptBuilder,
} from "./builder"

// Presets
export {
  // New presets
  CLI_AGENT_PRESET,
  SDK_DEFAULT_PRESET,
  // Legacy presets (backward compatibility)
  CLAUDE_CODE_PRESET,
  DEFAULT_PRESET,
  MINIMAL_PRESET,
  // Preset maps
  BUILT_IN_PRESETS,
  EXTENDED_PRESETS,
  PRESET_INFO,
  // Preset getters
  getBuiltInPreset,
  getPreset,
  // Context generators
  generateEnvContext,
  generateToolList,
  // Types
  type ExtendedPresetType,
} from "./presets"

// CLAUDE.md loader
export {
  ClaudeMdLoaderImpl,
  createClaudeMdLoader,
  defaultClaudeMdLoader,
  CLAUDE_MD_FILENAME,
  USER_CLAUDE_DIR,
} from "./claude-md"
