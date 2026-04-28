import { redirect } from "next/navigation";

export default function ApiKeyRedirect() {
  redirect("/settings?tab=api-key");
}
