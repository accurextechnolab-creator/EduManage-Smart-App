"""Comprehensive backend API tests for EduManage."""
import os
import uuid
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://student-track-49.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@edumanage.app"
ADMIN_PASSWORD = "admin123"

# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def secondary_user():
    """Register a second user for isolation tests."""
    email = f"test_user_{uuid.uuid4().hex[:8]}@edumanage-example.com"
    password = "testpass123"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "Test User B"})
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": password, "token": data["token"], "id": data["_id"]}


@pytest.fixture(scope="session")
def secondary_client(secondary_user):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {secondary_user['token']}", "Content-Type": "application/json"})
    return s


# Direct backend URL used for CORS preflight tests because the public ingress
# may rewrite OPTIONS responses. CORS middleware behavior must be tested at the
# FastAPI layer where the bug fix lives.
DIRECT_BACKEND = "http://localhost:8001"
PROD_ORIGIN = "https://student-track-49.emergent.host"
PREVIEW_ORIGIN = "https://student-track-49.preview.emergentagent.com"


# ---------- CORS bug-fix verification ----------
class TestCORS:
    """Verify CORS preflight + credentials for emergent.host and preview origins.

    Reproduces the production deploy failure: OPTIONS /api/auth/login was returning
    400 from the emergent.host origin. After the allow_origin_regex fix, both
    origins must succeed.
    """

    @pytest.mark.parametrize("origin", [PROD_ORIGIN, PREVIEW_ORIGIN])
    def test_preflight_login(self, origin):
        r = requests.options(
            f"{DIRECT_BACKEND}/api/auth/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert r.status_code == 200, f"Preflight from {origin} returned {r.status_code}"
        assert r.headers.get("access-control-allow-origin") == origin
        assert r.headers.get("access-control-allow-credentials") == "true"
        assert "POST" in r.headers.get("access-control-allow-methods", "")

    def test_preflight_disallowed_origin(self):
        r = requests.options(
            f"{DIRECT_BACKEND}/api/auth/login",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        # Starlette returns 400 for disallowed CORS preflight and does NOT
        # include access-control-allow-origin (browser will block).
        assert "access-control-allow-origin" not in {k.lower() for k in r.headers}

    def test_login_from_prod_origin_sets_cookie_and_cors(self):
        r = requests.post(
            f"{DIRECT_BACKEND}/api/auth/login",
            headers={"Origin": PROD_ORIGIN, "Content-Type": "application/json"},
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == PROD_ORIGIN
        assert r.headers.get("access-control-allow-credentials") == "true"
        cookie = r.headers.get("set-cookie", "")
        assert "access_token=" in cookie
        assert "HttpOnly" in cookie
        assert "Secure" in cookie
        assert "SameSite=none" in cookie or "samesite=none" in cookie.lower()

    def test_me_with_bearer_from_prod_origin(self):
        login = requests.post(
            f"{DIRECT_BACKEND}/api/auth/login",
            headers={"Origin": PROD_ORIGIN, "Content-Type": "application/json"},
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        token = login.json()["token"]
        r = requests.get(
            f"{DIRECT_BACKEND}/api/auth/me",
            headers={"Origin": PROD_ORIGIN, "Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, f"/auth/me returned {r.status_code}: {r.text}"
        assert r.headers.get("access-control-allow-origin") == PROD_ORIGIN
        assert r.headers.get("access-control-allow-credentials") == "true"
        assert r.json()["email"] == ADMIN_EMAIL


# ---------- Health ----------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert "token" in d and len(d["token"]) > 10
        # cookie set
        assert "access_token" in r.cookies

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_bearer(self, admin_client):
        r = admin_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_and_duplicate(self):
        email = f"reg_{uuid.uuid4().hex[:8]}@edumanage-example.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "Reg User"})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == email
        assert "token" in data
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "Reg User"})
        assert r2.status_code == 400

    def test_logout(self, admin_token):
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {admin_token}"})
        # logout endpoint should always succeed
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200


# ---------- Protected endpoints without auth ----------
class TestProtected:
    @pytest.mark.parametrize("path", [
        "/batches", "/expenses", "/dashboard/stats",
    ])
    def test_requires_auth(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401


# ---------- Batches CRUD ----------
class TestBatches:
    def test_full_batch_lifecycle(self, admin_client):
        # CREATE
        payload = {"name": "TEST_Batch_Alpha", "subject": "Math", "session": "Morning", "monthly_fee": 1500}
        r = admin_client.post(f"{API}/batches", json=payload)
        assert r.status_code == 200
        b = r.json()
        assert b["name"] == payload["name"]
        assert b["monthly_fee"] == 1500
        assert "id" in b
        bid = b["id"]

        # GET single
        r = admin_client.get(f"{API}/batches/{bid}")
        assert r.status_code == 200
        assert r.json()["id"] == bid

        # LIST
        r = admin_client.get(f"{API}/batches")
        assert r.status_code == 200
        listed = r.json()
        assert any(x["id"] == bid for x in listed)
        match = [x for x in listed if x["id"] == bid][0]
        assert "student_count" in match

        # UPDATE
        upd = {"name": "TEST_Batch_Alpha2", "subject": "Math+", "session": "Eve", "monthly_fee": 1800}
        r = admin_client.put(f"{API}/batches/{bid}", json=upd)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Batch_Alpha2"

        # DELETE
        r = admin_client.delete(f"{API}/batches/{bid}")
        assert r.status_code == 200

        # Verify gone
        r = admin_client.get(f"{API}/batches/{bid}")
        assert r.status_code == 404


# ---------- User Isolation ----------
class TestIsolation:
    def test_batch_not_visible_across_users(self, admin_client, secondary_client):
        payload = {"name": f"TEST_Isolation_{uuid.uuid4().hex[:6]}", "subject": "S", "monthly_fee": 100}
        r = admin_client.post(f"{API}/batches", json=payload)
        assert r.status_code == 200
        admin_batch_id = r.json()["id"]

        # secondary user list
        r2 = secondary_client.get(f"{API}/batches")
        assert r2.status_code == 200
        ids = [x["id"] for x in r2.json()]
        assert admin_batch_id not in ids

        # secondary user cannot access by id
        r3 = secondary_client.get(f"{API}/batches/{admin_batch_id}")
        assert r3.status_code == 404

        # cleanup
        admin_client.delete(f"{API}/batches/{admin_batch_id}")


# ---------- Students / Attendance / Fees / Expenses (Integration flow) ----------
@pytest.fixture(scope="class")
def workflow_data(admin_client):
    """Create batch + student for downstream tests; cleanup at end."""
    b = admin_client.post(f"{API}/batches", json={"name": "TEST_WF_Batch", "subject": "Sci", "monthly_fee": 2000}).json()
    s = admin_client.post(f"{API}/batches/{b['id']}/students", json={"name": "TEST_Student_1", "student_code": "S01"}).json()
    yield {"batch": b, "student": s}
    admin_client.delete(f"{API}/batches/{b['id']}")


class TestStudents:
    def test_create_list_update_delete(self, admin_client, workflow_data):
        bid = workflow_data["batch"]["id"]
        # ADD another student
        r = admin_client.post(f"{API}/batches/{bid}/students", json={"name": "TEST_StudentTemp", "student_code": "ST"})
        assert r.status_code == 200
        sid = r.json()["id"]
        assert r.json()["name"] == "TEST_StudentTemp"

        # LIST
        r = admin_client.get(f"{API}/batches/{bid}/students")
        assert r.status_code == 200
        assert any(x["id"] == sid for x in r.json())

        # UPDATE
        r = admin_client.put(f"{API}/students/{sid}", json={"name": "TEST_StudentTemp2", "student_code": "ST2"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_StudentTemp2"

        # DELETE
        r = admin_client.delete(f"{API}/students/{sid}")
        assert r.status_code == 200


class TestAttendance:
    def test_save_and_get_and_summary(self, admin_client, workflow_data):
        bid = workflow_data["batch"]["id"]
        sid = workflow_data["student"]["id"]
        today = date.today().isoformat()

        # GET attendance (no status yet)
        r = admin_client.get(f"{API}/attendance", params={"batch_id": bid, "date": today})
        assert r.status_code == 200
        d = r.json()
        assert "students" in d

        # SAVE
        r = admin_client.post(f"{API}/attendance/save", json={
            "batch_id": bid, "date": today, "marks": [{"student_id": sid, "status": "present"}]
        })
        assert r.status_code == 200
        assert r.json()["count"] == 1

        # GET again to verify persistence
        r = admin_client.get(f"{API}/attendance", params={"batch_id": bid, "date": today})
        assert r.status_code == 200
        match = [s for s in r.json()["students"] if s["id"] == sid]
        assert match and match[0]["status"] == "present"

        # SUMMARY
        r = admin_client.get(f"{API}/attendance/summary", params={"batch_id": bid, "start": today, "end": today})
        assert r.status_code == 200
        rows = r.json()["rows"]
        row = [x for x in rows if x["student"]["id"] == sid][0]
        assert row["present"] == 1
        assert row["absent"] == 0


class TestFees:
    def test_pay_list_delete(self, admin_client, workflow_data):
        bid = workflow_data["batch"]["id"]
        sid = workflow_data["student"]["id"]
        month = date.today().strftime("%Y-%m")

        # LIST (unpaid initially)
        r = admin_client.get(f"{API}/fees", params={"batch_id": bid, "month": month})
        assert r.status_code == 200
        data = r.json()
        row = [x for x in data["rows"] if x["student"]["id"] == sid][0]
        assert row["expected"] == 2000  # batch default
        assert row["status"] == "unpaid"

        # PAY
        r = admin_client.post(f"{API}/fees/pay", json={
            "student_id": sid, "batch_id": bid, "month": month, "amount": 2000, "note": "TEST"
        })
        assert r.status_code == 200

        # Verify
        r = admin_client.get(f"{API}/fees", params={"batch_id": bid, "month": month})
        row = [x for x in r.json()["rows"] if x["student"]["id"] == sid][0]
        assert row["status"] == "paid"
        assert row["paid"] == 2000

        # DELETE
        r = admin_client.delete(f"{API}/fees", params={"batch_id": bid, "student_id": sid, "month": month})
        assert r.status_code == 200

        # Verify back to unpaid
        r = admin_client.get(f"{API}/fees", params={"batch_id": bid, "month": month})
        row = [x for x in r.json()["rows"] if x["student"]["id"] == sid][0]
        assert row["status"] == "unpaid"


class TestExpenses:
    def test_crud(self, admin_client):
        today = date.today().isoformat()
        month = today[:7]
        # CREATE
        r = admin_client.post(f"{API}/expenses", json={"title": "TEST_Exp", "amount": 500, "category": "Utilities", "date": today})
        assert r.status_code == 200
        eid = r.json()["id"]

        # LIST
        r = admin_client.get(f"{API}/expenses", params={"month": month})
        assert r.status_code == 200
        assert any(x["id"] == eid for x in r.json())

        # UPDATE
        r = admin_client.put(f"{API}/expenses/{eid}", json={"title": "TEST_Exp2", "amount": 600, "category": "Utilities", "date": today})
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Exp2"
        assert r.json()["amount"] == 600

        # DELETE
        r = admin_client.delete(f"{API}/expenses/{eid}")
        assert r.status_code == 200


class TestDashboard:
    def test_stats(self, admin_client):
        r = admin_client.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_students", "total_batches", "present_today", "absent_today",
                  "fees_collected", "fees_expected", "expenses_total", "net"]:
            assert k in d


# ---------- Iteration 3: Student profile + history + ownership ----------
class TestStudentProfileEndpoints:
    """GET /students/{id}, GET /students/{id}/history, PUT ownership."""

    def test_get_student_returns_student_and_batch(self, admin_client, workflow_data):
        sid = workflow_data["student"]["id"]
        bid = workflow_data["batch"]["id"]
        r = admin_client.get(f"{API}/students/{sid}")
        assert r.status_code == 200
        d = r.json()
        assert "student" in d and "batch" in d
        assert d["student"]["id"] == sid
        assert d["batch"]["id"] == bid

    def test_get_student_404_for_non_owner(self, secondary_client, workflow_data):
        sid = workflow_data["student"]["id"]
        r = secondary_client.get(f"{API}/students/{sid}")
        assert r.status_code == 404

    def test_put_batch_404_for_non_owner(self, secondary_client, workflow_data):
        bid = workflow_data["batch"]["id"]
        r = secondary_client.put(f"{API}/batches/{bid}",
            json={"name": "HACK", "subject": "x", "session": "x", "monthly_fee": 0})
        assert r.status_code == 404

    def test_put_student_404_for_non_owner(self, secondary_client, workflow_data):
        sid = workflow_data["student"]["id"]
        r = secondary_client.put(f"{API}/students/{sid}",
            json={"name": "HACK"})
        assert r.status_code == 404

    def test_history_percent_math_75(self, admin_client):
        """Mark 3 present + 1 absent => 75%."""
        b = admin_client.post(f"{API}/batches",
            json={"name": "TEST_HistBatch", "subject": "X", "monthly_fee": 1000}).json()
        bid = b["id"]
        s = admin_client.post(f"{API}/batches/{bid}/students",
            json={"name": "TEST_HistStudent"}).json()
        sid = s["id"]
        try:
            # Save 4 attendance records on different dates
            for i, status in enumerate(["present", "present", "present", "absent"]):
                d = f"2026-01-{10+i:02d}"
                r = admin_client.post(f"{API}/attendance/save", json={
                    "batch_id": bid, "date": d,
                    "marks": [{"student_id": sid, "status": status}],
                })
                assert r.status_code == 200
            # Pay one fee
            admin_client.post(f"{API}/fees/pay", json={
                "student_id": sid, "batch_id": bid, "month": "2026-01",
                "amount": 1000, "note": "TEST",
            })
            # Fetch history
            r = admin_client.get(f"{API}/students/{sid}/history")
            assert r.status_code == 200
            h = r.json()
            assert h["student"]["id"] == sid
            assert h["batch"]["id"] == bid
            summ = h["attendance_summary"]
            assert summ["present"] == 3
            assert summ["absent"] == 1
            assert summ["total"] == 4
            assert summ["percent"] == 75
            assert len(h["attendance_records"]) == 4
            assert h["expected_monthly_fee"] == 1000
            assert h["total_paid"] == 1000
            assert len(h["fees"]) == 1
        finally:
            admin_client.delete(f"{API}/batches/{bid}")

    def test_history_zero_percent_when_no_marks(self, admin_client):
        b = admin_client.post(f"{API}/batches",
            json={"name": "TEST_HistEmpty", "subject": "X", "monthly_fee": 500}).json()
        bid = b["id"]
        s = admin_client.post(f"{API}/batches/{bid}/students",
            json={"name": "TEST_HistEmptyStu"}).json()
        sid = s["id"]
        try:
            r = admin_client.get(f"{API}/students/{sid}/history")
            assert r.status_code == 200
            h = r.json()
            assert h["attendance_summary"]["percent"] == 0
            assert h["attendance_summary"]["total"] == 0
            assert h["total_paid"] == 0
            # expected falls back to batch fee
            assert h["expected_monthly_fee"] == 500
        finally:
            admin_client.delete(f"{API}/batches/{bid}")

    def test_history_404_for_non_owner(self, secondary_client, workflow_data):
        sid = workflow_data["student"]["id"]
        r = secondary_client.get(f"{API}/students/{sid}/history")
        assert r.status_code == 404


class TestReports:
    def test_attendance_pdf(self, admin_client, workflow_data):
        bid = workflow_data["batch"]["id"]
        today = date.today().isoformat()
        r = admin_client.get(f"{API}/reports/attendance.pdf", params={"batch_id": bid, "start": today, "end": today})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_fees_pdf(self, admin_client, workflow_data):
        bid = workflow_data["batch"]["id"]
        month = date.today().strftime("%Y-%m")
        r = admin_client.get(f"{API}/reports/fees.pdf", params={"batch_id": bid, "month": month})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_expenses_pdf(self, admin_client):
        month = date.today().strftime("%Y-%m")
        r = admin_client.get(f"{API}/reports/expenses.pdf", params={"month": month})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# ---------- Iteration 4: Defensive ObjectId parsing ----------
class TestObjectIdHandling:
    """Malformed ObjectId path params must return 404, not 500."""

    def test_get_student_bad_id_returns_404(self, admin_client):
        r = admin_client.get(f"{API}/students/not-a-real-id")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"

    def test_get_batch_bad_id_returns_404(self, admin_client):
        r = admin_client.get(f"{API}/batches/12345")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"

    def test_delete_expense_bad_id_returns_404(self, admin_client):
        r = admin_client.delete(f"{API}/expenses/badid")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"

    def test_put_student_garbage_id_not_500(self, admin_client):
        r = admin_client.put(f"{API}/students/garbage", json={"name": "X"})
        # 404 preferred; 422 acceptable if pydantic catches earlier; never 500
        assert r.status_code in (404, 422), f"Got {r.status_code}: {r.text}"
        assert r.status_code != 500

    def test_get_student_history_bad_id_returns_404(self, admin_client):
        r = admin_client.get(f"{API}/students/badformat/history")
        assert r.status_code == 404

    def test_delete_student_bad_id_returns_404(self, admin_client):
        r = admin_client.delete(f"{API}/students/zzz")
        assert r.status_code == 404

    def test_valid_format_but_unknown_still_404(self, admin_client):
        """Regression: valid 24-char hex ObjectId that doesn't exist returns 404."""
        unknown = "0123456789abcdef01234567"
        r = admin_client.get(f"{API}/students/{unknown}")
        assert r.status_code == 404
        r = admin_client.get(f"{API}/batches/{unknown}")
        assert r.status_code == 404


# ---------- Iteration 4: Yearly summary endpoint ----------
class TestYearlyReports:
    YEAR = 2031  # use a year unlikely to have any pre-existing data

    def test_yearly_requires_auth(self):
        r = requests.get(f"{API}/reports/yearly", params={"year": self.YEAR})
        assert r.status_code == 401
        r = requests.get(f"{API}/reports/yearly.pdf", params={"year": self.YEAR})
        assert r.status_code == 401

    def test_yearly_structure_and_sort(self, admin_client):
        r = admin_client.get(f"{API}/reports/yearly", params={"year": self.YEAR})
        assert r.status_code == 200
        d = r.json()
        assert d["year"] == self.YEAR
        assert "rows" in d and "totals" in d
        assert len(d["rows"]) == 12
        # Sorted Jan..Dec
        expected = [f"{self.YEAR}-{m:02d}" for m in range(1, 13)]
        assert [row["month"] for row in d["rows"]] == expected
        # net = fees - expenses per row
        for row in d["rows"]:
            for k in ["month", "fees", "expenses", "net", "present", "absent"]:
                assert k in row
            assert row["net"] == row["fees"] - row["expenses"]
        # totals consistency
        t = d["totals"]
        assert t["net"] == t["fees"] - t["expenses"]
        assert t["fees"] == sum(row["fees"] for row in d["rows"])
        assert t["expenses"] == sum(row["expenses"] for row in d["rows"])

    def test_yearly_aggregates_fees_and_expenses(self, admin_client):
        year = self.YEAR
        # Create batch + student
        b = admin_client.post(f"{API}/batches", json={
            "name": "TEST_YearlyBatch", "subject": "S", "monthly_fee": 1500
        }).json()
        bid = b["id"]
        s = admin_client.post(f"{API}/batches/{bid}/students",
                              json={"name": "TEST_YearlyStu"}).json()
        sid = s["id"]
        eid = None
        try:
            # Add expense dated 2031-03-15, amount 500
            er = admin_client.post(f"{API}/expenses", json={
                "title": "TEST_YearlyExp", "amount": 500,
                "category": "Utilities", "date": f"{year}-03-15"
            })
            assert er.status_code == 200
            eid = er.json()["id"]

            # Pay fee for month YYYY-03 of 1500
            fr = admin_client.post(f"{API}/fees/pay", json={
                "student_id": sid, "batch_id": bid,
                "month": f"{year}-03", "amount": 1500, "note": "TEST",
            })
            assert fr.status_code == 200

            # Re-fetch yearly
            r = admin_client.get(f"{API}/reports/yearly", params={"year": year})
            assert r.status_code == 200
            data = r.json()
            mar = [row for row in data["rows"] if row["month"] == f"{year}-03"][0]
            assert mar["fees"] == 1500
            assert mar["expenses"] == 500
            assert mar["net"] == 1000
            # totals include them
            assert data["totals"]["fees"] >= 1500
            assert data["totals"]["expenses"] >= 500
        finally:
            if eid:
                admin_client.delete(f"{API}/expenses/{eid}")
            admin_client.delete(f"{API}/batches/{bid}")

    def test_yearly_pdf(self, admin_client):
        r = admin_client.get(f"{API}/reports/yearly.pdf", params={"year": self.YEAR})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1024, f"PDF body too small: {len(r.content)} bytes"
        # filename in disposition
        disp = r.headers.get("content-disposition", "")
        assert f"annual_{self.YEAR}.pdf" in disp

    def test_yearly_user_isolation(self, admin_client, secondary_client):
        year = 2032
        # Admin creates a batch/student/fee in year 2032
        b = admin_client.post(f"{API}/batches", json={
            "name": "TEST_IsolY", "subject": "S", "monthly_fee": 2222
        }).json()
        bid = b["id"]
        s = admin_client.post(f"{API}/batches/{bid}/students",
                              json={"name": "TEST_IsolYStu"}).json()
        sid = s["id"]
        try:
            admin_client.post(f"{API}/fees/pay", json={
                "student_id": sid, "batch_id": bid,
                "month": f"{year}-05", "amount": 2222, "note": "TEST",
            })
            # Admin should see 2222 in May
            ra = admin_client.get(f"{API}/reports/yearly", params={"year": year})
            may_a = [row for row in ra.json()["rows"] if row["month"] == f"{year}-05"][0]
            assert may_a["fees"] >= 2222
            # Secondary user should NOT see any fees from this admin's data
            rs = secondary_client.get(f"{API}/reports/yearly", params={"year": year})
            assert rs.status_code == 200
            data_s = rs.json()
            # Either no rows or zero in this month
            may_s = [row for row in data_s["rows"] if row["month"] == f"{year}-05"][0]
            assert may_s["fees"] == 0
            # totals not poisoned
            assert data_s["totals"]["fees"] == 0
        finally:
            admin_client.delete(f"{API}/batches/{bid}")



# ---------- P5: Year-over-Year Comparison ----------
class TestYearOverYearReports:
    """Tests for /api/reports/yearly-compare and yearly-compare.pdf"""
    CY = 2034  # current year (isolated)
    PY = 2033  # previous year

    def test_yoy_requires_auth(self):
        r = requests.get(f"{API}/reports/yearly-compare", params={"year": self.CY})
        assert r.status_code == 401
        r = requests.get(f"{API}/reports/yearly-compare.pdf", params={"year": self.CY})
        assert r.status_code == 401

    def test_yoy_structure(self, admin_client):
        r = admin_client.get(f"{API}/reports/yearly-compare", params={"year": self.CY})
        assert r.status_code == 200
        d = r.json()
        # Top-level
        assert d["current_year"] == self.CY
        assert d["previous_year"] == self.CY - 1
        for key in ["current", "previous", "deltas"]:
            assert key in d
        # 12 rows sorted Jan..Dec for each
        for k in ["current", "previous"]:
            assert "rows" in d[k]
            assert "totals" in d[k]
            assert len(d[k]["rows"]) == 12
            expected_year = d[k]["year"]
            expected_months = [f"{expected_year}-{m:02d}" for m in range(1, 13)]
            assert [row["month"] for row in d[k]["rows"]] == expected_months
        # deltas keys exist
        for k in ["fees", "expenses", "net", "fees_pct", "expenses_pct", "net_pct"]:
            assert k in d["deltas"]

    def test_yoy_delta_math_and_pct(self, admin_client):
        """Seed isolated data to verify deltas and pct math.

        Use years 2028 (prev) and 2029 (curr) — isolated from any other tests.
        prev fees=1000, curr fees=1500 -> fees_pct=50.0
        prev expenses=2000, curr expenses=1000 -> expenses_pct=-50.0
        """
        py = 2028
        cy = 2029
        # Setup batch + student
        b = admin_client.post(f"{API}/batches", json={
            "name": "TEST_YoYBatch", "subject": "S", "monthly_fee": 1000
        }).json()
        bid = b["id"]
        s = admin_client.post(f"{API}/batches/{bid}/students",
                              json={"name": "TEST_YoYStu"}).json()
        sid = s["id"]
        exp_ids = []
        try:
            # PY fees=1000 (Jan)
            admin_client.post(f"{API}/fees/pay", json={
                "student_id": sid, "batch_id": bid,
                "month": f"{py}-01", "amount": 1000, "note": "TEST",
            })
            # CY fees=1500 (Jan)
            admin_client.post(f"{API}/fees/pay", json={
                "student_id": sid, "batch_id": bid,
                "month": f"{cy}-01", "amount": 1500, "note": "TEST",
            })
            # PY expenses=2000 (Feb)
            er1 = admin_client.post(f"{API}/expenses", json={
                "title": "TEST_YoYExpPY", "amount": 2000,
                "category": "Misc", "date": f"{py}-02-10",
            })
            exp_ids.append(er1.json()["id"])
            # CY expenses=1000 (Feb)
            er2 = admin_client.post(f"{API}/expenses", json={
                "title": "TEST_YoYExpCY", "amount": 1000,
                "category": "Misc", "date": f"{cy}-02-10",
            })
            exp_ids.append(er2.json()["id"])

            r = admin_client.get(f"{API}/reports/yearly-compare", params={"year": cy})
            assert r.status_code == 200
            d = r.json()
            assert d["current_year"] == cy
            assert d["previous_year"] == py

            curr_totals = d["current"]["totals"]
            prev_totals = d["previous"]["totals"]
            assert prev_totals["fees"] == 1000
            assert curr_totals["fees"] == 1500
            assert prev_totals["expenses"] == 2000
            assert curr_totals["expenses"] == 1000
            assert prev_totals["net"] == 1000 - 2000  # -1000
            assert curr_totals["net"] == 1500 - 1000  # 500

            deltas = d["deltas"]
            # Absolute deltas
            assert deltas["fees"] == curr_totals["fees"] - prev_totals["fees"]
            assert deltas["expenses"] == curr_totals["expenses"] - prev_totals["expenses"]
            assert deltas["net"] == curr_totals["net"] - prev_totals["net"]
            assert deltas["fees"] == 500
            assert deltas["expenses"] == -1000
            assert deltas["net"] == 1500
            # Percent deltas
            assert deltas["fees_pct"] == 50.0
            assert deltas["expenses_pct"] == -50.0
            # net_pct: (500 - (-1000)) / |-1000| * 100 = 1500/1000*100 = 150.0
            assert deltas["net_pct"] == 150.0
        finally:
            for eid in exp_ids:
                admin_client.delete(f"{API}/expenses/{eid}")
            admin_client.delete(f"{API}/batches/{bid}")

    def test_yoy_null_pct_when_prev_zero(self, admin_client):
        """When previous year has zero fees/exp/net, _pct must be JSON null."""
        # Use isolated year — no prev-year data exists for these years
        cy = 2041
        r = admin_client.get(f"{API}/reports/yearly-compare", params={"year": cy})
        assert r.status_code == 200
        d = r.json()
        # prev should be all zeros
        pt = d["previous"]["totals"]
        assert pt["fees"] == 0
        assert pt["expenses"] == 0
        assert pt["net"] == 0
        # pct fields should literally be None (JSON null)
        assert d["deltas"]["fees_pct"] is None
        assert d["deltas"]["expenses_pct"] is None
        assert d["deltas"]["net_pct"] is None
        # Verify raw JSON contains literal `null`
        import json
        raw = json.dumps(d["deltas"])
        assert '"fees_pct": null' in raw
        assert '"expenses_pct": null' in raw
        assert '"net_pct": null' in raw

    def test_yoy_pdf(self, admin_client):
        cy = 2034
        py = cy - 1
        r = admin_client.get(f"{API}/reports/yearly-compare.pdf", params={"year": cy})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1024, f"PDF body too small: {len(r.content)} bytes"
        disp = r.headers.get("content-disposition", "")
        assert f"yoy_{py}_vs_{cy}.pdf" in disp

    def test_yoy_user_isolation(self, admin_client, secondary_client):
        """Admin's prev-year fees must not appear in secondary user's YoY."""
        cy = 2037
        py = cy - 1
        b = admin_client.post(f"{API}/batches", json={
            "name": "TEST_YoYIsoBatch", "subject": "S", "monthly_fee": 4444
        }).json()
        bid = b["id"]
        s = admin_client.post(f"{API}/batches/{bid}/students",
                              json={"name": "TEST_YoYIsoStu"}).json()
        sid = s["id"]
        try:
            # admin pays fees in PREV year
            admin_client.post(f"{API}/fees/pay", json={
                "student_id": sid, "batch_id": bid,
                "month": f"{py}-06", "amount": 4444, "note": "TEST",
            })
            # admin sees this in their yoy.previous
            ra = admin_client.get(f"{API}/reports/yearly-compare", params={"year": cy})
            assert ra.status_code == 200
            assert ra.json()["previous"]["totals"]["fees"] >= 4444

            # secondary user must NOT see any of admin's fees
            rs = secondary_client.get(f"{API}/reports/yearly-compare", params={"year": cy})
            assert rs.status_code == 200
            ds = rs.json()
            assert ds["previous"]["totals"]["fees"] == 0
            assert ds["current"]["totals"]["fees"] == 0
            assert ds["deltas"]["fees"] == 0
            # Per problem statement, when prev is 0 deltas pct must be null
            assert ds["deltas"]["fees_pct"] is None
        finally:
            admin_client.delete(f"{API}/batches/{bid}")
