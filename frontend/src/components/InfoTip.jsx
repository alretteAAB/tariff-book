import { useState, useEffect, useRef } from "react";

// ─── InfoTip ────────────────────────────────────────────────────────
// Click/tap to toggle; tap outside or Escape to close. Works on touch
// (where CSS :hover sticks) because visibility is driven by the `open`
// class, not :hover/:focus.
export function InfoTip({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <span
      ref={ref}
      className={`info-tip ${open ? "open" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={open}
      onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
        else if (e.key === "Escape") setOpen(false);
      }}
    >
      i
      <span className="info-tip-box">{children}</span>
    </span>
  );
}
