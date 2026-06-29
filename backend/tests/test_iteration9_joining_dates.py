"""Iteration 9 tests — joining_date field & bulk joining-dates endpoint."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://student-track-49.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@edumanage.app", "password": "admin123"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def second_user():
    """Register a second user for isolation tests."""
    email = f"it9_other_{int(time.time())}@example.com"
    payload = {"email": email, "password": "pass1234", "name": "Other User"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
    assert r.status_code in (200, 201), r.text
    tok = r.json()["token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_batch(admin_client):
    payload = {"name": f"TEST_IT9_Batch_{int(time.time())}", "subject": "Math", "monthly_fee": 1000,
               "schedule": "Mon-Fri 5pm"}
    r = admin_client.post(f"{API}/batches", json=payload)
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    yield bid
    # cleanup
    admin_client.delete(f"{API}/batches/{bid}")


# ------- Helpers -------
def _create_student(client, batch_id, name, **extra):
    body = {"name": name, "student_code": "", "phone": "", "parent_name": "", "parent_phone": "",
            "monthly_fee": 0, "discount_amount": 0, "discount_percent": 0, "discount_reason": "",
            "joining_date": "", "joining_month": ""}
    body.update(extra)
    r = client.post(f"{API}/batches/{batch_id}/students", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ===================== TESTS =====================

class TestJoiningDateModel:
    def test_create_with_joining_date(self, admin_client, test_batch):
        s = _create_student(admin_client, test_batch, "TEST_IT9_JD_New",
                            joining_date="2026-03-15")
        # PUT to update / verify roundtrip
        sid = s["id"]
        r = admin_client.get(f"{API}/students/{sid}")
        assert r.status_code == 200
        stu = r.json()["student"]
        assert stu["joining_date"] == "2026-03-15"

    def test_legacy_joining_month_still_accepted(self, admin_client, test_batch):
        s = _create_student(admin_client, test_batch, "TEST_IT9_Legacy",
                            joining_month="2026-05")
        r = admin_client.get(f"{API}/students/{s['id']}")
        assert r.status_code == 200
        assert r.json()["student"]["joining_month"] == "2026-05"

    def test_put_updates_joining_date(self, admin_client, test_batch):
        s = _create_student(admin_client, test_batch, "TEST_IT9_PUT")
        sid = s["id"]
        body = {**s, "joining_date": "2026-07-20"}
        # drop the server-only keys before PUT
        for k in ("id", "user_id", "batch_id", "created_at"):
            body.pop(k, None)
        r = admin_client.put(f"{API}/students/{sid}", json=body)
        assert r.status_code == 200, r.text
        r = admin_client.get(f"{API}/students/{sid}")
        assert r.json()["student"]["joining_date"] == "2026-07-20"


class TestJoiningResolution:
    """Verify effective_joining_month preference order via /students/all"""

    def _eff(self, admin_client, sid):
        r = admin_client.get(f"{API}/students/all")
        assert r.status_code == 200
        for row in r.json():
            if row["id"] == sid:
                return row["effective_joining_month"]
        return None

    def test_pref_joining_date(self, admin_client, test_batch):
        s = _create_student(admin_client, test_batch, "TEST_IT9_Pref_JD",
                            joining_date="2026-03-15")
        assert self._eff(admin_client, s["id"]) == "2026-03"

    def test_pref_legacy_joining_month(self, admin_client, test_batch):
        s = _create_student(admin_client, test_batch, "TEST_IT9_Pref_JM",
                            joining_month="2026-05")
        assert self._eff(admin_client, s["id"]) == "2026-05"

    def test_pref_created_at_fallback(self, admin_client, test_batch):
        s = _create_student(admin_client, test_batch, "TEST_IT9_Pref_CR")
        eff = self._eff(admin_client, s["id"])
        # falls back to created_at[:7]
        assert eff == (s.get("created_at") or "")[:7]


class TestStudentsAllEndpoint:
    def test_route_precedence_all_not_treated_as_id(self, admin_client):
        r = admin_client.get(f"{API}/students/all")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_all_contains_batch_info(self, admin_client, test_batch):
        s = _create_student(admin_client, test_batch, "TEST_IT9_AllRow",
                            joining_date="2026-02-10")
        r = admin_client.get(f"{API}/students/all")
        rows = r.json()
        match = [x for x in rows if x["id"] == s["id"]]
        assert len(match) == 1
        row = match[0]
        for k in ("batch_id", "batch_name", "joining_date", "joining_month",
                  "effective_joining_month"):
            assert k in row, f"missing key {k}"
        assert row["batch_id"] == test_batch
        assert row["joining_date"] == "2026-02-10"
        assert row["effective_joining_month"] == "2026-02"

    def test_all_requires_auth(self):
        r = requests.get(f"{API}/students/all", timeout=10)
        assert r.status_code in (401, 403)


class TestBulkJoiningDates:
    def test_requires_auth(self):
        r = requests.post(f"{API}/students/bulk-joining-dates",
                          json={"updates": []}, timeout=10)
        assert r.status_code in (401, 403)

    def test_updates_owned_students(self, admin_client, test_batch):
        a = _create_student(admin_client, test_batch, "TEST_IT9_Bulk_A")
        b = _create_student(admin_client, test_batch, "TEST_IT9_Bulk_B")
        body = {"updates": [
            {"id": a["id"], "joining_date": "2025-10-15"},
            {"id": b["id"], "joining_date": "2025-11-20"},
        ]}
        r = admin_client.post(f"{API}/students/bulk-joining-dates", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["updated"] == 2
        # verify persistence
        ra = admin_client.get(f"{API}/students/{a['id']}").json()["student"]
        rb = admin_client.get(f"{API}/students/{b['id']}").json()["student"]
        assert ra["joining_date"] == "2025-10-15"
        assert rb["joining_date"] == "2025-11-20"

    def test_skips_short_dates(self, admin_client, test_batch):
        a = _create_student(admin_client, test_batch, "TEST_IT9_Bulk_Short",
                            joining_date="2024-01-01")
        body = {"updates": [{"id": a["id"], "joining_date": "abc"}]}
        r = admin_client.post(f"{API}/students/bulk-joining-dates", json=body)
        assert r.status_code == 200
        assert r.json()["updated"] == 0
        # Unchanged
        cur = admin_client.get(f"{API}/students/{a['id']}").json()["student"]
        assert cur["joining_date"] == "2024-01-01"

    def test_foreign_ids_silently_skipped(self, admin_client, second_user, test_batch):
        # Create student under second_user
        bp = {"name": "Other Batch", "subject": "S", "monthly_fee": 100, "schedule": "x"}
        r = second_user.post(f"{API}/batches", json=bp)
        assert r.status_code == 200
        other_bid = r.json()["id"]
        other = _create_student(second_user, other_bid, "TEST_IT9_Foreign",
                                joining_date="2025-01-01")
        # admin attempts to update other_user's student
        body = {"updates": [{"id": other["id"], "joining_date": "2030-12-31"}]}
        r = admin_client.post(f"{API}/students/bulk-joining-dates", json=body)
        assert r.status_code == 200
        assert r.json()["updated"] == 0
        # confirm unchanged from owner's view
        chk = second_user.get(f"{API}/students/{other['id']}").json()["student"]
        assert chk["joining_date"] == "2025-01-01"
        # cleanup
        second_user.delete(f"{API}/batches/{other_bid}")


class TestBalanceMathWithJoiningDate:
    def test_balance_unchanged_with_joining_date(self, admin_client, test_batch):
        s = _create_student(admin_client, test_batch, "TEST_IT9_Balance",
                            joining_date="2026-04-15", monthly_fee=1000)
        sid = s["id"]
        # record payments for Apr, May, Jun via /fees/pay
        for month, amount in [("2026-04", 700), ("2026-05", 500), ("2026-06", 1500)]:
            r = admin_client.post(f"{API}/fees/pay", json={
                "student_id": sid, "batch_id": test_batch,
                "month": month, "amount": amount,
            })
            assert r.status_code == 200, r.text
        # GET /api/fees gives per-student balance row at view_month
        r = admin_client.get(f"{API}/fees",
                             params={"batch_id": test_batch, "month": "2026-06"})
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]
        row = next((x for x in rows if x["student"]["id"] == sid), None)
        assert row is not None, "student row not in fees response"
        assert row["joining_month"] == "2026-04"
        assert abs(row["balance"] - 300) < 0.01, row
