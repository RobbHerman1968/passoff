import "jest-axe";

declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): this;
  }
}
