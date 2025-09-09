"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Award, Save } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface GradingSystem {
  id: string;
  name: string;
  description: string | null;
  grading_scale: {
    type: 'letter' | 'percentage' | 'pass_fail';
    grades: Array<{
      letter?: string;
      grade?: string;
      min: number;
      max: number;
      gpa?: number;
    }>;
  };
  is_default: boolean;
  created_at: string;
}

interface ManageGradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

interface GradeEntry {
  letter?: string;
  grade?: string;
  min: number;
  max: number;
  gpa?: number;
}

interface CreateGradingForm {
  name: string;
  description: string;
  type: 'letter' | 'percentage' | 'pass_fail';
  grades: GradeEntry[];
}

export default function ManageGradingModal({ isOpen, onClose, onRefresh }: ManageGradingModalProps) {
  const [gradingSystems, setGradingSystems] = useState<GradingSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSystem, setEditingSystem] = useState<GradingSystem | null>(null);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CreateGradingForm>({
    name: '',
    description: '',
    type: 'letter',
    grades: [{ letter: '', min: 0, max: 100 }]
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (isOpen) {
      fetchGradingSystems();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  const fetchGradingSystems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('grading_systems')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      setGradingSystems(data || []);

      // Fetch usage counts from exams table
      const { data: exData, error: exErr } = await supabase
        .from('exams')
        .select('id, grading_system_id');
      if (exErr) throw exErr;
      const counts: Record<string, number> = {};
      const examRows = (exData || []) as Array<{ id: string; grading_system_id: string | null }>;
      examRows.forEach((e) => {
        const key = e.grading_system_id;
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      });
      setUsageCounts(counts);
    } catch (error) {
      console.error('Error fetching grading systems:', error);
    } finally {
      setLoading(false);
    }
  };

  const populateFormFromSystem = (system: GradingSystem) => {
    const type = system.grading_scale.type;
    const grades: GradeEntry[] = system.grading_scale.grades.map((g) => ({
      letter: g.letter,
      grade: g.grade,
      min: g.min,
      max: g.max,
      gpa: g.gpa,
    }));

    setCreateForm({
      name: system.name,
      description: system.description || '',
      type,
      grades,
    });
  };

  const validateGrades = (grades: GradeEntry[]): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Optional: normalize by sorting by min asc
    const sorted = grades.slice().sort((a, b) => a.min - b.min);

    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];

      // Bounds and min/max
      if (g.min < 0 || g.max > 100) newErrors[`grade_${i}`] = 'Scores must be between 0 and 100';
      if (g.min >= g.max) newErrors[`grade_${i}`] = 'Min score must be less than max score';

      // Required labels
      if (createForm.type === 'letter' && !g.letter?.trim()) newErrors[`grade_${i}`] = 'Letter is required';
      if (createForm.type !== 'letter' && !g.grade?.trim()) newErrors[`grade_${i}`] = 'Label is required';

      // Overlap with next ranges only (sorted) - standard overlap check
      if (i < sorted.length - 1) {
        const n = sorted[i + 1];
        if (g.min <= n.max && g.max >= n.min) {
          newErrors[`grade_${i}`] = 'Score ranges cannot overlap';
          newErrors[`grade_${i + 1}`] = 'Score ranges cannot overlap';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateSubmit = async () => {
    if (!createForm.name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }

    if (!validateGrades(createForm.grades)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/grading-systems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
          grading_scale: {
            type: createForm.type,
            grades: createForm.grades,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to create grading system');
      }

      setShowCreateForm(false);
      setCreateForm({
        name: '',
        description: '',
        type: 'letter',
        grades: [{ letter: '', min: 0, max: 100 }]
      });
      setErrors({});
      fetchGradingSystems();
    } catch (error) {
      console.error('Error creating grading system:', error);
      setErrors({ general: 'Failed to create grading system' });
    }
  };

  const handleEditSubmit = async () => {
    if (!createForm.name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }

    if (!validateGrades(createForm.grades)) {
      return;
    }

    try {
      if (!editingSystem) return;
      const usedBy = usageCounts[editingSystem.id] || 0;
      if (usedBy > 0) {
        const confirmed = confirm(`This grading system is used by ${usedBy} exam(s). Changes will affect existing results/grades. Continue?`);
        if (!confirmed) return;
      }
      const res = await fetch(`/api/admin/grading-systems?id=${editingSystem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
          grading_scale: {
            type: createForm.type,
            grades: createForm.grades,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to update grading system');
      }

      // Best-effort: trigger targeted grade recalculation if RPC exists and show a toast-like banner
      let bannerText = 'Grading system updated';
      try {
        const { data: recalcCount } = await supabase.rpc('recalc_grades_for_grading_system', { p_grading_system_id: editingSystem.id });
        if (typeof recalcCount === 'number') {
          bannerText = `Updated grading system · Recalculated ${recalcCount} result${recalcCount === 1 ? '' : 's'}`;
        }
      } catch {
        console.warn('Recalc RPC unavailable or failed; grades will update on next result change.');
      }

      setEditingSystem(null);
      setErrors({});
      setBanner(bannerText);
      fetchGradingSystems();
    } catch (error) {
      console.error('Error updating grading system:', error);
      setErrors({ general: 'Failed to update grading system' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the grading system "${name}"?`)) {
      try {
        const res = await fetch(`/api/admin/grading-systems?id=${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'Failed to delete grading system');
        }
        fetchGradingSystems();
      } catch (error) {
        console.error('Error deleting grading system:', error);
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('in use')) {
          alert('Cannot delete grading system: it is used by one or more exams.');
        } else {
          alert('Failed to delete grading system. It may be in use by existing exams.');
        }
      }
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      // Use atomic RPC to avoid transient states where no default exists
      const { error } = await supabase.rpc('set_default_grading_system', { p_id: id });

      if (error) throw error;
      fetchGradingSystems();
    } catch (error) {
      console.error('Error setting default grading system:', error);
    }
  };

  const addGrade = () => {
    setCreateForm(prev => ({
      ...prev,
      grades: [...prev.grades, { 
        letter: prev.type === 'letter' ? '' : undefined,
        grade: prev.type !== 'letter' ? '' : undefined,
        min: 0, 
        max: 100 
      }]
    }));
  };

  const removeGrade = (index: number) => {
    setCreateForm(prev => ({
      ...prev,
      grades: prev.grades.filter((_, i) => i !== index)
    }));
  };

  const updateGrade = (index: number, field: keyof GradeEntry, value: string | number) => {
    setCreateForm(prev => ({
      ...prev,
      grades: prev.grades.map((grade, i) => 
        i === index ? { ...grade, [field]: value } : grade
      )
    }));
    
    // Clear errors when user starts typing
    if (errors[`grade_${index}`]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`grade_${index}`];
        return newErrors;
      });
    }
  };

  const renderGradeForm = () => {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Grading System Name *
            </label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="e.g., Standard Letter Grades"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Type
            </label>
            <select
              value={createForm.type}
              onChange={(e) => setCreateForm(prev => ({ 
                ...prev, 
                type: e.target.value as 'letter' | 'percentage' | 'pass_fail',
                grades: [{ 
                  letter: e.target.value === 'letter' ? '' : undefined,
                  grade: e.target.value !== 'letter' ? '' : undefined,
                  min: 0, 
                  max: 100 
                }]
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="letter">Letter Grades (A, B, C...)</option>
              <option value="percentage">Percentage System</option>
              <option value="pass_fail">Pass/Fail</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={createForm.description}
            onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="Optional description of this grading system"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-semibold text-gray-700">
              Grade Ranges
            </label>
            <button
              type="button"
              onClick={addGrade}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Grade
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {createForm.grades.map((grade, index) => (
              <div key={index} className={`flex items-center gap-2 p-2 border rounded ${
                errors[`grade_${index}`] ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}>
                {createForm.type === 'letter' ? (
                  <input
                    type="text"
                    value={grade.letter || ''}
                    onChange={(e) => updateGrade(index, 'letter', e.target.value)}
                    className="w-16 px-2 py-1 border rounded text-center"
                    placeholder="A+"
                  />
                ) : (
                  <input
                    type="text"
                    value={grade.grade || ''}
                    onChange={(e) => updateGrade(index, 'grade', e.target.value)}
                    className="w-24 px-2 py-1 border rounded text-center"
                    placeholder="Excellent"
                  />
                )}
                
                <input
                  type="number"
                  value={grade.min}
                  onChange={(e) => updateGrade(index, 'min', parseInt(e.target.value) || 0)}
                  className="w-16 px-2 py-1 border rounded text-center"
                  placeholder="Min"
                  min="0"
                  max="100"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="number"
                  value={grade.max}
                  onChange={(e) => updateGrade(index, 'max', parseInt(e.target.value) || 100)}
                  className="w-16 px-2 py-1 border rounded text-center"
                  placeholder="Max"
                  min="0"
                  max="100"
                />

                {createForm.type === 'letter' && (
                  <input
                    type="number"
                    step="0.1"
                    value={grade.gpa || ''}
                    onChange={(e) => updateGrade(index, 'gpa', parseFloat(e.target.value) || 0)}
                    className="w-16 px-2 py-1 border rounded text-center"
                    placeholder="GPA"
                    min="0"
                    max="4"
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeGrade(index)}
                  className="p-1 text-red-500 hover:bg-red-100 rounded"
                  disabled={createForm.grades.length === 1}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          {errors.general && <p className="text-red-500 text-xs mt-1">{errors.general}</p>}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10001] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Award className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Manage Grading Systems</h2>
              <p className="text-sm text-gray-600">Create and manage grading scales for your exams</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!showCreateForm && !editingSystem ? (
            <div className="p-6">
              {banner && (
                <div className="mb-4 p-3 rounded-lg border border-green-200 bg-green-50 text-green-700">
                  {banner}
                </div>
              )}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Existing Grading Systems</h3>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create New
                </button>
              </div>

              {loading ? (
                <div className="animate-pulse space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {gradingSystems.map((system) => (
                    <div key={system.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900">{system.name}</h4>
                    {system.is_default && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Default
                      </span>
                    )}
                    {!!usageCounts[system.id] && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                        Used by {usageCounts[system.id]} exam{usageCounts[system.id] === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                          {system.description && (
                            <p className="text-sm text-gray-600 mb-2">{system.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {system.grading_scale.grades.map((grade, index) => (
                              <span key={index} className="inline-flex items-center px-2 py-1 bg-white border rounded text-xs">
                                {grade.letter || grade.grade}: {grade.min}-{grade.max}%
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {!system.is_default && (
                            <button
                              onClick={() => handleSetDefault(system.id)}
                              className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setShowCreateForm(false);
                              setEditingSystem(system);
                              populateFormFromSystem(system);
                              setErrors({});
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                            title="Edit grading system"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {(() => {
                            const usedBy = usageCounts[system.id] || 0;
                            const disabled = usedBy > 0;
                            return (
                              <button
                                onClick={() => !disabled && handleDelete(system.id, system.name)}
                                disabled={disabled}
                                aria-disabled={disabled}
                                title={disabled ? `Cannot delete: used by ${usedBy} exam${usedBy === 1 ? '' : 's'}` : 'Delete grading system'}
                                className={`p-2 rounded transition-colors ${
                                  disabled ? 'text-red-300 cursor-not-allowed' : 'text-red-500 hover:bg-red-100'
                                }`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingSystem ? 'Edit Grading System' : 'Create New Grading System'}
                </h3>
                <button
                  onClick={() => {
                    if (editingSystem) {
                      setEditingSystem(null);
                    } else {
                      setShowCreateForm(false);
                    }
                    setCreateForm({
                      name: '',
                      description: '',
                      type: 'letter',
                      grades: [{ letter: '', min: 0, max: 100 }]
                    });
                    setErrors({});
                  }}
                  className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>

              {renderGradeForm()}

              {editingSystem && (
                <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                  <strong>Heads up:</strong> {usageCounts[editingSystem.id] ? `This grading system is used by ${usageCounts[editingSystem.id]} exam(s). ` : ''}
                  Editing ranges could change computed grades for existing results.
                </div>
              )}

              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                {editingSystem ? (
                  <button
                    onClick={handleEditSubmit}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                ) : (
                  <button
                    onClick={handleCreateSubmit}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Create Grading System
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
