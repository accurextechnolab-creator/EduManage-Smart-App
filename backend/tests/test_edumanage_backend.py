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
