import { supabase } from '../supabaseClient';

export async function getVansForUser() {
  const { data: vans, error } = await supabase
    .from('vans')
    .select('id, nombre_van, placa, descripcion')
    .eq('activo', true);

  if (error) throw error;
  return vans;
}
