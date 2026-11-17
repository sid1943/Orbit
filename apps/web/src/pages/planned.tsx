import { PageBar } from "../components/page-bar.js";

/** Stand-in for a page that a later build step fills in (see docs/WEB-APP.md). */
export function Planned({ title, step }: { title: string; step: number }) {
  return (
    <>
      <PageBar title={title} />
      <div className="pad muted">This page arrives in build step {step}.</div>
    </>
  );
}
