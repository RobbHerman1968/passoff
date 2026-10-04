import { LoadingState } from "@/components/loading-state";

export default function ReviewLoading() {
  return <LoadingState label="Loading review" withHeader rows={3} />;
}
