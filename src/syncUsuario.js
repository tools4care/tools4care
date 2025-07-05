import { supabase } from "./supabaseClient";

// Busca usuario por email en tabla interna
export async function syncUsuario(email) {
  if (!email) return null;
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();
  if (error) return null;
  return data;
}
