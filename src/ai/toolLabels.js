import { translate } from '../i18n.js';

// Display translations only. Protocol IDs and workflow permissions stay stable.
const labels = {
  read_app_documentation: { label: "assistant.tools.read_app_documentation.label", description: "assistant.tools.read_app_documentation.description" },
  get_session_memory: { label: "assistant.tools.get_session_memory.label", description: "assistant.tools.get_session_memory.description" },
  remember_context: { label: "assistant.tools.remember_context.label", description: "assistant.tools.remember_context.description" },
  inspect_board_view: { label: "assistant.tools.inspect_board_view.label", description: "assistant.tools.inspect_board_view.description" },
  resolve_view_point: { label: "assistant.tools.resolve_view_point.label", description: "assistant.tools.resolve_view_point.description" },
  inspect_spatial_context: { label: "assistant.tools.inspect_spatial_context.label", description: "assistant.tools.inspect_spatial_context.description" },
  list_nav_areas: { label: "assistant.tools.list_nav_areas.label", description: "assistant.tools.list_nav_areas.description" },
  find_nav_path: { label: "assistant.tools.find_nav_path.label", description: "assistant.tools.find_nav_path.description" },
  get_action_history: { label: "assistant.tools.get_action_history.label", description: "assistant.tools.get_action_history.description" },
  get_board_state: { label: "assistant.tools.get_board_state.label", description: "assistant.tools.get_board_state.description" },
  get_map_context: { label: "assistant.tools.get_map_context.label", description: "assistant.tools.get_map_context.description" },
  list_map_places: { label: "assistant.tools.list_map_places.label", description: "assistant.tools.list_map_places.description" },
  find_map_locations: { label: "assistant.tools.find_map_locations.label", description: "assistant.tools.find_map_locations.description" },
  apply_tactical_changes: { label: "assistant.tools.apply_tactical_changes.label", description: "assistant.tools.apply_tactical_changes.description" },
  search_utilities: { label: "assistant.tools.search_utilities.label", description: "assistant.tools.search_utilities.description" },
  get_utility_details: { label: "assistant.tools.get_utility_details.label", description: "assistant.tools.get_utility_details.description" },
  import_utility: { label: "assistant.tools.import_utility.label", description: "assistant.tools.import_utility.description" },
  manage_frames: { label: "assistant.tools.manage_frames.label", description: "assistant.tools.manage_frames.description" },
  control_camera: { label: "assistant.tools.control_camera.label", description: "assistant.tools.control_camera.description" },
  edit_history: { label: "assistant.tools.edit_history.label", description: "assistant.tools.edit_history.description" },
  clear_board: { label: "assistant.tools.clear_board.label", description: "assistant.tools.clear_board.description" },
  list_archives: { label: "assistant.tools.list_archives.label", description: "assistant.tools.list_archives.description" },
  manage_archive_folders: { label: "assistant.tools.manage_archive_folders.label", description: "assistant.tools.manage_archive_folders.description" },
  request_room_action: { label: "assistant.tools.request_room_action.label", description: "assistant.tools.request_room_action.description" },
  request_archive_action: { label: "assistant.tools.request_archive_action.label", description: "assistant.tools.request_archive_action.description" },
  conversation: { label: "assistant.tools.conversation.label", description: "assistant.tools.conversation.description" },
};
export function toolDisplay(name, language) {
  const row = labels[name] || { label: "assistant.tools.other.label", description: "assistant.tools.other.description" };
  return { label: translate(language, row.label), description: translate(language, row.description) };
}
