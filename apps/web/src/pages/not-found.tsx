import { Link } from "react-router";
import { PageBar } from "../components/page-bar.js";

export function NotFound() {
  return (
    <>
      <PageBar title="Not found" />
      <div className="pad">
        Nothing lives at this address. <Link to="/">Go to Today</Link>
      </div>
    </>
  );
}
