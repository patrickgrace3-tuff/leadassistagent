// Content script: runs alongside the active page. Reads page context for the
// side panel and performs small on-page actions (highlight, fill).
(() => {
  // Guard against double-injection (declared in manifest + programmatic retry).
  if (window.__leadAssistContentLoaded) return;
  window.__leadAssistContentLoaded = true;

  const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const PHONE_RE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

  function unique(values) {
    return [...new Set(values)];
  }

  function readPage() {
    const bodyText = document.body ? document.body.innerText : "";
    return {
      url: location.href,
      title: document.title,
      selection: window.getSelection().toString().trim(),
      emails: unique(bodyText.match(EMAIL_RE) || []).slice(0, 20),
      phones: unique(bodyText.match(PHONE_RE) || []).slice(0, 20),
      metaDescription:
        document.querySelector('meta[name="description"]')?.content || "",
      headings: [...document.querySelectorAll("h1, h2")]
        .map((h) => h.innerText.trim())
        .filter(Boolean)
        .slice(0, 10),
    };
  }

  function highlight(selector) {
    document
      .querySelectorAll(".lead-assist-highlight")
      .forEach((el) => el.classList.remove("lead-assist-highlight"));

    const matches = document.querySelectorAll(selector);
    matches.forEach((el) => el.classList.add("lead-assist-highlight"));
    if (matches.length > 0) {
      matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return { matched: matches.length };
  }

  function fill(selector, value) {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`No element matches selector: ${selector}`);

    // Use the native setter so frameworks (React, etc.) see the change.
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { filled: selector };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      switch (message?.type) {
        case "page:read":
          sendResponse(readPage());
          break;
        case "page:highlight":
          sendResponse(highlight(message.selector));
          break;
        case "page:fill":
          sendResponse(fill(message.selector, message.value));
          break;
        default:
          return false;
      }
    } catch (err) {
      sendResponse({ error: err.message || String(err) });
    }
    return false; // responses above are synchronous
  });
})();
