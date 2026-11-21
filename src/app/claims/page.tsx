import ClaimsView from "./ClaimsView";

/** ?demo=1 shows the presenter's controls on the page. */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const sp = await searchParams;
  return <ClaimsView demo={sp.demo !== undefined} />;
}
