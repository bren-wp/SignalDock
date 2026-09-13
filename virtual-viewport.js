(function (root) {
  "use strict";

  function calculate(options = {}) {
    const total = Math.max(0, Math.floor(Number(options.total) || 0));
    const rowHeight = Math.max(1, Number(options.rowHeight) || 46);
    const viewportHeight = Math.max(rowHeight, Number(options.viewportHeight) || 420);
    const overscan = Math.max(0, Math.floor(Number(options.overscan) || 10));
    const maxScrollPx = Math.max(viewportHeight * 2, Number(options.maxScrollPx) || 8000000);
    const logicalHeight = total * rowHeight;
    const pitch = total && logicalHeight > maxScrollPx ? maxScrollPx / total : rowHeight;
    const compressed = pitch < rowHeight;
    const visibleRows = Math.max(12, Math.ceil(viewportHeight / rowHeight));
    const maxScrollTop = Math.max(0, Math.min(maxScrollPx, logicalHeight) - viewportHeight);
    const scrollTop = Math.max(0, Math.min(Number(options.scrollTop) || 0, maxScrollTop));
    const rawStart = total ? Math.floor(scrollTop / Math.max(pitch, 0.25)) : 0;
    const start = total ? Math.max(0, Math.min(total - 1, rawStart - overscan)) : 0;
    const end = Math.min(total, start + visibleRows + overscan * 2);
    return {
      total, rowHeight, pitch, compressed, logicalHeight, maxScrollPx,
      maxScrollTop, scrollTop, visibleRows, overscan, start, end,
      topSpacerPx: start * pitch,
      bottomSpacerPx: Math.max(0, (total - end) * pitch)
    };
  }

  root.SignalDockVirtualViewport = { calculate };
}(typeof self !== "undefined" ? self : window));
