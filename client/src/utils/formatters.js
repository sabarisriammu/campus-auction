/**
 * Shared Indian Rupee (INR) currency formatter.
 * Formats numbers into Indian numbering format with the rupee symbol ₹.
 * Example: 1250 -> "₹1,250.00", 50 -> "₹50.00", 100000 -> "₹1,00,000.00"
 * @param {number|string} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === "" || isNaN(Number(amount))) {
    return "₹0.00";
  }

  const num = Number(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format time remaining from an absolute end date into a live countdown string.
 * Driven strictly by (endTimestamp - Date.now()).
 * @param {Date|string|number} endTime
 * @returns {{ formatted: string, isEnded: boolean, urgent: boolean, totalSeconds: number }}
 */
export function calculateTimeRemaining(endTime) {
  if (!endTime) {
    return { formatted: "Auction ended", isEnded: true, urgent: false, totalSeconds: 0 };
  }

  const endTimestamp = new Date(endTime).getTime();
  if (isNaN(endTimestamp)) {
    return { formatted: "Auction ended", isEnded: true, urgent: false, totalSeconds: 0 };
  }

  const diffMs = endTimestamp - Date.now();
  if (diffMs <= 0) {
    return { formatted: "Auction ended", isEnded: true, urgent: false, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Urgent if less than 15 minutes left
  const urgent = totalSeconds <= 900;

  const padH = String(hours).padStart(2, "0");
  const padM = String(minutes).padStart(2, "0");
  const padS = String(seconds).padStart(2, "0");

  if (days > 0) {
    return {
      formatted: `${days}d ${padH}:${padM}:${padS}`,
      isEnded: false,
      urgent,
      totalSeconds,
    };
  }

  if (hours > 0) {
    return {
      formatted: `${padH}:${padM}:${padS}`,
      isEnded: false,
      urgent,
      totalSeconds,
    };
  }

  return {
    formatted: `${padM}:${padS}`,
    isEnded: false,
    urgent,
    totalSeconds,
  };
}
