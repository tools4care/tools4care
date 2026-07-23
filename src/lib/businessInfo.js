import { supabase } from "../supabaseClient";

// Content for the public "/info" landing page (QR code on business cards).
// Stored as a single JSONB row so fields can be added later without a
// migration. These defaults render instantly while the live row loads —
// and match the live row until someone edits it in Business Info Admin.
export const DEFAULT_BUSINESS_INFO = {
  name: "Tools4Care",
  tagline: "Beauty & Barber Supply",
  address: "108 Lafayette St, Salem, MA 01970",
  email: "tools4care@gmail.com",
  instagramHandle: "@tools4care",
  instagramUrl: "https://www.instagram.com/tools4care",
  shopUrl: "/storefront",
  venmoHandle: "@Jorge-ortiz-178",
  venmoUrl: "https://venmo.com/Jorge-ortiz-178",
  cashapp: [
    { handle: "$4carebeauty", url: "https://cash.app/$4carebeauty" },
    { handle: "$4carebeauty2", url: "https://cash.app/$4carebeauty2" },
  ],
  contacts: [
    { name: "Jorge Ortiz", phone: "(781) 953-1475", whatsapp: "17819531475" },
    { name: "Edwin Evangelista", phone: "(857) 856-0030", whatsapp: "18578560030" },
  ],
};

const ROW_ID = "default";

export function normalizeBusinessInfo(data) {
  return { ...DEFAULT_BUSINESS_INFO, ...(data || {}) };
}

// Never throws — callers should already be showing DEFAULT_BUSINESS_INFO,
// so a failed/slow fetch should just mean "keep showing the default".
export async function fetchBusinessInfo() {
  try {
    const { data, error } = await supabase
      .from("business_info")
      .select("data")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error || !data) return null;
    return normalizeBusinessInfo(data.data);
  } catch {
    return null;
  }
}

export async function saveBusinessInfo(info, userId) {
  const { error } = await supabase
    .from("business_info")
    .upsert(
      { id: ROW_ID, data: info, updated_at: new Date().toISOString(), updated_by: userId || null },
      { onConflict: "id" },
    );
  if (error) throw error;
}
