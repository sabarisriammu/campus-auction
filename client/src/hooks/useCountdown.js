import { useState, useEffect } from "react";
import { calculateTimeRemaining } from "../utils/formatters";

/**
 * Custom React hook for live second-by-second countdown driven by absolute end time.
 * Automatically cleans up timer on unmount and triggers optional onExpire callback.
 * @param {Date|string|number} endTime
 * @param {Function} [onExpire] - Optional callback fired when countdown reaches zero
 * @returns {{ formatted: string, isEnded: boolean, urgent: boolean, totalSeconds: number }}
 */
export function useCountdown(endTime, onExpire) {
  const [state, setState] = useState(() => calculateTimeRemaining(endTime));

  useEffect(() => {
    // Initial calculation on mount or when endTime changes
    const initial = calculateTimeRemaining(endTime);
    setState(initial);

    if (initial.isEnded) {
      return;
    }

    const intervalId = setInterval(() => {
      const current = calculateTimeRemaining(endTime);
      setState(current);

      if (current.isEnded) {
        clearInterval(intervalId);
        if (typeof onExpire === "function") {
          onExpire();
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [endTime, onExpire]);

  return state;
}
