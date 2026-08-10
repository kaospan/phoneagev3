const SEEN_KEY = "stone-age-campaign-intro-seen";

export const hasSeenCampaignIntro = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
};

export const markCampaignIntroSeen = (): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // ignore storage failures
  }
};
