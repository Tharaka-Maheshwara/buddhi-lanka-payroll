import { useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../../lib/firebase/client";
import { firebaseReady } from "../../config/env";
import { Button, Field } from "../../shared/ui";
import { useAuth } from "./AuthProvider";

export function LoginPage() {
  const { error: accessError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRequest(resetPassword) {
    if (!auth || busy) return;

    setBusy(true);
    setMessage("");

    try {
      if (resetPassword) {
        await sendPasswordResetEmail(auth, email.trim());
        setMessage(
          "If this account is registered, a reset email will be sent.",
        );
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch {
      setMessage(
        "Unable to complete this request. Check your details and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-5">
      <form
        className="card w-full max-w-md space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          handleRequest(false);
        }}
      >
        <img
          src="/company-logo.png"
          alt="Buddhi Lanka Engineers"
          className="h-20 w-32 object-contain"
        />

        <div>
          <p className="eyebrow">BUDDHI LANKA ENGINEERS</p>
          <h1>Administrator login</h1>
          <p>Sign in with your company-approved account.</p>
        </div>

        {!firebaseReady && (
          <p role="alert" className="notice">
            Complete the Firebase configuration in your .env file.
          </p>
        )}

        <Field label="Email">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {accessError && (
          <p role="alert" className="text-sm text-red-600">
            {accessError}
          </p>
        )}

        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}

        <Button disabled={!auth || busy}>
          {busy ? "Please wait…" : "Sign in"}
        </Button>

        <button
          type="button"
          className="block text-sm underline"
          disabled={!auth || busy || !email}
          onClick={() => handleRequest(true)}
        >
          Reset password
        </button>
      </form>
    </main>
  );
}