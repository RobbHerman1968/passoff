import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { PasswordInput } from "@/components/auth/password-input";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { AppProviders } from "@/components/app-providers";
import { FormField } from "@/components/form-field";

vi.mock("@/app/(auth)/actions", () => ({
  signInWithCredentialsAction: vi.fn(async () => ({ status: "idle" })),
  signUpAction: vi.fn(async () => ({ status: "idle" })),
  forgotPasswordAction: vi.fn(async () => ({ status: "idle" })),
  resetPasswordAction: vi.fn(async () => ({ status: "idle" })),
  createWorkspaceAction: vi.fn(async () => ({ status: "idle" })),
  signOutAction: vi.fn(async () => ({ status: "idle" })),
}));

function wrap(node: React.ReactNode) {
  return render(<AppProviders>{node}</AppProviders>);
}

describe("auth forms accessibility", () => {
  it("associates labels and errors on sign-in", async () => {
    const { container } = wrap(
      <SignInForm
        callbackUrl="/dashboard"
        oauthButtons={<button type="button">Continue with Google</button>}
      />,
    );

    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("toggles password visibility accessible names", async () => {
    const user = userEvent.setup();
    wrap(
      <FormField id="password" label="Password">
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </FormField>,
    );

    const toggle = screen.getByRole("button", { name: "Show password" });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("supports keyboard activation of password visibility", async () => {
    const user = userEvent.setup();
    wrap(
      <FormField id="password" label="Password">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </FormField>,
    );

    const toggle = screen.getByRole("button", { name: "Show password" });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveFocus();
  });

  it("checks signup, forgot, reset, and onboarding pages for a11y", async () => {
    const signup = wrap(
      <SignUpForm oauthButtons={<button type="button">Continue with GitHub</button>} />,
    );
    expect(await axe(signup.container)).toHaveNoViolations();
    signup.unmount();

    const forgot = wrap(<ForgotPasswordForm />);
    expect(await axe(forgot.container)).toHaveNoViolations();
    forgot.unmount();

    const reset = wrap(<ResetPasswordForm token="test-token" />);
    expect(await axe(reset.container)).toHaveNoViolations();
    reset.unmount();

    const onboarding = wrap(<OnboardingForm />);
    expect(await axe(onboarding.container)).toHaveNoViolations();
  });
});
