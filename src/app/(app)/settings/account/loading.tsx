import { LoadingState } from "@/components/loading-state";

export default function AccountLoading() {
  return <LoadingState label="Loading your account" withHeader rows={3} />;
}
