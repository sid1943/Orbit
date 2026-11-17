import { Link } from "react-router";

/** A topic; opens everything that shares it. */
export function TopicChip({ name, count }: { name: string; count?: number }) {
  return (
    <Link className="chip topic-chip" to={`/topic/${encodeURIComponent(name.toLowerCase())}`}>
      #{name}
      {count !== undefined && <span className="n">{count.toLocaleString()}</span>}
    </Link>
  );
}
