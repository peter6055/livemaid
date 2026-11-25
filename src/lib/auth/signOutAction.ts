"use server";

import { signOut } from "@/lib/auth";

export async function signOutAction() {
  // Clear the session cookie and let the client navigate. Redirecting from the
  // action rejects the caller's promise with NEXT_REDIRECT, which surfaces as an
  // error toast on the login page.
  await signOut({ redirect: false });
}
