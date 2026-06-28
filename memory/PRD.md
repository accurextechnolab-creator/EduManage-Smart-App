# EduManage — Coaching Class Management

## Original Problem Statement
> "I have UI from Stitch for a coaching class management app which will be helpful for students attendance batch wise, fees collection from students and expense records. This will also give reports in pdf format to download and share. Please create front-end and back-end coding for web app. I should share this application to my friends for using it."

## Architecture
- **Frontend**: React 19 + React Router + Tailwind CSS + Sonner (toasts) + lucide-react (icons). Mobile-first responsive — bottom nav on mobile, left sidebar on desktop. Work Sans typography.
- **Backend**: FastAPI + MongoDB (motor) + PyJWT + bcrypt + reportlab (PDF). All routes under `/api`. Auth via httpOnly cookie + Bearer fallback (token also returned in login/register responses).
- **Design system**: Stitch "Instructional Clarity" — Primary blue `#003fb1`, surface `#faf8ff`, success/error semantic colors with low-opacity backgrounds, 8pt grid, 4px button radius / 8px card radius.

## User Personas
- **Coaching teacher / tutor**: creates batches, adds students, marks attendance daily, collects monthly fees, logs expenses, downloads PDF reports to share with parents.
- **Multiple tutors sharing the app**: each user account has fully isolated data (verified by tests).

## Core Requirements (static)
1. JWT-based custom email/password auth (registration + login + logout).
2. Batches (subject, session, monthly fee) with student count.
3. Students per batch (name, code, phone, parent name, parent phone, optional fee override).
4. Daily attendance per batch (Present / Absent toggles, save with date).
5. Monthly fee tracking per batch — record payments, mark unpaid, see collected vs expected.
6. Expense records (title, amount, category, date, note) with month filter.
7. PDF reports — Attendance (date range), Fees (month), Expenses (month) — download + native share.
8. Dashboard with daily/monthly summary stats and recent batches.
9. INR currency formatting throughout.

## What's Implemented (2026-02)
- Auth: register/login/logout/me with isolated user data.
- Batches CRUD, students CRUD, attendance get/save/summary, fees list/pay/unpay, expenses CRUD.
- Dashboard stats endpoint.
- PDF generators for attendance, fees, expenses with brand styling.
- Full responsive UI: Login, Register, Dashboard, Batches list, Batch Detail (Attendance/Students tabs), Finance (Fees/Expenses tabs), Reports.
- Native Web Share API for sharing PDFs on mobile (falls back to new tab on desktop).
- 20/20 backend pytest tests passing, full Playwright UI flow verified.

## Prioritized Backlog
- **P1**: Edit batch / edit student inline; bulk-mark-all-present button on attendance day.
- **P1**: Student profile page with full history (attendance %, fee ledger).
- **P2**: Optional WhatsApp share link for individual fee reminders.
- **P2**: Year-to-date / multi-month report consolidation.
- **P2**: User profile page (rename, change password).
- **P3**: Email PDF reports directly from app.
- **P3**: Holiday/non-class-day calendar so attendance % excludes them.

## Credentials
Admin (seeded): `admin@edumanage.app` / `admin123` — see `/app/memory/test_credentials.md`.

## File Map
- `/app/backend/server.py` — all API logic.
- `/app/frontend/src/App.js` — router.
- `/app/frontend/src/lib/{api,auth}.{js,jsx}` — axios client + auth context.
- `/app/frontend/src/pages/*.jsx` — page components.
- `/app/frontend/src/components/{Layout,ui-edu}.jsx` — shell + shared primitives.
- `/app/backend/tests/test_edumanage_backend.py` — backend test suite.
