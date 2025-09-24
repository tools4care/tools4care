// src/autoMerchantFault.js
import dayjs from "dayjs";
import { supabase } from "./supabaseClient";

const KEY = "auto-merchant-fault-last-run";

export async function runAutoMerchantFaultIfNeeded() {
  const now = dayjs();
  const hh = now.hour();
  const mm = now.minute();

  // Corre solo después de 20:30
  if (hh < 20 || (hh === 20 && mm < 30)) return;

  const today = now.format("YYYY-MM-DD");
  const lastRun = localStorage.getItem(KEY);
  if (lastRun === today) return; // ya corrió hoy

  const { data, error } = await supabase.rpc("mark_merchant_fault_auto", {
    cutoff_hour: 20,
    cutoff_min: 30,
  });
  if (!error) {
    localStorage.setItem(KEY, today);
    // opcional: notificar en UI
    console.info(`[Auto] MERCHANT_FAULT ejecutado. Filas afectadas: ${data ?? 0}`);
  } else {
    console.error("Error al ejecutar auto MERCHANT_FAULT:", error);
  }
}
