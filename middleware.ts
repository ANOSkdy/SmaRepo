import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((request) => {
  if (request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (!request.auth) {
    const loginUrl = new URL("/login", request.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

// この設定で、どのページを認証保護の対象にするかを定義します
export const config = {
  matcher: [
    "/reports/:path*",
    "/dashboard/:path*",
    "/report/:path*",
    "/inventory/:path*",
  ],
};
