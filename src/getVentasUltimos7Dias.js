import { supabase } from "./supabaseClient";

import dayjs from "dayjs";

export async function getVentasUltimos7Dias() {
  const hoy = dayjs().format("YYYY-MM-DD");
  const hace7 = dayjs().subtract(6, "day").format("YYYY-MM-DD");
  const { data, error } = await supabase
    .from("ventas")
    .select("total,fecha")
    .gte("fecha", hace7)
    .lte("fecha", hoy);

  if (error) throw new Error(error.message);
  return data;
}
