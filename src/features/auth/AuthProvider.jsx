import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../lib/firebase/client";

const AuthContext = createContext(null);

const emptySession = {
  user: null,
  admin: false,
  loading: false,
  error: "",
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState({
    ...emptySession,
    loading: Boolean(auth && db),
  });

  useEffect(() => {
    if (!auth || !db) return;

    let generation = 0;
    let stopAccessListener = () => {};
    let accessTimer;

    function clearAccessCheck() {
      stopAccessListener();
      stopAccessListener = () => {};

      clearTimeout(accessTimer);
    }

    const stopAuthListener = onIdTokenChanged(auth, (user) => {
      const currentGeneration = ++generation;

      clearAccessCheck();

      if (!user) {
        setSession((previous) => ({
          ...emptySession,
          error: previous.error,
        }));
        return;
      }

      setSession({
        ...emptySession,
        loading: true,
      });

      function denyAccess(message) {
        if (currentGeneration !== generation) return;

        // Ignore callbacks belonging to this completed access check.
        generation++;
        clearAccessCheck();

        setSession({
          ...emptySession,
          error: message,
        });

        void signOut(auth).catch(() => {});
      }

      // Return to login if server verification takes too long.
      accessTimer = setTimeout(() => {
        denyAccess(
          "Account verification timed out. Check your connection and sign in again.",
        );
      }, 15000);

      stopAccessListener = onSnapshot(
        doc(db, "access", user.uid),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (currentGeneration !== generation) return;

          if (snapshot.metadata.fromCache) return;

          clearTimeout(accessTimer);

          if (
            !snapshot.exists() ||
            snapshot.data().enabled !== true
          ) {
            denyAccess(
              "Only company-approved accounts can sign in.",
            );
            return;
          }

          setSession({
            user,
            admin: true,
            loading: false,
            error: "",
          });
        },
        (error) => {
          console.error("Account access check failed:", error.code);

          denyAccess(
            error.code === "permission-denied"
              ? "Access denied. Check your access document and published Firestore rules."
              : "Unable to verify account access. Check your connection and sign in again.",
          );
        },
      );
    });

    return () => {
      generation++;
      clearAccessCheck();
      stopAuthListener();
    };
  }, []);

  async function logout() {
    if (!auth) return;

    await signOut(auth);
    setSession({ ...emptySession });
  }

  return (
    <AuthContext.Provider
      value={{
        ...session,
        demo: false,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);