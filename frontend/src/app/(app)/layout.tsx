import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/sidebar/Sidebar";
import UnreadBadgesLoader from "@/components/UnreadBadgesLoader";
import Toasts from "@/components/Toasts";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <UnreadBadgesLoader />
      <Toasts />
      <div className="flex h-screen bg-zinc-950">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
      </div>
    </AuthGuard>
  );
}
