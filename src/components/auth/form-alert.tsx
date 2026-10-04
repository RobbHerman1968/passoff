import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function FormAlert({
  id,
  tone = "error",
  title,
  description,
}: {
  id?: string;
  tone?: "error" | "success" | "info";
  title: string;
  description?: string;
}) {
  const variant =
    tone === "error" ? "destructive" : tone === "success" ? "success" : "info";

  return (
    <Alert
      id={id}
      variant={variant}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  );
}
