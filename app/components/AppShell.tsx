import { Sidebar } from "@/components/Sidebar";
import { ShowProvider } from "@/components/ShowProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShowProvider>
      <Sidebar />
      <main
        className="h-dvh min-h-0 min-w-0 overflow-hidden bg-background transition-[margin-left] duration-200 ease-out"
        style={{ marginLeft: "var(--sidebar-width, 240px)" }}
      >
        {children}
      </main>
    </ShowProvider>
  );
}
