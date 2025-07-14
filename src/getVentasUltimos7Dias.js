import { supabase } from "./supabaseClient";
import dayjs from "dayjs";

export async function getVentasUltimos7Dias() {
  const fechaInicio = dayjs().subtract(6, "day").startOf("day").format("YYYY-MM-DD");
  const fechaFin = dayjs().endOf("day").format("YYYY-MM-DD");
  const { data, error } = await supabase
    .from("ventas")
    .select("*")
    .gte("fecha", fechaInicio)
    .lte("fecha", fechaFin)
    .order("fecha", { ascending: false });

  if (error) {
    console.error("Error consultando ventas:", error);
    return [];
  }
  return data || [];
}
