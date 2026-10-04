import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Local helper to clear Auth.js cookies after secret/strategy changes.
 * Visit /api/dev/clear-session
 * Only available outside production.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  const present = cookieStore.getAll();
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";

  if (debug) {
    return NextResponse.json({
      cookies: present.map((cookie) => ({
        name: cookie.name,
        length: cookie.value.length,
      })),
    });
  }

  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  const names = new Set(present.map((cookie) => cookie.name));

  for (let i = 0; i < 10; i += 1) {
    names.add(`authjs.session-token.${i}`);
    names.add(`__Secure-authjs.session-token.${i}`);
    names.add(`next-auth.session-token.${i}`);
  }

  names.add("authjs.session-token");
  names.add("__Secure-authjs.session-token");
  names.add("__Host-authjs.session-token");
  names.add("authjs.csrf-token");
  names.add("__Host-authjs.csrf-token");
  names.add("authjs.callback-url");
  names.add("__Secure-authjs.callback-url");
  names.add("next-auth.session-token");
  names.add("__Secure-next-auth.session-token");
  names.add("next-auth.csrf-token");
  names.add("next-auth.callback-url");

  for (const name of names) {
    cookieStore.delete(name);
    response.cookies.delete({
      name,
      path: "/",
    });
    response.cookies.set({
      name,
      value: "deleted",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-") || name.startsWith("__Host-"),
    });
  }

  return response;
}
