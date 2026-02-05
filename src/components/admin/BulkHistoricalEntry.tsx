"use client";
import React, { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
}

interface HistoricalRecord {
  id: string;
  student_id: string;
  juzuk_from: number;
  juzuk_to: number;
  date: string;
  studentFilter: string;
}

export default function BulkHistoricalEntry() {
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<HistoricalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openStudentSelectorId, setOpenStudentSelectorId] = useState<string | null>(null);
  const strictFilter = (value: string, search: string) => {
    if (!search) return 1;
    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : -1;
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/students", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as Record<string, unknown>));
        throw new Error((j?.error as string) || `HTTP ${res.status}`);
      }
      const data: unknown = await res.json();
      const mapped: Student[] = (Array.isArray(data) ? data : []).map((s) => {
        const row = s as { id: string | number; name?: string | null };
        return { id: String(row.id), name: row.name || "Unnamed" };
      });
      setStudents(mapped);
    } catch (err: unknown) {
      setError("Failed to fetch students: " + ((err as Error)?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const addRecord = () => {
    const newRecord: HistoricalRecord = {
      id: Date.now().toString(),
      student_id: "",
      juzuk_from: 1,
      juzuk_to: 1,
      date: new Date().toISOString().split('T')[0],
      studentFilter: ""
    };
    setRecords([...records, newRecord]);
  };

  const updateRecord = (id: string, field: keyof HistoricalRecord, value: string | number) => {
    setRecords(records.map(record => 
      record.id === id ? { ...record, [field]: value } : record
    ));
  };

  const removeRecord = (id: string) => {
    setRecords(records.filter(record => record.id !== id));
  };

  const validateRecords = () => {
    for (const record of records) {
      if (!record.student_id || !record.juzuk_from || !record.juzuk_to) {
        return "Please fill in all required fields (Student, From Juz, To Juz) for all records.";
      }
      if (record.juzuk_from < 1 || record.juzuk_from > 30 || record.juzuk_to < 1 || record.juzuk_to > 30) {
        return "Juz numbers must be between 1 and 30.";
      }
      if (record.juzuk_from > record.juzuk_to) {
        return "From Juz cannot be greater than To Juz.";
      }
    }
    return null;
  };

  const submitRecords = async () => {
    const validationError = validateRecords();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitLoading(true);
    setError("");
    setSuccess("");

    const juzTestsToInsert: {
      student_id: string;
      juz_number: number;
      test_date: string;
      total_percentage: number;
      passed: boolean;
      examiner_name: string;
      remarks: string;
      should_repeat: boolean;
    }[] = [];
    
    records.forEach(record => {
      for (let juz = record.juzuk_from; juz <= record.juzuk_to; juz++) {
        juzTestsToInsert.push({
          student_id: record.student_id,
          juz_number: juz,
          test_date: record.date,
          total_percentage: 75, // Default passing score for historical records
          passed: true, // All historical entries are passed tests
          examiner_name: "Historical Entry",
          remarks: "Historical record entry",
          should_repeat: false
        });
      }
    });

    const { data, error } = await supabase
      .from("juz_tests")
      .insert(juzTestsToInsert)
      .select();

    if (error) {
      setError("Failed to submit records: " + error.message);
    } else if (data) {
      setSuccess(`Successfully added ${data.length} historical Juz test records!`);
      setRecords([]); // Clear the form
      setTimeout(() => setSuccess(""), 5000);
    }

    setSubmitLoading(false);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading students...</div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Bulk Historical Juz Test Entry</h2>
        <p className="text-gray-600 text-sm">
          Add historical Juz test records for students. Use From/To Juz fields to create multiple passed tests at once.
          Only passed tests are recorded. Date is optional - if not provided, today&apos;s date will be used.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <div className="mb-4">
        <Button onClick={addRecord} className="bg-blue-600 hover:bg-blue-700">
          Add Record
        </Button>
      </div>

      {records.length > 0 && (
        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-medium text-gray-800">Records to Add ({records.length})</h3>
          
          {records.map((record, index) => (
            <div key={record.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-800">Record #{index + 1}</h4>
                <button
                  onClick={() => removeRecord(record.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student <span className="text-red-500">*</span>
                  </label>
                  <Popover
                    open={openStudentSelectorId === record.id}
                    onOpenChange={(o) => setOpenStudentSelectorId(o ? record.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={false}
                        className={cn("w-full justify-between", !record.student_id && "text-muted-foreground")}
                      >
                        {record.student_id
                          ? students.find((s) => s.id === record.student_id)?.name
                          : "Select student"}
                        <ChevronsUpDown className="opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command filter={strictFilter}>
                        <CommandInput placeholder="Search student..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No student found.</CommandEmpty>
                          <CommandGroup>
                            {students.map((s) => (
                                <CommandItem
                                  key={s.id}
                                  value={s.name}
                                  onSelect={() => {
                                    updateRecord(record.id, "student_id", s.id)
                                    setOpenStudentSelectorId(null)
                                  }}
                                >
                                  {s.name}
                                  <Check
                                    className={cn(
                                      "ml-auto",
                                      record.student_id === s.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    From Juz <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={record.juzuk_from}
                    onChange={(e) => updateRecord(record.id, "juzuk_from", parseInt(e.target.value))}
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                    required
                  >
                    {Array.from({length: 30}, (_, i) => i + 1).map(num => (
                      <option key={num} value={num}>Juz {num}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    To Juz <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={record.juzuk_to}
                    onChange={(e) => updateRecord(record.id, "juzuk_to", parseInt(e.target.value))}
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                    required
                  >
                    {Array.from({length: 30}, (_, i) => i + 1).map(num => (
                      <option key={num} value={num}>Juz {num}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Result
                  </label>
                  <div className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm bg-green-50 text-green-700 font-medium">
                    ✓ Passed (All historical records are passed tests)
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={record.date}
                    onChange={(e) => updateRecord(record.id, "date", e.target.value)}
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {records.length > 0 && (
        <div className="border-t pt-4">
          <button
            onClick={submitRecords}
            disabled={submitLoading}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitLoading ? 'Submitting...' : `Submit ${records.length} Records`}
          </button>
        </div>
      )}

      {records.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Click &quot;Add Record&quot; to start entering historical Juz test data.
        </div>
      )}
    </Card>
  );
}
