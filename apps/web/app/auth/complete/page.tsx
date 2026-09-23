import { redirect } from "next/navigation";
import { completeSignIn } from "../callback/page";

/**
 * Second half of the implicit-flow sign-in.
 *
 * The client has set the session cookies and navigated here, so the server can now see
 * who this is and finish the same work the query-string paths do.
 */
export default async function AuthCompletePage() {
  redirect(await completeSignIn());
}
