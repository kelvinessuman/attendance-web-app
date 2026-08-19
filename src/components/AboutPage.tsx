import React from "react";
import { QrCode, GraduationCap, ArrowLeft, Shield } from "lucide-react";
import ugLogo from "../assets/UG Logo.png";

interface AboutPageProps {
  onBack?: () => void;
}

export default function AboutPage({ onBack }: AboutPageProps) {
  const year = new Date().getFullYear();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.pushState({}, "", "/");
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-grow flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-white border border-slate-100 rounded-3xl shadow-sm p-8 text-center">
          <img src={ugLogo} alt="University of Ghana" className="h-12 mx-auto mb-5 object-contain" />
          <div className="mx-auto w-14 h-14 bg-navy rounded-2xl flex items-center justify-center text-white shadow-md shadow-navy/10 mb-5">
            <QrCode className="h-7 w-7" />
          </div>

          <h1 className="text-xl font-extrabold text-slate-900 font-sans tracking-tight mb-1">
            QR Attendance System
          </h1>
          <p className="text-xs text-slate-400 mb-6">About this project</p>

          <div className="flex items-start gap-3 text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
            <GraduationCap className="h-5 w-5 text-navy shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              This is a STEM project built by University of Ghana Education students (Mathematics Unit)
              as part of their semester course requirement facilitated by Rev. Sr. Prof. Florence Christiana Awoniyi
            </p>
          </div>

          <div className="flex items-start gap-3 text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6">
            <Shield className="h-5 w-5 text-navy shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 leading-relaxed">
              © {year} University of Ghana. All rights reserved. This application was
              developed for educational purposes and may not be reproduced or
              redistributed without permission.
            </p>
          </div>

          <button
            onClick={handleBack}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </button>
        </div>
      </main>

      <footer className="text-center text-[10px] text-slate-400 pb-6">
        QR Automatic Attendance Verification System © {year}
      </footer>
    </div>
  );
}


// import React from "react";
// import { QrCode, GraduationCap, ArrowLeft, Shield } from "lucide-react";

// interface AboutPageProps {
//   onBack?: () => void;
// }

// export default function AboutPage({ onBack }: AboutPageProps) {
//   const year = new Date().getFullYear();

//   const handleBack = () => {
//     if (onBack) {
//       onBack();
//     } else {
//       window.history.pushState({}, "", "/");
//       window.location.href = "/";
//     }
//   };

//   return (
//     <div className="min-h-screen bg-slate-50 flex flex-col">
//       <main className="flex-grow flex items-center justify-center px-4 py-16">
//         <div className="max-w-md w-full bg-white border border-slate-100 rounded-3xl shadow-sm p-8 text-center">
//           <div className="mx-auto w-14 h-14 bg-navy rounded-2xl flex items-center justify-center text-white shadow-md shadow-navy/10 mb-5">
//             <QrCode className="h-7 w-7" />
//           </div>

//           <h1 className="text-xl font-extrabold text-slate-900 font-sans tracking-tight mb-1">
//             QR Attendance System
//           </h1>
//           <p className="text-xs text-slate-400 mb-6">About this project</p>

//           <div className="flex items-start gap-3 text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
//             <GraduationCap className="h-5 w-5 text-navy shrink-0 mt-0.5" />
//             <p className="text-sm text-slate-600 leading-relaxed">
//               This is a STEM project built by a University of Ghana education student
//               as part of a semester course requirement.
//             </p>
//           </div>

//           <div className="flex items-start gap-3 text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6">
//             <Shield className="h-5 w-5 text-navy shrink-0 mt-0.5" />
//             <p className="text-xs text-slate-500 leading-relaxed">
//               © {year} University of Ghana. All rights reserved. This application was
//               developed for educational purposes and may not be reproduced or
//               redistributed without permission.
//             </p>
//           </div>

//           <button
//             onClick={handleBack}
//             className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
//           >
//             <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
//           </button>
//         </div>
//       </main>

//       <footer className="text-center text-[10px] text-slate-400 pb-6">
//         QR Automatic Attendance Verification System © {year}
//       </footer>
//     </div>
//   );
// }
