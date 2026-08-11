import { useEffect, useState } from "react";
import { DEFAULT_BUSINESS_INFO, fetchBusinessInfo } from "../lib/businessInfo";

export function usePortalPaymentOptions() {
  const [info, setInfo] = useState(DEFAULT_BUSINESS_INFO);

  useEffect(() => {
    let active = true;
    fetchBusinessInfo().then((liveInfo) => {
      if (active && liveInfo) setInfo(liveInfo);
    });
    return () => { active = false; };
  }, []);

  return {
    venmo: info.venmoUrl ? { handle: info.venmoHandle, url: info.venmoUrl } : null,
    cashApp: Array.isArray(info.cashapp) ? info.cashapp.filter((option) => option?.handle && option?.url) : [],
  };
}
