import { LoadingState } from "@/components/loading-state";

export default function WorkspaceSettingsLoading() {
  return <LoadingState label="Loading workspace settings" withHeader rows={3} />;
}
