import { useState, useEffect, useCallback } from 'react';

export interface TextSelectionResult {
  sectionId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  rect: DOMRect;
}

export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelectionResult | null>(null);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      return;
    }

    const text = sel.toString().trim();
    if (!text || text.length < 3) {
      return;
    }

    const range = sel.getRangeAt(0);

    // Find the section container
    const sectionEl = findSectionAncestor(range.commonAncestorContainer);
    if (!sectionEl) {
      return;
    }

    const sectionId = sectionEl.getAttribute('data-section-id');
    if (!sectionId) {
      return;
    }

    // Compute character offsets relative to the section's text content
    const offsets = computeOffsets(sectionEl, range);
    if (!offsets) {
      return;
    }

    const rect = range.getBoundingClientRect();

    setSelection({
      sectionId,
      selectedText: text,
      startOffset: offsets.start,
      endOffset: offsets.end,
      rect,
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mouseup', handleMouseUp);

    // Clear selection when clicking outside
    function handleMouseDown(e: MouseEvent) {
      // Don't clear if clicking on a popover
      const target = e.target as HTMLElement;
      if (target.closest('[data-popover]')) return;
      setSelection(null);
    }

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef, handleMouseUp]);

  return { selection, clearSelection };
}

function findSectionAncestor(node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hasAttribute('data-section-id')) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

function computeOffsets(
  container: HTMLElement,
  range: Range,
): { start: number; end: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let start = -1;
  let end = -1;

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const len = textNode.length;

    if (textNode === range.startContainer) {
      start = charCount + range.startOffset;
    }
    if (textNode === range.endContainer) {
      end = charCount + range.endOffset;
      break;
    }

    charCount += len;
  }

  if (start === -1 || end === -1 || start >= end) return null;
  return { start, end };
}
