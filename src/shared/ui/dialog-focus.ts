"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

interface DialogTabState {
  count: number;
  activeIndex: number;
  focusInside: boolean;
  shiftKey?: boolean;
}

export function resolveDialogTabIndex({
  count,
  activeIndex,
  focusInside,
  shiftKey = false,
}: DialogTabState): number | null {
  if (count <= 0) return null;
  if (!focusInside || activeIndex < 0) return shiftKey ? count - 1 : 0;
  if (shiftKey && activeIndex === 0) return count - 1;
  if (!shiftKey && activeIndex === count - 1) return 0;
  return null;
}

export const DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface UseDialogFocusOptions {
  active: boolean;
  onClose: () => void;
}

interface UseDialogFocusResult {
  dialogRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
}

export function useDialogFocus({
  active,
  onClose,
}: UseDialogFocusOptions): UseDialogFocusResult {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) {
      hasFocusedRef.current = false;
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [active]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    const activeElement = document.activeElement;
    const activeIndex = focusable.findIndex(
      (element) => element === activeElement
    );
    const nextIndex = resolveDialogTabIndex({
      count: focusable.length,
      activeIndex,
      focusInside: activeIndex >= 0,
      shiftKey: event.shiftKey,
    });
    if (nextIndex == null) return;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }, []);

  useEffect(() => {
    if (!active) return;

    if (!hasFocusedRef.current) {
      closeButtonRef.current?.focus();
      hasFocusedRef.current = true;
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, handleKeyDown]);

  return { dialogRef, closeButtonRef };
}
