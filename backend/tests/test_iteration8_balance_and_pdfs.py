"""Iteration 8 backend tests.

Covers:
  1) Per-student fee BALANCE carry-forward in Finance > Fees (3 user examples).
  2) Fees PDF range (start_month + end_month) + backward compat with `month`.
  3) Expenses PDF range (start_month + end_month) + backward compat.
  4) PDF heading: 'EduManage' brand text must not collide with the title row.
  + Backward compat & clamp behaviour for joining_month.
"""
import io
import os
import uuid
import pytest
import requests
from datetime import date, datetime, timezone

from pypdf import PdfReader

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://student-track-49.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@edumanage.app"
ADMIN_PASSWORD = "admin123"

CUR_YM = datetime.now(timezone.utc).strftime("%Y-%m")


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


def _make_batch(client, name, fee=1000.0):
    r = client.post(f"{API}/batches", json={
        "name": name,
        "subject": "Math",
        "monthly_fee": fee,
        "session": "Mon/Wed",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _add_student(client, batch_id, name, joining_month=None):
    payload = {
        "name": name,
        "student_code": f"S{uuid.uuid4().hex[:6].upper()}",
    }
    if joining_month is not None:
        payload["joining_month"] = joining_month
    r = client.post(f"{API}/batches/{batch_id}/students", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _pay(client, batch_id, student_id, month, amount):
    r = client.post(f"{API}/fees/pay", json={
        "batch_id": batch_id, "student_id": student_id,
        "month": month, "amount": amount,
    })
    assert r.status_code == 200, r.text


def _fees_row(client, batch_id, month, student_id):
    r = client.get(f"{API}/fees", params={"batch_id": batch_id, "month": month})
    assert r.status_code == 200, r.text
    data = r.json()
    rows = data["rows"]
    for row in rows:
        if row["student"]["id"] == student_id:
            return row
    pytest.fail(f"student {student_id} not found in fees rows")


# ---------- 1) Balance math: 3 user examples ----------
class TestBalanceExamples:
    """Verify per-student balance for the three documented examples."""

    def test_example1_partial_payments(self, client):
        """Fee 1000/mo, joined April, paid Apr=700, May=500, Jun=1500.
        As of June 2026: expected = 3000, paid = 2700, balance = 300."""
        b = _make_batch(client, f"TEST_IT8_E1_{uuid.uuid4().hex[:6]}", 1000)
        s = _add_student(client, b["id"], "E1 Student", joining_month="2026-04")
        _pay(client, b["id"], s["id"], "2026-04", 700)
        _pay(client, b["id"], s["id"], "2026-05", 500)
        _pay(client, b["id"], s["id"], "2026-06", 1500)
        row = _fees_row(client, b["id"], "2026-06", s["id"])
        assert row["joining_month"] == "2026-04"
        assert row["months_active"] == 3
        assert row["expected_to_date"] == 3000
        assert row["paid_to_date"] == 2700
        assert row["balance"] == 300

    def test_example2_two_months(self, client):
        """Fee 1000/mo, joined May, paid May=0, Jun=1500.
        As of June: expected=2000, paid=1500, balance=500."""
        b = _make_batch(client, f"TEST_IT8_E2_{uuid.uuid4().hex[:6]}", 1000)
        s = _add_student(client, b["id"], "E2 Student", joining_month="2026-05")
        _pay(client, b["id"], s["id"], "2026-06", 1500)
        row = _fees_row(client, b["id"], "2026-06", s["id"])
        assert row["months_active"] == 2
        assert row["expected_to_date"] == 2000
        assert row["paid_to_date"] == 1500
        assert row["balance"] == 500

    def test_example3_advance_then_due(self, client):
        """Fee 1000/mo, joined April, paid Apr=2500.
        - As of May: expected=2000, paid=2500, balance=-500 (advance).
        - As of June: expected=3000, paid=2500, balance=500."""
        b = _make_batch(client, f"TEST_IT8_E3_{uuid.uuid4().hex[:6]}", 1000)
        s = _add_student(client, b["id"], "E3 Student", joining_month="2026-04")
        _pay(client, b["id"], s["id"], "2026-04", 2500)

        row_may = _fees_row(client, b["id"], "2026-05", s["id"])
        assert row_may["months_active"] == 2
        assert row_may["expected_to_date"] == 2000
        assert row_may["paid_to_date"] == 2500
        assert row_may["balance"] == -500  # advance

        row_jun = _fees_row(client, b["id"], "2026-06", s["id"])
        assert row_jun["months_active"] == 3
        assert row_jun["expected_to_date"] == 3000
        assert row_jun["paid_to_date"] == 2500
        assert row_jun["balance"] == 500


# ---------- 2) Backward compat + clamp ----------
class TestBalanceEdgeCases:
    def test_missing_joining_month_falls_back_to_created_at(self, client):
        """A student created without joining_month: months_active >= 1 for current month."""
        b = _make_batch(client, f"TEST_IT8_NJM_{uuid.uuid4().hex[:6]}", 500)
        s = _add_student(client, b["id"], "NoJM Student")  # joining_month omitted
        row = _fees_row(client, b["id"], CUR_YM, s["id"])
        assert row["joining_month"], "joining_month should fall back to created_at month"
        assert row["months_active"] >= 1

    def test_future_joining_month_clamps_to_zero(self, client):
        """Future joining month -> months_active=0 and expected_to_date=0; balance=-paid."""
        b = _make_batch(client, f"TEST_IT8_FUT_{uuid.uuid4().hex[:6]}", 1000)
        s = _add_student(client, b["id"], "Future Student", joining_month="2099-01")
        # Record an advance payment in the current month
        _pay(client, b["id"], s["id"], CUR_YM, 700)
        row = _fees_row(client, b["id"], CUR_YM, s["id"])
        assert row["months_active"] == 0
        assert row["expected_to_date"] == 0
        assert row["paid_to_date"] == 700
        assert row["balance"] == -700


# ---------- 3) Fees PDF range ----------
def _read_pdf_text(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


class TestFeesPDFRange:
    @pytest.fixture(scope="class")
    def batch_with_data(self, client):
        b = _make_batch(client, f"TEST_IT8_PDF_{uuid.uuid4().hex[:6]}", 1000)
        s = _add_student(client, b["id"], "PDFRange Student", joining_month="2026-04")
        _pay(client, b["id"], s["id"], "2026-04", 1000)
        _pay(client, b["id"], s["id"], "2026-05", 1000)
        _pay(client, b["id"], s["id"], "2026-06", 500)
        return b, s

    def test_range_returns_pdf(self, client, batch_with_data):
        b, _ = batch_with_data
        r = client.get(f"{API}/reports/fees.pdf", params={
            "batch_id": b["id"],
            "start_month": "2026-04",
            "end_month": "2026-06",
        })
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        # Filename
        cd = r.headers.get("content-disposition", "")
        assert f'fees_{b["id"]}_2026-04_2026-06.pdf' in cd, cd
        text = _read_pdf_text(r.content)
        assert "EduManage" in text
        assert "Fee Collection Report" in text
        assert "2026-04 to 2026-06" in text
        # Headers row
        for col in ["Student", "Joined", "Months", "Expected", "Paid", "Balance"]:
            assert col in text, f"missing column '{col}' in PDF text"
        # Balance for student: expected=3000, paid_in_range=2500, balance=500
        assert "500" in text and "3000" in text and "2500" in text

    def test_legacy_month_param_still_works(self, client, batch_with_data):
        b, _ = batch_with_data
        r = client.get(f"{API}/reports/fees.pdf", params={
            "batch_id": b["id"], "month": "2026-06",
        })
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        text = _read_pdf_text(r.content)
        # When single month given, range_label collapses to single month
        assert "Period: 2026-06" in text


# ---------- 4) Expenses PDF range ----------
class TestExpensesPDFRange:
    @pytest.fixture(scope="class")
    def expenses_setup(self, client):
        # Create 2 expenses in different months
        r1 = client.post(f"{API}/expenses", json={
            "title": "TEST_IT8 Rent Apr", "amount": 5000,
            "category": "Rent", "date": "2026-04-15",
        })
        assert r1.status_code == 200, r1.text
        r2 = client.post(f"{API}/expenses", json={
            "title": "TEST_IT8 Books May", "amount": 1200,
            "category": "Supplies", "date": "2026-05-10",
        })
        assert r2.status_code == 200, r2.text
        r3 = client.post(f"{API}/expenses", json={
            "title": "TEST_IT8 Misc Jun", "amount": 800,
            "category": "Misc", "date": "2026-06-20",
        })
        assert r3.status_code == 200, r3.text
        return [r1.json(), r2.json(), r3.json()]

    def test_range_groups_by_month_with_totals(self, client, expenses_setup):
        r = client.get(f"{API}/reports/expenses.pdf", params={
            "start_month": "2026-04", "end_month": "2026-06",
        })
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        cd = r.headers.get("content-disposition", "")
        assert "expenses_2026-04_2026-06.pdf" in cd
        text = _read_pdf_text(r.content)
        assert "Expense Report" in text
        assert "2026-04 to 2026-06" in text
        # 3 month-sections
        assert "Expenses — 2026-04" in text
        assert "Expenses — 2026-05" in text
        assert "Expenses — 2026-06" in text
        # Grand total section
        assert "Grand Total" in text
        # Month totals present (5000, 1200, 800 minimums) — values may be multiples
        # because test re-runs accumulate expense rows. Just verify section structure.
        assert "Month total" in text
        # Grand total appears once at the end

    def test_legacy_single_month_param(self, client, expenses_setup):
        r = client.get(f"{API}/reports/expenses.pdf", params={"month": "2026-05"})
        assert r.status_code == 200
        text = _read_pdf_text(r.content)
        assert "Period: 2026-05" in text
        assert "Expenses — 2026-05" in text


# ---------- 5) PDF heading does not overlap ----------
class TestPDFHeadingNoOverlap:
    """Inspect text layout: 'EduManage' brand text must appear before (above) the
    report title with vertical separation, not on the same line."""

    def _layout(self, content: bytes):
        reader = PdfReader(io.BytesIO(content))
        items = []  # (y, text)

        def visitor(text, cm, tm, font_dict, font_size):
            if not text or not text.strip():
                return
            # tm = [a, b, c, d, e, f] — f is y-coord in user space
            try:
                y = float(tm[5])
            except Exception:
                return
            items.append((round(y, 2), text.strip()))

        for page in reader.pages:
            page.extract_text(visitor_text=visitor)
            break  # first page only
        return items

    def test_attendance_pdf_heading_no_collision(self, client):
        # Need a batch + at least one student; reuse existing if any
        rb = client.get(f"{API}/batches")
        assert rb.status_code == 200
        batches = rb.json()
        if not batches:
            b = _make_batch(client, f"TEST_IT8_HDR_{uuid.uuid4().hex[:6]}", 1000)
            _add_student(client, b["id"], "HDR Student", joining_month="2026-01")
            batch_id = b["id"]
        else:
            batch_id = batches[0]["id"]
        r = client.get(f"{API}/reports/attendance.pdf", params={
            "batch_id": batch_id, "start": "2026-01-01", "end": "2026-01-31",
        })
        assert r.status_code == 200
        self._assert_brand_above_title(r.content, "Attendance Report")

    def test_fees_pdf_heading_no_collision(self, client):
        b = _make_batch(client, f"TEST_IT8_HDRF_{uuid.uuid4().hex[:6]}", 1000)
        _add_student(client, b["id"], "HDRF Student", joining_month="2026-04")
        r = client.get(f"{API}/reports/fees.pdf", params={
            "batch_id": b["id"], "start_month": "2026-04", "end_month": "2026-06",
        })
        assert r.status_code == 200
        self._assert_brand_above_title(r.content, "Fee Collection Report")

    def test_expenses_pdf_heading_no_collision(self, client):
        r = client.get(f"{API}/reports/expenses.pdf", params={
            "start_month": "2026-04", "end_month": "2026-06",
        })
        assert r.status_code == 200
        self._assert_brand_above_title(r.content, "Expense Report")

    def _assert_brand_above_title(self, content: bytes, title_keyword: str):
        # Use the simpler extract_text(): if brand and title overlap visually,
        # ReportLab will not produce them as cleanly separated lines.
        reader = PdfReader(io.BytesIO(content))
        text = reader.pages[0].extract_text() or ""
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        assert any(ln == "EduManage" for ln in lines), (
            f"'EduManage' should appear on its own line. Got lines: {lines[:6]}"
        )
        brand_idx = next(i for i, ln in enumerate(lines) if ln == "EduManage")
        # The title (or a line containing title_keyword) must be on a later line —
        # NOT on the same line as the brand (overlap symptom).
        title_idx = next(
            (i for i, ln in enumerate(lines) if title_keyword in ln and ln != "EduManage"),
            None,
        )
        assert title_idx is not None, f"Title containing '{title_keyword}' not found in PDF"
        assert title_idx > brand_idx, (
            f"Title '{title_keyword}' should appear AFTER brand. brand_idx={brand_idx}, title_idx={title_idx}"
        )
        # Sanity: brand line should not contain the title (overlap symptom)
        assert title_keyword not in lines[brand_idx], (
            f"Brand line contains title text — overlap! Line: {lines[brand_idx]!r}"
        )
