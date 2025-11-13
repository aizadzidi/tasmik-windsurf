"use client";
import React, { useState, useEffect } from "react";
import { X, Plus, Edit, Trash2, Check } from "lucide-react";

interface Subject {
  id: string;
  name: string;
  description?: string;
}

interface ManageSubjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function ManageSubjectsModal({
  isOpen,
  onClose,
  onRefresh
}: ManageSubjectsModalProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  
  // Multi-select states
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());

  // Form states
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Fetch subjects
  const fetchSubjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/subjects');
      const data = await response.json();
      
      if (data.success) {
        setSubjects(data.subjects);
      } else {
        console.error('Failed to fetch subjects:', data.error);
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load subjects when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSubjects();
    }
  }, [isOpen]);

  // Handle create/edit form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setFormLoading(true);
    try {
      const isEditing = !!editingSubject;
      const url = isEditing ? `/api/admin/subjects?id=${editingSubject.id}` : '/api/admin/subjects';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchSubjects();
        onRefresh?.();
        handleCloseForm();
        alert(isEditing ? 'Subject updated successfully!' : 'Subject created successfully!');
      } else {
        alert(data.error || 'Failed to save subject');
      }
    } catch (error) {
      console.error('Error saving subject:', error);
      alert('Error saving subject');
    } finally {
      setFormLoading(false);
    }
  };

  // Multi-select handlers
  const handleSelectSubject = (subjectId: string) => {
    const newSelection = new Set(selectedSubjects);
    if (newSelection.has(subjectId)) {
      newSelection.delete(subjectId);
    } else {
      newSelection.add(subjectId);
    }
    setSelectedSubjects(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedSubjects.size === subjects.length) {
      setSelectedSubjects(new Set());
    } else {
      setSelectedSubjects(new Set(subjects.map(s => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSubjects.size === 0) return;
    
    const selectedNames = subjects
      .filter(s => selectedSubjects.has(s.id))
      .map(s => s.name)
      .join(', ');
    
    if (!confirm(`Are you sure you want to delete ${selectedSubjects.size} subject(s): ${selectedNames}?`)) return;

    try {
      setFormLoading(true);
      const subjectArray = Array.from(selectedSubjects);
      const deletePromises = subjectArray.map(subjectId =>
        fetch(`/api/admin/subjects?id=${subjectId}`, { method: 'DELETE' })
      );

      const responses = await Promise.all(deletePromises);
      const results = await Promise.all(responses.map(r => r.json()));

      const successfulDeletes = results.filter(r => r.success).length;
      const failedDeletes = results.filter(r => !r.success);
      
      if (failedDeletes.length === 0) {
        await fetchSubjects();
        onRefresh?.();
        setSelectedSubjects(new Set());
        alert(`Successfully deleted all ${selectedSubjects.size} subject(s)!`);
      } else {
        // Get specific error details
        const errorDetails = failedDeletes.map((result, index) => {
          const subjectId = subjectArray[results.indexOf(result)];
          const subjectName = subjects.find(s => s.id === subjectId)?.name || 'Unknown';
          return `• ${subjectName}: ${result.error}`;
        }).join('\n');

        const message = successfulDeletes > 0 
          ? `Successfully deleted ${successfulDeletes} subject(s), but ${failedDeletes.length} failed:\n\n${errorDetails}\n\nThe failed subjects are likely being used in exams or have exam results.`
          : `Failed to delete ${failedDeletes.length} subject(s):\n\n${errorDetails}\n\nThese subjects are likely being used in exams or have exam results.`;
        
        alert(message);
        
        // Refresh to update the list
        await fetchSubjects();
        onRefresh?.();
        
        // Clear only successfully deleted subjects from selection
        if (successfulDeletes > 0) {
          const remainingSelected = new Set<string>();
          failedDeletes.forEach((result, index) => {
            const subjectId = subjectArray[results.indexOf(result)];
            remainingSelected.add(subjectId);
          });
          setSelectedSubjects(remainingSelected);
        }
      }
    } catch (error) {
      console.error('Error bulk deleting subjects:', error);
      alert('Network error occurred while deleting subjects. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async (subject: Subject) => {
    if (!confirm(`Are you sure you want to delete "${subject.name}"?`)) return;

    try {
      const response = await fetch(`/api/admin/subjects?id=${subject.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        await fetchSubjects();
        onRefresh?.();
        alert('Subject deleted successfully!');
      } else {
        alert(data.error || 'Failed to delete subject');
      }
    } catch (error) {
      console.error('Error deleting subject:', error);
      alert('Error deleting subject');
    }
  };

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setFormName(subject.name);
    setFormDescription(subject.description || "");
    setIsCreateModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsCreateModalOpen(false);
    setEditingSubject(null);
    setFormName("");
    setFormDescription("");
  };

  const handleClose = () => {
    handleCloseForm();
    setSelectedSubjects(new Set());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Manage Subjects</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto min-h-0">
          {/* Action Buttons */}
          <div className="mb-6 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Subject
              </button>
              
              {subjects.length > 0 && selectedSubjects.size === 0 && (
                <p className="text-sm text-gray-500">Click subjects to select multiple for bulk delete</p>
              )}
            </div>

            {/* Bulk Actions */}
            {selectedSubjects.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  {selectedSubjects.size} selected
                </span>
                <button
                  onClick={() => setSelectedSubjects(new Set())}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={formLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Selected
                </button>
              </div>
            )}
          </div>

          {/* Select All Option */}
          {selectedSubjects.size > 0 && subjects.length > 0 && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <button
                onClick={handleSelectAll}
                className="flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded hover:border-blue-500 transition-colors"
              >
                {selectedSubjects.size === subjects.length ? (
                  <Check className="w-3 h-3 text-blue-600" />
                ) : (
                  <div className="w-3 h-3"></div>
                )}
              </button>
              <label className="text-sm font-medium text-gray-700 cursor-pointer" onClick={handleSelectAll}>
                Select All ({selectedSubjects.size}/{subjects.length})
              </label>
            </div>
          )}

          {/* Subjects List */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-200 h-16 rounded-lg"></div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No subjects found. Create your first subject to get started.
                </div>
              ) : (
                subjects.map((subject) => (
                  <div key={subject.id} className="relative">
                    <div
                      className={`border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
                        selectedSubjects.has(subject.id) 
                          ? 'bg-blue-50 border-blue-300 shadow-sm' 
                          : 'hover:border-gray-300'
                      }`}
                      onClick={() => handleSelectSubject(subject.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3 flex-1">
                          {/* Selection Checkbox - Only visible when subject is selected or when any subjects are selected */}
                          <div
                            className={`flex items-center justify-center w-5 h-5 border-2 rounded transition-all mt-0.5 ${
                              selectedSubjects.has(subject.id) || selectedSubjects.size > 0
                                ? 'border-gray-300 hover:border-blue-500 opacity-100'
                                : 'border-transparent opacity-0'
                            }`}
                          >
                            {selectedSubjects.has(subject.id) ? (
                              <Check className="w-3 h-3 text-blue-600" />
                            ) : (
                              <div className="w-3 h-3"></div>
                            )}
                          </div>
                          
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{subject.name}</h3>
                            {subject.description && (
                              <p className="text-sm text-gray-600 mt-1">{subject.description}</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Action Buttons - Show when not selected */}
                        {!selectedSubjects.has(subject.id) && (
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(subject);
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                              title="Edit subject"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(subject);
                              }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                              title="Delete subject"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Subject Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                {editingSubject ? 'Edit Subject' : 'Create Subject'}
              </h3>
              <button
                onClick={handleCloseForm}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="subject-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Subject Name *
                </label>
                <input
                  id="subject-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter subject name"
                  required
                  disabled={formLoading}
                />
              </div>

              <div>
                <label htmlFor="subject-description" className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="subject-description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Enter subject description (optional)"
                  disabled={formLoading}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading || !formName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formLoading ? 'Saving...' : editingSubject ? 'Update Subject' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
