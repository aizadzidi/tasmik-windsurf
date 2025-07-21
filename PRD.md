# Product Requirements Document (PRD)

## Project Name: Study Report App (Tasmik MVP)

### Purpose
A web application for schools to record, monitor, and share students' tasmik and murajaah progress. The MVP focuses on enabling teachers (Ustaz/Ustazah) to submit reports, admins to manage users, and prepares for future parent access.

---

## 1. Stakeholders
- **Admin**: Manages users (teachers, students), assigns students to teachers, monitors reports.
- **Ustaz/Ustazah (Teacher)**: Fills in and views student tasmik/murajaah reports.
- **Parent**: (Future phase) Views their child's progress.

## 2. MVP Features

### 2.1 Authentication & User Flow
- Sign up and login for all users (parents, teachers, admins) via email/password.
- **Default sign up role is 'parent'.**
- After sign up, user is redirected to the `/parent` dashboard.
- Admin can manually change a user's role to 'teacher' or 'admin' via Supabase dashboard (or future admin UI).
- On login, user is redirected to their dashboard based on role:
  - `parent` → `/parent`
  - `teacher` → `/teacher`
  - `admin` → `/admin`

### 2.2 Tasmik/Murajaah Report Management
- Teachers can fill in reports for assigned students.
- Fields:
  - Student
  - Teacher
  - Report type: Tasmi' / Old Murajaah / New Murajaah
  - Surah (dropdown with all surahs in the Quran for standardization)
  - Juzuk (juz)
  - Nombor Ayat (From - To)
  - Muka Surat (From - To)
  - Date (auto-filled)
  - Grade (mumtaz, jayyid jiddan, jayyid)
- Teachers can view their own reports.
- Parents can view their own child's reports on `/parent` dashboard (future phase).

### 2.3 Admin Panel
- Add students.
- Assign students to teachers.
- View all reports.
- Change user roles (parent → teacher/admin) via Supabase dashboard (or future admin UI).

### 2.4 Data Model (Supabase Tables)
- **users** (id, name, email, role [`parent`/`teacher`/`admin`], etc.)
- **students** (id, name, parent_id, assigned_teacher_id, etc.)
- **reports** (id, student_id, teacher_id, type, surah, juzuk, ayat_from, ayat_to, page_from, page_to, date, grade)

### 2.5 Future Features (Not in MVP)
- Parent/student auto-matching by parent ID.
- Parent view of reports (full feature).
- Notifications/announcements.
- Admin dashboard for changing user roles (currently via Supabase dashboard).

---

### 2.6 Teacher Exam Dashboard (NEW)

#### Purpose
A dynamic dashboard for teachers to record, edit, and visualize students' marks and conduct for exams and quizzes, based on their assigned classes and subjects.

#### Features

- **Dynamic Assignment-Based Controls**
  - Teachers only see classes, subjects, and students assigned to them by the admin.
  - Class, subject, assessment type (Exam/Quiz), and specific assessment (e.g., Midterm, Quiz 1) are all selectable via a modern, grouped picker UI.

- **Editable Student Table**
  - Displays list of students for the selected class and subject.
  - Teachers can enter/edit marks (%) and conduct breakdown for each student.
  - Grades are auto-calculated based on mark.
  - Expandable row for detailed conduct input (multiple categories, e.g., Discipline, Effort, etc.).
  - All edits are saved in real time (auto-save planned for backend).

- **Live Visualizations**
  - Marks overview (line chart).
  - Class conduct radar (radar chart, averages per conduct category).
  - Charts update instantly as teacher edits data.

- **Assessment Management**
  - Teachers can toggle between Exam and Quiz.
  - Assessment dropdown updates dynamically based on class, subject, and type.
  - "+ Create Quiz" button for quick quiz creation (UI only for now).

- **Responsive and Accessible UI**
  - Controls are grouped in a visually distinct, accessible card at the top.
  - Layout adapts for mobile and desktop.

#### Out of Scope (for now)
- Backend integration (currently uses mock data).
- Advanced permissions or analytics.
- Full quiz creation workflow and backend.
- Parent/Student access to exam dashboard.

---

## 3. Tech Stack
- **Frontend**: Next.js, TypeScript, Tailwind CSS, shadcn/ui
- **Backend/DB**: Supabase (auth, database)

---

## 4. Success Criteria
- Any new user can sign up and is assigned the 'parent' role by default.
- Admin can add students and assign them to teachers.
- Admin can promote users to 'teacher' or 'admin' via Supabase dashboard.
- Teachers can log in and fill in tasmik/murajaah reports for assigned students.
- Admin can view all reports.
- Simple, clean UI with shadcn/ui components.
- Ready for parent login/expansion after testing phase.
- Clear separation of dashboards: `/admin`, `/teacher`, `/parent`.

---

## 5. Out of Scope for MVP
- Parent login and account creation.
- Advanced analytics, notifications, or messaging.
- Mobile app (web only for now).

---

## 6. Deployment
- App must be deployable on Windsurf/Netlify by today.

---

## 7. References
- See PROMPT.md for the original project prompt and requirements.
