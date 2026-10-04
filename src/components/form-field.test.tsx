import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";

describe("FormField", () => {
  it("connects the visible label, description, and inline error", () => {
    render(
      <FormField
        id="project-name"
        label="Project name"
        description="Use the client or campaign name."
        error="Enter a project name so teammates can find this review."
      >
        <Input />
      </FormField>,
    );

    const field = screen.getByLabelText("Project name");
    expect(field).toHaveAccessibleDescription(
      "Use the client or campaign name. Enter a project name so teammates can find this review.",
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("Enter a project name so teammates can find this review.");
  });
});
