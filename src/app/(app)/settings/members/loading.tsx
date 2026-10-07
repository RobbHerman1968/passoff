import { LoadingState } from "@/components/loading-state";

export default function MembersLoading() {
  return <LoadingState label="Loading members" withHeader rows={4} />;
}
