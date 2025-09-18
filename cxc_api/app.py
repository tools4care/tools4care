# app.py
from __future__ import annotations

import os
from typing import Optional, Tuple, Any, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

# --- Postgres con psycopg v3 ---
import psycopg
from psycopg.rows import dict_row


# --- Cargar variables de entorno (.env) de forma segura/optativa ---
def _safe_load_dotenv() -> None:
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except Exception:
        # Si no está instalado python-dotenv, seguimos sin romper.
        pass


_safe_load_dotenv()

# --- DSN de Postgres (toma DATABASE_URL del entorno) ---
DB_DSN = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/tu_db")


def _mask_dsn(dsn: str) -> str:
    """Enmascara la contraseña al imprimir el DSN (log seguro)."""
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

# --- CORS ---
# Nota: allow_credentials=True no es compatible con allow_origins=["*"] en navegadores.
ALLOWED_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=False if ALLOWED_ORIGINS == ["*"] else True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Helper DB ---
def q(sql: str, params: Optional[Tuple[Any, ...]] = None) -> List[dict]:
    """Ejecuta una consulta y devuelve lista de dicts (psycopg v3 con dict_row)."""
    try:
        with psycopg.connect(DB_DSN, row_factory=dict_row, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params or ())
                rows = cur.fetchall()
                # rows ya es List[dict] gracias a dict_row
                return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


# --- Root / Health ---
@app.get("/", response_class=PlainTextResponse)
def root():
    return "CxC Reporting API up. See /docs"


@app.get("/health")
def health():
    try:
        rows = q("SELECT 1 AS ok")
        ok_val = bool(rows and rows[0].get("ok") == 1)
        return {"ok": True, "db": ok_val, "dsn": _mask_dsn(DB_DSN)}
    except HTTPException as e:
        return JSONResponse(
            {"ok": False, "error": e.detail, "dsn": _mask_dsn(DB_DSN)}, status_code=500
        )


# ---------------- ENDPOINTS ----------------

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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando resumen: {e}")


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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando aging: {e}")


@app.get("/cxc/clientes/{cliente_id}/pendientes")
def cxc_pendientes_cliente(cliente_id: str):
    """
    Detalle de facturas pendientes por cliente (usando la vista disponible).
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando pendientes: {e}")


@app.get("/cxc/clientes/{cliente_id}/top")
def cxc_top_for_cliente(cliente_id: str, limit: int = Query(10, ge=1, le=1000)):
    sql = """
      SELECT cliente_id, cliente, telefono, ventas_con_saldo, saldo_cliente
      FROM reporting.v_cxc_resumen_clientes
      WHERE cliente_id = %s
      ORDER BY saldo_cliente DESC
      LIMIT %s
    """
    try:
        return q(sql, (cliente_id, limit))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando top por cliente: {e}")


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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando top: {e}")


# -------- Recordatorio / Mensaje sugerido --------

class RecordatorioReq(BaseModel):
    plantilla: Optional[str] = None  # permite personalizar el mensaje


def _armar_mensaje(cliente: str, total: float, plantilla: Optional[str]) -> str:
    if plantilla:
        # placeholders {cliente} y {total}
        return plantilla.format(cliente=cliente, total=total)
    return (
        f"Hi {cliente}, we show an outstanding balance of ${total:.2f}. "
        f"Can we help you settle it today?"
    )


@app.get("/cxc/clientes/{cliente_id}/mensaje")
def cxc_mensaje_sugerido(cliente_id: str, plantilla: Optional[str] = None):
    info_sql = """
      SELECT cliente, saldo_cliente
      FROM reporting.v_cxc_resumen_clientes
      WHERE cliente_id = %s
    """
    try:
        info = q(info_sql, (cliente_id,))
        if not info:
            raise HTTPException(status_code=404, detail="Cliente no encontrado o sin saldo.")

        cliente = info[0]["cliente"]
        total = float(info[0]["saldo_cliente"])
        return {
            "cliente": cliente,
            "saldo_total": total,
            "mensaje_sugerido": _armar_mensaje(cliente, total, plantilla),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando mensaje: {e}")


@app.post("/cxc/clientes/{cliente_id}/recordatorio")
def cxc_recordatorio(cliente_id: str, body: Optional[RecordatorioReq] = None):
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
            raise HTTPException(status_code=404, detail="Cliente no encontrado o sin saldo.")

        detalle = q(det_sql, (cliente_id,))
        cliente = info[0]["cliente"]
        telefono = info[0]["telefono"]
        total = float(info[0]["saldo_cliente"])

        msg = _armar_mensaje(cliente, total, (body.plantilla if body else None))

        return {
            "cliente": cliente,
            "telefono": telefono,
            "saldo_total": total,
            "mensaje_sugerido": msg,
            "detalle": detalle,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando recordatorio: {e}")


# --- Ejecución directa: python app.py (útil en local) ---
if __name__ == "__main__":
    import uvicorn  # type: ignore
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
