"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Playfair_Display, Source_Sans_3 } from "next/font/google";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { Switch } from "@/components/ui/Switch";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/Select";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/app/icon.png";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "600", "700"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  weight: ["400", "600", "700"],
});

const certificateOptions = [
  { value: "tamat", label: "Sijil Tamat Sekolah" },
  { value: "program", label: "Sijil Program" },
  { value: "hafazan", label: "Rekod Hafazan" },
  { value: "akademik", label: "Rekod Akademik" },
];

const statementPresets: Record<string, { bm: string; en: string }> = {
  tamat: {
    bm: "Dengan ini disahkan bahawa pelajar ini telah menamatkan pengajian di institusi kami dengan jayanya serta menunjukkan disiplin dan komitmen yang cemerlang sepanjang tempoh persekolahan.",
    en: "This is to certify that the student has successfully completed their studies at our institution and demonstrated exemplary discipline and commitment throughout their schooling period.",
  },
  program: {
    bm: "Diberikan kepada pelajar ini atas penyertaan aktif dan pencapaian cemerlang dalam program yang dianjurkan oleh institusi kami.",
    en: "Awarded to this student for active participation and outstanding achievement in a program organized by our institution.",
  },
  hafazan: {
    bm: "Diberikan sebagai pengiktirafan terhadap pencapaian hafazan dan penilaian semakan yang konsisten sepanjang tempoh pembelajaran.",
    en: "Presented in recognition of memorization achievement and consistent review assessments throughout the learning period.",
  },
  akademik: {
    bm: "Penyata rasmi prestasi akademik pelajar ini berdasarkan rekod peperiksaan dan penilaian institusi.",
    en: "An official academic performance record based on the institution's examinations and assessments.",
  },
};

const parseMyKadDob = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 6) return "";
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return "";
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  const currentYear = new Date().getFullYear();
  const currentYY = currentYear % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const fullYear = century + yy;
  const date = new Date(fullYear, mm - 1, dd);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getFullYear() !== fullYear || date.getMonth() !== mm - 1 || date.getDate() !== dd) {
    return "";
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

const calculateAge = (dob: string, onDate: string) => {
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

const formatAgeLabel = (age: number | null) => (age === null ? "—" : `${age} years old`);

const formatDate = (value: string) => {
  if (!value) return "—";
  const parsed = parseLocalDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

type Student = {
  id: string;
  name: string;
  identification_number?: string | null;
  class_id?: string | null;
  student_id_no?: string | null;
  date_of_birth?: string | null;
  birth_place?: string | null;
  gender?: string | null;
  religion?: string | null;
  admission_date?: string | null;
  leaving_date?: string | null;
  reason_leaving?: string | null;
};

type ClassItem = {
  id: string;
  name: string;
  level?: string | null;
};

export default function CertificatesPage() {
  const today = new Date();
  const defaultDate = today.toISOString().slice(0, 10);
  const year = today.getFullYear();

  const [certificateType, setCertificateType] = useState("tamat");
  const [language, setLanguage] = useState("bm");
  const [orientation, setOrientation] = useState("portrait");
  const [showWatermark, setShowWatermark] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [studentId, setStudentId] = useState("040512-10-1234");
  const [studentClass, setStudentClass] = useState("Tingkatan 5 Al-Kindi");
  const [programName, setProgramName] = useState("Program Kecemerlangan Akademik");
  const [session, setSession] = useState(`${year}`);
  const [location, setLocation] = useState("Shah Alam, Selangor");
  const [issueDate, setIssueDate] = useState(defaultDate);
  const [principalName, setPrincipalName] = useState("Pn. Siti Nurhayati");
  const [principalTitle, setPrincipalTitle] = useState("Pengetua");
  const [serialNumber, setSerialNumber] = useState(`SKL-${year}-000128`);
  const [statement, setStatement] = useState(statementPresets.tamat.bm);
  const [statementCustom, setStatementCustom] = useState(false);
  const [studentIdNo, setStudentIdNo] = useState("L29");
  const [studentBirthPlace, setStudentBirthPlace] = useState("Kedah, Malaysia");
  const [studentGender, setStudentGender] = useState("Male");
  const [studentReligion, setStudentReligion] = useState("Islam");
  const [reasonLeaving, setReasonLeaving] = useState("Graduated from school");
  const [hafazanSurah, setHafazanSurah] = useState("");
  const [hafazanPage, setHafazanPage] = useState("");
  const [hafazanAyah, setHafazanAyah] = useState("");
  const [hafazanGrade, setHafazanGrade] = useState("");
  const [hafazanLoading, setHafazanLoading] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentError, setStudentError] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const studentListRef = useRef<HTMLDivElement>(null);

  const statementDefault = useMemo(() => {
    const preset = statementPresets[certificateType] || statementPresets.tamat;
    return language === "en" ? preset.en : preset.bm;
  }, [certificateType, language]);

  const handleTypeChange = (value: string) => {
    setCertificateType(value);
    if (!statementCustom) {
      setStatement(statementPresets[value]?.[language === "en" ? "en" : "bm"] ?? statementDefault);
    }
  };

  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    if (!statementCustom) {
      const preset = statementPresets[certificateType] || statementPresets.tamat;
      setStatement(value === "en" ? preset.en : preset.bm);
    }
  };

  const resetStatement = () => {
    setStatement(statementDefault);
    setStatementCustom(false);
  };

  const certTitle = useMemo(() => {
    const map: Record<string, { bm: string; en: string }> = {
      tamat: { bm: "Sijil Tamat Sekolah", en: "Certificate of School Completion" },
      program: { bm: "Sijil Program", en: "Program Certificate" },
      hafazan: { bm: "Sijil Rekod Hafazan", en: "Memorization Record" },
      akademik: { bm: "Sijil Rekod Akademik", en: "Academic Record" },
    };
    const entry = map[certificateType] || map.tamat;
    return language === "en" ? entry.en : entry.bm;
  }, [certificateType, language]);

  const classLabels = useMemo(() => {
    return new Map(
      classes.map((entry) => {
        const label = entry.level ? `${entry.level} ${entry.name}` : entry.name;
        return [entry.id, label];
      })
    );
  }, [classes]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const selectedStudentName = selectedStudent?.name || "";

  const selectedStudentLabel = useMemo(() => {
    if (selectedStudent) return selectedStudent.name;
    if (studentLoading) return "Loading...";
    return "Pilih pelajar";
  }, [selectedStudent, studentLoading]);
  const normalizedStudentQuery = studentQuery.trim().toLowerCase();

  const derivedDob = selectedStudent?.date_of_birth || parseMyKadDob(studentId);
  const admissionDateValue = selectedStudent?.admission_date || "";
  const leavingDateValue = selectedStudent?.leaving_date || "";
  const admissionAgeValue = formatAgeLabel(calculateAge(derivedDob, admissionDateValue));
  const leavingAgeValue = formatAgeLabel(calculateAge(derivedDob, leavingDateValue));

  const attendanceRecordValue = "—";
  const conductRecordValue = "—";
  const clubSportValue = "—";
  const clubPositionValue = "—";
  const participationAchievementValue = "—";

  const leavingTitle = language === "en" ? "SCHOOL LEAVING CERTIFICATE" : "SIJIL TAMAT SEKOLAH";

  const leavingLeftFields = useMemo(
    () => [
      { no: "1.", label: "Student's Name", value: selectedStudentName || "—" },
      { no: "2.", label: "Identity Card No. / Passport No.", value: studentId || "—" },
      { no: "3.", label: "Date of Birth", value: formatDate(derivedDob) },
      { no: "4.", label: "Place of Birth / Nation", value: studentBirthPlace || "—" },
      { no: "5.", label: "School-admission age", value: admissionAgeValue },
      { no: "6.", label: "School-leaving age", value: leavingAgeValue },
      { no: "7.", label: "Reason of Leaving", value: reasonLeaving || "—" },
      { no: "8.", label: "Full Attendance Record", value: attendanceRecordValue },
    ],
    [
      selectedStudentName,
      studentId,
      derivedDob,
      studentBirthPlace,
      admissionAgeValue,
      leavingAgeValue,
      reasonLeaving,
      attendanceRecordValue
    ]
  );

  const leavingRightFields = useMemo(
    () => [
      { no: "11.", label: "Student's ID No.", value: studentIdNo || "—" },
      { no: "12.", label: "Gender", value: studentGender || "—" },
      { no: "13.", label: "Religion", value: studentReligion || "—" },
      { no: "14.", label: "Date of School Admission", value: formatDate(admissionDateValue) },
      { no: "15.", label: "Date of Leaving School", value: formatDate(leavingDateValue) },
      { no: "16.", label: "Conduct and Discipline Record", value: conductRecordValue },
    ],
    [studentIdNo, studentGender, studentReligion, admissionDateValue, leavingDateValue, conductRecordValue]
  );

  const filteredStudents = useMemo(() => {
    if (!normalizedStudentQuery) {
      return [...students].sort((a, b) => a.name.localeCompare(b.name));
    }

    const ranked = students
      .map((student) => {
        const name = student.name?.toLowerCase() ?? "";
        if (!name) return null;
        if (name.startsWith(normalizedStudentQuery)) return { student, score: 2 };
        if (name.includes(normalizedStudentQuery)) return { student, score: 1 };
        return null;
      })
      .filter(Boolean) as Array<{ student: Student; score: number }>;

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.student.name.localeCompare(b.student.name);
    });

    return ranked.map((entry) => entry.student);
  }, [students, normalizedStudentQuery]);

  useEffect(() => {
    if (!studentOpen) return;
    if (studentListRef.current) {
      studentListRef.current.scrollTop = 0;
    }
  }, [studentOpen, studentQuery, filteredStudents.length]);

  const hasLoadedStudents = useRef(false);

  useEffect(() => {
    if (hasLoadedStudents.current) return;
    let isMounted = true;
    const load = async () => {
      setStudentLoading(true);
      setStudentError("");
      try {
        const [studentsRes, classesRes] = await Promise.all([
          fetch("/api/admin/students"),
          fetch("/api/admin/classes"),
        ]);

        if (!studentsRes.ok) {
          throw new Error("Gagal memuatkan pelajar");
        }
        if (!classesRes.ok) {
          throw new Error("Gagal memuatkan kelas");
        }

        const studentsData = (await studentsRes.json()) as Student[];
        const classesData = (await classesRes.json()) as ClassItem[];

        if (!isMounted) return;
        setStudents(Array.isArray(studentsData) ? studentsData : []);
        setClasses(Array.isArray(classesData) ? classesData : []);

        if (!selectedStudentId && Array.isArray(studentsData) && studentsData.length > 0) {
          setSelectedStudentId(studentsData[0].id);
        }
        hasLoadedStudents.current = true;
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "Gagal memuatkan data pelajar.";
        setStudentError(message);
      } finally {
        if (isMounted) setStudentLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedStudent) return;
    setStudentId(selectedStudent.identification_number || "");
    const classLabel = selectedStudent.class_id ? classLabels.get(selectedStudent.class_id) : "";
    setStudentClass(classLabel || "");
    setStudentIdNo(selectedStudent.student_id_no || "");
    setStudentBirthPlace(selectedStudent.birth_place || "");
    setStudentGender(selectedStudent.gender || "");
    setStudentReligion(selectedStudent.religion || "");
    setReasonLeaving(selectedStudent.reason_leaving || "");
  }, [selectedStudent, classLabels]);

  useEffect(() => {
    let isMounted = true;
    const fetchHafazan = async () => {
      if (!selectedStudentId) {
        setHafazanSurah("");
        setHafazanPage("");
        setHafazanAyah("");
        setHafazanGrade("");
        return;
      }
      setHafazanLoading(true);
      try {
        const response = await fetch(
          `/api/admin/student-reports?studentId=${selectedStudentId}&viewMode=tasmik`
        );
        if (!response.ok) {
          throw new Error("Gagal memuatkan rekod tasmi");
        }
        const data = (await response.json()) as Array<{
          surah: string;
          juzuk: number | null;
          ayat_from: number;
          ayat_to: number;
          page_from: number | null;
          page_to: number | null;
          grade: string | null;
        }>;
        if (!isMounted) return;
        if (!Array.isArray(data) || data.length === 0) {
          setHafazanSurah("");
          setHafazanPage("");
          setHafazanAyah("");
          setHafazanGrade("");
          return;
        }
        const latest = data[0];
        const surahLabel = latest.juzuk ? `${latest.surah} (Juz ${latest.juzuk})` : latest.surah;
        const pageMin = latest.page_from ?? latest.page_to;
        const pageMax = latest.page_to ?? latest.page_from;
        const pageLabel =
          pageMin && pageMax && pageMin !== pageMax ? `${Math.min(pageMin, pageMax)}-${Math.max(pageMin, pageMax)}` : `${pageMin ?? ""}`;
        const ayahLabel =
          latest.ayat_from && latest.ayat_to && latest.ayat_from !== latest.ayat_to
            ? `${latest.ayat_from}-${latest.ayat_to}`
            : `${latest.ayat_from ?? ""}`;
        const gradeLabel = latest.grade
          ? latest.grade.charAt(0).toUpperCase() + latest.grade.slice(1)
          : "";

        setHafazanSurah(surahLabel || "");
        setHafazanPage(pageLabel || "");
        setHafazanAyah(ayahLabel || "");
        setHafazanGrade(gradeLabel || "");
      } catch {
        if (!isMounted) return;
        setHafazanSurah("");
        setHafazanPage("");
        setHafazanAyah("");
        setHafazanGrade("");
      } finally {
        if (isMounted) setHafazanLoading(false);
      }
    };

    fetchHafazan();
    return () => {
      isMounted = false;
    };
  }, [selectedStudentId]);

  return (
    <div className="min-h-screen">
      <AdminNavbar />
      <main className="mx-auto w-full max-w-7xl px-6 pb-16 pt-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Certificate Studio</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">Generator Sijil Premium</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Hasilkan sijil formal dengan gaya institusi rasmi. Lengkap dengan serial number, bilingual, dan preview A4.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-300 bg-white/80">Save Draft</Button>
            <Button variant="secondary" className="bg-slate-900 text-white hover:bg-slate-800">Export PDF</Button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card className="border border-slate-200/80 bg-white/90 p-0 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-200/70 px-6 py-5">
              <h2 className="text-base font-semibold text-slate-900">Maklumat Sijil</h2>
              <p className="mt-1 text-xs text-slate-500">Isi semua butiran yang diperlukan untuk sijil rasmi.</p>
            </div>
            <div className="space-y-6 px-6 py-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Jenis Sijil</label>
                <Select value={certificateType} onValueChange={handleTypeChange}>
                  <SelectTrigger value={certificateType}>
                    {certificateOptions.find((opt) => opt.value === certificateType)?.label ?? "Pilih"}
                  </SelectTrigger>
                  <SelectContent>
                    {certificateOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Bahasa</label>
                <RadioGroup value={language} onValueChange={handleLanguageChange} className="gap-3">
                  <RadioGroupItem value="bm" className="rounded-full px-4 py-2 text-xs font-semibold">BM</RadioGroupItem>
                  <RadioGroupItem value="en" className="rounded-full px-4 py-2 text-xs font-semibold">EN</RadioGroupItem>
                </RadioGroup>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Maklumat Pelajar</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Pilih Pelajar</label>
                    <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={studentOpen}
                          className="w-full justify-between border-slate-200 bg-white text-left font-normal"
                        >
                          {selectedStudentLabel}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Cari pelajar..."
                            value={studentQuery}
                            onValueChange={setStudentQuery}
                          />
                          <CommandList ref={studentListRef}>
                            {studentLoading && (
                              <CommandGroup>
                                <CommandItem value="loading" className="text-slate-500">
                                  Memuatkan pelajar...
                                </CommandItem>
                              </CommandGroup>
                            )}
                            {!studentLoading && studentError && (
                              <CommandGroup>
                                <CommandItem value="error" className="text-rose-600">
                                  {studentError}
                                </CommandItem>
                              </CommandGroup>
                            )}
                            {!studentLoading && !studentError && filteredStudents.length === 0 && (
                              <CommandGroup>
                                <CommandItem value="empty" className="text-slate-500">
                                  Tiada pelajar ditemui.
                                </CommandItem>
                              </CommandGroup>
                            )}
                            {!studentLoading && !studentError && filteredStudents.length > 0 && (
                              <CommandGroup>
                                {filteredStudents.map((student) => (
                                  <CommandItem
                                    key={student.id}
                                    value={student.name}
                                    onSelect={() => {
                                      setSelectedStudentId(student.id);
                                      setStudentOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedStudentId === student.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {student.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="No. Kad Pengenalan" />
                  <Input value={studentClass} onChange={(e) => setStudentClass(e.target.value)} placeholder="Kelas / Tingkatan" />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Butiran Program</p>
                <div className="space-y-3">
                  <Input value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="Nama program" />
                  <Input value={session} onChange={(e) => setSession(e.target.value)} placeholder="Sesi / Tahun" />
                </div>
              </div>

              {certificateType === "tamat" && (
                <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Butiran Tamat Sekolah</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Student ID No.</label>
                        <Input value={studentIdNo} onChange={(e) => setStudentIdNo(e.target.value)} placeholder="L29" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Tarikh Lahir</label>
                        <Input type="text" value={formatDate(derivedDob)} readOnly className="bg-slate-100 text-slate-500" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Tempat Lahir / Negara</label>
                      <Input value={studentBirthPlace} onChange={(e) => setStudentBirthPlace(e.target.value)} placeholder="Kedah, Malaysia" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Jantina</label>
                        <Input value={studentGender} onChange={(e) => setStudentGender(e.target.value)} placeholder="Male" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Agama</label>
                        <Input value={studentReligion} onChange={(e) => setStudentReligion(e.target.value)} placeholder="Islam" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Tarikh Kemasukan</label>
                        <Input type="text" value={formatDate(admissionDateValue)} readOnly className="bg-slate-100 text-slate-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Tarikh Tamat Sekolah</label>
                        <Input type="text" value={formatDate(leavingDateValue)} readOnly className="bg-slate-100 text-slate-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Umur Kemasukan</label>
                        <Input value={admissionAgeValue} readOnly className="bg-slate-100 text-slate-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Umur Tamat Sekolah</label>
                        <Input value={leavingAgeValue} readOnly className="bg-slate-100 text-slate-500" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Sebab Berhenti</label>
                      <Input value={reasonLeaving} onChange={(e) => setReasonLeaving(e.target.value)} placeholder="Graduated from school" />
                    </div>
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Rekod Hafazan (Auto)</p>
                      <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600">
                        <div>Surah: <span className="font-semibold text-slate-800">{hafazanSurah || "—"}</span></div>
                        <div>Page: <span className="font-semibold text-slate-800">{hafazanPage || "—"}</span></div>
                        <div>Ayah: <span className="font-semibold text-slate-800">{hafazanAyah || "—"}</span></div>
                        <div>Grade: <span className="font-semibold text-slate-800">{hafazanGrade || "—"}</span></div>
                        {hafazanLoading && <div className="text-[11px] text-slate-400">Memuatkan rekod...</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Pernyataan Rasmi</p>
                  <button
                    type="button"
                    className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-800"
                    onClick={resetStatement}
                  >
                    Reset
                  </button>
                </div>
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                  value={statement}
                  onChange={(e) => {
                    setStatement(e.target.value);
                    setStatementCustom(true);
                  }}
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Tarikh & Lokasi</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lokasi" />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Pengesahan</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input value={principalName} onChange={(e) => setPrincipalName(e.target.value)} placeholder="Nama penandatangan" />
                  <Input value={principalTitle} onChange={(e) => setPrincipalTitle(e.target.value)} placeholder="Jawatan" />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Serial & Layout</p>
                <div className="space-y-3">
                  <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Serial number" />
                  <RadioGroup value={orientation} onValueChange={setOrientation} className="gap-3">
                    <RadioGroupItem value="portrait" className="rounded-full px-4 py-2 text-xs font-semibold">Portrait</RadioGroupItem>
                    <RadioGroupItem value="landscape" className="rounded-full px-4 py-2 text-xs font-semibold">Landscape</RadioGroupItem>
                  </RadioGroup>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Watermark Logo</p>
                    <p className="text-xs text-slate-500">Ton lembut di belakang teks</p>
                  </div>
                  <Switch checked={showWatermark} onCheckedChange={setShowWatermark} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">QR Verification</p>
                    <p className="text-xs text-slate-500">Paparan QR kecil di penjuru</p>
                  </div>
                  <Switch checked={showQr} onCheckedChange={setShowQr} />
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="border border-slate-200/70 bg-white/85 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Live Preview</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">A4 Certificate</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="border-slate-300 bg-white/80">Preview Full</Button>
                  <Button variant="outline" className="border-slate-300 bg-white/80">Download PNG</Button>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                {certificateType === "tamat" ? (
                  <div
                    className={`${sourceSans.className} relative w-full max-w-[760px] overflow-hidden border border-amber-300/80 bg-white shadow-[0_30px_80px_rgba(120,113,108,0.2)]`}
                    style={{ aspectRatio: orientation === "portrait" ? "210 / 297" : "297 / 210" }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(252,211,77,0.12),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.1),transparent_60%)]" />
                    <div className="absolute inset-4 border-2 border-amber-400/70" />
                    <div className="absolute inset-6 border border-amber-300/60" />
                    <div className="absolute inset-2 border border-amber-300/80" />

                    {showWatermark && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-[0.05]">
                        <Image src={logo} alt="Logo watermark" className="w-72" />
                      </div>
                    )}

                    <div className="relative z-10 flex h-full flex-col px-10 py-8 text-[11px] text-slate-700">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start">
                        <div />
                        <div className="text-center">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-300 bg-white shadow-sm">
                            <Image src={logo} alt="Akademi Al Khayr" className="h-10 w-10 object-contain" />
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">Akademi Al Khayr</p>
                          <p className="text-[11px] text-slate-500">Al Khayr Management and Services (003343305-P)</p>
                          <p className="text-[11px] text-slate-500">
                            Mukim 7 & Mukim J, Kampung Genting, Daerah Barat Daya, 11000 Balik Pulau, Pulau Pinang
                          </p>
                          <p className="text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">Phone No.</span>: 019-381 8616{" "}
                            <span className="font-semibold text-slate-700">Website</span>: akademialkhayr.com{" "}
                            <span className="font-semibold text-slate-700">Email</span>: admin@akademialkhayr.com
                          </p>
                        </div>
                        <div className="flex justify-end">
                          <div className="text-right text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                            Serial No
                            <div className="mt-1 text-[11px] font-semibold text-slate-900">{serialNumber}</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 text-center">
                        <p className="text-lg font-semibold uppercase tracking-[0.2em] text-slate-800">
                          {leavingTitle}
                        </p>
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-6 text-[11px]">
                        <div className="space-y-3">
                          {leavingLeftFields.map((field) => (
                            <div key={field.no} className="grid grid-cols-[28px_1fr_1fr] gap-2">
                              <div className="text-slate-400">{field.no}</div>
                              <div className="font-medium text-slate-600">{field.label}</div>
                              <div className="font-semibold text-slate-900">{field.value}</div>
                            </div>
                          ))}

                          <div className="pt-2">
                            <div className="grid grid-cols-[28px_1fr] gap-2">
                              <div className="text-slate-400">9.</div>
                              <div className="font-semibold text-slate-900">Co-curriculum</div>
                            </div>
                            <div className="mt-2 grid grid-cols-[120px_1fr] gap-2">
                              <div className="text-slate-500">Club/Sport</div>
                              <div className="whitespace-pre-line font-semibold text-slate-900">{clubSportValue}</div>
                              <div className="text-slate-500">Position</div>
                              <div className="font-semibold text-slate-900">{clubPositionValue}</div>
                            </div>
                          </div>

                          <div className="pt-2">
                            <div className="grid grid-cols-[28px_1fr] gap-2">
                              <div className="text-slate-400">10.</div>
                              <div className="font-semibold text-slate-900">
                                Qur&apos;anic Memorization (Photographic Memory Memorization Method - PMMM)
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-[120px_1fr] gap-2">
                              <div className="text-slate-500">Surah</div>
                              <div className="font-semibold text-slate-900">{hafazanSurah || "—"}</div>
                              <div className="text-slate-500">Page</div>
                              <div className="font-semibold text-slate-900">{hafazanPage || "—"}</div>
                              <div className="text-slate-500">Ayah</div>
                              <div className="font-semibold text-slate-900">{hafazanAyah || "—"}</div>
                              <div className="text-slate-500">Grade</div>
                              <div className="font-semibold text-slate-900">{hafazanGrade || "—"}</div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {leavingRightFields.map((field) => (
                            <div key={field.no} className="grid grid-cols-[34px_1fr_1fr] gap-2">
                              <div className="text-slate-400">{field.no}</div>
                              <div className="font-medium text-slate-600">{field.label}</div>
                              <div className="font-semibold text-slate-900">{field.value}</div>
                            </div>
                          ))}

                          <div className="pt-2">
                            <div className="grid grid-cols-[34px_1fr] gap-2">
                              <div className="text-slate-400">17.</div>
                              <div className="font-semibold text-slate-900">Participation and Achievement</div>
                            </div>
                            <div className="mt-2 pl-[34px] font-semibold text-slate-900">
                              {participationAchievementValue}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-10 flex items-end justify-between">
                        <div className="text-center">
                          <div className="mx-auto h-[1px] w-40 bg-slate-300" />
                          <div className="mt-2 text-xs font-semibold text-slate-900">Dr. Kamilin Jamilin</div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            Chairman of Akademi Al Khayr
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-16 w-16 rounded-full border-2 border-slate-200 bg-white" />
                          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Official Stamp</div>
                        </div>
                        <div className="text-center">
                          <div className="mx-auto h-[1px] w-40 bg-slate-300" />
                          <div className="mt-2 text-xs font-semibold text-slate-900">{principalName}</div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            Principal of Akademi Al Khayr
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`${sourceSans.className} relative w-full max-w-[720px] overflow-hidden rounded-[28px] border border-amber-200/60 bg-[#fdfbf6] shadow-[0_30px_80px_rgba(120,113,108,0.25)]`}
                    style={{ aspectRatio: orientation === "portrait" ? "210 / 297" : "297 / 210" }}
                  >
                    <div className="absolute inset-0">
                      <div className="absolute -left-20 -top-28 h-64 w-64 rounded-full bg-amber-100/60 blur-3xl" />
                      <div className="absolute -right-24 -bottom-28 h-72 w-72 rounded-full bg-emerald-100/40 blur-3xl" />
                    </div>

                    {showWatermark && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-[0.08]">
                        <Image src={logo} alt="Logo watermark" className="w-56" />
                      </div>
                    )}

                    <div className="relative z-10 flex h-full flex-col justify-between px-12 py-10">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200/80 bg-white shadow-sm">
                            <Image src={logo} alt="School logo" className="h-10 w-10 object-contain" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-semibold text-slate-800">Akademi Al Khayr</p>
                          </div>
                        </div>
                        <div className="text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                          Serial No
                          <div className="mt-1 text-sm font-semibold text-slate-800">{serialNumber}</div>
                        </div>
                      </div>

                      <div className="text-center">
                        <p className={`${playfair.className} text-3xl font-semibold uppercase tracking-[0.25em] text-amber-700`}>
                          {certTitle}
                        </p>
                        <div className="mt-8 space-y-2">
                          <p className={`${playfair.className} text-2xl font-semibold text-slate-900`}>
                            {selectedStudentName || "Nama Pelajar"}
                          </p>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                            {studentId || "No. Kad Pengenalan"} • {studentClass || "Kelas"}
                          </p>
                        </div>
                        <div className="mt-8 px-6 text-sm leading-relaxed text-slate-700">
                          {statement}
                        </div>
                        <div className="mt-6 text-xs uppercase tracking-[0.3em] text-slate-500">
                          {programName} • {session}
                        </div>
                      </div>

                      <div className="flex items-end justify-between">
                        <div className="text-left text-xs uppercase tracking-[0.3em] text-slate-500">
                          Dikeluarkan pada
                          <div className="mt-2 text-sm font-semibold text-slate-800">{formatDate(issueDate)}</div>
                          <div className="mt-1 text-xs text-slate-500">{location}</div>
                        </div>

                        <div className="flex items-end gap-6">
                          {showQr && (
                            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-300 bg-white">
                              <div className="grid grid-cols-4 gap-0.5">
                                {Array.from({ length: 16 }).map((_, idx) => (
                                  <div
                                    key={idx}
                                    className={`h-2 w-2 ${idx % 3 === 0 ? "bg-slate-800" : "bg-slate-200"}`}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="text-right">
                            <div className="h-[1px] w-40 bg-slate-400" />
                            <div className="mt-2 text-sm font-semibold text-slate-800">{principalName}</div>
                            <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{principalTitle}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="absolute inset-3 rounded-[22px] border border-amber-200/70" />
                    <div className="absolute inset-6 rounded-[18px] border border-amber-100/60" />
                  </div>
                )}
              </div>
            </Card>

            <Card className="border border-slate-200/70 bg-white/80 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Export</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">Output & Batch</h3>
                  <p className="mt-1 text-sm text-slate-500">Sokong output PDF/PNG dan batch CSV untuk skala besar.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-slate-300 bg-white/80">Upload CSV</Button>
                  <Button className="bg-amber-600 text-white hover:bg-amber-500">Generate Batch</Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
