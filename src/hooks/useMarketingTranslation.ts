import { useCallback } from "react";
import { useTranslation } from "react-i18next";

// Public copy uses complete English phrases as keys, including punctuation.
// Leave numbers and other React values unchanged when rendering market data.
export function useMarketingTranslation() {
  const { t } = useTranslation("marketing");

  return useCallback(
    <T>(value: T): T =>
      typeof value === "string"
        ? (t(value, {
            keySeparator: false,
            nsSeparator: false,
            defaultValue: value,
          }) as T)
        : value,
    [t],
  );
}
