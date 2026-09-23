import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether burn-in subtitles are being rendered.
 *
 * Templates do not draw the subtitles themselves, but they do have to stay out of the
 * band those subtitles occupy — so `Safe` reserves the space when this is true, and
 * reclaims it under `--no-captions`.
 */
const CaptionsContext = createContext(false);

export const CaptionsProvider: React.FC<{ value: boolean; children: ReactNode }> = ({
  value,
  children,
}) => <CaptionsContext.Provider value={value}>{children}</CaptionsContext.Provider>;

export function useCaptionsShown(): boolean {
  return useContext(CaptionsContext);
}
