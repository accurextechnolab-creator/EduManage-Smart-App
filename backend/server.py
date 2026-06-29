from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import io
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Annotated

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

# ---------- Setup ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ['JWT_SECRET']

app = FastAPI(title="EduManage API")
api = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("edumanage")

# ---------- Pydantic helpers ----------
def str_objectid(v) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)

PyObjectId = Annotated[str, BeforeValidator(str_objectid)]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


# ---------- Models ----------
class UserOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: PyObjectId = Field(alias="_id")
    email: str
    name: str
    role: str = "teacher"


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class BatchIn(BaseModel):
    name: str
    subject: Optional[str] = ""
    session: Optional[str] = ""
    monthly_fee: float = 0


class StudentIn(BaseModel):
    name: str
    student_code: Optional[str] = ""
    phone: Optional[str] = ""
    parent_name: Optional[str] = ""
    parent_phone: Optional[str] = ""
    monthly_fee: Optional[float] = None  # override batch fee
    discount_amount: Optional[float] = 0.0   # ₹ off per month
    discount_percent: Optional[float] = 0.0  # % off per month
    discount_reason: Optional[str] = ""      # e.g. Sibling, Scholarship, ...


class AttendanceMark(BaseModel):
    student_id: str
    status: str  # "present" | "absent"


class AttendanceSaveIn(BaseModel):
    batch_id: str
    date: str  # YYYY-MM-DD
    marks: List[AttendanceMark]


class FeePayIn(BaseModel):
    student_id: str
    batch_id: str
    month: str  # YYYY-MM
    amount: float
    paid_on: Optional[str] = None  # YYYY-MM-DD
    note: Optional[str] = ""


class ExpenseIn(BaseModel):
    title: str
    amount: float
    category: str = "General"
    date: str  # YYYY-MM-DD
    note: Optional[str] = ""


# ---------- Auth utils ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": now_utc() + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=7 * 24 * 3600, path="/"
    )


# ---------- Auth endpoints ----------
@auth_router.post("/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name.strip(),
        "role": "teacher",
        "created_at": iso(now_utc()),
    }
    result = await db.users.insert_one(doc)
    uid = str(result.inserted_id)
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    return {"_id": uid, "email": email, "name": doc["name"], "role": "teacher", "token": token}


@auth_router.post("/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    return {"_id": uid, "email": email, "name": user.get("name", ""), "role": user.get("role", "teacher"), "token": token}


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"_id": user["_id"], "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "teacher")}


# ---------- Helpers ----------
def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    out = dict(doc)
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    return out


def require_owner(doc: dict, user_id: str):
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Not found")


def parse_oid(value: str) -> ObjectId:
    """Defensive ObjectId parser: any malformed id returns 404 instead of 500."""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Not found")


def compute_fee_breakdown(student: dict, batch: dict) -> dict:
    """Returns { list_fee, discount_amount, discount_percent, discount_reason, final }.
    `final` is the per-month expected fee after applying both fixed and percentage discounts.
    """
    default_fee = (batch or {}).get("monthly_fee", 0) or 0
    override = student.get("monthly_fee")
    list_fee = float(override) if override not in (None, 0) else float(default_fee)
    disc_amt = float(student.get("discount_amount", 0) or 0)
    disc_pct = float(student.get("discount_percent", 0) or 0)
    pct_off = list_fee * (disc_pct / 100.0) if disc_pct else 0.0
    final = max(0.0, list_fee - disc_amt - pct_off)
    return {
        "list_fee": list_fee,
        "discount_amount": disc_amt,
        "discount_percent": disc_pct,
        "discount_reason": student.get("discount_reason", "") or "",
        "final": final,
    }


# ---------- Batches ----------
@api.get("/batches")
async def list_batches(user: dict = Depends(get_current_user)):
    docs = await db.batches.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(500)
    result = []
    for d in docs:
        student_count = await db.students.count_documents({"batch_id": str(d["_id"]), "user_id": user["_id"]})
        item = serialize_doc(d)
        item["student_count"] = student_count
        result.append(item)
    return result


@api.post("/batches")
async def create_batch(payload: BatchIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({"user_id": user["_id"], "created_at": iso(now_utc())})
    r = await db.batches.insert_one(doc)
    new = await db.batches.find_one({"_id": r.inserted_id})
    return serialize_doc(new)


@api.get("/batches/{batch_id}")
async def get_batch(batch_id: str, user: dict = Depends(get_current_user)):
    doc = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(doc, user["_id"])
    return serialize_doc(doc)


@api.put("/batches/{batch_id}")
async def update_batch(batch_id: str, payload: BatchIn, user: dict = Depends(get_current_user)):
    doc = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(doc, user["_id"])
    await db.batches.update_one({"_id": parse_oid(batch_id)}, {"$set": payload.model_dump()})
    new = await db.batches.find_one({"_id": parse_oid(batch_id)})
    return serialize_doc(new)


@api.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str, user: dict = Depends(get_current_user)):
    doc = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(doc, user["_id"])
    await db.batches.delete_one({"_id": parse_oid(batch_id)})
    await db.students.delete_many({"batch_id": batch_id, "user_id": user["_id"]})
    await db.attendance.delete_many({"batch_id": batch_id, "user_id": user["_id"]})
    await db.fees.delete_many({"batch_id": batch_id, "user_id": user["_id"]})
    return {"ok": True}


# ---------- Students ----------
@api.get("/batches/{batch_id}/students")
async def list_students(batch_id: str, user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(batch, user["_id"])
    docs = await db.students.find({"batch_id": batch_id, "user_id": user["_id"]}).sort("name", 1).to_list(1000)
    return [serialize_doc(d) for d in docs]


@api.post("/batches/{batch_id}/students")
async def add_student(batch_id: str, payload: StudentIn, user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(batch, user["_id"])
    doc = payload.model_dump()
    doc.update({
        "user_id": user["_id"],
        "batch_id": batch_id,
        "created_at": iso(now_utc()),
    })
    r = await db.students.insert_one(doc)
    new = await db.students.find_one({"_id": r.inserted_id})
    return serialize_doc(new)


@api.put("/students/{student_id}")
async def update_student(student_id: str, payload: StudentIn, user: dict = Depends(get_current_user)):
    s = await db.students.find_one({"_id": parse_oid(student_id)})
    require_owner(s, user["_id"])
    await db.students.update_one({"_id": parse_oid(student_id)}, {"$set": payload.model_dump()})
    new = await db.students.find_one({"_id": parse_oid(student_id)})
    return serialize_doc(new)


@api.delete("/students/{student_id}")
async def delete_student(student_id: str, user: dict = Depends(get_current_user)):
    s = await db.students.find_one({"_id": parse_oid(student_id)})
    require_owner(s, user["_id"])
    await db.students.delete_one({"_id": parse_oid(student_id)})
    await db.attendance.delete_many({"student_id": student_id, "user_id": user["_id"]})
    await db.fees.delete_many({"student_id": student_id, "user_id": user["_id"]})
    return {"ok": True}


@api.get("/students/{student_id}")
async def get_student(student_id: str, user: dict = Depends(get_current_user)):
    s = await db.students.find_one({"_id": parse_oid(student_id)})
    require_owner(s, user["_id"])
    batch = await db.batches.find_one({"_id": ObjectId(s["batch_id"])})
    return {"student": serialize_doc(s), "batch": serialize_doc(batch) if batch else None}


@api.get("/students/{student_id}/history")
async def student_history(student_id: str, user: dict = Depends(get_current_user)):
    s = await db.students.find_one({"_id": parse_oid(student_id)})
    require_owner(s, user["_id"])
    batch = await db.batches.find_one({"_id": ObjectId(s["batch_id"])})

    attendance = await db.attendance.find({
        "user_id": user["_id"], "student_id": student_id
    }).sort("date", -1).to_list(2000)
    present = sum(1 for r in attendance if r["status"] == "present")
    absent = sum(1 for r in attendance if r["status"] == "absent")
    total = present + absent
    pct = round((present / total) * 100) if total else 0

    fees = await db.fees.find({
        "user_id": user["_id"], "student_id": student_id
    }).sort("month", -1).to_list(2000)

    default_fee = batch.get("monthly_fee", 0) if batch else 0
    breakdown = compute_fee_breakdown(s, batch or {})
    expected = breakdown["final"]
    total_paid = sum(f.get("amount", 0) for f in fees)

    return {
        "student": serialize_doc(s),
        "batch": serialize_doc(batch) if batch else None,
        "attendance_summary": {
            "present": present, "absent": absent, "total": total, "percent": pct,
        },
        "attendance_records": [
            {"date": r["date"], "status": r["status"]} for r in attendance
        ],
        "fees": [
            {
                "month": f["month"], "amount": f.get("amount", 0),
                "paid_on": f.get("paid_on"), "note": f.get("note", ""),
            } for f in fees
        ],
        "expected_monthly_fee": expected,
        "list_monthly_fee": breakdown["list_fee"],
        "discount_amount": breakdown["discount_amount"],
        "discount_percent": breakdown["discount_percent"],
        "discount_reason": breakdown["discount_reason"],
        "discount_savings": max(0.0, breakdown["list_fee"] - breakdown["final"]),
        "default_batch_fee": default_fee,
        "total_paid": total_paid,
    }


# ---------- Attendance ----------
@api.get("/attendance")
async def get_attendance(batch_id: str, date: str, user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(batch, user["_id"])
    students = await db.students.find({"batch_id": batch_id, "user_id": user["_id"]}).sort("name", 1).to_list(1000)
    records = await db.attendance.find({"batch_id": batch_id, "user_id": user["_id"], "date": date}).to_list(2000)
    status_map = {r["student_id"]: r["status"] for r in records}
    return {
        "batch_id": batch_id,
        "date": date,
        "students": [
            {**serialize_doc(s), "status": status_map.get(str(s["_id"]), None)}
            for s in students
        ],
    }


@api.post("/attendance/save")
async def save_attendance(payload: AttendanceSaveIn, user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"_id": ObjectId(payload.batch_id)})
    require_owner(batch, user["_id"])
    for mark in payload.marks:
        await db.attendance.update_one(
            {"user_id": user["_id"], "batch_id": payload.batch_id,
             "student_id": mark.student_id, "date": payload.date},
            {"$set": {"status": mark.status, "updated_at": iso(now_utc())}},
            upsert=True,
        )
    return {"ok": True, "count": len(payload.marks)}


@api.get("/attendance/summary")
async def attendance_summary(batch_id: str, start: str, end: str, user: dict = Depends(get_current_user)):
    """Per-student summary between dates (inclusive)."""
    batch = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(batch, user["_id"])
    students = await db.students.find({"batch_id": batch_id, "user_id": user["_id"]}).sort("name", 1).to_list(1000)
    records = await db.attendance.find({
        "batch_id": batch_id, "user_id": user["_id"],
        "date": {"$gte": start, "$lte": end},
    }).to_list(10000)
    by_student = {}
    for r in records:
        d = by_student.setdefault(r["student_id"], {"present": 0, "absent": 0})
        if r["status"] == "present":
            d["present"] += 1
        elif r["status"] == "absent":
            d["absent"] += 1
    return {
        "batch": serialize_doc(batch),
        "start": start, "end": end,
        "rows": [
            {
                "student": serialize_doc(s),
                "present": by_student.get(str(s["_id"]), {}).get("present", 0),
                "absent": by_student.get(str(s["_id"]), {}).get("absent", 0),
            } for s in students
        ],
    }


# ---------- Fees ----------
@api.get("/fees")
async def list_fees(batch_id: str, month: str, user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(batch, user["_id"])
    students = await db.students.find({"batch_id": batch_id, "user_id": user["_id"]}).sort("name", 1).to_list(1000)
    fees = await db.fees.find({"batch_id": batch_id, "user_id": user["_id"], "month": month}).to_list(2000)
    fee_map = {f["student_id"]: serialize_doc(f) for f in fees}
    rows = []
    for s in students:
        sid = str(s["_id"])
        bd = compute_fee_breakdown(s, batch)
        f = fee_map.get(sid)
        rows.append({
            "student": serialize_doc(s),
            "expected": bd["final"],
            "list_fee": bd["list_fee"],
            "discount_amount": bd["discount_amount"],
            "discount_percent": bd["discount_percent"],
            "discount_reason": bd["discount_reason"],
            "discount_savings": max(0.0, bd["list_fee"] - bd["final"]),
            "paid": f.get("amount", 0) if f else 0,
            "paid_on": f.get("paid_on") if f else None,
            "note": f.get("note", "") if f else "",
            "status": "paid" if f and f.get("amount", 0) > 0 else "unpaid",
        })
    return {"batch": serialize_doc(batch), "month": month, "rows": rows}


@api.post("/fees/pay")
async def pay_fee(payload: FeePayIn, user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"_id": ObjectId(payload.batch_id)})
    require_owner(batch, user["_id"])
    paid_on = payload.paid_on or date.today().isoformat()
    await db.fees.update_one(
        {"user_id": user["_id"], "batch_id": payload.batch_id,
         "student_id": payload.student_id, "month": payload.month},
        {"$set": {
            "amount": payload.amount, "paid_on": paid_on, "note": payload.note or "",
            "updated_at": iso(now_utc()),
        }},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/fees")
async def unpay_fee(batch_id: str, student_id: str, month: str, user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"_id": parse_oid(batch_id)})
    require_owner(batch, user["_id"])
    await db.fees.delete_one({
        "user_id": user["_id"], "batch_id": batch_id,
        "student_id": student_id, "month": month,
    })
    return {"ok": True}


# ---------- Expenses ----------
@api.get("/expenses")
async def list_expenses(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["_id"]}
    if month:
        q["date"] = {"$regex": f"^{month}"}
    docs = await db.expenses.find(q).sort("date", -1).to_list(2000)
    return [serialize_doc(d) for d in docs]


@api.post("/expenses")
async def add_expense(payload: ExpenseIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({"user_id": user["_id"], "created_at": iso(now_utc())})
    r = await db.expenses.insert_one(doc)
    new = await db.expenses.find_one({"_id": r.inserted_id})
    return serialize_doc(new)


@api.put("/expenses/{eid}")
async def update_expense(eid: str, payload: ExpenseIn, user: dict = Depends(get_current_user)):
    e = await db.expenses.find_one({"_id": parse_oid(eid)})
    require_owner(e, user["_id"])
    await db.expenses.update_one({"_id": parse_oid(eid)}, {"$set": payload.model_dump()})
    new = await db.expenses.find_one({"_id": parse_oid(eid)})
    return serialize_doc(new)


@api.delete("/expenses/{eid}")
async def delete_expense(eid: str, user: dict = Depends(get_current_user)):
    e = await db.expenses.find_one({"_id": parse_oid(eid)})
    require_owner(e, user["_id"])
    await db.expenses.delete_one({"_id": parse_oid(eid)})
    return {"ok": True}


# ---------- Dashboard ----------
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    month = today[:7]
    total_students = await db.students.count_documents({"user_id": user["_id"]})
    total_batches = await db.batches.count_documents({"user_id": user["_id"]})

    # Today's attendance
    today_records = await db.attendance.find({"user_id": user["_id"], "date": today}).to_list(5000)
    present_today = sum(1 for r in today_records if r["status"] == "present")
    absent_today = sum(1 for r in today_records if r["status"] == "absent")

    # Fees this month
    fees = await db.fees.find({"user_id": user["_id"], "month": month}).to_list(5000)
    fees_collected = sum(f.get("amount", 0) for f in fees)

    # Expenses this month
    expenses = await db.expenses.find({"user_id": user["_id"], "date": {"$regex": f"^{month}"}}).to_list(5000)
    expenses_total = sum(e.get("amount", 0) for e in expenses)

    # Expected fees this month (apply per-student discounts)
    batches = await db.batches.find({"user_id": user["_id"]}).to_list(500)
    batch_by_id = {str(b["_id"]): b for b in batches}
    students = await db.students.find({"user_id": user["_id"]}).to_list(5000)
    expected = 0.0
    for s in students:
        bd = compute_fee_breakdown(s, batch_by_id.get(s.get("batch_id"), {}))
        expected += bd["final"]

    return {
        "total_students": total_students,
        "total_batches": total_batches,
        "present_today": present_today,
        "absent_today": absent_today,
        "fees_collected": fees_collected,
        "fees_expected": expected,
        "expenses_total": expenses_total,
        "net": fees_collected - expenses_total,
        "month": month,
        "today": today,
    }


# ---------- PDF Reports ----------
def _pdf_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Brand", fontName="Helvetica-Bold", fontSize=20, textColor=colors.HexColor("#003fb1")))
    styles.add(ParagraphStyle(name="Sub", fontName="Helvetica", fontSize=11, textColor=colors.HexColor("#434654")))
    styles.add(ParagraphStyle(name="H2", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#191b23"), spaceAfter=6))
    return styles


def _build_pdf(title: str, subtitle: str, sections: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5*cm, rightMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = _pdf_styles()
    story = [
        Paragraph("EduManage", styles["Brand"]),
        Paragraph(title, styles["H2"]),
        Paragraph(subtitle, styles["Sub"]),
        Spacer(1, 0.5 * cm),
    ]
    for sec in sections:
        if sec.get("heading"):
            story.append(Paragraph(sec["heading"], styles["H2"]))
        if sec.get("table"):
            tbl = Table(sec["table"], repeatRows=1, hAlign="LEFT")
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#003fb1")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f3fe")]),
                ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#c3c5d7")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 0.4 * cm))
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%d %b %Y, %I:%M %p')}", styles["Sub"]))
    doc.build(story)
    return buf.getvalue()


def _pdf_response(filename: str, content: bytes) -> StreamingResponse:
    return StreamingResponse(io.BytesIO(content), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api.get("/reports/attendance.pdf")
async def report_attendance_pdf(batch_id: str, start: str, end: str, user: dict = Depends(get_current_user)):
    summary = await attendance_summary(batch_id=batch_id, start=start, end=end, user=user)
    batch = summary["batch"]
    rows = [["#", "Student", "Code", "Present", "Absent", "%"]]
    for i, r in enumerate(summary["rows"], 1):
        s = r["student"]
        p, a = r["present"], r["absent"]
        total = p + a
        pct = f"{(p/total*100):.0f}%" if total else "-"
        rows.append([str(i), s.get("name", ""), s.get("student_code", ""), str(p), str(a), pct])
    pdf = _build_pdf(
        title=f"Attendance Report — {batch.get('name', '')}",
        subtitle=f"{batch.get('subject', '')} • {start} to {end}",
        sections=[{"heading": "Per-Student Summary", "table": rows}],
    )
    return _pdf_response(f"attendance_{batch_id}_{start}_{end}.pdf", pdf)


@api.get("/reports/fees.pdf")
async def report_fees_pdf(batch_id: str, month: str, user: dict = Depends(get_current_user)):
    data = await list_fees(batch_id=batch_id, month=month, user=user)
    batch = data["batch"]
    rows = [["#", "Student", "Code", "List Fee", "Discount", "Final Fee", "Paid", "Status"]]
    total_list = 0.0
    total_discount = 0.0
    total_expected = 0.0
    total_paid = 0.0
    for i, r in enumerate(data["rows"], 1):
        s = r["student"]
        list_fee = float(r.get("list_fee", r["expected"]) or 0)
        savings = float(r.get("discount_savings", 0) or 0)
        pct = r.get("discount_percent") or 0
        disc_label = "-"
        if savings > 0:
            disc_label = f"-Rs. {savings:.0f}" + (f" ({pct:.0f}%)" if pct else "")
        total_list += list_fee
        total_discount += savings
        total_expected += r["expected"] or 0
        total_paid += r["paid"] or 0
        rows.append([
            str(i), s.get("name", ""), s.get("student_code", ""),
            f"{list_fee:.0f}", disc_label, f"{r['expected']:.0f}",
            f"{r['paid']:.0f}", r["status"].title(),
        ])
    rows.append([
        "", "TOTAL", "",
        f"{total_list:.0f}",
        f"-Rs. {total_discount:.0f}" if total_discount > 0 else "-",
        f"{total_expected:.0f}", f"{total_paid:.0f}", "",
    ])
    pdf = _build_pdf(
        title=f"Fee Collection Report — {batch.get('name', '')}",
        subtitle=f"Month: {month}",
        sections=[{"heading": "Fee Status", "table": rows}],
    )
    return _pdf_response(f"fees_{batch_id}_{month}.pdf", pdf)


@api.get("/reports/expenses.pdf")
async def report_expenses_pdf(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    data = await list_expenses(month=month, user=user)
    rows = [["#", "Date", "Title", "Category", "Amount (Rs.)"]]
    total = 0
    for i, e in enumerate(data, 1):
        total += e.get("amount", 0)
        rows.append([str(i), e.get("date", ""), e.get("title", ""), e.get("category", ""), f"{e.get('amount', 0):.0f}"])
    rows.append(["", "", "", "TOTAL", f"{total:.0f}"])
    pdf = _build_pdf(
        title="Expense Report",
        subtitle=f"Month: {month}" if month else "All time",
        sections=[{"heading": "Expenses", "table": rows}],
    )
    return _pdf_response(f"expenses_{month or 'all'}.pdf", pdf)


# ---------- Yearly Summary (P3.5) ----------
async def _build_yearly_summary(user_id: str, year: int) -> dict:
    months = [f"{year:04d}-{m:02d}" for m in range(1, 13)]

    # Fees per month
    fees_cur = await db.fees.find({"user_id": user_id, "month": {"$in": months}}).to_list(20000)
    fees_by_month = {m: 0.0 for m in months}
    for f in fees_cur:
        fees_by_month[f["month"]] = fees_by_month.get(f["month"], 0.0) + float(f.get("amount", 0) or 0)

    # Expenses per month (date is YYYY-MM-DD)
    exp_cur = await db.expenses.find({
        "user_id": user_id,
        "date": {"$regex": f"^{year:04d}-"},
    }).to_list(20000)
    exp_by_month = {m: 0.0 for m in months}
    for e in exp_cur:
        m = (e.get("date") or "")[:7]
        if m in exp_by_month:
            exp_by_month[m] += float(e.get("amount", 0) or 0)

    # Attendance per month (just totals)
    att_cur = await db.attendance.find({
        "user_id": user_id,
        "date": {"$regex": f"^{year:04d}-"},
    }).to_list(50000)
    att_present = {m: 0 for m in months}
    att_absent = {m: 0 for m in months}
    for a in att_cur:
        m = (a.get("date") or "")[:7]
        if m not in att_present:
            continue
        if a.get("status") == "present":
            att_present[m] += 1
        elif a.get("status") == "absent":
            att_absent[m] += 1

    rows = []
    total_fees = total_exp = 0.0
    total_present = total_absent = 0
    for m in months:
        fees_m = fees_by_month[m]
        exp_m = exp_by_month[m]
        total_fees += fees_m
        total_exp += exp_m
        total_present += att_present[m]
        total_absent += att_absent[m]
        rows.append({
            "month": m,
            "fees": fees_m,
            "expenses": exp_m,
            "net": fees_m - exp_m,
            "present": att_present[m],
            "absent": att_absent[m],
        })

    return {
        "year": year,
        "rows": rows,
        "totals": {
            "fees": total_fees,
            "expenses": total_exp,
            "net": total_fees - total_exp,
            "present": total_present,
            "absent": total_absent,
        },
    }


@api.get("/reports/yearly")
async def report_yearly(year: int, user: dict = Depends(get_current_user)):
    return await _build_yearly_summary(user["_id"], year)


@api.get("/reports/yearly.pdf")
async def report_yearly_pdf(year: int, user: dict = Depends(get_current_user)):
    data = await _build_yearly_summary(user["_id"], year)
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    rows = [["Month", "Fees (Rs.)", "Expenses (Rs.)", "Net (Rs.)", "Present", "Absent"]]
    for i, r in enumerate(data["rows"]):
        rows.append([
            f"{month_names[i]} {year}",
            f"{r['fees']:.0f}",
            f"{r['expenses']:.0f}",
            f"{r['net']:.0f}",
            str(r["present"]),
            str(r["absent"]),
        ])
    t = data["totals"]
    rows.append([
        "TOTAL",
        f"{t['fees']:.0f}",
        f"{t['expenses']:.0f}",
        f"{t['net']:.0f}",
        str(t["present"]),
        str(t["absent"]),
    ])
    pdf = _build_pdf(
        title=f"Annual Summary — {year}",
        subtitle=f"Fees collected, expenses and attendance for {year}",
        sections=[{"heading": "Monthly Breakdown", "table": rows}],
    )
    return _pdf_response(f"annual_{year}.pdf", pdf)


# ---------- Year-over-Year Comparison (P5) ----------
def _pct_change(prev: float, curr: float) -> float | None:
    if prev == 0:
        return None  # undefined; UI will render as "—"
    return round((curr - prev) / abs(prev) * 100, 1)


async def _build_yoy(user_id: str, year: int) -> dict:
    curr = await _build_yearly_summary(user_id, year)
    prev = await _build_yearly_summary(user_id, year - 1)
    ct, pt = curr["totals"], prev["totals"]
    deltas = {
        "fees": ct["fees"] - pt["fees"],
        "expenses": ct["expenses"] - pt["expenses"],
        "net": ct["net"] - pt["net"],
        "fees_pct": _pct_change(pt["fees"], ct["fees"]),
        "expenses_pct": _pct_change(pt["expenses"], ct["expenses"]),
        "net_pct": _pct_change(pt["net"], ct["net"]),
    }
    return {
        "current_year": year,
        "previous_year": year - 1,
        "current": curr,
        "previous": prev,
        "deltas": deltas,
    }


@api.get("/reports/yearly-compare")
async def report_yearly_compare(year: int, user: dict = Depends(get_current_user)):
    return await _build_yoy(user["_id"], year)


@api.get("/reports/yearly-compare.pdf")
async def report_yearly_compare_pdf(year: int, user: dict = Depends(get_current_user)):
    data = await _build_yoy(user["_id"], year)
    cy, py = data["current_year"], data["previous_year"]
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    rows = [[
        "Month",
        f"Fees {py}", f"Fees {cy}",
        f"Exp {py}", f"Exp {cy}",
        f"Net {py}", f"Net {cy}",
    ]]
    for i in range(12):
        pr = data["previous"]["rows"][i]
        cr = data["current"]["rows"][i]
        rows.append([
            month_names[i],
            f"{pr['fees']:.0f}", f"{cr['fees']:.0f}",
            f"{pr['expenses']:.0f}", f"{cr['expenses']:.0f}",
            f"{pr['net']:.0f}", f"{cr['net']:.0f}",
        ])
    ct = data["current"]["totals"]
    pt = data["previous"]["totals"]
    rows.append([
        "TOTAL",
        f"{pt['fees']:.0f}", f"{ct['fees']:.0f}",
        f"{pt['expenses']:.0f}", f"{ct['expenses']:.0f}",
        f"{pt['net']:.0f}", f"{ct['net']:.0f}",
    ])

    def _fmt_delta(amt, pct):
        sign = "+" if amt >= 0 else ""
        pct_str = "—" if pct is None else f"{'+' if pct >= 0 else ''}{pct}%"
        return f"{sign}Rs. {amt:.0f} ({pct_str})"

    delta_rows = [
        ["Metric", f"{py}", f"{cy}", "Change"],
        ["Fees collected", f"{pt['fees']:.0f}", f"{ct['fees']:.0f}",
         _fmt_delta(data["deltas"]["fees"], data["deltas"]["fees_pct"])],
        ["Expenses", f"{pt['expenses']:.0f}", f"{ct['expenses']:.0f}",
         _fmt_delta(data["deltas"]["expenses"], data["deltas"]["expenses_pct"])],
        ["Net P&L", f"{pt['net']:.0f}", f"{ct['net']:.0f}",
         _fmt_delta(data["deltas"]["net"], data["deltas"]["net_pct"])],
    ]

    pdf = _build_pdf(
        title=f"Year-over-Year — {py} vs {cy}",
        subtitle=f"Comparison of fees, expenses and net P&L between {py} and {cy}",
        sections=[
            {"heading": "Summary", "table": delta_rows},
            {"heading": "Monthly Breakdown", "table": rows},
        ],
    )
    return _pdf_response(f"yoy_{py}_vs_{cy}.pdf", pdf)


# ---------- Health ----------
@api.get("/")
async def root():
    return {"message": "EduManage API"}


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.batches.create_index("user_id")
    await db.students.create_index([("user_id", 1), ("batch_id", 1)])
    await db.attendance.create_index([("user_id", 1), ("batch_id", 1), ("date", 1)])
    await db.fees.create_index([("user_id", 1), ("batch_id", 1), ("month", 1)])
    await db.expenses.create_index([("user_id", 1), ("date", -1)])

    # Seed admin (demo teacher)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@edumanage.app").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Demo Teacher",
            "role": "admin",
            "created_at": iso(now_utc()),
        })
        logger.info(f"Seeded admin user {admin_email}")


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------- Mount routers + CORS ----------
# ---------- Mount routers + CORS ----------
# CORS must accept both preview (*.preview.emergentagent.com) and production (*.emergent.host)
# domains since the frontend can be served from either. With allow_credentials=True we cannot
# use "*", so we use a regex that matches all valid emergent domains plus localhost.
cors_origin_regex = os.environ.get(
    "CORS_ORIGIN_REGEX",
    r"https?://(localhost(:\d+)?|.*\.emergent\.host|.*\.emergentagent\.com)",
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(api)
