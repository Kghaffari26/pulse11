import { Inngest } from "inngest";

// Create Inngest client
export const inngest = new Inngest({
  id: process.env.INNGEST_APP_ID || "pulse11",
  eventKey: process.env.INNGEST_EVENT_KEY || "local",
  // For production, signing key is required to verify webhook requests from Inngest
  ...(process.env.NODE_ENV === "production" && {
    signingKey: process.env.INNGEST_SIGNING_KEY,
  }),
  // For local development, events are sent directly to the dev server
  isDev: process.env.NODE_ENV !== "production",
});
