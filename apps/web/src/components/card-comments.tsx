import { addComment, deleteComment, type Comment } from "@orbit/core";
import { RichText } from "./rich-text.js";
import { AddBox } from "./add-box.js";

/** Comments, oldest first, each with its date and a delete button; a box to add one. */
export function CardComments({
  comments,
  onSave,
}: {
  comments: readonly Comment[];
  onSave: (comments: Comment[]) => void;
}) {
  return (
    <section className="card-sec">
      <h3>Comments</h3>
      {comments.map((c, i) => (
        <div className="comment" key={`${i}-${c.date}`}>
          <div className="comment-body">
            <div className="muted small-text">{c.date}</div>
            <div className="notes">
              <RichText text={c.text} />
            </div>
          </div>
          <button
            type="button"
            className="x-btn"
            aria-label="Delete comment"
            title="Delete comment"
            onClick={() => onSave(deleteComment(comments, i))}
          >
            ×
          </button>
        </div>
      ))}
      <AddBox label="Add a comment" onAdd={(text) => onSave(addComment(comments, text))} />
    </section>
  );
}
