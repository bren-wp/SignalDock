(function (root) {
  "use strict";

  function score(command, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return 1;
    const hay = `${command.title} ${command.keywords || ""}`.toLowerCase();
    if (hay === q) return 100;
    if (hay.startsWith(q)) return 80;
    if (hay.includes(q)) return 55;
    let cursor = 0;
    for (const char of hay) if (char === q[cursor]) cursor += 1;
    return cursor === q.length ? 20 : 0;
  }

  function filter(commands, query) {
    return (Array.isArray(commands) ? commands : [])
      .map((command) => ({ command, score: score(command, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))
      .map((item) => item.command);
  }

  root.SignalDockCommandPalette = { filter, score };
}(typeof self !== "undefined" ? self : window));
