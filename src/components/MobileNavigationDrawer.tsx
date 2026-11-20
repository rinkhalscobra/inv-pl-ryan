import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import BrandLogo from './BrandLogo';

interface MobileNavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  desktopMinWidth: number;
  triggerRef: RefObject<HTMLButtonElement>;
  children: ReactNode;
  footer: ReactNode;
}

export default function MobileNavigationDrawer({
  isOpen, onClose, desktopMinWidth, triggerRef, children, footer,
}: MobileNavigationDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const desktop = window.matchMedia(`(min-width: ${desktopMinWidth}px)`);
    if (desktop.matches) {
      onClose();
      return;
    }

    // A modal dialog keeps keyboard focus inside and the page behind it inert.
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleResize = () => {
      if (desktop.matches) onClose();
    };
    desktop.addEventListener('change', handleResize);

    return () => {
      desktop.removeEventListener('change', handleResize);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      if (!desktop.matches) triggerRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen, onClose, desktopMinWidth, triggerRef]);

  return createPortal(
    <dialog
      ref={dialogRef}
      id="mobile-navigation"
      aria-label="Navigation menu"
      aria-modal="true"
      className="mobile-navigation-drawer"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.defaultPrevented) return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        )).filter(element => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      {isOpen && (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <BrandLogo className="h-auto w-28" />
            <button type="button" autoFocus onClick={onClose} aria-label="Close navigation menu"
              className="flex h-10 w-10 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
              <X size={19} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
            {children}
          </div>
          <div className="shrink-0 border-t border-white/[0.08] bg-[#10141c] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
