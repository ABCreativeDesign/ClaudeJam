export interface NodeSummary {
  id: string;
  type: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface BoardState {
  file: string;
  page: string;
  nodes: NodeSummary[];
}

export interface PluginCommand {
  id: string;
  type:
    | "read_board"
    | "create_node"
    | "create_connector"
    | "update_node"
    | "delete_nodes"
    | "get_selection"
    | "list_pages"
    | "switch_page";
  params: Record<string, unknown>;
}

export interface PluginResponse {
  id: string;
  result?: unknown;
  error?: string;
}
