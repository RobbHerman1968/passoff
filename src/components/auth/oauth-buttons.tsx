import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";

/* Provider marks must keep their official brand colors. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1.125rem]">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1.125rem]" fill="currentColor">
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}

export function OAuthButtons({
  callbackUrl,
  disabled,
}: {
  callbackUrl?: string;
  disabled?: boolean;
}) {
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl, "/onboarding");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: safeCallbackUrl });
        }}
      >
        <Button
          type="submit"
          variant="outline"
          className="w-full gap-2.5"
          disabled={disabled}
        >
          <GoogleMark />
          Continue with Google
        </Button>
      </form>
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: safeCallbackUrl });
        }}
      >
        <Button
          type="submit"
          variant="outline"
          className="w-full gap-2.5"
          disabled={disabled}
        >
          <GitHubMark />
          Continue with GitHub
        </Button>
      </form>
    </div>
  );
}
