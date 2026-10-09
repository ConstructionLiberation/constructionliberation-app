import { useLayoutEffect, useRef } from "react"

// A textarea that grows to fit what is in it, and shrinks back. Used wherever
// the Management portal takes a line of text that may run to several lines:
// SWOT points, goals, success measures, comments, actions.
//
// Height is set from scrollHeight after every change of value, so pasted text
// and text loaded from the server size correctly too, not only typing.
export default function AutoTextarea({ value, style, minRows = 1, ...rest }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = el.scrollHeight + 2 + "px"
  }, [value])
  return <textarea ref={ref} rows={minRows} value={value} {...rest}
    style={{ ...style, boxSizing: "border-box", resize: "none", overflow: "hidden" }} />
}
