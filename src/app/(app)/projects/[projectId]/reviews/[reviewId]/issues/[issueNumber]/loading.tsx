import { LoadingState } from "@/components/loading-state";

export default function IssueDetailLoading() {
  return <LoadingState label="Loading issue" withHeader rows={3} />;
}
