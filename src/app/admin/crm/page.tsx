"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus, Settings, UserPlus } from "lucide-react";

type RecordType = "prospect" | "student";
type CrmStage = string;

interface StudentRecord {
  id: string;
  name: string;
  parent_id: string | null;
  assigned_teacher_id: string | null;
  class_id: string | null;
  record_type?: RecordType | null;
  crm_stage?: string | null;
  crm_status_reason?: string | null;
  identification_number?: string | null;
  address?: string | null;
  parent_name?: string | null;
  parent_contact_number?: string | null;
  parent_occupation?: string | null;
  household_income?: string | null;
  interviewer_remark?: string | null;
  student_id_no?: string | null;
  date_of_birth?: string | null;
  birth_place?: string | null;
  gender?: string | null;
  religion?: string | null;
  admission_date?: string | null;
  leaving_date?: string | null;
  reason_leaving?: string | null;
}

interface Parent {
  id: string;
  name: string;
  email: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface Class {
  id: string;
  name: string;
}

interface StageConfig {
  key: CrmStage;
  label: string;
  colorBg: string;
  colorText: string;
  isActive?: boolean;
  sortOrder?: number;
  id?: string;
}

type StageRecord = {
  id: string;
  record_type: RecordType;
  stage_key: string;
  label: string;
  sort_order: number;
  color_bg: string | null;
  color_text: string | null;
  is_active: boolean;
};

interface StudentFormState {
  name: string;
  record_type: RecordType;
  crm_stage: CrmStage;
  parent_id: string;
  assigned_teacher_id: string;
  class_id: string;
  identification_number: string;
  address: string;
  parent_name: string;
  parent_contact_number: string;
  parent_occupation: string;
  household_income: string;
  interviewer_remark: string;
  crm_status_reason: string;
  student_id_no: string;
  date_of_birth: string;
  birth_place: string;
  gender: string;
  religion: string;
  admission_date: string;
  leaving_date: string;
  reason_leaving: string;
}

const defaultStageByType: Record<RecordType, CrmStage> = {
  prospect: "interested",
  student: "active"
};

const fallbackProspectStages: StageConfig[] = [
  {
    key: "interested",
    label: "Interested",
    colorBg: "#E0F2FE",
    colorText: "#0369A1",
    isActive: true,
    sortOrder: 1
  },
  {
    key: "interviewed",
    label: "Interviewed",
    colorBg: "#FEF3C7",
    colorText: "#B45309",
    isActive: true,
    sortOrder: 2
  },
  {
    key: "trial",
    label: "Done Trial",
    colorBg: "#CCFBF1",
    colorText: "#0F766E",
    isActive: true,
    sortOrder: 3
  },
  {
    key: "registered",
    label: "Registered",
    colorBg: "#DCFCE7",
    colorText: "#15803D",
    isActive: true,
    sortOrder: 4
  },
  {
    key: "lost_interest",
    label: "Lost Interest",
    colorBg: "#F1F5F9",
    colorText: "#475569",
    isActive: true,
    sortOrder: 5
  }
];

const fallbackStudentStages: StageConfig[] = [
  {
    key: "active",
    label: "Active",
    colorBg: "#DCFCE7",
    colorText: "#15803D",
    isActive: true,
    sortOrder: 1
  },
  {
    key: "discontinued",
    label: "Discontinued",
    colorBg: "#F1F5F9",
    colorText: "#475569",
    isActive: true,
    sortOrder: 2
  }
];

const resolveRecordType = (student: StudentRecord): RecordType =>
  student.record_type === "prospect" ? "prospect" : "student";

const resolveStage = (
  student: StudentRecord,
  activeStages: StageConfig[]
): CrmStage => {
  const recordType = resolveRecordType(student);
  const stage = student.crm_stage as CrmStage | null | undefined;
  if (stage && activeStages.some((item) => item.key === stage)) {
    return stage;
  }
  return activeStages[0]?.key ?? defaultStageByType[recordType];
};

const isReasonStage = (stage: CrmStage) =>
  stage === "lost_interest" || stage === "discontinued";

const slugifyStageKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

const WHATSAPP_DEFAULT_MESSAGE = "Assalamualaikum wbt Tuan/Puan";

const normalizeWhatsappNumber = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("0")) {
    return `60${digits.slice(1)}`;
  }
  return digits;
};

const parseMyKadDob = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 6) return null;
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYear = new Date().getFullYear();
  const currentYY = currentYear % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const fullYear = century + yy;
  const date = new Date(fullYear, mm - 1, dd);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== fullYear || date.getMonth() !== mm - 1 || date.getDate() !== dd) {
    return null;
  }
  const paddedMonth = String(mm).padStart(2, "0");
  const paddedDay = String(dd).padStart(2, "0");
  return `${fullYear}-${paddedMonth}-${paddedDay}`;
};

const parseLocalDate = (value: string | null) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const calculateAge = (dob: string | null, onDate: string | null) => {
  if (!dob || !onDate) return null;
  const dobDate = parseLocalDate(dob);
  const refDate = parseLocalDate(onDate);
  if (!dobDate || !refDate) return null;
  let age = refDate.getFullYear() - dobDate.getFullYear();
  const monthDiff = refDate.getMonth() - dobDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < dobDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const formatAgeLabel = (age: number | null) => (age === null ? "" : `${age} years old`);

const buildWhatsappLink = (value: string) => {
  const normalized = normalizeWhatsappNumber(value);
  if (!normalized) {
    return "";
  }
  const text = encodeURIComponent(WHATSAPP_DEFAULT_MESSAGE);
  return `https://wa.me/${normalized}?text=${text}`;
};

const toStageConfig = (stage: StageRecord): StageConfig => ({
  id: stage.id,
  key: stage.stage_key,
  label: stage.label,
  colorBg: stage.color_bg || "#E2E8F0",
  colorText: stage.color_text || "#1F2937",
  isActive: stage.is_active,
  sortOrder: stage.sort_order
});

const bySortOrder = (a: StageConfig, b: StageConfig) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

const resolveActiveStages = (
  stages: StageConfig[],
  fallback: StageConfig[]
) => {
  const active = stages.filter((stage) => stage.isActive);
  return active.length > 0 ? active.sort(bySortOrder) : fallback;
};

const buildFormState = (
  student: StudentRecord,
  activeStages: StageConfig[]
): StudentFormState => ({
  name: student.name || "",
  record_type: resolveRecordType(student),
  crm_stage: resolveStage(student, activeStages),
  parent_id: student.parent_id || "",
  assigned_teacher_id: student.assigned_teacher_id || "",
  class_id: student.class_id || "",
  identification_number: student.identification_number || "",
  address: student.address || "",
  parent_name: student.parent_name || "",
  parent_contact_number: student.parent_contact_number || "",
  parent_occupation: student.parent_occupation || "",
  household_income: student.household_income || "",
  interviewer_remark: student.interviewer_remark || "",
  crm_status_reason: student.crm_status_reason || "",
  student_id_no: student.student_id_no || "",
  date_of_birth: student.date_of_birth || "",
  birth_place: student.birth_place || "",
  gender: student.gender || "",
  religion: student.religion || "",
  admission_date: student.admission_date || "",
  leaving_date: student.leaving_date || "",
  reason_leaving: student.reason_leaving || ""
});

const buildEmptyForm = (recordType: RecordType): StudentFormState => ({
  name: "",
  record_type: recordType,
  crm_stage: defaultStageByType[recordType],
  parent_id: "",
  assigned_teacher_id: "",
  class_id: "",
  identification_number: "",
  address: "",
  parent_name: "",
  parent_contact_number: "",
  parent_occupation: "",
  household_income: "",
  interviewer_remark: "",
  crm_status_reason: "",
  student_id_no: "",
  date_of_birth: "",
  birth_place: "",
  gender: "",
  religion: "",
  admission_date: "",
  leaving_date: "",
  reason_leaving: ""
});

type StudentFormFieldsProps = {
  form: StudentFormState;
  stageOptions: StageConfig[];
  parents: Parent[];
  teachers: Teacher[];
  classes: Class[];
  onChange: (next: Partial<StudentFormState>) => void;
};

const StudentFormFields = ({
  form,
  stageOptions,
  parents,
  teachers,
  classes,
  onChange
}: StudentFormFieldsProps) => {
  const showReason = isReasonStage(form.crm_stage);
  const derivedDob = form.date_of_birth || parseMyKadDob(form.identification_number) || "";
  const admissionAge = calculateAge(derivedDob || null, form.admission_date || null);
  const leavingAge = calculateAge(derivedDob || null, form.leaving_date || null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Student Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Enter student name"
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Record Type
          </label>
          <select
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
            value={form.record_type}
            onChange={(e) =>
              onChange({ record_type: e.target.value as RecordType })
            }
          >
            <option value="prospect">Prospect</option>
            <option value="student">Student</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pipeline Stage
          </label>
          <select
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
            value={form.crm_stage}
            onChange={(e) => onChange({ crm_stage: e.target.value as CrmStage })}
          >
            {stageOptions.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Parent User (Optional)
          </label>
          <select
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
            value={form.parent_id}
            onChange={(e) => onChange({ parent_id: e.target.value })}
          >
            <option value="">No parent assigned</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Teacher (Optional)
          </label>
          <select
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
            value={form.assigned_teacher_id}
            onChange={(e) => onChange({ assigned_teacher_id: e.target.value })}
          >
            <option value="">No teacher assigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Class (Optional)
          </label>
          <select
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
            value={form.class_id}
            onChange={(e) => onChange({ class_id: e.target.value })}
          >
            <option value="">No class assigned</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Parent and Household
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parent Name
            </label>
            <input
              type="text"
              placeholder="Enter parent name"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.parent_name}
              onChange={(e) => onChange({ parent_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parent Contact Number
            </label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Enter contact number"
                className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                value={form.parent_contact_number}
                onChange={(e) =>
                  onChange({ parent_contact_number: e.target.value })
                }
              />
              {buildWhatsappLink(form.parent_contact_number) && (
                <a
                  href={buildWhatsappLink(form.parent_contact_number)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  WhatsApp Parent
                </a>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parent Occupation
            </label>
            <input
              type="text"
              placeholder="Enter occupation"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.parent_occupation}
              onChange={(e) => onChange({ parent_occupation: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Household Income
            </label>
            <input
              type="text"
              placeholder="e.g. RM 3,000 - RM 5,000"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.household_income}
              onChange={(e) => onChange({ household_income: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Student Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Identification Card Number
            </label>
            <input
              type="text"
              placeholder="Enter ID number"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.identification_number}
              onChange={(e) =>
                onChange({
                  identification_number: e.target.value,
                  date_of_birth: parseMyKadDob(e.target.value) || form.date_of_birth
                })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date of Birth (Auto from IC)
            </label>
            <input
              type="text"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border bg-gray-50 text-gray-600"
              value={derivedDob}
              readOnly
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Address
            </label>
            <textarea
              rows={3}
              placeholder="Enter address"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.address}
              onChange={(e) => onChange({ address: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Certificate Details (School Leaving)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Student ID No.
            </label>
            <input
              type="text"
              placeholder="Enter student ID"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.student_id_no}
              onChange={(e) => onChange({ student_id_no: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Place of Birth / Nation
            </label>
            <input
              type="text"
              placeholder="e.g. Kedah, Malaysia"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.birth_place}
              onChange={(e) => onChange({ birth_place: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gender
            </label>
            <input
              type="text"
              placeholder="e.g. Male"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.gender}
              onChange={(e) => onChange({ gender: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Religion
            </label>
            <input
              type="text"
              placeholder="e.g. Islam"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.religion}
              onChange={(e) => onChange({ religion: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date of School Admission
            </label>
            <input
              type="text"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border bg-gray-50 text-gray-600"
              value={form.admission_date || ""}
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date of Leaving School
            </label>
            <input
              type="text"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border bg-gray-50 text-gray-600"
              value={form.leaving_date || ""}
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              School-admission age
            </label>
            <input
              type="text"
              placeholder="e.g. 15 years old"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border bg-gray-50 text-gray-600"
              value={formatAgeLabel(admissionAge)}
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              School-leaving age
            </label>
            <input
              type="text"
              placeholder="e.g. 18 years old"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border bg-gray-50 text-gray-600"
              value={formatAgeLabel(leavingAge)}
              readOnly
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason of Leaving
            </label>
            <input
              type="text"
              placeholder="e.g. Graduated from school"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.reason_leaving}
              onChange={(e) => onChange({ reason_leaving: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Interview and Notes
        </h3>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Interviewer Remark
            </label>
            <textarea
              rows={3}
              placeholder="Add interviewer remark"
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
              value={form.interviewer_remark}
              onChange={(e) => onChange({ interviewer_remark: e.target.value })}
            />
          </div>
          {showReason && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status Reason
              </label>
              <textarea
                rows={3}
                placeholder="Add status reason"
                className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                value={form.crm_status_reason}
                onChange={(e) => onChange({ crm_status_reason: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function AdminCrmPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<RecordType>("prospect");
  const [stagesByType, setStagesByType] = useState<{
    prospect: StageConfig[];
    student: StageConfig[];
  }>({
    prospect: fallbackProspectStages,
    student: fallbackStudentStages
  });
  const [stageEditor, setStageEditor] = useState<{
    prospect: StageConfig[];
    student: StageConfig[];
  }>({
    prospect: fallbackProspectStages,
    student: fallbackStudentStages
  });
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [stageSaving, setStageSaving] = useState(false);
  const [stageError, setStageError] = useState("");
  const [stageTab, setStageTab] = useState<RecordType>("prospect");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CrmStage | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(
    null
  );
  const [detailForm, setDetailForm] = useState<StudentFormState | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailDeleting, setDetailDeleting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<StudentFormState>(
    buildEmptyForm("prospect")
  );
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const parseError = useCallback(async (res: Response) => {
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        return j?.error || res.statusText || "Request failed";
      }
      const t = await res.text();
      return t || res.statusText || "Request failed";
    } catch {
      return res.statusText || "Unknown error";
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const [studentsRes, parentsRes, teachersRes, classesRes, stagesRes] =
          await Promise.all([
            fetch("/api/admin/students?include_prospects=true"),
            fetch("/api/admin/users?role=parent"),
            fetch("/api/admin/users?role=teacher"),
            fetch("/api/admin/classes"),
            fetch("/api/admin/crm-stages")
          ]);

        if (studentsRes.ok) {
          const studentsData = await studentsRes.json();
          setStudents(studentsData);
        } else {
          setError(`Failed to load students: ${await parseError(studentsRes)}`);
        }

        if (parentsRes.ok) {
          setParents(await parentsRes.json());
        }

        if (teachersRes.ok) {
          setTeachers(await teachersRes.json());
        }

        if (classesRes.ok) {
          setClasses(await classesRes.json());
        }
        if (stagesRes.ok) {
          const stageRows = (await stagesRes.json()) as StageRecord[];
          const resultByType = {
            prospect: stageRows
              .filter((stage) => stage.record_type === "prospect")
              .map(toStageConfig),
            student: stageRows
              .filter((stage) => stage.record_type === "student")
              .map(toStageConfig)
          };
          const nextStages = {
            prospect:
              resultByType.prospect.length > 0
                ? resultByType.prospect
                : fallbackProspectStages,
            student:
              resultByType.student.length > 0
                ? resultByType.student
                : fallbackStudentStages
          };
          setStagesByType(nextStages);
          setStageEditor({
            prospect: nextStages.prospect.slice(),
            student: nextStages.student.slice()
          });
        }
      } catch (err) {
        console.error("Failed to fetch CRM data:", err);
        setError("Failed to load CRM data. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [parseError]);

  const parentById = useMemo(
    () => new Map(parents.map((parent) => [parent.id, parent])),
    [parents]
  );
  const teacherById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers]
  );
  const classById = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes]
  );

  const stageConfig = resolveActiveStages(
    stagesByType[view],
    view === "prospect" ? fallbackProspectStages : fallbackStudentStages
  );

  const filteredRecords = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return students
      .filter((student) => resolveRecordType(student) === view)
      .filter((student) => {
        if (
          filterClass &&
          (filterClass !== "unassigned" || student.class_id)
        ) {
          if (filterClass === "unassigned") return !student.class_id;
          if (student.class_id !== filterClass) return false;
        }

        if (
          filterTeacher &&
          (filterTeacher !== "unassigned" || student.assigned_teacher_id)
        ) {
          if (filterTeacher === "unassigned") {
            return !student.assigned_teacher_id;
          }
          if (student.assigned_teacher_id !== filterTeacher) {
            return false;
          }
        }

        if (!search) return true;

        const parent = student.parent_id
          ? parentById.get(student.parent_id)?.name || ""
          : "";
        const haystack = [
          student.name || "",
          student.parent_name || "",
          student.parent_contact_number || "",
          parent
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [
    students,
    view,
    searchTerm,
    filterClass,
    filterTeacher,
    parentById
  ]);

  const groupedByStage = useMemo(() => {
    const grouped = new Map<CrmStage, StudentRecord[]>();
    stageConfig.forEach((stage) => grouped.set(stage.key, []));

    filteredRecords.forEach((student) => {
      const stage = resolveStage(student, stageConfig);
      if (!grouped.has(stage)) {
        grouped.set(stage, []);
      }
      grouped.get(stage)?.push(student);
    });

    return grouped;
  }, [filteredRecords, stageConfig]);

  const updateStudent = useCallback(
    async (id: string, updates: Partial<StudentFormState>) => {
      const payload = {
        id,
        name: updates.name,
        parent_id: updates.parent_id || null,
        assigned_teacher_id: updates.assigned_teacher_id || null,
        class_id: updates.class_id || null,
        record_type: updates.record_type,
        crm_stage: updates.crm_stage,
        identification_number: updates.identification_number,
        address: updates.address,
        parent_name: updates.parent_name,
        parent_contact_number: updates.parent_contact_number,
        parent_occupation: updates.parent_occupation,
        household_income: updates.household_income,
        interviewer_remark: updates.interviewer_remark,
        crm_status_reason: updates.crm_status_reason,
        student_id_no: updates.student_id_no,
        date_of_birth: updates.date_of_birth,
        birth_place: updates.birth_place,
        gender: updates.gender,
        religion: updates.religion,
        admission_date: updates.admission_date,
        leaving_date: updates.leaving_date,
        reason_leaving: updates.reason_leaving
      };

      const response = await fetch("/api/admin/students", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const updated = (await response.json()) as StudentRecord;
      setStudents((prev) =>
        prev.map((student) => (student.id === id ? updated : student))
      );

      return updated;
    },
    [parseError]
  );

  const handleDrop = async (stageKey: CrmStage, studentId: string) => {
    if (!studentId) return;
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    if (resolveStage(student, stageConfig) === stageKey) return;

    try {
      await updateStudent(student.id, {
        ...buildFormState(student, stageConfig),
        crm_stage: stageKey
      });
    } catch (err) {
      console.error("Failed to update CRM stage:", err);
      setError("Failed to update stage. Please try again.");
    }
  };

  const openDetails = (student: StudentRecord) => {
    setSelectedStudent(student);
    setDetailForm(buildFormState(student, stageConfig));
    setDetailError("");
  };

  const closeDetails = () => {
    setSelectedStudent(null);
    setDetailForm(null);
    setDetailError("");
  };

  const handleDeleteRecord = async () => {
    if (!selectedStudent) return;
    const confirmed = window.confirm(
      `Delete ${selectedStudent.name}? This action cannot be undone.`
    );
    if (!confirmed) return;
    setDetailDeleting(true);
    setDetailError("");
    try {
      const response = await fetch(
        `/api/admin/students?id=${selectedStudent.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        throw new Error(await parseError(response));
      }
      setStudents((prev) =>
        prev.filter((student) => student.id !== selectedStudent.id)
      );
      closeDetails();
    } catch (err) {
      setDetailError((err as Error)?.message || "Failed to delete record.");
    } finally {
      setDetailDeleting(false);
    }
  };

  const getDefaultStage = useCallback(
    (recordType: RecordType) => {
      const active = resolveActiveStages(
        stagesByType[recordType],
        recordType === "prospect" ? fallbackProspectStages : fallbackStudentStages
      );
      return active[0]?.key ?? defaultStageByType[recordType];
    },
    [stagesByType]
  );

  const handleDetailChange = useCallback(
    (next: Partial<StudentFormState>) => {
      setDetailForm((prev) => {
        if (!prev) return prev;
        let updated = { ...prev, ...next };
        if (next.record_type && next.record_type !== prev.record_type) {
          updated = {
            ...updated,
            crm_stage: getDefaultStage(next.record_type)
          };
          if (!isReasonStage(updated.crm_stage)) {
            updated = { ...updated, crm_status_reason: "" };
          }
        }
        if (next.crm_stage && !isReasonStage(next.crm_stage)) {
          updated = { ...updated, crm_status_reason: "" };
        }
        return updated;
      });
    },
    [getDefaultStage]
  );

  const handleSaveDetails = async () => {
    if (!detailForm || !selectedStudent) return;
    if (!detailForm.name.trim()) {
      setDetailError("Student name is required.");
      return;
    }
    setDetailSaving(true);
    setDetailError("");
    try {
      const updated = await updateStudent(selectedStudent.id, detailForm);
      setSelectedStudent(updated);
      setDetailForm(buildFormState(updated, stageConfig));
      if (detailForm.record_type === "student") {
        closeDetails();
      }
    } catch (err) {
      setDetailError((err as Error)?.message || "Failed to save details.");
    } finally {
      setDetailSaving(false);
    }
  };

  const handleConvertToStudent = async () => {
    if (!detailForm || !selectedStudent) return;
    const nextForm = {
      ...detailForm,
      record_type: "student" as RecordType,
      crm_stage: getDefaultStage("student")
    };
    setDetailForm(nextForm);
    try {
      const updated = await updateStudent(selectedStudent.id, nextForm);
      setSelectedStudent(updated);
      setDetailForm(buildFormState(updated, stageConfig));
      setView("student");
      closeDetails();
    } catch (err) {
      setDetailError((err as Error)?.message || "Failed to convert record.");
    }
  };

  const openAddModal = (type: RecordType) => {
    setAddForm({
      ...buildEmptyForm(type),
      crm_stage: getDefaultStage(type)
    });
    setAddError("");
    setIsAddModalOpen(true);
  };

  const handleAddChange = useCallback((next: Partial<StudentFormState>) => {
    setAddForm((prev) => {
      let updated = { ...prev, ...next };
      if (next.record_type && next.record_type !== prev.record_type) {
        updated = {
          ...updated,
          crm_stage: getDefaultStage(next.record_type)
        };
        if (!isReasonStage(updated.crm_stage)) {
          updated = { ...updated, crm_status_reason: "" };
        }
      }
      if (next.crm_stage && !isReasonStage(next.crm_stage)) {
        updated = { ...updated, crm_status_reason: "" };
      }
      return updated;
    });
  }, [getDefaultStage]);

  const addTitle = addForm.record_type === "prospect" ? "Prospect" : "Student";

  const stageList = useMemo(
    () => stageEditor[stageTab].slice().sort(bySortOrder),
    [stageEditor, stageTab]
  );

  const updateStageDraft = useCallback(
    (recordType: RecordType, key: string, patch: Partial<StageConfig>) => {
      setStageEditor((prev) => ({
        ...prev,
        [recordType]: prev[recordType].map((stage) => {
          const identifier = stage.id ?? stage.key;
          return identifier === key ? { ...stage, ...patch } : stage;
        })
      }));
    },
    []
  );

  const moveStage = useCallback(
    (recordType: RecordType, fromIndex: number, toIndex: number) => {
      setStageEditor((prev) => {
        const sorted = prev[recordType].slice().sort(bySortOrder);
        if (toIndex < 0 || toIndex >= sorted.length) return prev;
        const next = [...sorted];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        const normalized = next.map((stage, idx) => ({
          ...stage,
          sortOrder: idx + 1
        }));
        return { ...prev, [recordType]: normalized };
      });
    },
    []
  );

  const addStageDraft = useCallback((recordType: RecordType) => {
    setStageEditor((prev) => {
      const sorted = prev[recordType].slice().sort(bySortOrder);
      const nextOrder = sorted.length + 1;
      const label = `Stage ${nextOrder}`;
      const key = slugifyStageKey(label) || `stage_${nextOrder}`;
      const nextStage: StageConfig = {
        key,
        label,
        colorBg: "#E2E8F0",
        colorText: "#1F2937",
        isActive: true,
        sortOrder: nextOrder
      };
      return { ...prev, [recordType]: [...sorted, nextStage] };
    });
  }, []);

  const handleSaveStages = async () => {
    const stages = stageEditor[stageTab].slice().sort(bySortOrder);
    if (!stages.some((stage) => stage.isActive)) {
      setStageError("At least one active stage is required.");
      return;
    }
    setStageSaving(true);
    setStageError("");
    try {
      const normalized = stages.map((stage, idx) => ({
        ...stage,
        sortOrder: idx + 1
      }));

      await Promise.all(
        normalized.map(async (stage) => {
          if (!stage.label.trim()) {
            throw new Error("Stage label is required.");
          }
          const stageKey =
            stage.key?.trim() ||
            slugifyStageKey(stage.label) ||
            `stage_${stage.sortOrder ?? 0}`;
          if (!stage.id) {
            const response = await fetch("/api/admin/crm-stages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                record_type: stageTab,
                stage_key: stageKey,
                label: stage.label.trim(),
                sort_order: stage.sortOrder ?? 0,
                color_bg: stage.colorBg,
                color_text: stage.colorText,
                is_active: stage.isActive !== false
              })
            });
            if (!response.ok) {
              throw new Error(await parseError(response));
            }
          } else {
            const response = await fetch("/api/admin/crm-stages", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: stage.id,
                label: stage.label.trim(),
                sort_order: stage.sortOrder ?? 0,
                color_bg: stage.colorBg,
                color_text: stage.colorText,
                is_active: stage.isActive !== false
              })
            });
            if (!response.ok) {
              throw new Error(await parseError(response));
            }
          }
        })
      );

      const refreshed = await fetch("/api/admin/crm-stages");
      if (!refreshed.ok) {
        throw new Error(await parseError(refreshed));
      }
      const stageRows = (await refreshed.json()) as StageRecord[];
      const resultByType = {
        prospect: stageRows
          .filter((stage) => stage.record_type === "prospect")
          .map(toStageConfig),
        student: stageRows
          .filter((stage) => stage.record_type === "student")
          .map(toStageConfig)
      };
      const nextStages = {
        prospect:
          resultByType.prospect.length > 0
            ? resultByType.prospect
            : fallbackProspectStages,
        student:
          resultByType.student.length > 0
            ? resultByType.student
            : fallbackStudentStages
      };
      setStagesByType(nextStages);
      setStageEditor({
        prospect: nextStages.prospect.slice(),
        student: nextStages.student.slice()
      });
      setIsStageModalOpen(false);
    } catch (err) {
      setStageError((err as Error)?.message || "Failed to save stages.");
    } finally {
      setStageSaving(false);
    }
  };

  const handleCreateRecord = async () => {
    if (!addForm.name.trim()) {
      setAddError("Student name is required.");
      return;
    }
    setAddLoading(true);
    setAddError("");
    try {
      const response = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name.trim(),
          parent_id: addForm.parent_id || null,
          assigned_teacher_id: addForm.assigned_teacher_id || null,
          class_id: addForm.class_id || null,
          record_type: addForm.record_type,
          crm_stage: addForm.crm_stage,
          identification_number: addForm.identification_number,
          address: addForm.address,
          parent_name: addForm.parent_name,
          parent_contact_number: addForm.parent_contact_number,
          parent_occupation: addForm.parent_occupation,
          household_income: addForm.household_income,
          interviewer_remark: addForm.interviewer_remark,
          crm_status_reason: addForm.crm_status_reason,
          student_id_no: addForm.student_id_no,
          date_of_birth: addForm.date_of_birth,
          birth_place: addForm.birth_place,
          gender: addForm.gender,
          religion: addForm.religion,
          admission_date: addForm.admission_date,
          leaving_date: addForm.leaving_date,
          reason_leaving: addForm.reason_leaving
        })
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const created = (await response.json()) as StudentRecord;
      setStudents((prev) =>
        [...prev, created].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        )
      );
      setIsAddModalOpen(false);
    } catch (err) {
      setAddError((err as Error)?.message || "Failed to create record.");
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <AdminNavbar />
      <div className="relative p-4 sm:p-6">
        <header className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Student CRM</h1>
              <p className="text-gray-600">
                Track prospects and manage student lifecycle stages.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStageEditor({
                    prospect: stagesByType.prospect.slice(),
                    student: stagesByType.student.slice()
                  });
                  setStageTab(view);
                  setStageError("");
                  setIsStageModalOpen(true);
                }}
              >
                <Settings className="h-4 w-4" />
                Manage Stages
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => openAddModal("prospect")}
              >
                <UserPlus className="h-4 w-4" />
                Add Prospect
              </Button>
              <Button type="button" onClick={() => openAddModal("student")}>
                <Plus className="h-4 w-4" />
                Add Student
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card className="p-4 mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView("prospect")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  view === "prospect"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                )}
              >
                Prospects
              </button>
              <button
                type="button"
                onClick={() => setView("student")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  view === "student"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                )}
              >
                Students
              </button>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
              <input
                type="text"
                placeholder="Search name, parent, phone..."
                className="w-full md:w-72 border-gray-300 rounded-md shadow-sm p-2 border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <select
                className="w-full md:w-56 border-gray-300 rounded-md shadow-sm p-2 border"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
              >
                <option value="">All Classes</option>
                <option value="unassigned">Unassigned</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                className="w-full md:w-56 border-gray-300 rounded-md shadow-sm p-2 border"
                value={filterTeacher}
                onChange={(e) => setFilterTeacher(e.target.value)}
              >
                <option value="">All Teachers</option>
                <option value="unassigned">Unassigned</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {loading ? (
          <Card className="p-6 text-center text-gray-500">
            Loading CRM board...
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stageConfig.map((stage) => {
              const stageStudents = groupedByStage.get(stage.key) || [];
              return (
                <div key={stage.key} className="min-w-[260px] w-72">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: stage.colorBg,
                          color: stage.colorText
                        }}
                      >
                        {stage.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        {stageStudents.length}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "mt-3 min-h-[120px] rounded-xl border border-dashed border-slate-200 p-2 transition",
                        dragOverStage === stage.key
                          ? "border-slate-400 bg-slate-50"
                          : "bg-white/70"
                      )}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverStage(stage.key);
                      }}
                      onDragLeave={() => setDragOverStage(null)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const data = event.dataTransfer.getData("text/plain");
                        handleDrop(stage.key, data || draggingId || "");
                        setDragOverStage(null);
                        setDraggingId(null);
                      }}
                    >
                      <div className="flex flex-col gap-3">
                        {stageStudents.map((student) => {
                          const parent =
                            student.parent_id &&
                            parentById.get(student.parent_id)?.name;
                          const parentDisplay = parent || student.parent_name;
                          const contact = student.parent_contact_number || "";
                          const whatsappLink = buildWhatsappLink(contact);
                          const className = student.class_id
                            ? classById.get(student.class_id)?.name
                            : "";
                          const teacherName = student.assigned_teacher_id
                            ? teacherById.get(student.assigned_teacher_id)?.name
                            : "";

                          return (
                            <div
                              key={student.id}
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData(
                                  "text/plain",
                                  student.id
                                );
                                event.dataTransfer.effectAllowed = "move";
                                setDraggingId(student.id);
                              }}
                              onDragEnd={() => setDraggingId(null)}
                              className={cn(
                                "rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md",
                                draggingId === student.id && "opacity-60"
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => openDetails(student)}
                                className="w-full text-left"
                              >
                                <div className="text-sm font-semibold text-slate-900">
                                  {student.name}
                                </div>
                                {parentDisplay && (
                                  <div className="text-xs text-slate-500">
                                    {parentDisplay}
                                  </div>
                                )}
                                {contact && (
                                  <div className="text-xs text-slate-400">
                                    {contact}
                                  </div>
                                )}
                              </button>
                              {whatsappLink && (
                                <a
                                  href={whatsappLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                >
                                  WhatsApp
                                </a>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                                {className && (
                                  <span className="rounded-full bg-slate-100 px-2 py-1">
                                    {className}
                                  </span>
                                )}
                                {teacherName && (
                                  <span className="rounded-full bg-slate-100 px-2 py-1">
                                    {teacherName}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {stageStudents.length === 0 && (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-xs text-slate-400">
                            Drop a card here
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedStudent && detailForm && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDetails}
          />
          <div className="relative ml-auto h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-100 p-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Student Details
                </h2>
                <p className="text-sm text-gray-500">
                  Update CRM stage and profile information.
                </p>
              </div>
              <button
                onClick={closeDetails}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close details drawer"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <StudentFormFields
                form={detailForm}
                stageOptions={resolveActiveStages(
                  stagesByType[detailForm.record_type],
                  detailForm.record_type === "prospect"
                    ? fallbackProspectStages
                    : fallbackStudentStages
                )}
                parents={parents}
                teachers={teachers}
                classes={classes}
                onChange={handleDetailChange}
              />

              {detailError && (
                <p className="text-sm text-red-500">{detailError}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {detailForm.record_type === "prospect" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleConvertToStudent}
                  >
                    Convert to Student
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteRecord}
                  disabled={detailDeleting}
                >
                  {detailDeleting ? "Deleting..." : "Delete"}
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveDetails}
                  disabled={detailSaving}
                >
                  {detailSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isStageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between border-b border-gray-100 p-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Manage CRM Stages
                </h2>
                <p className="text-sm text-gray-500">
                  Configure pipeline stages for prospects and students.
                </p>
              </div>
              <button
                onClick={() => setIsStageModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close stage settings modal"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(85vh-96px)]">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStageTab("prospect")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    stageTab === "prospect"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  )}
                >
                  Prospect Stages
                </button>
                <button
                  type="button"
                  onClick={() => setStageTab("student")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    stageTab === "student"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  )}
                >
                  Student Stages
                </button>
              </div>

              <div className="space-y-3">
                {stageList.map((stage, index) => {
                  const identifier = stage.id ?? stage.key;
                  return (
                    <div
                      key={identifier}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6 lg:items-center">
                        <div className="lg:col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Label
                          </label>
                          <input
                            type="text"
                            className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                            value={stage.label}
                            onChange={(e) => {
                              const label = e.target.value;
                              updateStageDraft(stageTab, identifier, {
                                label,
                                key: stage.id
                                  ? stage.key
                                  : slugifyStageKey(label) || stage.key
                              });
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Key
                          </label>
                          <input
                            type="text"
                            className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                            value={stage.key}
                            disabled={Boolean(stage.id)}
                            onChange={(e) =>
                              updateStageDraft(stageTab, identifier, {
                                key: slugifyStageKey(e.target.value) || stage.key
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Background
                          </label>
                          <input
                            type="color"
                            value={stage.colorBg}
                            onChange={(e) =>
                              updateStageDraft(stageTab, identifier, {
                                colorBg: e.target.value
                              })
                            }
                            className="h-9 w-full rounded-md border border-slate-200 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Text
                          </label>
                          <input
                            type="color"
                            value={stage.colorText}
                            onChange={(e) =>
                              updateStageDraft(stageTab, identifier, {
                                colorText: e.target.value
                              })
                            }
                            className="h-9 w-full rounded-md border border-slate-200 bg-white"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={stage.isActive !== false}
                              onChange={(e) =>
                                updateStageDraft(stageTab, identifier, {
                                  isActive: e.target.checked
                                })
                              }
                            />
                            Active
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => moveStage(stageTab, index, index - 1)}
                            disabled={index === 0}
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => moveStage(stageTab, index, index + 1)}
                            disabled={index === stageList.length - 1}
                          >
                            Down
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {stageError && (
                <p className="text-sm text-red-500">{stageError}</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addStageDraft(stageTab)}
                >
                  Add Stage
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsStageModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveStages}
                    disabled={stageSaving}
                  >
                    {stageSaving ? "Saving..." : "Save Stages"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between border-b border-gray-100 p-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Add {addTitle}
                </h2>
                <p className="text-sm text-gray-500">
                  Create a new CRM record.
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close add modal"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(85vh-96px)]">
              <StudentFormFields
                form={addForm}
                stageOptions={resolveActiveStages(
                  stagesByType[addForm.record_type],
                  addForm.record_type === "prospect"
                    ? fallbackProspectStages
                    : fallbackStudentStages
                )}
                parents={parents}
                teachers={teachers}
                classes={classes}
                onChange={handleAddChange}
              />

              {addError && <p className="text-sm text-red-500">{addError}</p>}

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleCreateRecord}
                  disabled={addLoading}
                >
                  {addLoading ? "Saving..." : "Create Record"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
