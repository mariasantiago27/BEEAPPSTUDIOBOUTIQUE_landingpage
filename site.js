(function () {
  function isExternal(href) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      return false;
    }
    try {
      return new URL(href, window.location.href).origin !== window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function applyExternal(anchor) {
    if (!isExternal(anchor.getAttribute("href"))) return;
    if (anchor.target === "_blank") return;
    anchor.target = "_blank";
    var rel = (anchor.getAttribute("rel") || "").split(/\s+/).filter(Boolean);
    if (rel.indexOf("noopener") === -1) rel.push("noopener");
    if (rel.indexOf("noreferrer") === -1) rel.push("noreferrer");
    anchor.rel = rel.join(" ");
  }

  function scan(root) {
    (root || document).querySelectorAll("a[href]").forEach(applyExternal);
  }

  scan();

  if (document.body) {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches("a[href]")) applyExternal(node);
          else scan(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
