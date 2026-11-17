import { useState } from "react";

/** A one-line box that adds what you type when you press Enter, then empties for the next one. */
export function AddBox({ label, onAdd, list }: { label: string; onAdd: (text: string) => void; list?: string }) {
  const [text, setText] = useState("");
  return (
    <div className="add-box">
      <input
        placeholder={label}
        aria-label={label}
        value={text}
        list={list}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            e.preventDefault();
            onAdd(text.trim());
            setText("");
          }
        }}
      />
    </div>
  );
}
