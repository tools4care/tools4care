import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function ModalCreateSupplier({ onClose, onCreate }) {
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    contacto: "",
    direccion: "",
    email: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("suplidores")
      .insert([form])
      .select()
      .maybeSingle();
    setLoading(false);
    if (err) {
      setError("Could not create supplier.");
      return;
    }
    onCreate(data);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <form
        className="bg-white p-6 rounded-xl shadow-xl w-full max-w-lg relative"
        onSubmit={handleSubmit}
      >
        <button
          className="absolute top-2 right-2 text-2xl text-gray-500 hover:text-black"
          type="button"
          onClick={onClose}
        >×</button>
        <h2 className="text-xl font-bold mb-3">New Supplier</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            type="text"
            className="border rounded p-2"
            placeholder="Name*"
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            required
            autoFocus
          />
          <input
            type="text"
            className="border rounded p-2"
            placeholder="Contact"
            value={form.contacto}
            onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))}
          />
          <input
            type="tel"
            className="border rounded p-2"
            placeholder="Phone"
            value={form.telefono}
            onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
          />
          <input
            type="email"
            className="border rounded p-2"
            placeholder="Email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
          <input
            type="text"
            className="border rounded p-2 md:col-span-2"
            placeholder="Address"
            value={form.direccion}
            onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
          />
        </div>
        {error && <div className="text-red-600 text-sm my-2">{error}</div>}
        <div className="flex gap-2 mt-4">
          <button
            className="flex-1 bg-gray-400 text-white py-2 rounded"
            type="button"
            onClick={onClose}
            disabled={loading}
          >Cancel</button>
          <button
            className="flex-1 bg-blue-700 text-white py-2 rounded"
            type="submit"
            disabled={loading}
          >{loading ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
