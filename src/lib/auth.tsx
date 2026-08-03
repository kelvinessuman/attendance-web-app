import React, { createContext, useContext, useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string, confirmPassword: string) => Promise<{ requiresVerification: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function parseJsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await parseJsonOrThrow(res);
    setUser(data.user);
  };

  const register = async (email: string, fullName: string, password: string, confirmPassword: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, fullName, password, confirmPassword }),
    });
    const data = await parseJsonOrThrow(res);
    if (data.user) {
      setUser(data.user);
    }
    return { requiresVerification: !!data.requiresVerification };
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}





// import React, { createContext, useContext, useEffect, useState } from "react";

// export interface AuthUser {
//   id: string;
//   email: string;
//   fullName: string;
// }

// interface AuthContextValue {
//   user: AuthUser | null;
//   loading: boolean;
//   login: (email: string, password: string) => Promise<void>;
//   register: (email: string, fullName: string, password: string, confirmPassword: string) => Promise<void>;
//   logout: () => Promise<void>;
//   refresh: () => Promise<void>;
// }

// const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// async function parseJsonOrThrow(res: Response) {
//   const data = await res.json().catch(() => ({}));
//   if (!res.ok) {
//     throw new Error(data.error || "Something went wrong. Please try again.");
//   }
//   return data;
// }

// export function AuthProvider({ children }: { children: React.ReactNode }) {
//   const [user, setUser] = useState<AuthUser | null>(null);
//   const [loading, setLoading] = useState(true);

//   const refresh = async () => {
//     try {
//       const res = await fetch("/api/auth/me", { credentials: "include" });
//       if (res.ok) {
//         const data = await res.json();
//         setUser(data.user);
//       } else {
//         setUser(null);
//       }
//     } catch (err) {
//       setUser(null);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     refresh();
//   }, []);

//   const login = async (email: string, password: string) => {
//     const res = await fetch("/api/auth/login", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       credentials: "include",
//       body: JSON.stringify({ email, password }),
//     });
//     const data = await parseJsonOrThrow(res);
//     setUser(data.user);
//   };

//   const register = async (email: string, fullName: string, password: string, confirmPassword: string) => {
//     const res = await fetch("/api/auth/register", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       credentials: "include",
//       body: JSON.stringify({ email, fullName, password, confirmPassword }),
//     });
//     const data = await parseJsonOrThrow(res);
//     setUser(data.user);
//   };

//   const logout = async () => {
//     await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
//     setUser(null);
//   };

//   return (
//     <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export function useAuth() {
//   const ctx = useContext(AuthContext);
//   if (!ctx) {
//     throw new Error("useAuth must be used within an AuthProvider");
//   }
//   return ctx;
// }
