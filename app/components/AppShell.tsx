import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main
        className="h-dvh min-h-0 overflow-hidden bg-background transition-[margin-left] duration-200 ease-out"
        style={{ marginLeft: "var(--sidebar-width, 240px)" }}
      >
        {children}
      </main>
    </>
  );
}
