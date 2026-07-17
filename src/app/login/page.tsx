"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Lock, Mail } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";

// Real login against the Spring Boot backend (hitech-backend). On success we also sign the
// mock store into its seeded "Admin" user so the not-yet-migrated feature screens (which
// still read currentUserId/users from useAppStore) keep working while we wire them up
// one at a time.
export default function LoginPage() {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const authError = useAuthStore((s) => s.error);
  const authLogin = useAuthStore((s) => s.login);
  const mockLogin = useAppStore((s) => s.login);

  const [email, setEmail] = useState("admin@hitech.local");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (authUser) router.replace("/project");
  }, [authUser, router]);

  async function signIn() {
    const ok = await authLogin(email, password);
    if (ok) {
      mockLogin("u-admin");
      router.push("/project");
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-brand-accent/10 via-background to-cyan-100/40 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl md:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between bg-brand-accent p-8 text-white md:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
              HT
            </div>
            <div>
              <div className="text-sm font-semibold">Hi-Tech Construction</div>
              <div className="text-xs text-white/70">Management Platform</div>
            </div>
          </div>
          <div>
            <Building2 size={36} className="mb-4 text-white/80" />
            <h2 className="text-2xl font-semibold leading-snug">
              One platform for every site, store and role.
            </h2>
            <p className="mt-3 text-sm text-white/70">
              Sign in with your email and password to manage projects, warehouses and material
              requests.
            </p>
          </div>
          <div className="text-xs text-white/50">© Hi-Tech Construction · v1.0.0</div>
        </div>

        {/* Form panel */}
        <div className="p-8">
          <h1 className="text-lg font-semibold text-gray-800">Sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in with your Hitech ERP account.</p>

          <label className="mt-6 block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Email</span>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3">
              <Mail size={15} className="text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signIn()}
                placeholder="you@hitech.local"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Password</span>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3">
              <Lock size={15} className="text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signIn()}
                placeholder="Enter password"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
              />
            </div>
          </label>

          {authError && <div className="mt-2 text-xs font-medium text-rose-600">{authError}</div>}

          <button
            onClick={signIn}
            disabled={authLoading}
            className="mt-5 w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {authLoading ? "Signing in…" : "Sign in"}
          </button>

          <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Test admin: <span className="font-semibold text-gray-700">admin@hitech.local</span> /{" "}
            <span className="font-semibold text-gray-700">Admin@123</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Previous mock login (user-picker + shared demo password) ----
// Kept for reference until every feature is migrated off the in-memory store; restore this
// (and drop the real-auth version above) if you need to demo without the backend running.
//
// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import { Building2, ShieldCheck, HardHat, Warehouse as WarehouseIcon, Lock } from "lucide-react";
// import { useAppStore } from "@/lib/store";
// import { DEMO_PASSWORD } from "@/lib/auth";
// import type { UserRole } from "@/lib/types";
//
// const ROLE_META: Record<UserRole, { icon: React.ComponentType<{ size?: number }>; tint: string }> = {
//   Admin: { icon: ShieldCheck, tint: "bg-cyan-50 text-cyan-600" },
//   "Site In-charge": { icon: HardHat, tint: "bg-amber-50 text-amber-600" },
//   "Store Keeper": { icon: WarehouseIcon, tint: "bg-indigo-50 text-indigo-600" },
// };
//
// export default function LoginPage() {
//   const router = useRouter();
//   const users = useAppStore((s) => s.users);
//   const currentUserId = useAppStore((s) => s.currentUserId);
//   const login = useAppStore((s) => s.login);
//
//   const [userId, setUserId] = useState(users[0]?.id ?? "");
//   const [password, setPassword] = useState("");
//   const [error, setError] = useState("");
//
//   useEffect(() => {
//     if (currentUserId) router.replace("/");
//   }, [currentUserId, router]);
//
//   function signIn() {
//     if (!userId) return;
//     if (password !== DEMO_PASSWORD) {
//       setError("Incorrect password.");
//       return;
//     }
//     login(userId);
//     router.push("/");
//   }
//
//   return (
//     <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-brand-accent/10 via-background to-cyan-100/40 p-4">
//       <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl md:grid-cols-2">
//         <div className="hidden flex-col justify-between bg-brand-accent p-8 text-white md:flex">
//           <div className="flex items-center gap-3">
//             <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
//               HT
//             </div>
//             <div>
//               <div className="text-sm font-semibold">Hi-Tech Construction</div>
//               <div className="text-xs text-white/70">Management Platform</div>
//             </div>
//           </div>
//           <div>
//             <Building2 size={36} className="mb-4 text-white/80" />
//             <h2 className="text-2xl font-semibold leading-snug">
//               One platform for every site, store and role.
//             </h2>
//             <p className="mt-3 text-sm text-white/70">
//               Sign in with your role to manage projects, warehouses and material requests.
//             </p>
//           </div>
//           <div className="text-xs text-white/50">© Hi-Tech Construction · v1.0.0</div>
//         </div>
//         <div className="p-8">
//           <h1 className="text-lg font-semibold text-gray-800">Sign in</h1>
//           <p className="mt-1 text-sm text-gray-500">Choose an account to continue.</p>
//           <div className="mt-6 space-y-2">
//             {users.map((u) => {
//               const meta = ROLE_META[u.role];
//               const Icon = meta.icon;
//               const active = userId === u.id;
//               return (
//                 <button
//                   key={u.id}
//                   type="button"
//                   onClick={() => setUserId(u.id)}
//                   className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
//                     active ? "border-brand-accent bg-brand-accent/5" : "border-gray-200 hover:border-gray-300"
//                   }`}
//                 >
//                   <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.tint}`}>
//                     <Icon size={18} />
//                   </div>
//                   <div className="min-w-0 flex-1">
//                     <div className="truncate text-sm font-medium text-gray-800">{u.name}</div>
//                     <div className="text-xs text-gray-400">{u.role}</div>
//                   </div>
//                   {active && <div className="h-2.5 w-2.5 rounded-full bg-brand-accent" />}
//                 </button>
//               );
//             })}
//           </div>
//           <label className="mt-5 block">
//             <span className="mb-1 block text-xs font-medium text-gray-500">Password</span>
//             <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3">
//               <Lock size={15} className="text-gray-400" />
//               <input
//                 type="password"
//                 value={password}
//                 onChange={(e) => {
//                   setPassword(e.target.value);
//                   setError("");
//                 }}
//                 onKeyDown={(e) => e.key === "Enter" && signIn()}
//                 placeholder="Enter password"
//                 className="w-full bg-transparent py-2.5 text-sm outline-none"
//               />
//             </div>
//           </label>
//           {error && <div className="mt-2 text-xs font-medium text-rose-600">{error}</div>}
//           <button
//             onClick={signIn}
//             className="mt-5 w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
//           >
//             Sign in
//           </button>
//           <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
//             Demo password for all accounts: <span className="font-semibold text-gray-700">{DEMO_PASSWORD}</span>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
