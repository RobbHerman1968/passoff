import { LoadingState } from "@/components/loading-state";

export default function BillingLoading() {
  return <LoadingState label="Loading your plan" withHeader rows={3} />;
}
