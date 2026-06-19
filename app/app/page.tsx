import { ShortsFeed } from "@/components/ShortsFeed";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const params = await searchParams;
  return <ShortsFeed initialSegmentId={params.segment} />;
}
