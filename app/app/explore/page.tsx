import { Suspense } from "react";
import { ExploreGrid } from "@/components/ExploreGrid";

function ExploreFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-background text-sm text-text-tertiary">
      Loading explore…
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<ExploreFallback />}>
      <ExploreGrid />
    </Suspense>
  );
}
