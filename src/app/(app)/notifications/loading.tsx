import { LoadingState } from "@/components/loading-state";

export default function NotificationsLoading() {
  return <LoadingState label="Loading notifications" withHeader rows={4} />;
}
