"use client";

import { SessionProvider } from "next-auth/react";
import { JSX } from "react";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return <SessionProvider>{children}</SessionProvider>;
}
