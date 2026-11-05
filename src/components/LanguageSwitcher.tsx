import React, { useState, useRef, useEffect, useId } from "react";
import { Globe, ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

const languages = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
];

const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({
  compact = false,
}) => {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [failed, setFailed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const languageCode = (i18n.resolvedLanguage || i18n.language || "en").split(
    "-",
  )[0];
  const currentLanguage =
    languages.find((lang) => lang.code === languageCode) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      )
        setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen)
      dropdownRef.current
        ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
        ?.focus();
  }, [isOpen]);

  const handleLanguageChange = async (code: string) => {
    setChanging(true);
    setFailed(false);
    try {
      await i18n.changeLanguage(code);
      setIsOpen(false);
      buttonRef.current?.focus();
    } catch {
      setFailed(true);
    } finally {
      setChanging(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (
      isOpen &&
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const options = Array.from(
        dropdownRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitemradio"]',
        ) || [],
      );
      const index = options.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length;
      options[next]?.focus();
    } else if (event.key === "Tab") {
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div
      className="relative shrink-0"
      ref={dropdownRef}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setIsOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(event) => {
          if (!isOpen && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        aria-label={`${t("languages.selectLanguage")}: ${currentLanguage.name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        className={`flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${compact ? "px-2.5 py-2.5 text-xs" : "px-3 py-2 text-sm"}`}
      >
        <Globe size={16} aria-hidden="true" />
        <span className="font-medium">
          {compact ? currentLanguage.code.toUpperCase() : currentLanguage.name}
        </span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`text-slate-500 transition ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("languages.selectLanguage")}
          aria-busy={changing}
          className="absolute right-0 top-full z-[80] mt-2 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-[#12141f] p-1.5 shadow-xl shadow-black/40"
        >
          {languages.map((language) => (
            <button
              key={language.code}
              type="button"
              role="menuitemradio"
              aria-checked={currentLanguage.code === language.code}
              disabled={changing}
              onClick={() => void handleLanguageChange(language.code)}
              className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-violet-400/10 focus:bg-violet-400/10 focus:outline-none disabled:opacity-50 ${currentLanguage.code === language.code ? "bg-violet-400/10 text-violet-200" : "text-slate-300"}`}
            >
              <span lang={language.code}>{language.name}</span>
              {currentLanguage.code === language.code && (
                <Check size={15} aria-hidden="true" />
              )}
            </button>
          ))}
          {failed && (
            <p role="alert" className="px-3 py-2 text-xs text-red-300">
              {t("languages.changeFailed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
