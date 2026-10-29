import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const iframeDocuments = new Map<HTMLIFrameElement, Document>();
    const iframeLoadHandlers = new Map<
      HTMLIFrameElement,
      (event: Event) => void
    >();
    initialFocusRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          !element.hasAttribute("hidden") &&
          element.getAttribute("aria-hidden") !== "true",
      );
      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeIndex = focusableElements.indexOf(
        document.activeElement as HTMLElement,
      );
      const nextIndex = event.shiftKey
        ? activeIndex <= 0
          ? focusableElements.length - 1
          : activeIndex - 1
        : activeIndex < 0 || activeIndex === focusableElements.length - 1
          ? 0
          : activeIndex + 1;
      event.preventDefault();
      focusableElements[nextIndex]?.focus();
    };

    const attachIframeKeyHandler = (iframe: HTMLIFrameElement) => {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument || iframeDocuments.get(iframe) === frameDocument) {
        return;
      }

      iframeDocuments
        .get(iframe)
        ?.removeEventListener("keydown", handleKeyDown);
      frameDocument.addEventListener("keydown", handleKeyDown);
      iframeDocuments.set(iframe, frameDocument);
    };

    const observeIframe = (iframe: HTMLIFrameElement) => {
      if (!iframeLoadHandlers.has(iframe)) {
        const handleLoad = () => attachIframeKeyHandler(iframe);
        iframe.addEventListener("load", handleLoad);
        iframeLoadHandlers.set(iframe, handleLoad);
      }
      attachIframeKeyHandler(iframe);
    };

    const dialog = dialogRef.current;
    dialog?.querySelectorAll("iframe").forEach(observeIframe);
    const observer = dialog
      ? new MutationObserver(() => {
          dialog.querySelectorAll("iframe").forEach(observeIframe);
        })
      : null;
    if (dialog && observer) {
      observer.observe(dialog, { childList: true, subtree: true });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      observer?.disconnect();
      iframeLoadHandlers.forEach((handler, iframe) => {
        iframe.removeEventListener("load", handler);
      });
      iframeDocuments.forEach((frameDocument) => {
        frameDocument.removeEventListener("keydown", handleKeyDown);
      });
      previouslyFocused?.focus();
    };
  }, [dialogRef, initialFocusRef]);
}
