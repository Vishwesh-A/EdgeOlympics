"""Build the participant-facing PDF from the current submission contract."""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

OUT = Path(__file__).resolve().parents[1] / "public" / "edge-olympics-participant-guide.pdf"
green = colors.HexColor("#12805d")
ink = colors.HexColor("#14231f")
muted = colors.HexColor("#52625c")
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="GuideTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=ink, spaceAfter=8))
styles.add(ParagraphStyle(name="GuideDeck", parent=styles["Normal"], fontSize=9, leading=12, textColor=muted, spaceAfter=8))
styles.add(ParagraphStyle(name="GuideHeading", parent=styles["Heading2"], fontSize=11, leading=13, textColor=green, spaceBefore=9, spaceAfter=3))
styles.add(ParagraphStyle(name="GuideBody", parent=styles["Normal"], fontSize=8.3, leading=11, textColor=ink, spaceAfter=3))
styles.add(ParagraphStyle(name="GuideBullet", parent=styles["GuideBody"], leftIndent=13, firstLineIndent=-9))
styles.add(ParagraphStyle(name="GuideSmall", parent=styles["GuideBody"], fontSize=7.5, leading=9.5))

story = []
def p(s, style="GuideBody"):
    story.append(Paragraph(s, styles[style]))
def heading(s):
    p(s, "GuideHeading")
def bullets(items):
    for item in items:
        p("&#8226; " + item, "GuideBullet")

p("EDGE OLYMPICS | PARTICIPANT GUIDE", "GuideTitle")
p("30 October 2026 · Submission deadline: <b>6:00 PM India Standard Time (IST)</b> · Official portal: edgeolympics.vercel.app", "GuideDeck")
p("Build a single TensorFlow Lite image classifier and submit it through your team page. The organizers validate the file, then benchmark eligible models on Raspberry Pi 4B workers against a private evaluation set.")

heading("1  Get started")
bullets([
    "Sign in on the event site. Create a team or join one with the team's invite code. Submit from <b>My team</b>.",
    "Use the training data and class definitions supplied for the challenge. Keep a separate validation split while developing. The official evaluation images and labels are private.",
    "Train on your own computer or cloud compute if useful. Only the exported model runs during judging; no notebook, script, network service, or sidecar file accompanies it.",
])

heading("2  Exact model contract")
rows = [
    ("File", "One self-contained <b>.tflite</b> file, at most <b>50 MiB</b> (50 × 1,048,576 bytes)."),
    ("Input", "One image tensor of shape <b>[1, 128, 128, 1]</b>: batch 1, grayscale. Input image values represent the normalized <b>0–1</b> range."),
    ("Input dtype", "<b>float32, int8, or uint8</b>. For quantized inputs, the judge uses the model's input scale and zero point."),
    ("Output", "First output tensor has shape <b>[1, 8]</b> and contains eight class scores. The highest score determines the predicted class, indexed <b>0–7</b> in the supplied class order."),
    ("Runtime", "The model must load and run with the official CPU TFLite interpreter on a Raspberry Pi 4B. Avoid custom or delegate-only operators."),
]
table = Table([[Paragraph(a, styles["GuideSmall"]), Paragraph(b, styles["GuideSmall"])] for a,b in rows], colWidths=[78, 423])
table.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#f0f7f3")),("ROWBACKGROUNDS",(0,0),(-1,-1),[colors.HexColor("#f0f7f3"),colors.white]),("BOTTOMPADDING",(0,0),(-1,-1),4),("TOPPADDING",(0,0),(-1,-1),4),("LINEBELOW",(0,0),(-1,-1),0.3,colors.HexColor("#d5e4dc"))]))
story.append(table)
p("Check the exact input/output tensors and run a local inference before uploading. A correct extension alone does not mean the model will pass validation.", "GuideSmall")

heading("3  Submit and track")
bullets([
    "Open <b>My team</b>, select the .tflite file, and press <b>Submit model</b> before 6:00 PM IST. The portal displays the deadline in your device's local timezone.",
    "Each team has <b>three submission slots</b>. Pending, running, completed, and disqualified entries use slots. A failed entry releases its slot so you can fix the model and submit again.",
    "Follow the result on <b>My team</b> or <b>Leaderboard / My submissions</b>. Normal progress: pending_prelim, queued_for_edge, running, completed. A failed status includes an error to help diagnose the issue.",
    "There is no overwrite or 'latest file wins' behavior. Each upload creates a separate submission; the best completed eligible score for your team is used for ranking.",
])

heading("4  How scoring works")
p("The benchmark measures <b>accuracy</b> on the hidden set, <b>inference latency</b> in milliseconds, and <b>peak RAM</b> in MiB. The current weights are accuracy 60%, latency 25%, and RAM 15%, with reference values of 100 ms and 256 MiB. The organizer dashboard can change settings; the live leaderboard shows the active values.")
p("Score = 100 × [0.60 × accuracy + 0.25 × 100/(100 + latency_ms) + 0.15 × 256/(256 + peak_ram_mb)]. Accuracy is a fraction from 0 to 1. Higher score is better. Ties use accuracy (higher), then latency (lower), then RAM (lower).", "GuideSmall")
p("Model file size is a submission limit and displayed metric, but it is not part of the weighted score. Temperature is monitored for safe operation; it is not a scored metric. There is no minimum accuracy qualification threshold.")

heading("5  Before you upload")
bullets([
    "Confirm the file is self-contained, under 50 MiB, and has the required shape, dtype, normalized image domain, and class order.",
    "Run it locally with a CPU TFLite interpreter and check that all eight output scores are finite. Leave time for validation and, if necessary, another upload before the deadline.",
    "Do not attempt to access the hidden evaluation set, another team's files, or judging infrastructure. Ask an organizer about event logistics or a submission status you cannot resolve.",
])
p("Portal: <link href='https://edgeolympics.vercel.app/' color='#12805d'>edgeolympics.vercel.app</link>  |  This guide describes the current portal and benchmark contract.", "GuideSmall")

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor("#d5e4dc"))
    canvas.line(48, 44, A4[0]-48, 44)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(muted)
    canvas.drawString(48, 31, "Edge Olympics 2026 · Participant guide")
    canvas.drawRightString(A4[0]-48, 31, str(doc.page))

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=47, leftMargin=47, topMargin=32, bottomMargin=51)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
