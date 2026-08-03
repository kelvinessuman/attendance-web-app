import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, CheckCircle2, QrCode } from "lucide-react";

type Mode = "login" | "register" | "forgot";

export default function AuthPanel() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [regEmail, setRegEmail] = useState("");
  const [regFullName, setRegFullName] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");

  // Forgot password flow
  const [forgotStep, setForgotStep] = useState<"email" | "done">("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");

  // Set after registering, when the account needs email verification before
  // it can log in (only happens once email sending is configured server-side)
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  // Reflects the ?emailVerified=1|0 the server redirects to after the user
  // clicks the emailed verification link.
  const [verifiedBanner, setVerifiedBanner] = useState<"success" | "failure" | null>(null);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("emailVerified");
    if (flag === "1") setVerifiedBanner("success");
    else if (flag === "0") setVerifiedBanner("failure");
    if (flag !== null) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setForgotStep("email");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(loginEmail.trim(), loginPassword);
    } catch (err: any) {
      setError(err.message || "Failed to log in.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (regPassword !== regConfirmPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await register(regEmail.trim(), regFullName.trim(), regPassword, regConfirmPassword);
      if (result.requiresVerification) {
        setPendingVerificationEmail(regEmail.trim());
      }
    } catch (err: any) {
      setError(err.message || "Failed to register.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send reset email.");
      }
      setForgotMessage(data.message);
      setForgotStep("done");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center p-3.5 bg-navy rounded-3xl shadow-xl shadow-navy/10 text-white mb-6">
          <QrCode className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-extrabold font-sans tracking-tight text-slate-900">
          QR Attendance System
        </h2>
        <p className="mt-2.5 text-sm text-slate-500 font-sans max-w-sm mx-auto leading-relaxed">
          Automated attendance tracking & live dashboards with browser camera QR code check-in.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="bg-white py-8 px-6 shadow-xl border border-slate-100 rounded-3xl sm:px-10">
          {pendingVerificationEmail ? (
            <div className="text-center py-4">
              <CheckCircle2 className="h-10 w-10 text-gold mx-auto mb-3" />
              <p className="text-sm text-slate-700 font-semibold mb-1">Verify your email</p>
              <p className="text-xs text-slate-500 mb-5">
                We sent a verification link to <span className="font-semibold">{pendingVerificationEmail}</span>. Click it to activate your account, then log in below.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPendingVerificationEmail(null);
                  switchMode("login");
                }}
                className="w-full py-3 px-4 bg-navy hover:bg-navy/90 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
              >
                Back to Log In
              </button>
            </div>
          ) : (
            <>
          {verifiedBanner && (
            <div
              className={`mb-5 rounded-xl p-3.5 border flex items-start gap-2.5 text-xs font-medium text-left ${
                verifiedBanner === "success"
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                  : "bg-red-50 border-red-100 text-red-700"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {verifiedBanner === "success"
                  ? "Your email is verified. You can now log in."
                  : "That verification link is invalid or has expired. Please try registering again or contact support."}
              </span>
            </div>
          )}

          {/* Tabs */}
          {mode !== "forgot" && (
            <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  mode === "login" ? "bg-white text-navy shadow-sm" : "text-slate-500"
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  mode === "register" ? "bg-white text-navy shadow-sm" : "text-slate-500"
                }`}
              >
                Register
              </button>
            </div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-5 rounded-xl bg-navy/8 p-3.5 border border-navy/15 flex items-start gap-2.5 text-xs text-navy font-medium text-left"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-navy/80" />
              <span>{error}</span>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {/* LOGIN */}
            {mode === "login" && (
              <motion.form
                key="login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleLogin}
                className="space-y-4 text-left"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-navy hover:bg-navy/90 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
                >
                  {loading ? "Signing in..." : "Log In"}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="w-full text-center text-xs font-semibold text-navy hover:text-navy cursor-pointer"
                >
                  Forgot your password?
                </button>
              </motion.form>
            )}

            {/* REGISTER */}
            {mode === "register" && (
              <motion.form
                key="register"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleRegister}
                className="space-y-4 text-left"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-navy hover:bg-navy/90 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
                >
                  {loading ? "Creating account..." : "Create Account"}
                </button>
              </motion.form>
            )}

            {/* FORGOT PASSWORD */}
            {mode === "forgot" && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-left"
              >
                {forgotStep === "email" && (
                  <form onSubmit={handleRequestReset} className="space-y-4">
                    <p className="text-sm text-slate-600 mb-2">
                      Enter your account email. If it matches an account, we'll email you a link to reset your password.
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 bg-navy hover:bg-navy/90 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
                    >
                      {loading ? "Sending..." : "Send Reset Link"}
                    </button>
                  </form>
                )}

                {forgotStep === "done" && (
                  <div className="text-center py-4">
                    <CheckCircle2 className="h-10 w-10 text-gold mx-auto mb-3" />
                    <p className="text-sm text-slate-700 font-semibold mb-1">Check your email</p>
                    <p className="text-xs text-slate-500 mb-5">{forgotMessage}</p>
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="w-full py-3 px-4 bg-navy hover:bg-navy/90 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
                    >
                      Back to Log In
                    </button>
                  </div>
                )}

                {forgotStep !== "done" && (
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer mt-4"
                  >
                    Back to Log In
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-8 text-xs text-slate-400 text-center">
            Secured with local email &amp; password authentication.
          </p>
          <p className="mt-2 text-xs text-center">
            <a href="/about" className="text-slate-400 hover:text-slate-600 font-semibold transition-colors">
              About this project
            </a>
          </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}



// import React, { useState } from "react";
// import { useAuth } from "../lib/auth";
// import { motion, AnimatePresence } from "motion/react";
// import { AlertCircle, CheckCircle2, QrCode } from "lucide-react";

// type Mode = "login" | "register" | "forgot";

// export default function AuthPanel() {
//   const { login, register } = useAuth();
//   const [mode, setMode] = useState<Mode>("login");
//   const [error, setError] = useState<string | null>(null);
//   const [loading, setLoading] = useState(false);

//   // Login fields
//   const [loginEmail, setLoginEmail] = useState("");
//   const [loginPassword, setLoginPassword] = useState("");

//   // Register fields
//   const [regEmail, setRegEmail] = useState("");
//   const [regFullName, setRegFullName] = useState("");
//   const [regPassword, setRegPassword] = useState("");
//   const [regConfirmPassword, setRegConfirmPassword] = useState("");

//   // Forgot password flow
//   const [forgotStep, setForgotStep] = useState<"email" | "reset" | "done">("email");
//   const [forgotEmail, setForgotEmail] = useState("");
//   const [newPassword, setNewPassword] = useState("");
//   const [newConfirmPassword, setNewConfirmPassword] = useState("");

//   const switchMode = (m: Mode) => {
//     setMode(m);
//     setError(null);
//     setForgotStep("email");
//   };

//   const handleLogin = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setError(null);
//     setLoading(true);
//     try {
//       await login(loginEmail.trim(), loginPassword);
//     } catch (err: any) {
//       setError(err.message || "Failed to log in.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleRegister = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setError(null);

//     if (regPassword !== regConfirmPassword) {
//       setError("Password and confirm password do not match.");
//       return;
//     }

//     setLoading(true);
//     try {
//       await register(regEmail.trim(), regFullName.trim(), regPassword, regConfirmPassword);
//     } catch (err: any) {
//       setError(err.message || "Failed to register.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleCheckEmail = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setError(null);
//     setLoading(true);
//     try {
//       const res = await fetch("/api/auth/forgot-password/check-email", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ email: forgotEmail.trim() }),
//       });
//       const data = await res.json();
//       if (!res.ok) {
//         throw new Error(data.error || "No account was found for this email address.");
//       }
//       setForgotStep("reset");
//     } catch (err: any) {
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleResetPassword = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setError(null);

//     if (newPassword !== newConfirmPassword) {
//       setError("New password and confirm password do not match.");
//       return;
//     }

//     setLoading(true);
//     try {
//       const res = await fetch("/api/auth/forgot-password/reset", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           email: forgotEmail.trim(),
//           newPassword,
//           confirmPassword: newConfirmPassword,
//         }),
//       });
//       const data = await res.json();
//       if (!res.ok) {
//         throw new Error(data.error || "Failed to reset password.");
//       }
//       setForgotStep("done");
//     } catch (err: any) {
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
//       <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
//         <div className="inline-flex items-center justify-center p-3.5 bg-navy rounded-3xl shadow-xl shadow-navy/10 text-white mb-6">
//           <QrCode className="w-10 h-10" />
//         </div>
//         <h2 className="text-3xl font-extrabold font-sans tracking-tight text-slate-900">
//           QR Attendance System
//         </h2>
//         <p className="mt-2.5 text-sm text-slate-500 font-sans max-w-sm mx-auto leading-relaxed">
//           Automated attendance tracking & live dashboards with browser camera QR code check-in.
//         </p>
//       </div>

//       <motion.div
//         initial={{ opacity: 0, y: 15 }}
//         animate={{ opacity: 1, y: 0 }}
//         transition={{ duration: 0.4 }}
//         className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
//       >
//         <div className="bg-white py-8 px-6 shadow-xl border border-slate-100 rounded-3xl sm:px-10">
//           {/* Tabs */}
//           {mode !== "forgot" && (
//             <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
//               <button
//                 type="button"
//                 onClick={() => switchMode("login")}
//                 className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
//                   mode === "login" ? "bg-white text-navy shadow-sm" : "text-slate-500"
//                 }`}
//               >
//                 Log In
//               </button>
//               <button
//                 type="button"
//                 onClick={() => switchMode("register")}
//                 className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
//                   mode === "register" ? "bg-white text-navy shadow-sm" : "text-slate-500"
//                 }`}
//               >
//                 Register
//               </button>
//             </div>
//           )}

//           {error && (
//             <motion.div
//               initial={{ opacity: 0, scale: 0.95 }}
//               animate={{ opacity: 1, scale: 1 }}
//               className="mb-5 rounded-xl bg-navy/8 p-3.5 border border-navy/15 flex items-start gap-2.5 text-xs text-navy font-medium text-left"
//             >
//               <AlertCircle className="h-4 w-4 shrink-0 text-navy/80" />
//               <span>{error}</span>
//             </motion.div>
//           )}

//           <AnimatePresence mode="wait">
//             {/* LOGIN */}
//             {mode === "login" && (
//               <motion.form
//                 key="login"
//                 initial={{ opacity: 0 }}
//                 animate={{ opacity: 1 }}
//                 exit={{ opacity: 0 }}
//                 onSubmit={handleLogin}
//                 className="space-y-4 text-left"
//               >
//                 <div>
//                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                     Email
//                   </label>
//                   <input
//                     type="email"
//                     required
//                     value={loginEmail}
//                     onChange={(e) => setLoginEmail(e.target.value)}
//                     placeholder="you@example.com"
//                     className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                     Password
//                   </label>
//                   <input
//                     type="password"
//                     required
//                     value={loginPassword}
//                     onChange={(e) => setLoginPassword(e.target.value)}
//                     placeholder="••••••••"
//                     className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                   />
//                 </div>

//                 <button
//                   type="submit"
//                   disabled={loading}
//                   className="w-full py-3 px-4 bg-navy hover:bg-navy/90 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
//                 >
//                   {loading ? "Signing in..." : "Log In"}
//                 </button>

//                 <button
//                   type="button"
//                   onClick={() => switchMode("forgot")}
//                   className="w-full text-center text-xs font-semibold text-navy hover:text-navy cursor-pointer"
//                 >
//                   Forgot your password?
//                 </button>
//               </motion.form>
//             )}

//             {/* REGISTER */}
//             {mode === "register" && (
//               <motion.form
//                 key="register"
//                 initial={{ opacity: 0 }}
//                 animate={{ opacity: 1 }}
//                 exit={{ opacity: 0 }}
//                 onSubmit={handleRegister}
//                 className="space-y-4 text-left"
//               >
//                 <div>
//                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                     Full Name
//                   </label>
//                   <input
//                     type="text"
//                     required
//                     value={regFullName}
//                     onChange={(e) => setRegFullName(e.target.value)}
//                     placeholder="Jane Doe"
//                     className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                     Email
//                   </label>
//                   <input
//                     type="email"
//                     required
//                     value={regEmail}
//                     onChange={(e) => setRegEmail(e.target.value)}
//                     placeholder="you@example.com"
//                     className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                     Password
//                   </label>
//                   <input
//                     type="password"
//                     required
//                     minLength={6}
//                     value={regPassword}
//                     onChange={(e) => setRegPassword(e.target.value)}
//                     placeholder="At least 6 characters"
//                     className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                     Confirm Password
//                   </label>
//                   <input
//                     type="password"
//                     required
//                     minLength={6}
//                     value={regConfirmPassword}
//                     onChange={(e) => setRegConfirmPassword(e.target.value)}
//                     placeholder="Re-enter your password"
//                     className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                   />
//                 </div>

//                 <button
//                   type="submit"
//                   disabled={loading}
//                   className="w-full py-3 px-4 bg-navy hover:bg-navy/90 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
//                 >
//                   {loading ? "Creating account..." : "Create Account"}
//                 </button>
//               </motion.form>
//             )}

//             {/* FORGOT PASSWORD */}
//             {mode === "forgot" && (
//               <motion.div
//                 key="forgot"
//                 initial={{ opacity: 0 }}
//                 animate={{ opacity: 1 }}
//                 exit={{ opacity: 0 }}
//                 className="text-left"
//               >
//                 {forgotStep === "email" && (
//                   <form onSubmit={handleCheckEmail} className="space-y-4">
//                     <p className="text-sm text-slate-600 mb-2">
//                       Enter your account email. We'll check it exists before letting you set a new password.
//                     </p>
//                     <div>
//                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                         Email
//                       </label>
//                       <input
//                         type="email"
//                         required
//                         value={forgotEmail}
//                         onChange={(e) => setForgotEmail(e.target.value)}
//                         placeholder="you@example.com"
//                         className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                       />
//                     </div>
//                     <button
//                       type="submit"
//                       disabled={loading}
//                       className="w-full py-3 px-4 bg-navy hover:bg-navy/90 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
//                     >
//                       {loading ? "Checking..." : "Continue"}
//                     </button>
//                   </form>
//                 )}

//                 {forgotStep === "reset" && (
//                   <form onSubmit={handleResetPassword} className="space-y-4">
//                     <p className="text-sm text-slate-600 mb-2">
//                       Email verified. Choose a new password for <span className="font-semibold">{forgotEmail}</span>.
//                     </p>
//                     <div>
//                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                         New Password
//                       </label>
//                       <input
//                         type="password"
//                         required
//                         minLength={6}
//                         value={newPassword}
//                         onChange={(e) => setNewPassword(e.target.value)}
//                         placeholder="At least 6 characters"
//                         className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                       />
//                     </div>
//                     <div>
//                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
//                         Confirm New Password
//                       </label>
//                       <input
//                         type="password"
//                         required
//                         minLength={6}
//                         value={newConfirmPassword}
//                         onChange={(e) => setNewConfirmPassword(e.target.value)}
//                         placeholder="Re-enter new password"
//                         className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                       />
//                     </div>
//                     <button
//                       type="submit"
//                       disabled={loading}
//                       className="w-full py-3 px-4 bg-navy hover:bg-navy/90 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
//                     >
//                       {loading ? "Saving..." : "Reset Password"}
//                     </button>
//                   </form>
//                 )}

//                 {forgotStep === "done" && (
//                   <div className="text-center py-4">
//                     <CheckCircle2 className="h-10 w-10 text-gold mx-auto mb-3" />
//                     <p className="text-sm text-slate-700 font-semibold mb-1">Password reset successfully!</p>
//                     <p className="text-xs text-slate-500 mb-5">You can now log in with your new password.</p>
//                     <button
//                       type="button"
//                       onClick={() => switchMode("login")}
//                       className="w-full py-3 px-4 bg-navy hover:bg-navy/90 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
//                     >
//                       Back to Log In
//                     </button>
//                   </div>
//                 )}

//                 {forgotStep !== "done" && (
//                   <button
//                     type="button"
//                     onClick={() => switchMode("login")}
//                     className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer mt-4"
//                   >
//                     Back to Log In
//                   </button>
//                 )}
//               </motion.div>
//             )}
//           </AnimatePresence>

//           <p className="mt-8 text-xs text-slate-400 text-center">
//             Secured with local email &amp; password authentication.
//           </p>
//           <p className="mt-2 text-xs text-center">
//             <a href="/about" className="text-slate-400 hover:text-slate-600 font-semibold transition-colors">
//               About this project
//             </a>
//           </p>
//         </div>
//       </motion.div>
//     </div>
//   );
// }
