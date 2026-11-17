import { textParts } from "@orbit/core";
import { Link } from "react-router";
import { useCardFinder } from "../lib/card-finder.js";

/** Notes or a comment: web addresses shown by readable names, [[Exact title]] opens that card. */
export function RichText({ text }: { text: string }) {
  const findCard = useCardFinder();
  return (
    <>
      {textParts(text, findCard).map((p, i) => {
        switch (p.t) {
          case "text":
            return <span key={i}>{p.text}</span>;
          case "bold":
            return <b key={i}>{p.text}</b>;
          case "url":
            return (
              <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                {p.label}
              </a>
            );
          case "card":
            return p.id ? (
              <Link key={i} to={`/item/${encodeURIComponent(p.id)}`}>
                {p.title}
              </Link>
            ) : (
              <span key={i} className="muted">
                [[{p.title}]]
              </span>
            );
        }
      })}
    </>
  );
}
