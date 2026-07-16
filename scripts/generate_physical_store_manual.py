#!/usr/bin/env python3
"""Generate the TOOLS4CARE Physical Store employee training guide."""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "TOOLS4CARE_Physical_Store_Employee_Guide.pdf"
LOGO = ROOT / "public" / "icons" / "icon-512.png"

PAGE_W, PAGE_H = letter
NAVY = colors.HexColor("#0F2742")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#DCE5F0")
PAPER = colors.HexColor("#F5F8FC")
BLUE = colors.HexColor("#3563E9")
BLUE_LIGHT = colors.HexColor("#EAF1FF")
GREEN = colors.HexColor("#08A16A")
GREEN_LIGHT = colors.HexColor("#E8FAF3")
AMBER = colors.HexColor("#F59E0B")
AMBER_LIGHT = colors.HexColor("#FFF7E2")
RED = colors.HexColor("#E5484D")
RED_LIGHT = colors.HexColor("#FFF0F0")
PURPLE = colors.HexColor("#6D4AFF")
TEAL = colors.HexColor("#0E9AAA")
WHITE = colors.white


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="GuideTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=29, leading=33, textColor=WHITE, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="GuideSubtitle", parent=styles["Normal"], fontName="Helvetica",
    fontSize=12, leading=17, textColor=colors.HexColor("#D9E8FF"), alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="SectionEyebrow", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=8, leading=10, textColor=BLUE, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="SectionTitle", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=23, leading=27, textColor=INK, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="SectionLead", parent=styles["Normal"], fontName="Helvetica",
    fontSize=10.5, leading=15, textColor=MUTED, spaceAfter=13,
))
styles.add(ParagraphStyle(
    name="CardTitle", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=11, leading=14, textColor=INK, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="Body", parent=styles["Normal"], fontName="Helvetica",
    fontSize=9, leading=12.5, textColor=INK,
))
styles.add(ParagraphStyle(
    name="Small", parent=styles["Normal"], fontName="Helvetica",
    fontSize=7.5, leading=10, textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Tiny", parent=styles["Normal"], fontName="Helvetica",
    fontSize=6.7, leading=8.5, textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Button", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=8.5, leading=11, textColor=WHITE, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="StepNo", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=13, leading=15, textColor=WHITE, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="Callout", parent=styles["Normal"], fontName="Helvetica",
    fontSize=8.5, leading=12, textColor=INK,
))
styles.add(ParagraphStyle(
    name="Spanish", parent=styles["Normal"], fontName="Helvetica-Oblique",
    fontSize=8.2, leading=11.5, textColor=colors.HexColor("#475569"),
))
styles.add(ParagraphStyle(
    name="TableHeader", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=7.2, leading=9, textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="TableCell", parent=styles["Normal"], fontName="Helvetica",
    fontSize=7.2, leading=9.4, textColor=INK,
))


def P(text, style="Body"):
    return Paragraph(text, styles[style])


def page_chrome(canvas, doc):
    page = canvas.getPageNumber()
    canvas.saveState()
    if page == 1:
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(BLUE)
        canvas.circle(PAGE_W - 0.45 * inch, PAGE_H - 0.55 * inch, 1.35 * inch, fill=1, stroke=0)
        canvas.setFillColor(GREEN)
        canvas.circle(0.2 * inch, 0.25 * inch, 1.1 * inch, fill=1, stroke=0)
    else:
        canvas.setFillColor(WHITE)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(NAVY)
        canvas.rect(0, PAGE_H - 0.38 * inch, PAGE_W, 0.38 * inch, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(WHITE)
        canvas.drawString(0.55 * inch, PAGE_H - 0.245 * inch, "TOOLS4CARE  |  PHYSICAL STORE")
        canvas.setFont("Helvetica", 7.5)
        canvas.drawRightString(PAGE_W - 0.55 * inch, PAGE_H - 0.245 * inch, "Employee Training Guide")
        canvas.setStrokeColor(LINE)
        canvas.line(0.55 * inch, 0.45 * inch, PAGE_W - 0.55 * inch, 0.45 * inch)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(0.55 * inch, 0.27 * inch, "Button names match the English interface")
        canvas.drawRightString(PAGE_W - 0.55 * inch, 0.27 * inch, f"Page {page}")
    canvas.restoreState()


def section_header(number, title, lead):
    return [
        P(f"SECTION {number}", "SectionEyebrow"),
        P(title, "SectionTitle"),
        P(lead, "SectionLead"),
    ]


def callout(title, body, tone="blue"):
    palette = {
        "blue": (BLUE_LIGHT, BLUE),
        "green": (GREEN_LIGHT, GREEN),
        "amber": (AMBER_LIGHT, AMBER),
        "red": (RED_LIGHT, RED),
    }
    bg, accent = palette[tone]
    table = Table([[P(title, "CardTitle"), P(body, "Callout")]], colWidths=[1.45 * inch, 5.15 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.8, accent),
        ("LINEBEFORE", (0, 0), (0, -1), 5, accent),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return KeepTogether([table, Spacer(1, 10)])


def step_rows(steps, color=BLUE):
    rows = []
    for number, title, body, spanish in steps:
        number_table = Table([[P(str(number), "StepNo")]], colWidths=[0.35 * inch], rowHeights=[0.35 * inch])
        number_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), color),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOX", (0, 0), (-1, -1), 0, color),
        ]))
        content = [P(title, "CardTitle"), P(body, "Body")]
        if spanish:
            content.extend([Spacer(1, 2), P(spanish, "Spanish")])
        rows.append([number_table, content])
    table = Table(rows, colWidths=[0.55 * inch, 6.05 * inch], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (1, 0), (1, -2), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def cards(items, columns=2):
    rows = []
    for index in range(0, len(items), columns):
        row = []
        for item in items[index:index + columns]:
            title, body, tone = item
            bg, accent = {
                "blue": (BLUE_LIGHT, BLUE), "green": (GREEN_LIGHT, GREEN),
                "amber": (AMBER_LIGHT, AMBER), "red": (RED_LIGHT, RED),
                "navy": (colors.HexColor("#EDF2F8"), NAVY),
            }[tone]
            box = Table([[P(title, "CardTitle")], [P(body, "Body")]], colWidths=[3.18 * inch])
            box.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.8, accent),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]))
            row.append(box)
        while len(row) < columns:
            row.append("")
        rows.append(row)
    grid = Table(rows, colWidths=[3.3 * inch] * columns, hAlign="LEFT")
    grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return grid


def button(label, color=BLUE, width=1.45 * inch):
    table = Table([[P(label, "Button")]], colWidths=[width], rowHeights=[0.42 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("BOX", (0, 0), (-1, -1), 0, color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table


def screen_mock(title, rows, footer_buttons=None, accent=BLUE):
    data = [[P(title, "TableHeader"), P("PHYSICAL STORE", "TableHeader")]]
    for label, value in rows:
        data.append([P(label, "TableCell"), P(value, "TableCell")])
    table = Table(data, colWidths=[2.0 * inch, 4.55 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BACKGROUND", (0, 1), (-1, -1), PAPER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PAPER]),
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("INNERGRID", (0, 1), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    elements = [table]
    if footer_buttons:
        buttons = [button(label, color, width) for label, color, width in footer_buttons]
        footer = Table([buttons], colWidths=[b._colWidths[0] + 0.08 * inch for b in buttons], hAlign="RIGHT")
        footer.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(footer)
    return KeepTogether(elements)


def feature_table(headers, rows, widths):
    data = [[P(value, "TableHeader") for value in headers]]
    data.extend([[P(str(value), "TableCell") for value in row] for row in rows])
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PAPER]),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def build_story():
    story = []

    # Cover
    story.extend([
        Spacer(1, 0.55 * inch),
        Image(str(LOGO), width=1.55 * inch, height=1.55 * inch),
        Spacer(1, 0.28 * inch),
        P("PHYSICAL STORE", "GuideTitle"),
        P("Employee Training Guide", "GuideTitle"),
        Spacer(1, 0.15 * inch),
        P("Step-by-step training / Guia de capacitacion", "GuideSubtitle"),
        Spacer(1, 0.5 * inch),
    ])
    cover_box = Table([
        [P("WHO SHOULD USE THIS", "TableHeader"), P("WHAT THIS GUIDE COVERS", "TableHeader")],
        [P("Cashiers, supervisors, store managers and employees receiving inventory.", "Body"),
         P("Opening the register, sales, customer payments, returns, stock transfers and daily closeout.", "Body")],
    ], colWidths=[3.05 * inch, 3.05 * inch])
    cover_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#284466")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F5F8FC")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#5C7899")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#5C7899")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.extend([
        cover_box,
        Spacer(1, 0.42 * inch),
        P("IMPORTANT", "TableHeader"),
        Spacer(1, 0.08 * inch),
        P("The interface remains in English. This guide repeats the exact button names and adds short Spanish explanations so a trainer can guide a new employee without changing the system language.", "GuideSubtitle"),
        Spacer(1, 0.42 * inch),
        P(f"Training edition - {date.today().strftime('%B %Y')}", "GuideSubtitle"),
        PageBreak(),
    ])

    # Page 2
    story.extend(section_header("01", "Start Here", "The Physical Store workspace is a separate operating environment for a fixed retail location. Customers are shared, while stock, cash shifts and store settings belong to the selected location."))
    story.append(cards([
        ("Cashier", "Open one register, process sales and returns, record approved cash movements, and close the same register.", "green"),
        ("Supervisor", "Confirm inventory, receive transfers, review differences, void incorrect movements, and reopen a close with a reason.", "blue"),
        ("Store Manager", "Review store dashboard, tax settings, reorder alerts, register history and general closeout.", "navy"),
        ("Customer-facing tools", "Use Customer Display, receipt printing and the cash drawer only when the store setup enables them.", "amber"),
    ]))
    story.append(callout("Core rule", "Always select the correct Physical Store and open the register assigned to this computer before accepting cash, completing a store sale or processing a refund.", "red"))
    story.append(P("Daily workflow", "CardTitle"))
    workflow = feature_table(
        ["1", "2", "3", "4", "5", "6"],
        [["Sign In", "Select Store", "Open Register", "Sell / Return", "Count Drawer", "Close Store"]],
        [1.1 * inch] * 6,
    )
    story.extend([workflow, Spacer(1, 12), P("Flujo diario: entrar, seleccionar la tienda, abrir la caja, trabajar, contar el efectivo y cerrar.", "Spanish"), PageBreak()])

    # Page 3
    story.extend(section_header("02", "Sign In and Select Physical Store", "Each employee signs in with an individual account. Never share credentials because sales, transfers, cash movements and approvals are recorded by user."))
    story.append(step_rows([
        (1, "Open TOOLS4CARE", "Go to the production URL and enter your Email Address and Password.", "Abra el sistema e ingrese su correo y contrasena."),
        (2, "Choose the location", "Use the location selector and choose the Physical Store where you are working. Do not select a VAN for counter sales.", "Seleccione la tienda fisica correcta, no una VAN."),
        (3, "Confirm the workspace", "The sidebar and dashboard should identify the store. Verify the store name before opening a register.", "Confirme el nombre de la tienda antes de abrir caja."),
        (4, "Use your own computer", "A register shift is tied to the cashier and this computer. Do not continue another employee's open shift.", "El turno pertenece al cajero y a esa computadora."),
    ], color=BLUE))
    story.extend([Spacer(1, 12), screen_mock("Login", [
        ("Email Address", "employee@company.com"),
        ("Password", "********"),
        ("Location", "Physical Store - Main Counter"),
    ], [("Sign In", BLUE, 1.55 * inch)]), Spacer(1, 12)])
    story.append(callout("If the wrong menu appears", "Stop and verify the selected location. A VAN, Online Store and Physical Store can share customers but use different inventory and operational menus.", "amber"))
    story.append(PageBreak())

    # Page 4
    story.extend(section_header("03", "Physical Store Dashboard", "The dashboard is the store's home page. It summarizes sales, returns, cash, inventory risk and the actions employees use most."))
    story.append(cards([
        ("New Sale", "Start a walk-in or saved-customer transaction at the counter.", "green"),
        ("Cash Register", "Open, monitor, count and close the drawer assigned to this cashier and computer.", "navy"),
        ("Process Return", "Find the original receipt and refund only eligible quantities.", "amber"),
        ("Find Customer", "Search by name, phone, email, address or business; create a customer when needed.", "blue"),
        ("Close Store", "Review the general store close after individual registers are closed.", "navy"),
        ("Inventory Alerts", "Review low stock, best sellers at risk and pending transfer receipts.", "red"),
    ]))
    story.append(callout("Initial inventory", "A supervisor confirms the starting inventory once the first physical count or transfer is complete. The system saves the product-by-product baseline.", "green"))
    story.append(P("Dashboard numbers are operational indicators, not a replacement for counting the physical drawer or merchandise.", "Spanish"))
    story.append(PageBreak())

    # Page 5
    story.extend(section_header("04", "Open the Cash Register", "The register must be open before cash sales, customer A/R payments or store refunds. Opening creates a shift for one cashier on one computer."))
    story.append(step_rows([
        (1, "Open Cash Register", "From the dashboard, select Cash Register.", "Entre a Cash Register desde el dashboard."),
        (2, "Verify register and cashier", "Confirm the register name, your employee name and this device.", "Confirme caja, cajero y computadora."),
        (3, "Count the opening float", "Count the physical starting cash and enter the exact amount in Opening Float.", "Cuente el fondo inicial real."),
        (4, "Add an opening note", "Record anything unusual, such as a sealed cash bag number or approved starting difference.", "Anote cualquier detalle especial."),
        (5, "Select Open Register", "The expected cash starts with the opening float and updates during the shift.", "Abra la caja y verifique el total esperado."),
    ], color=GREEN))
    story.extend([Spacer(1, 8), screen_mock("Cash Register", [
        ("Register", "Front Counter 1"),
        ("Cashier", "Signed-in employee"),
        ("Opening Float", "$100.00"),
        ("Status", "Ready to open"),
    ], [("Open Register", GREEN, 1.8 * inch)]), Spacer(1, 9)])
    story.append(callout("Never do this", "Do not enter estimated money, borrow another cashier's session, or open multiple registers for the same drawer.", "red"))
    story.append(PageBreak())

    # Page 6
    story.extend(section_header("05", "Create a Sale", "The fastest store workflow is scanner first: scan products, confirm quantities, then continue to payment. Camera scanning stays optional."))
    story.append(step_rows([
        (1, "Choose the customer", "Select No Client Sale for a walk-in, or find/create a customer when the purchase should be saved to an account.", "Use No Client para venta rapida o busque el cliente."),
        (2, "Add products", "Scan a barcode with the USB scanner and press Enter. You may also search by product name, code or brand.", "Escanee o busque el producto."),
        (3, "Build the cart", "Adding an item keeps the product list open. Continue scanning; use plus or minus to correct quantity.", "Siga agregando sin salir de la lista."),
        (4, "Check stock and price", "Verify product, price, available quantity and any approved discount before payment.", "Revise producto, precio, inventario y descuento."),
        (5, "Select Next - Payment", "Continue only after the cart matches the merchandise at the counter.", "Pase a pago cuando la lista este correcta."),
    ], color=BLUE))
    story.extend([Spacer(1, 9), callout("Scanner priority", "The USB barcode scanner is the main store tool. Use Camera Scan only when a barcode cannot be captured with the scanner or no scanner is connected.", "blue")])
    story.append(screen_mock("Add Products", [
        ("Search / Scanner", "Search by name, code or brand..."),
        ("Cart", "3 units - $39.98"),
        ("Product result", "Price, brand and stock visible"),
    ], [("Back", NAVY, 1.05 * inch), ("Next - Payment", BLUE, 1.8 * inch)]))
    story.append(PageBreak())

    # Page 7
    story.extend(section_header("06", "Customers and Accounts Receivable", "Customer accounts are shared across locations. The selected Physical Store still records which register collected a direct balance payment."))
    story.append(cards([
        ("Search", "Find a customer by name, phone, email, address or business. Confirm at least two identifiers before selecting.", "blue"),
        ("Create", "Use Client to add a new account. Avoid duplicates by searching phone and business first.", "green"),
        ("Balance Due", "A positive amount is money owed by the customer. Zero means no balance due.", "red"),
        ("Available Credit", "Shows remaining approved credit. Do not confuse it with the current balance or cash available.", "amber"),
    ]))
    story.append(step_rows([
        (1, "Open the customer", "Confirm the customer name, business and phone before viewing or collecting a balance.", "Confirme que sea el cliente correcto."),
        (2, "Review Balance Due", "Check the amount owed and any payment agreement before accepting money.", "Revise la deuda y acuerdos."),
        (3, "Collect payment", "Select the payment method and enter only the amount received. Store cash payments require an open register.", "Registre solamente el dinero recibido."),
        (4, "Give proof", "Print or send the resulting receipt when available and confirm the updated balance.", "Entregue recibo y confirme el nuevo balance."),
    ], color=PURPLE))
    story.append(callout("Do not create credits by mistake", "Never enter more than the customer's balance as a direct A/R payment. A product return and a customer payment are different transactions.", "red"))
    story.append(PageBreak())

    # Page 8
    story.extend(section_header("07", "Collect Payment", "The payment page is intentionally simple. Choose the method, confirm the amount received and review the remaining balance or change before saving."))
    story.append(step_rows([
        (1, "Confirm Total to Collect", "Compare the system total with the cart and customer display.", "Confirme el total de la compra."),
        (2, "Choose payment method", "Select Cash, Card, Transfer, Check or another approved method. Use Split Payment only when needed.", "Seleccione el metodo correcto."),
        (3, "Enter amount received", "For cash, enter the money handed to you. The system calculates Change. For electronic methods, enter the approved amount.", "En efectivo, escriba lo recibido para calcular el cambio."),
        (4, "Review Remaining", "Remaining must be zero unless an approved customer balance is intentionally going to A/R.", "Remaining debe quedar en cero salvo credito autorizado."),
        (5, "Save Sale", "Save once, wait for confirmation, then print the receipt or open the drawer as configured.", "Guarde una sola vez y espere confirmacion."),
    ], color=GREEN))
    story.extend([Spacer(1, 8), screen_mock("Payment", [
        ("Total to Collect", "$43.25"),
        ("Payment Method", "Cash"),
        ("Amount Received", "$50.00"),
        ("Change", "$6.75"),
        ("Remaining", "$0.00"),
    ], [("Customer Display", PURPLE, 1.75 * inch), ("Save Sale", GREEN, 1.45 * inch)]), Spacer(1, 9)])
    story.append(callout("Cash accuracy", "Count the customer's cash aloud, enter the amount before opening the drawer, and count the change back to the customer.", "amber"))
    story.append(PageBreak())

    # Page 9
    story.extend(section_header("08", "Tax, Customer Display, Receipt and Drawer", "These tools are location settings. They may be enabled or disabled for one store without changing a VAN or Online Store."))
    story.append(feature_table(
        ["Function", "Use", "Employee action", "Important control"],
        [
            ["Sales Tax", "Adds or extracts the configured store tax.", "Confirm the tax indicator before saving.", "Only managers change the rate or included setting."],
            ["Customer Display", "Shows products, tax, total, payments and balance to the customer.", "Open when the customer wants to review the order.", "It is optional and contains no cashier controls."],
            ["Print Receipt", "Prints a thermal receipt after a completed sale.", "Confirm the printer and paper before reprinting.", "Do not create a second sale to replace a receipt."],
            ["Open Drawer", "Triggers a drawer connected through the receipt printer.", "Open only for an approved cash reason.", "Browser kiosk printing may be required."],
        ],
        [1.15 * inch, 1.65 * inch, 2.0 * inch, 1.8 * inch],
    ))
    story.extend([Spacer(1, 12), callout("Tax is optional per sale", "If the location is configured for tax, use the tax control according to store policy. The receipt and customer display must match the amount collected.", "blue")])
    story.append(callout("Customer privacy", "Close the Customer Display after the transaction. Never leave another customer's name, balance or purchase list visible.", "red"))
    story.append(PageBreak())

    # Page 10
    story.extend(section_header("09", "Returns and Refunds", "Returns start from the original transaction. The system prevents returning more units than were sold and restores approved quantities to the selected store inventory."))
    story.append(step_rows([
        (1, "Select Process Return", "Open return mode from the dashboard or store sales tools.", "Entre a Process Return."),
        (2, "Find the receipt", "Search the customer or walk-in sale and open the original transaction.", "Busque la venta original."),
        (3, "Choose quantities", "Use plus and minus to select only the items physically received. Review Already Returned.", "Seleccione solo lo recibido y revise devoluciones previas."),
        (4, "Record the reason", "Choose or type a clear return reason and inspect the merchandise.", "Registre el motivo real."),
        (5, "Choose return type", "Money Refund returns money by the approved method. Reduce A/R lowers customer debt and does not remove cash.", "Reembolso devuelve dinero; Reduce A/R reduce deuda."),
        (6, "Confirm", "Verify total, method, items and customer. Cash refunds require an open register.", "Confirme total, metodo, productos y cliente."),
    ], color=AMBER))
    story.append(callout("Never refund without merchandise", "Follow store policy for damaged items, exceptions and manager approval. Do not use a negative sale or a manual withdrawal to imitate a return.", "red"))
    story.append(PageBreak())

    # Page 11
    story.extend(section_header("10", "Store Inventory", "Physical Store inventory is independent from Warehouse and each VAN. A shared product catalog does not mean shared quantity."))
    story.append(cards([
        ("Store Stock", "The quantity physically available in this retail location.", "green"),
        ("Warehouse Stock", "Central quantity used to replenish stores and VANs.", "navy"),
        ("VAN Stock", "Quantity assigned to one mobile route or vehicle.", "blue"),
        ("Online Availability", "May follow its own location and selling rules.", "amber"),
    ]))
    story.append(step_rows([
        (1, "Search or scan", "Find the product and confirm the selected inventory location.", "Busque el producto y confirme la ubicacion."),
        (2, "Review quantity", "Compare system stock with the physical shelf or receiving count.", "Compare sistema con conteo fisico."),
        (3, "Adjust only with permission", "Record a reason for damage, correction or authorized count adjustment.", "Ajuste solo con permiso y motivo."),
        (4, "Watch reorder alerts", "Best sellers at risk, low stock and out-of-stock products should be prioritized for replenishment.", "Priorice mas vendidos con poco inventario."),
    ], color=TEAL))
    story.append(callout("Starting inventory", "A supervisor confirms Initial Store Inventory only after the store count is credible. The saved snapshot supports later discrepancy review.", "green"))
    story.append(PageBreak())

    # Page 12
    story.extend(section_header("11", "Transfers and Receiving", "A stock transfer records the product, quantity, origin, destination, sender and receiver. Destination stock is updated atomically, then the receiver confirms delivery."))
    story.append(step_rows([
        (1, "Create transfer", "Choose the origin, destination, product and quantity. Confirm enough stock exists at the origin.", "Seleccione origen, destino, producto y cantidad."),
        (2, "Record reason", "State why merchandise is moving, such as store replenishment or VAN restock.", "Escriba el motivo de la transferencia."),
        (3, "Sender verifies", "The employee initiating the transfer checks product and count before dispatch.", "Quien envia confirma producto y cantidad."),
        (4, "Receiver counts", "At the destination, open Inventory Awaiting Receipt and compare the delivered quantity.", "Quien recibe cuenta la mercancia."),
        (5, "Confirm Received", "Select Confirm Received only after the physical count matches.", "Confirme recibido solo si coincide."),
        (6, "Escalate differences", "If quantity or product is wrong, do not confirm. Contact a supervisor and preserve the package or transfer reference.", "Si no coincide, no confirme y avise."),
    ], color=GREEN))
    story.extend([Spacer(1, 8), screen_mock("Inventory Awaiting Receipt", [
        ("Product", "COOL CARE PLUS 5IN1 SPRAY"),
        ("Transfer", "Warehouse to Physical Store"),
        ("Quantity", "12 units"),
        ("Sent by", "Employee name and time"),
    ], [("Confirm Received", GREEN, 1.9 * inch)]), Spacer(1, 8)])
    story.append(P("<b>Control:</b> The sender and receiver are recorded separately so inventory differences remain traceable.", "Small"))
    story.append(PageBreak())

    # Page 13
    story.extend(section_header("12", "Cash Movements During the Shift", "Deposits, withdrawals and expenses change expected cash. Every movement needs an amount, reason, employee and time."))
    story.append(feature_table(
        ["Movement", "When to use", "Effect on expected cash", "Example"],
        [
            ["Deposit", "Approved cash added to the drawer outside a sale.", "Increases", "Additional change fund"],
            ["Withdrawal", "Approved cash removed and secured elsewhere.", "Decreases", "Safe drop"],
            ["Expense", "Approved store expense paid from the drawer.", "Decreases", "Emergency store supply"],
            ["Void", "Supervisor correction of an incorrect movement.", "Removes original effect", "Wrong amount or duplicate"],
        ],
        [1.05 * inch, 2.1 * inch, 1.55 * inch, 1.9 * inch],
    ))
    story.extend([Spacer(1, 12), step_rows([
        (1, "Select movement type", "Choose Deposit, Withdrawal or Expense.", "Seleccione el tipo correcto."),
        (2, "Enter exact amount", "Count and enter the money moved, not the drawer total.", "Ingrese solo el dinero movido."),
        (3, "Enter reason", "Use a clear business reason. Keep supporting documents.", "Escriba un motivo claro y guarde evidencia."),
        (4, "Supervisor void only", "An incorrect movement stays visible and is voided with a reason, employee and timestamp.", "El movimiento no se borra; se anula con auditoria."),
    ], color=NAVY), Spacer(1, 10)])
    story.append(callout("No shortcuts", "Never use a cash movement to correct a sale, return, customer payment or counting difference. Correct the original operation or escalate it.", "red"))
    story.append(PageBreak())

    # Page 14
    story.extend(section_header("13", "Close the Register and Store", "Close each cashier register first. The store's general closeout is reviewed after all operating drawers are counted and closed."))
    story.append(step_rows([
        (1, "Stop transactions", "Finish or cancel active sales and verify pending offline activity.", "Termine ventas y revise actividad offline."),
        (2, "Count physical cash", "Count the drawer without looking for a number to match. Enter Cash Counted exactly.", "Cuente primero y escriba el total real."),
        (3, "Review System Expected", "Expected Cash equals opening float + cash sales + A/R cash - cash returns + deposits - withdrawals - expenses.", "Compare contado contra esperado."),
        (4, "Explain variance", "If variance is not zero, recount and document the reason. Do not add a fake movement.", "Recuente y explique diferencias."),
        (5, "Close this register", "Save the close. The snapshot and audit trail remain in history.", "Cierre la caja y conserve el registro."),
        (6, "General store close", "Manager reviews all registers and payment methods, then completes Close Store.", "El gerente completa el cierre general."),
    ], color=RED))
    story.extend([Spacer(1, 8), screen_mock("Close This Register", [
        ("System Expected", "$1,248.50"),
        ("Cash Counted", "$1,248.50"),
        ("Variance", "$0.00"),
        ("Close note", "Count verified"),
    ], [("Close Register", RED, 1.8 * inch)]), Spacer(1, 8)])
    story.append(P("<b>Controlled reopening:</b> Only an authorized supervisor should reopen a closed shift. The prior close and reopening reason remain in history.", "Small"))
    story.append(PageBreak())

    # Page 15
    story.extend(section_header("14", "Offline Work and Problem Recovery", "The sales workspace can retain approved data locally, but store cash integrity still depends on the original register shift and later synchronization."))
    story.append(feature_table(
        ["Situation", "What the employee should do", "What not to do"],
        [
            ["Internet lost", "Confirm Offline Ready, continue only approved operations, and keep the browser open.", "Do not refresh repeatedly or clear browser data."],
            ["Payment queued", "Keep the transaction confirmation and allow automatic synchronization when online.", "Do not enter the same payment again."],
            ["Printer fails", "Finish one valid sale, then reprint the receipt after checking printer and paper.", "Do not create a duplicate sale."],
            ["Scanner fails", "Search product by code/name or use optional Camera Scan.", "Do not select a similar product without verifying code."],
            ["Register not found", "Confirm location, cashier and computer; ask a supervisor if another shift is open.", "Do not use another cashier's login."],
            ["Inventory mismatch", "Stop receipt confirmation and notify a supervisor with transfer details.", "Do not force an adjustment without a count and reason."],
        ],
        [1.3 * inch, 3.0 * inch, 2.3 * inch],
    ))
    story.extend([Spacer(1, 12), callout("Duplicate prevention", "If a button appears slow, wait for the result. Repeated clicks can create operational confusion even when the database blocks duplicate financial transactions.", "amber")])
    story.append(callout("Security", "Never share passwords, leave a signed-in register unattended, or photograph customer account information.", "red"))
    story.append(PageBreak())

    # Page 16
    story.extend(section_header("15", "Quick Checklists", "Use these short lists at the beginning and end of every shift. A supervisor may print this page for the counter."))
    checklist = feature_table(
        ["Opening checklist", "Closing checklist"],
        [[
            "[ ] Correct Physical Store selected<br/>[ ] Own cashier account<br/>[ ] Correct register and computer<br/>[ ] Opening float physically counted<br/>[ ] Scanner tested<br/>[ ] Printer paper checked<br/>[ ] Customer Display ready if used",
            "[ ] Active sales completed<br/>[ ] Offline queue reviewed<br/>[ ] Deposits / withdrawals documented<br/>[ ] Drawer physically counted<br/>[ ] Variance reviewed and noted<br/>[ ] Register closed<br/>[ ] Manager notified for store close",
        ]],
        [3.3 * inch, 3.3 * inch],
    )
    story.extend([checklist, Spacer(1, 14), P("Terms employees must know", "CardTitle")])
    story.append(feature_table(
        ["English interface term", "Meaning / significado"],
        [
            ["Opening Float", "Starting cash - fondo inicial"],
            ["Expected Cash", "System drawer target - efectivo esperado"],
            ["Cash Counted", "Physical cash counted - efectivo contado"],
            ["Variance", "Difference between counted and expected - diferencia"],
            ["Balance Due", "Money the customer owes - deuda del cliente"],
            ["Available Credit", "Approved unused credit - credito disponible"],
            ["Money Refund", "Money returned to customer - reembolso"],
            ["Reduce A/R", "Reduce customer debt - reducir cuenta por cobrar"],
            ["Confirm Received", "Receiver accepts delivered quantity - confirmar recibido"],
        ],
        [2.35 * inch, 4.25 * inch],
    ))
    story.extend([Spacer(1, 13), callout("Need help?", "Stop the transaction before guessing. Record the customer, receipt, register and transfer reference, then contact the store supervisor or system administrator.", "blue")])
    story.append(P("End of guide - use only the production system and current store policy.", "Small"))
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=letter,
        leftMargin=0.58 * inch, rightMargin=0.58 * inch,
        topMargin=0.62 * inch, bottomMargin=0.58 * inch,
        title="TOOLS4CARE Physical Store Employee Training Guide",
        author="TOOLS4CARE",
        subject="Physical Store operations and employee training",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="guide", frames=[frame], onPage=page_chrome)])
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
