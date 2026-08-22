import React, { useState, useEffect, useRef } from "react";
import { Camera, CheckCircle2, AlertTriangle, RefreshCw, Sparkles, User, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CheckInPageProps {
  groupId: string;
}

export default function CheckInPage({ groupId }: CheckInPageProps) {
  const [loading, setLoading] = useState(true);
  const [groupInfo, setGroupInfo] = useState<{ name: string; description: string } | null>(null);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [studentId, setStudentId] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [msRemaining, setMsRemaining] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Keeps the MediaStream across retakes so unmounting the <video> does not lose the camera. */
  const streamRef = useRef<MediaStream | null>(null);

  // initial=true only on first load (shows spinner). Polls stay silent so the
  // camera and form are never interrupted every 20s.
  const fetchSessionStatus = async (opts?: { initial?: boolean }) => {
    const initial = opts?.initial === true;
    if (initial) {
      setLoading(true);
      setErrorMsg(null);
    }
    try {
      const res = await fetch(`/api/groups/${groupId}/active-session`);
      const data = await res.json();
      if (res.ok) {
        setGroupInfo(data.group);
        const wasActive = !!activeSessionRef.current;
        const nowActive = !!data.hasActiveSession;
        if (nowActive) {
          setActiveSession(data.session);
          // Only (re)start camera when session becomes active or on first load —
          // not on every quiet poll while already streaming.
          if (!wasActive || initial) {
            startCamera();
          }
        } else {
          setActiveSession(null);
          if (wasActive || initial) {
            stopCamera();
          }
        }
      } else if (initial) {
        setErrorMsg(data.error || "Failed to load group details.");
      }
    } catch (err) {
      console.error(err);
      if (initial) {
        setErrorMsg("Network error. Could not connect to the server.");
      }
    } finally {
      if (initial) setLoading(false);
    }
  };

  const activeSessionRef = useRef<any | null>(null);
  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    fetchSessionStatus({ initial: true });
    return () => {
      stopCamera();
    };
  }, [groupId]);

  // Quiet background poll — no spinner, no camera restart unless status flips.
  useEffect(() => {
    const pollId = setInterval(() => {
      if (!checkingIn && !checkinSuccess) {
        fetchSessionStatus({ initial: false });
      }
    }, 30000);
    return () => clearInterval(pollId);
  }, [groupId, checkingIn, checkinSuccess]);

  // Live per-second countdown driven by the session's real expiresAt instant
  // (never by the display-only start/end clock strings).
  useEffect(() => {
    if (!activeSession?.expiresAt) {
      setMsRemaining(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(activeSession.expiresAt).getTime() - Date.now();
      setMsRemaining(remaining);
      if (remaining <= 0) {
        // Session just expired locally — confirm with the server immediately.
        fetchSessionStatus({ initial: false });
      }
    };
    tick();
    const timerId = setInterval(tick, 1000);
    return () => clearInterval(timerId);
  }, [activeSession?.expiresAt]);

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  // 2. Browser Camera Controls
  const attachStreamToVideo = (mediaStream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
    }
    video.play().catch((err) => console.error("Video play interrupted", err));
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      // Reuse an existing live stream when possible (e.g. after Retake).
      if (streamRef.current && streamRef.current.getVideoTracks().some((t) => t.readyState === "live")) {
        setStream(streamRef.current);
        // video may have just remounted — attach on next paint
        requestAnimationFrame(() => attachStreamToVideo(streamRef.current!));
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      requestAnimationFrame(() => attachStreamToVideo(mediaStream));
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError(
        "Camera permission was denied or is unavailable. Please grant camera permissions to complete check-in."
      );
    }
  };

  const stopCamera = () => {
    const active =
      streamRef.current ||
      stream ||
      (videoRef.current?.srcObject as MediaStream | null);
    if (active) {
      active.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStream(null);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (ctx && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Live preview uses CSS scale-x-[-1] (mirror). Match that in the
        // captured image so the photo does not appear "turned" vs what the
        // student saw on screen.
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setPhoto(dataUrl);
      }
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    setErrorMsg(null);
    // Re-show live video: stream is still running; re-attach after React paints the <video>.
    requestAnimationFrame(() => {
      if (streamRef.current) {
        attachStreamToVideo(streamRef.current);
      } else {
        void startCamera();
      }
    });
  };

  // When returning to live view after a photo, ensure the video element has the stream.
  useEffect(() => {
    if (!photo && !cameraError && activeSession && streamRef.current) {
      attachStreamToVideo(streamRef.current);
    }
  }, [photo, cameraError, activeSession]);

  // 3. Submit Check-in
  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim()) {
      setErrorMsg("Please enter your Student ID.");
      return;
    }
    if (!photo) {
      setErrorMsg("Please capture a live verification photo.");
      return;
    }

    setCheckingIn(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          sessionId: activeSession.id,
          studentId: studentId.trim().toUpperCase(),
          photoBase64: photo
        })
      });

      const data = await res.json();
      if (res.ok) {
        setCheckinSuccess(data);
        stopCamera();
      } else {
        setErrorMsg(data.error || "Failed to submit check-in.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to connect to the server. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleResetCheckin = () => {
    setStudentId("");
    setPhoto(null);
    setCheckinSuccess(null);
    setErrorMsg(null);
    fetchSessionStatus({ initial: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <span
            className="h-10 w-10 border-[3px] border-gold/30 border-t-gold rounded-full animate-spin"
            aria-hidden
          />
          <p className="text-sm text-slate-400 font-sans">Checking session status…</p>
          <span className="sr-only">Checking session status</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="max-w-md mx-auto w-full text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-navy/20 border border-navy/40 text-gold rounded-full text-xs font-semibold mb-4">
          <ShieldCheck className="h-4.5 w-4.5 text-gold" />
          <span>Secured Attendance Portal</span>
        </div>
        <h1 className="text-2xl font-bold font-sans tracking-tight text-white mb-1">
          {groupInfo?.name || "Attendance Check-In"}
        </h1>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          {groupInfo?.description || "Scan, capture, and register your presence instantly."}
        </p>
      </header>

      {/* Main Container */}
      <main className="max-w-md mx-auto w-full my-6 flex-grow flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {/* SUCCESS SCREEN */}
          {checkinSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-gold/20 shadow-2xl rounded-3xl p-6 text-center overflow-hidden relative"
            >
              {/* Confetti decoration elements */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gold to-navy" />
              <div className="absolute -top-12 -right-12 w-24 h-24 bg-gold/10 rounded-full blur-xl" />
              <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-navy/10 rounded-full blur-xl" />

              <div className="mx-auto w-16 h-16 bg-navy/15 border border-gold/30 rounded-2xl flex items-center justify-center text-gold mb-5 shadow-lg shadow-navy/30">
                <CheckCircle2 className="h-10 w-10 animate-pulse" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-navy/15 text-gold border border-gold/20 rounded-full text-xs font-semibold mb-2">
                <Sparkles className="h-3.5 w-3.5" /> Checked In Successfully
              </span>

              <h2 className="text-xl font-bold text-white mb-2 font-sans">
                Thank you, {checkinSuccess.participant?.name}!
              </h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mb-6">
                Your attendance for Student ID <span className="text-gold font-mono font-bold">{checkinSuccess.participant?.studentId}</span> has been logged with photo verification.
              </p>

              <button
                onClick={handleResetCheckin}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer"
              >
                Register Another Participant
              </button>
            </motion.div>
          ) : !activeSession ? (
            /* CLOSED SCREEN */
            <motion.div
              key="closed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-navy/20 shadow-2xl rounded-3xl p-8 text-center"
            >
              <div className="mx-auto w-14 h-14 bg-navy/15 border border-gold/20 rounded-2xl flex items-center justify-center text-gold mb-5">
                <AlertTriangle className="h-8 w-8 text-gold" />
              </div>
              <h2 className="text-lg font-bold text-white mb-1 font-sans">
                Attendance is Closed
              </h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mb-6">
                There are currently no active sessions for this group. Please make sure your coordinator has launched a scheduled or manual attendance session.
              </p>
              <button
                onClick={() => fetchSessionStatus({ initial: true })}
                className="inline-flex items-center justify-center gap-2 bg-navy hover:bg-navy/90 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-all cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Check Again
              </button>
            </motion.div>
          ) : (
            /* ACTIVE CHECK-IN FORM */
            <motion.div
              key="active-form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-slate-900 border border-slate-800 shadow-2xl rounded-3xl p-5 sm:p-6"
            >
              {/* Session Alert Header */}
              <div className="bg-navy/15 border border-navy/25 rounded-2xl p-3 mb-5 flex items-start gap-3">
                <div className="h-2 w-2 rounded-full bg-gold mt-1.5 animate-ping" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-gold">Active Attendance Session</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Open today from <span className="text-white font-mono font-semibold">{activeSession.startTime}</span> to <span className="text-white font-mono font-semibold">{activeSession.endTime}</span>
                  </p>
                  {msRemaining !== null && msRemaining > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Closes in <span className={`font-mono font-semibold ${msRemaining < 60000 ? "text-red-400" : "text-white"}`}>{formatCountdown(msRemaining)}</span>
                    </p>
                  )}
                </div>
              </div>

              <form onSubmit={handleCheckIn} className="space-y-5 text-left">
                {/* Participant ID */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Enter Participant / Student ID
                  </label>
                  <div className="relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="block w-full bg-slate-950 pl-10 pr-3 py-2.5 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold text-sm placeholder-slate-600 font-mono text-white tracking-widest uppercase"
                      placeholder="e.g. STU1004"
                    />
                  </div>
                </div>

                {/* Camera / Live Photo Section */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Live verification photo
                  </label>
                  
                  <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] border border-slate-800 flex flex-col items-center justify-center">
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Keep <video> mounted whenever we are not in cameraError so Retake
                        does not destroy the element and lose the live stream. */}
                    {!cameraError && (
                      <div
                        className={`relative w-full h-full ${photo ? "invisible absolute inset-0 pointer-events-none" : ""}`}
                        aria-hidden={!!photo}
                      >
                        <video
                          ref={videoRef}
                          className="w-full h-full object-cover scale-x-[-1]"
                          playsInline
                          muted
                          autoPlay
                        />
                        {!photo && (
                          <>
                            <div className="absolute inset-0 border-[2px] border-gold/20 rounded-2xl pointer-events-none" />
                            <div className="absolute top-3 left-3 bg-slate-900/80 px-2 py-0.5 rounded-full text-[9px] font-bold text-gold tracking-wider flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" /> LIVE
                            </div>
                            <button
                              type="button"
                              onClick={capturePhoto}
                              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-navy hover:bg-navy/80 active:scale-95 text-xs font-semibold text-white px-4 py-2 rounded-xl transition-all cursor-pointer shadow-lg shadow-navy/30 inline-flex items-center gap-1.5"
                            >
                              <Camera className="h-4 w-4" /> Capture Photo
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {photo && (
                      <div className="relative w-full h-full">
                        <img
                          src={photo}
                          alt="Verification Preview"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={retakePhoto}
                          className="absolute bottom-3 right-3 bg-slate-900/90 hover:bg-slate-900 border border-slate-700 text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <RefreshCw className="h-3 w-3" /> Retake
                        </button>
                      </div>
                    )}

                    {!photo && cameraError && (
                      <div className="p-6 text-center space-y-3">
                        <AlertTriangle className="h-10 w-10 text-gold mx-auto" />
                        <p className="text-xs text-slate-400 max-w-xs">{cameraError}</p>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="bg-navy hover:bg-navy/80 text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <RefreshCw className="h-3 w-3" /> Retry Permission
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit Error */}
                {errorMsg && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3 bg-navy/15 border border-gold/20 text-gold text-xs rounded-xl flex items-start gap-2.5"
                  >
                    <AlertTriangle className="h-4 w-4 text-gold shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </motion.div>
                )}

                {/* Action Button */}
                <button
                  type="submit"
                  disabled={checkingIn || !photo || !studentId.trim()}
                  className="w-full bg-navy hover:bg-navy/80 disabled:bg-slate-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-lg shadow-navy/15"
                >
                  {checkingIn ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Submitting Attendance...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Submit Attendance
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-slate-600">
        QR Automatic Attendance Verification System © 2026. Browser-side live photography secure processing.
        <br />
        <a href="/about" className="text-slate-500 hover:text-slate-300 underline transition-colors">
          About this project
        </a>
      </footer>
    </div>
  );
}
