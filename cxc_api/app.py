# app.py
import os
from typing import Optional, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel


import psycopg
from psycopg.rows import dict_row

from dotenv import load_dotenv

# --- Cargar variables de entorno (.env) ---
load_dotenv()

# --- DSN de Postgres (toma DATABASE_URL del entorno) ---
DB_DSN = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/tu_db")


def _mask_dsn(dsn: str) -> str:
    """Enmascara la contraseña al imprimir el DSN."""
    try:
        prefix, rest = dsn.split("://", 1)
        userpass, hostrest = rest.split("@", 1)
        if ":" in userpass:
            user, _pwd = userpass.split(":", 1)
            userpass_masked = f"{user}:******"
        else:
            userpass_masked = userpass
        return f"{prefix}://{userpass_masked}@{hostrest}"
    except Exception:
        return dsn[:80] + ("..." if len(dsn) > 80 else "")


print("Using DATABASE_URL ->", _mask_dsn(DB_DSN))

app = FastAPI(title="CxC Reporting API", version="1.0")

# --- CORS para permitir llamadas desde el mini frontend ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # en producción reemplaza con tu dominio
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper para consultas ---
def q(sql: str, params: Optional[Tuple] = None):
    with psycopg.connect(DB_DSN, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()

# --- Healthcheck ---
@app.get("/health")
def health():
    try:
        rows = q("SELECT 1 AS ok")
        return {"ok": True, "db": rows[0]["ok"] == 1}
    except Exception as e:
        return JSONResponse(
            {"ok": False, "error": str(e), "dsn": _mask_dsn(DB_DSN)},
            status_code=500,
        )

# -------------- ENDPOINTS --------------

@app.get("/cxc/resumen")
def cxc_resumen(
    limit: int = Query(200, ge=1, le=10000),
    min_saldo: float = Query(0.05, ge=0.0),
):
    sql = """
      SELECT * FROM reporting.v_cxc_resumen_clientes
      WHERE saldo_cliente >= %s
      ORDER BY saldo_cliente DESC
      LIMIT %s
    """
    try:
        return q(sql, (min_saldo, limit))
    except Exception as e:
        raise HTTPException(500, f"Error consultando resumen: {e}")

@app.get("/cxc/aging")
def cxc_aging(
    limit: int = Query(200, ge=1, le=10000),
    min_total: float = Query(0.05, ge=0.0),
):
    sql = """
      SELECT * FROM reporting.v_cxc_aging_clientes
      WHERE total >= %s
      ORDER BY total DESC
      LIMIT %s
    """
    try:
        return q(sql, (min_total, limit))
    except Exception as e:
        raise HTTPException(500, f"Error consultando aging: {e}")

@app.get("/cxc/clientes/{cliente_id}/pendientes")
def cxc_pendientes_cliente(cliente_id: str):
    """
    Detalle de facturas pendientes por cliente (usando la vista).
    """
    sql = """
  SELECT
    numero_factura,
    fecha::date AS fecha,
    pendiente,
    dias
  FROM reporting.v_cxc_pendientes_detalle
  WHERE cliente_id = %s
  ORDER BY fecha
"""

    try:
        return q(sql, (cliente_id,))
    except Exception as e:
        raise HTTPException(500, f"Error consultando pendientes: {e}")

@app.get("/cxc/clientes/top")
def cxc_top(limit: int = Query(10, ge=1, le=1000)):
    sql = """
      SELECT cliente_id, cliente, telefono, ventas_con_saldo, saldo_cliente
      FROM reporting.v_cxc_resumen_clientes
      ORDER BY saldo_cliente DESC
      LIMIT %s
    """
    try:
        return q(sql, (limit,))
    except Exception as e:
        raise HTTPException(500, f"Error consultando top: {e}")

class RecordatorioReq(BaseModel):
    plantilla: Optional[str] = None  # permite personalizar el mensaje

@app.post("/cxc/clientes/{cliente_id}/recordatorio")
def cxc_recordatorio(cliente_id: str, body: RecordatorioReq):
    """
    Devuelve mensaje sugerido y detalle de facturas para WhatsApp/SMS/Email.
    """
    info_sql = """
      SELECT cliente, telefono, saldo_cliente
      FROM reporting.v_cxc_resumen_clientes
      WHERE cliente_id = %s
    """
    det_sql = """
      SELECT numero_factura, fecha::date AS fecha, pendiente, dias
      FROM reporting.v_cxc_pendientes_detalle
      WHERE cliente_id = %s
      ORDER BY fecha
    """
    try:
        info = q(info_sql, (cliente_id,))
        if not info:
            raise HTTPException(404, "Cliente no encontrado o sin saldo.")

        detalle = q(det_sql, (cliente_id,))
        cliente = info[0]["cliente"]
        telefono = info[0]["telefono"]
        total = info[0]["saldo_cliente"]

        if body and body.plantilla:
            msg = body.plantilla.format(cliente=cliente, total=total)
        else:
            msg = (
                f"Hola {cliente}, tenemos registrado un saldo pendiente de ${total}. "
                f"¿Podemos ayudarle a regularizarlo hoy?"
            )

        return JSONResponse({
            "cliente": cliente,
            "telefono": telefono,
            "saldo_total": float(total),
            "mensaje_sugerido": msg,
            "detalle": detalle,
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error generando recordatorio: {e}")
