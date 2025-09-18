# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os

app = FastAPI()

# --------- CORS ---------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # o limita: ["http://localhost:5173", "https://tu-dominio"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------- Health ---------
@app.get("/health")
@app.head("/health")
def health():
    return {"ok": True}

# --------- Defaults por entorno (Render -> Environment) ---------
COMPANY_NAME   = os.getenv("COMPANY_NAME",   "Care Beauty Supply")
PAY_URL        = os.getenv("PAY_URL",        "https://carebeautysupply.carrd.co/")
CONTACT_EMAIL  = os.getenv("CONTACT_EMAIL",  "tools4care@gmail.com")
CONTACT_PHONE  = os.getenv("CONTACT_PHONE",  "+1 (781) 953-1475 & +1 (857) 856-0030")
DEFAULT_TONE   = os.getenv("REMINDER_TONE",  "professional").lower()  # professional | friendly | short

# --------- Helpers ---------
def fmt_money(n: Optional[float]) -> str:
    try:
        return f"${float(n):,.2f}"
    except Exception:
        return "$0.00"

# --------- Modelos ---------
class ReminderIn(BaseModel):
    # datos de la cuenta (limit/available se aceptan pero NO se muestran)
    cliente: str
    saldo: Optional[float] = None
    limite: Optional[float] = None
    disponible: Optional[float] = None
    total_cxc: Optional[float] = None
    score: Optional[int] = None

    # personalización (opcionales; si no vienen, se usan los defaults fijos de arriba)
    company: Optional[str] = None
    pay_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    tone: Optional[str] = None  # 'professional' | 'friendly' | 'short'
    lang: Optional[str] = None  # 'en' | 'es'  (opcional; por defecto 'en')

class ReminderOut(BaseModel):
    ok: bool
    message: str

# --------- Endpoint ---------
@app.post("/reminder", response_model=ReminderOut)
def make_reminder(body: ReminderIn):
    nombre = (body.cliente or "customer").strip()
    saldo = float(body.saldo or 0.0)
    total_cxc = body.total_cxc

    company = (body.company or COMPANY_NAME).strip()
    pay_url = (body.pay_url or PAY_URL).strip()
    contact_email = (body.contact_email or CONTACT_EMAIL).strip()
    contact_phone = (body.contact_phone or CONTACT_PHONE).strip()
    tone = (body.tone or DEFAULT_TONE).lower()
    if tone not in {"professional", "friendly", "short"}:
        tone = "professional"

    lang = (body.lang or "en").lower()
    if lang not in {"en", "es"}:
        lang = "en"

    # ===== Mensajes (sin límite/disponible) =====
    if lang == "es":
        if tone == "short":
            msg = (
                f"{company} — Saldo {fmt_money(saldo)}. "
                f"Pagar: {pay_url} • Ayuda: {contact_phone} / {contact_email}"
            )
        elif tone == "friendly":
            partes = [
                f"Hola {nombre}! Te saluda {company} 😊",
                f"Tu saldo pendiente es {fmt_money(saldo)}.",
            ]
            if total_cxc is not None:
                partes.append(f"Total CxC: {fmt_money(total_cxc)}.")
            partes += [
                f"Puedes pagar aquí: {pay_url}",
                f"Si tienes preguntas, respóndenos o contáctanos en {contact_email} o {contact_phone}.",
                f"¡Gracias por tu preferencia! — {company}",
            ]
            msg = "\n".join(partes)
        else:  # professional
            lineas = [
                f"Hola {nombre}, le escribe {company}.",
                "Este es un recordatorio sobre su cuenta.",
                f"Saldo pendiente: {fmt_money(saldo)}.",
            ]
            if total_cxc is not None:
                lineas.append(f"Total por cobrar: {fmt_money(total_cxc)}.")
            lineas += [
                f"Opciones de pago: {pay_url}",
                f"Consultas: {contact_email} | {contact_phone}",
                f"Gracias por su preferencia. — {company}",
            ]
            msg = "\n".join(lineas)
    else:
        if tone == "short":
            msg = (
                f"{company} — Balance {fmt_money(saldo)}. "
                f"Pay: {pay_url} • Help: {contact_phone} / {contact_email}"
            )
        elif tone == "friendly":
            parts = [
                f"Hello {nombre}, this is {company} 😊",
                "Just a friendly reminder about your account.",
                f"Outstanding balance: {fmt_money(saldo)}.",
            ]
            if total_cxc is not None:
                parts.append(f"Total A/R: {fmt_money(total_cxc)}.")
            parts += [
                f"You can choose a payment option here: {pay_url}",
                f"If you have any questions, reply here or contact us at {contact_email} or {contact_phone}.",
                f"Thank you for your business! — {company}",
            ]
            msg = "\n".join(parts)
        else:  # professional
            lines = [
                f"Hello {nombre}, this is {company}.",
                "This is a friendly reminder about your account.",
                f"Outstanding balance: {fmt_money(saldo)}.",
            ]
            if total_cxc is not None:
                lines.append(f"Total A/R: {fmt_money(total_cxc)}.")
            lines += [
                f"Payment options: {pay_url}",
                f"For questions: {contact_email} | {contact_phone}",
                f"Thank you. — {company}",
            ]
            msg = "\n".join(lines)

    return {"ok": True, "message": msg}
