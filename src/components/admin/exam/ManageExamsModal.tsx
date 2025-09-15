"use client";

import React from "react";
import { X, Edit, Trash2, FileText } from "lucide-react";

interface ExamItem {
  id: string;
  name: string;
  type: string;
  exam_classes?: { conduct_weightage: number; classes?: { id: string; name: string } }[];
  exam_subjects?: { subjects?: { id: string; name: string } }[];
  exam_class_subjects?: { classes?: { id: string; name: string }; subjects?: { id: string; name: string } }[];
  released?: boolean;
}

interface ManageExamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  exams: ExamItem[];
  selectedExam: string;
  onSelectExam: (examId: string) => void;
  onEdit: (exam: ExamItem) => void;
  onDelete: (examId: string, examName: string) => void;
  onToggleRelease?: (exam: ExamItem, next: boolean) => void;
}

export default function ManageExamsModal({
  isOpen,
  onClose,
  exams,
  selectedExam,
  onSelectExam,
  onEdit,
  onDelete,
  onToggleRelease,
}: ManageExamsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10001] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Manage Exams</h2>
              <p className="text-sm text-gray-600">Select, edit, or delete exams</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {exams.length === 0 ? (
            <div className="text-center text-gray-600">No exams available.</div>
          ) : (
            <div className="space-y-2">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between p-3 bg-gray-50/70 rounded-xl hover:bg-gray-100/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        selectedExam === exam.id ? "bg-blue-500" : "bg-gray-300"
                      }`}
                    ></div>
                    <div>
                      <h3 className="font-medium text-gray-900">{exam.name}</h3>
                      <p className="text-sm text-gray-500 capitalize">{exam.type} exam</p>
                      {(() => {
                        const classCount = Array.isArray(exam.exam_classes) ? exam.exam_classes.length : undefined;
                        const pairCount = Array.isArray(exam.exam_class_subjects) ? exam.exam_class_subjects.length : undefined;
                        const subjCount = Array.isArray(exam.exam_subjects)
                          ? new Set(
                              exam.exam_subjects
                                .map(es => es?.subjects?.id)
                                .filter((x): x is string => !!x)
                            ).size
                          : undefined;
                        const hasAny = (classCount ?? 0) > 0 || (pairCount ?? 0) > 0 || (subjCount ?? 0) > 0;
                        if (!hasAny) return null;
                        return (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {typeof classCount === 'number' ? `${classCount} class${classCount === 1 ? '' : 'es'}` : ''}
                            {typeof pairCount === 'number' ? `${classCount ? ' • ' : ''}${pairCount} class-subject pair${pairCount === 1 ? '' : 's'}` : ''}
                            {!pairCount && typeof subjCount === 'number' ? `${classCount ? ' • ' : ''}${subjCount} subject${subjCount === 1 ? '' : 's'}` : ''}
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectExam(exam.id)}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        selectedExam === exam.id
                          ? "bg-blue-100 text-blue-700 font-medium"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {selectedExam === exam.id ? "Selected" : "Select"}
                    </button>
                    <button
                      onClick={() => onToggleRelease && onToggleRelease(exam, !(exam.released ?? false))}
                      className={`px-3 py-1.5 text-sm rounded-lg border ${ (exam.released ?? false) ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                      aria-label={`Toggle release for ${exam.name}`}
                      title={(exam.released ?? false) ? 'Unrelease results' : 'Release results'}
                    >
                      {(exam.released ?? false) ? 'Released' : 'Release'}
                    </button>
                    <button
                      onClick={() => onEdit(exam)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                      aria-label={`Edit ${exam.name}`}
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(exam.id, exam.name)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 flex items-center gap-1"
                      aria-label={`Delete ${exam.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
