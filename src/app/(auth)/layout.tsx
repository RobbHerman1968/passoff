import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-full flex-1 bg-background lg:grid-cols-2">
      <main id="main-content" className="flex flex-col page-padding">
        {children}
      </main>
      <AuthBrandPanel />
    </div>
  );
}
