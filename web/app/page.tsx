import { redirect } from "next/navigation";

// Netlify's @netlify/plugin-nextjs static-prerenders pages by default,
// which bakes the redirect() throw into HTML and serves it as a 200
// with __next_error__ instead of a 307. Forcing dynamic rendering
// makes the redirect run at request time and produce the proper 3xx.
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/screening");
}
