"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

// For what has to run in the browser: passkeys (WebAuthn). Everything else
// signs in through server actions.
export const authClient = createAuthClient({ plugins: [passkeyClient()] });
