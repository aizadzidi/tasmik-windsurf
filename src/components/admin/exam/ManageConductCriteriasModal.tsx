"use client";
import React, { useState, useEffect } from "react";
import { X, Plus, Edit, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

interface ConductCriteria {
  id: string;
  name: string;
  description?: string;
  max_score: number;
}

interface ManageConductCriteriasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function ManageConductCriteriasModal({
  isOpen,
  onClose,
  onRefresh
}: ManageConductCriteriasModalProps) {
  const [criterias, setCriterias] = useState<ConductCriteria[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState<ConductCriteria | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMaxScore, setFormMaxScore] = useState("100");
  const [formLoading, setFormLoading] = useState(false);

  // Fetch conduct criteria
  const fetchCriterias = async () => {
    setLoading(true);
    try {
      const response = await authFetch('/api/admin/conduct-criterias');
      const data = await response.json();
      
      if (data.success) {
        setCriterias(data.criterias);
      } else {
        console.error('Failed to fetch conduct criteria:', data.error);
      }
    } catch (error) {
      console.error('Error fetching conduct criteria:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load criteria when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCriterias();
    }
  }, [isOpen]);

  // Handle create/edit form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const maxScore = parseInt(formMaxScore);
    if (isNaN(maxScore) || maxScore < 1 || maxScore > 1000) {
      alert('Max score must be between 1 and 1000');
      return;
    }

    setFormLoading(true);
    try {
      const isEditing = !!editingCriteria;
      const url = isEditing ? `/api/admin/conduct-criterias?id=${editingCriteria.id}` : '/api/admin/conduct-criterias';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim() || null,
          max_score: maxScore,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchCriterias();
        onRefresh?.();
        handleCloseForm();
        alert(isEditing ? 'Conduct criteria updated successfully!' : 'Conduct criteria created successfully!');
      } else {
        alert(data.error || 'Failed to save conduct criteria');
      }
    } catch (error) {
      console.error('Error saving conduct criteria:', error);
      alert('Error saving conduct criteria');
    } finally {
      setFormLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async (criteria: ConductCriteria) => {
    if (!confirm(`Are you sure you want to delete "${criteria.name}"?`)) return;

    try {
      const response = await authFetch(`/api/admin/conduct-criterias?id=${criteria.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        await fetchCriterias();
        onRefresh?.();
        alert('Conduct criteria deleted successfully!');
      } else {
        alert(data.error || 'Failed to delete conduct criteria');
      }
    } catch (error) {
      console.error('Error deleting conduct criteria:', error);
      alert('Error deleting conduct criteria');
    }
  };

  const handleEdit = (criteria: ConductCriteria) => {
    setEditingCriteria(criteria);
    setFormName(criteria.name);
    setFormDescription(criteria.description || "");
    setFormMaxScore(criteria.max_score.toString());
    setIsCreateModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsCreateModalOpen(false);
    setEditingCriteria(null);
    setFormName("");
    setFormDescription("");
    setFormMaxScore("100");
  };

  const handleClose = () => {
    handleCloseForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Manage Conduct Criteria</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto min-h-0">
          {/* Add Criteria Button */}
          <div className="mb-6">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Conduct Criteria
            </button>
          </div>

          {/* Criteria List */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-200 h-20 rounded-lg"></div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {criterias.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No conduct criteria found. Create your first criteria to get started.
                </div>
              ) : (
                criterias.map((criteria) => (
                  <div
                    key={criteria.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">{criteria.name}</h3>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            Max: {criteria.max_score}
                          </span>
                        </div>
                        {criteria.description && (
                          <p className="text-sm text-gray-600">{criteria.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleEdit(criteria)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                          title="Edit criteria"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(criteria)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete criteria"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Criteria Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                {editingCriteria ? 'Edit Conduct Criteria' : 'Create Conduct Criteria'}
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
                <label htmlFor="criteria-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Criteria Name *
                </label>
                <input
                  id="criteria-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter criteria name"
                  required
                  disabled={formLoading}
                />
              </div>

              <div>
                <label htmlFor="criteria-description" className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="criteria-description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  rows={3}
                  placeholder="Enter criteria description (optional)"
                  disabled={formLoading}
                />
              </div>

              <div>
                <label htmlFor="criteria-max-score" className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Score *
                </label>
                <input
                  id="criteria-max-score"
                  type="number"
                  min="1"
                  max="1000"
                  value={formMaxScore}
                  onChange={(e) => setFormMaxScore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="100"
                  required
                  disabled={formLoading}
                />
                <p className="text-xs text-gray-500 mt-1">Value between 1 and 1000</p>
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
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formLoading ? 'Saving...' : editingCriteria ? 'Update Criteria' : 'Create Criteria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
