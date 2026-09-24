"use client";

import { NotFoundScreen } from "@/features/nav/not-found-screen";

// A mistyped, removed or other shop's account (NOT_FOUND / invalid id) must not crash the app.
export default function AccountError() {
  return <NotFoundScreen backHref="/accounts" />;
}
