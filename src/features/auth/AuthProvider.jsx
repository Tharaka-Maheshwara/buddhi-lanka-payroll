import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  onIdTokenChanged,
  signOut,
} from "firebase/auth";

import {
  doc,
  onSnapshot,
} from "firebase/firestore";

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
    let activeUid = null;
    let stopAccessListener = () => {};
    let accessTimer;

    function clearAccessCheck() {
      stopAccessListener();
      stopAccessListener = () => {};

      clearTimeout(accessTimer);
      accessTimer = undefined;
    }

    const stopAuthListener = onIdTokenChanged(
      auth,
      (user) => {
        /*
         * Same user, refreshed token:
         * keep the current page, access listener and loading state.
         */
        if (user && activeUid === user.uid) {
          setSession((previous) => {
            if (previous.user?.uid !== user.uid) {
              return previous;
            }

            return {
              ...previous,
              user,
            };
          });

          return;
        }

        const currentGeneration = ++generation;

        clearAccessCheck();
        activeUid = user?.uid ?? null;

        if (!user) {
          setSession((previous) => ({
            ...emptySession,
            error: previous.error,
          }));

          return;
        }

        // Only show initial access loading for a new login/account.
        setSession({
          ...emptySession,
          loading: true,
        });

        function denyAccess(message) {
          if (currentGeneration !== generation) return;

          generation++;
          activeUid = null;
          clearAccessCheck();

          setSession({
            ...emptySession,
            error: message,
          });

          void signOut(auth).catch((error) => {
            console.error(
              "Sign out failed:",
              error.code,
            );
          });
        }

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

            // Require server verification before granting access.
            if (snapshot.metadata.fromCache) return;

            clearTimeout(accessTimer);
            accessTimer = undefined;

            if (
              !snapshot.exists() ||
              snapshot.data().enabled !== true
            ) {
              denyAccess(
                "Only company-approved accounts can sign in.",
              );

              return;
            }

            const currentUser = auth.currentUser;

            if (currentUser?.uid !== user.uid) return;

            setSession({
              user: currentUser,
              admin: true,
              loading: false,
              error: "",
            });
          },

          (error) => {
            if (currentGeneration !== generation) return;

            console.error(
              "Account access check failed:",
              error.code,
            );

            denyAccess(
              error.code === "permission-denied"
                ? "Access denied. Check your access document and published Firestore rules."
                : "Unable to verify account access. Check your connection and sign in again.",
            );
          },
        );
      },
    );

    return () => {
      generation++;
      activeUid = null;

      clearAccessCheck();
      stopAuthListener();
    };
  }, []);

  async function logout() {
    if (auth) {
      await signOut(auth);
    }

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

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider.",
    );
  }

  return context;
}