/**
 * Copied text without the text engine's invisible line-break hints (CS2-13): U+200B between Chinese words, U+00AD in
 * Turkish headings and U+2060 inside codes are display controls, but pasted into a search box (Baidu, WeChat, Google)
 * or a quote e-mail they split words or survive as junk. Both the plain-text and the HTML flavour are cleaned, so a
 * paste into a rich editor keeps its formatting. Form fields are left alone (the browser copies their value).
 */
const INVISIBLE = /[​­⁠]/;
const INVISIBLE_ALL = /[​­⁠]/g;

document.addEventListener("copy", (e) => {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !e.clipboardData) return;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;
  const text = sel.toString();
  if (!INVISIBLE.test(text)) return;
  const box = document.createElement("div");
  for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
  e.clipboardData.setData("text/plain", text.replace(INVISIBLE_ALL, ""));
  e.clipboardData.setData("text/html", box.innerHTML.replace(INVISIBLE_ALL, ""));
  e.preventDefault();
});
