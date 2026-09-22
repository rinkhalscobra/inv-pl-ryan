import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

type Choice = { value: string; label: ReactNode; group?: string; disabled?: boolean };
type SelectChange = { target: { value: string } };

interface AppSelectProps {
  value?: string | number;
  onChange?: (event: SelectChange) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  'aria-label'?: string;
}

function readChoices(children: ReactNode, group?: string): Choice[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === 'optgroup') {
      const props = child.props as { label?: string; children?: ReactNode };
      return readChoices(props.children, props.label);
    }
    if (child.type !== 'option') return [];
    const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    return [{ value: String(props.value ?? ''), label: props.children, group, disabled: props.disabled }];
  });
}

export default function AppSelect({ value, onChange, children, className = '', disabled, id, name, required, 'aria-label': ariaLabel }: AppSelectProps) {
  const choices = useMemo(() => readChoices(children), [children]);
  const selected = String(value ?? '');
  const selectedIndex = choices.findIndex(choice => choice.value === selected);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 180, maxHeight: 300 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId().replace(/:/g, '');

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const placeAbove = below < 220 && above > below;
    const maxHeight = Math.max(100, Math.min(320, placeAbove ? above : below));
    setPosition({
      top: placeAbove ? Math.max(8, rect.top - maxHeight - 5) : rect.bottom + 5,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!buttonRef.current?.contains(node) && !menuRef.current?.contains(node)) setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      updatePosition();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const menu = menuRef.current;
    const row = menu?.children[activeIndex] as HTMLElement | undefined;
    if (!menu || !row) return;
    if (row.offsetTop < menu.scrollTop) menu.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = row.offsetTop + row.offsetHeight - menu.clientHeight;
    }
  }, [open, activeIndex]);

  const nextEnabled = (start: number, step: number) => {
    if (!choices.length) return -1;
    for (let count = 0; count < choices.length; count++) {
      const index = (start + step * (count + 1) + choices.length * 2) % choices.length;
      if (!choices[index].disabled) return index;
    }
    return -1;
  };
  const select = (choice: Choice) => {
    if (choice.disabled) return;
    if (choice.value !== selected) onChange?.({ target: { value: choice.value } });
    setOpen(false);
    buttonRef.current?.focus();
  };
  const toggle = () => {
    if (disabled) return;
    if (!open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : nextEnabled(-1, 1));
    setOpen(current => !current);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(nextEnabled(open ? activeIndex : selectedIndex < 0 && step < 0 ? 0 : selectedIndex, step));
      if (!open) setOpen(true);
      return;
    }
    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? nextEnabled(-1, 1) : nextEnabled(0, -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open && choices[activeIndex]) select(choices[activeIndex]);
      else toggle();
    }
  };

  return <>
    <button
      ref={buttonRef}
      id={id}
      type="button"
      role="combobox"
      aria-label={ariaLabel}
      aria-controls={open ? listId : undefined}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      aria-required={required || undefined}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={onKeyDown}
      className={`inline-flex min-w-0 items-center justify-between gap-3 text-left ${className.replace(/\bcustom-select\b/g, '')}`}
      style={{ backgroundImage: 'none' }}
    >
      <span className="min-w-0 truncate">{choices[selectedIndex]?.label ?? 'Select'}</span>
      <ChevronDown aria-hidden="true" size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180 text-violet-300' : ''}`} />
    </button>
    {name && <input type="hidden" name={name} value={selected} />}
    {open && createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        className="fixed z-[10000] overflow-y-auto rounded-xl border border-white/[0.14] bg-[#171d29] p-1.5 text-sm text-slate-200 shadow-[0_18px_55px_rgba(0,0,0,0.55)] ring-1 ring-black/20"
        style={position}
      >
        {choices.map((choice, index) => <div key={`${choice.value}-${index}`}>
          {choice.group && (index === 0 || choice.group !== choices[index - 1].group) &&
            <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{choice.group}</div>}
          <div
            id={`${listId}-${index}`}
            role="option"
            aria-selected={selected === choice.value}
            aria-disabled={choice.disabled || undefined}
            onMouseEnter={() => { if (!choice.disabled) setActiveIndex(index); }}
            onMouseDown={event => event.preventDefault()}
            onClick={() => select(choice)}
            className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors ${choice.disabled ? 'cursor-not-allowed opacity-40' : activeIndex === index ? 'bg-violet-500/20 text-white' : 'hover:bg-white/[0.07]'} ${selected === choice.value ? 'text-violet-200' : ''}`}
          >
            <span className="min-w-0 truncate">{choice.label}</span>
            {selected === choice.value && <Check aria-hidden="true" size={15} className="shrink-0 text-violet-300" />}
          </div>
        </div>)}
      </div>, document.body)}
  </>;
}
