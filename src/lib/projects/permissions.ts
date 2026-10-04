export function canDeleteProjects(context: {
  role: "owner" | "member";
}): boolean {
  return context.role === "owner";
}

export function canMutateProjects(context: {
  role: "owner" | "member";
}): boolean {
  return context.role === "owner" || context.role === "member";
}
