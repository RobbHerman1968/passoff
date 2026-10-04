import { FormAlert } from "@/components/auth/form-alert";
import { getNoticeMessage } from "@/lib/projects/notices";

export function SuccessNotice({ notice }: { notice?: string }) {
  const message = getNoticeMessage(notice);
  if (!message) return null;

  return (
    <div className="mb-6" tabIndex={-1} id="success-notice">
      <FormAlert tone="success" title={message} />
    </div>
  );
}
