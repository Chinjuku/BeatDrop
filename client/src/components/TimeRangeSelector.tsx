import React, { useState, useEffect } from 'react';
import { Clock, Settings2, Sliders, X, Plus, Trash2, Check, RotateCcw } from 'lucide-react';
import {
  DEFAULT_TIME_STAGES,
  TIME_RANGE_PRESETS,
  TimeRangePresetId,
} from '../../../shared/types';

interface TimeRangeSelectorProps {
  currentPreset?: TimeRangePresetId;
  stages?: number[];
  onChangePreset: (presetId: TimeRangePresetId, stages: number[]) => void;
  compact?: boolean;
}

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  currentPreset = 'songspot',
  stages = DEFAULT_TIME_STAGES,
  onChangePreset,
  compact = false,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<number[]>(stages);
  const [rawCommaInput, setRawCommaInput] = useState<string>(stages.join(', '));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (modalOpen) {
      const init = stages.length >= 2 ? stages : DEFAULT_TIME_STAGES;
      setCustomDraft(init);
      setRawCommaInput(init.join(', '));
      setValidationError(null);
    }
  }, [modalOpen, stages]);

  const handleSelectPreset = (presetId: TimeRangePresetId) => {
    if (presetId === 'custom') {
      setModalOpen(true);
      return;
    }
    const preset = TIME_RANGE_PRESETS[presetId];
    if (preset) {
      onChangePreset(presetId, preset.stages);
    }
  };

  const handleApplyCustom = () => {
    // Parse from rawCommaInput or customDraft
    let parsed: number[] = rawCommaInput
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));

    if (parsed.length < 2) {
      setValidationError('ต้องระบุอย่างน้อย 2 ช่วงเวลา (เช่น 0.5, 1.5, 3, 6, 10)');
      return;
    }

    // Ensure all <= 15s and > 0
    const outOfBounds = parsed.some((n) => n <= 0 || n > 15);
    if (outOfBounds) {
      setValidationError('ช่วงเวลาต้องอยู่ระหว่าง 0.1s ถึงสูงสุด 15s');
      return;
    }

    // Auto sort ascending and deduplicate
    const sorted = Array.from(new Set(parsed)).sort((a, b) => a - b);
    if (sorted.length < 2) {
      setValidationError('ต้องมีค่าที่ไม่ซ้ำกันอย่างน้อย 2 ขั้น');
      return;
    }

    setValidationError(null);
    setModalOpen(false);
    onChangePreset('custom', sorted);
  };

  const handleSliderChange = (index: number, value: number) => {
    const updated = [...customDraft];
    updated[index] = Math.round(value * 10) / 10;
    // Keep sorted
    const sorted = [...updated].sort((a, b) => a - b);
    setCustomDraft(sorted);
    setRawCommaInput(sorted.join(', '));
    setValidationError(null);
  };

  const handleAddStage = () => {
    if (customDraft.length >= 8) {
      setValidationError('สูงสุด 8 ขั้น');
      return;
    }
    const last = customDraft[customDraft.length - 1] || 5;
    const nextVal = Math.min(15, Math.round((last + 2) * 10) / 10);
    const updated = [...customDraft, nextVal];
    const sorted = Array.from(new Set(updated)).sort((a, b) => a - b);
    setCustomDraft(sorted);
    setRawCommaInput(sorted.join(', '));
    setValidationError(null);
  };

  const handleRemoveStage = (index: number) => {
    if (customDraft.length <= 2) {
      setValidationError('ต้องมีอย่างน้อย 2 ขั้น');
      return;
    }
    const updated = customDraft.filter((_, idx) => idx !== index);
    setCustomDraft(updated);
    setRawCommaInput(updated.join(', '));
    setValidationError(null);
  };

  const handleTemplateSelect = (templateStages: number[]) => {
    setCustomDraft(templateStages);
    setRawCommaInput(templateStages.join(', '));
    setValidationError(null);
  };

  const PRESETS: Array<{
    id: TimeRangePresetId;
    label: string;
    sub: string;
    tooltip: string;
  }> = [
    {
      id: 'relaxed',
      label: 'Relaxed',
      sub: '3s → 15s',
      tooltip: 'Easy / Relaxed (3s → 5s → 10s → 15s)',
    },
    {
      id: 'standard',
      label: 'Standard',
      sub: '1s → 15s',
      tooltip: 'Standard (1s → 2s → 4s → 8s → 15s)',
    },
    {
      id: 'songspot',
      label: 'Songspot',
      sub: '0.5s → 10s',
      tooltip: 'Songspot Default (0.5s → 1.5s → 3s → 6s → 10s)',
    },
    {
      id: 'custom',
      label: 'Custom',
      sub: currentPreset === 'custom' ? `${stages[0]}s → ${stages[stages.length - 1]}s` : 'กำหนดเอง',
      tooltip: 'Custom Clip Stages (สูงสุด 15 วินาที)',
    },
  ];

  return (
    <>
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
        <div
          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider shrink-0 mr-0.5"
          style={{ color: 'var(--song-muted)' }}
          title="ตัวเลือกช่วงเวลาเสียงตัวอย่าง (Clip Duration Stages)"
        >
          <Clock className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} />
          <span>Time Range:</span>
        </div>

        <div className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap">
          {PRESETS.map((p) => {
            const isSelected = currentPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (p.id === 'custom' && isSelected) {
                    setModalOpen(true);
                  } else {
                    handleSelectPreset(p.id);
                  }
                }}
                title={p.tooltip}
                className={`group relative px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 border whitespace-nowrap ${
                  isSelected ? 'shadow-sm' : 'hover:brightness-110'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: 'var(--song-accent)',
                        borderColor: 'var(--song-accent)',
                        color: 'var(--song-accent-on)',
                      }
                    : {
                        backgroundColor: 'color-mix(in srgb, var(--song-surface-soft) 80%, transparent)',
                        borderColor: 'var(--song-border)',
                        color: 'var(--song-text)',
                      }
                }
              >
                <span>{p.label}</span>
                <span
                  className="text-[10px] opacity-75 font-mono hidden md:inline"
                  style={{
                    color: isSelected ? 'inherit' : 'var(--song-muted)',
                  }}
                >
                  ({p.sub})
                </span>
                {p.id === 'custom' && (
                  <Settings2
                    className={`w-3 h-3 ${isSelected ? 'opacity-100' : 'opacity-60'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalOpen(true);
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Stages Configuration Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto overflow-x-hidden animate-in fade-in duration-200">
          <div
            className="m-auto w-full max-w-[94vw] sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-2xl border p-5 sm:p-6 shadow-2xl flex flex-col gap-4 relative my-auto animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5" style={{ color: 'var(--song-accent-text)' }} />
                  <h3 className="text-base font-extrabold tracking-wide">
                    กำหนดช่วงเวลาเสียงตัวอย่าง (Custom Stages)
                  </h3>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--song-muted)' }}>
                  ปรับความยาวเสียงในแต่ละขั้นตอน (วินาที) คั่นด้วยจุลภาค (,) หรือปรับ slider (สูงสุด 15s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg border hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-muted)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Templates */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--song-muted)' }}>
                เทมเพลตด่วน (Quick Presets):
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleTemplateSelect([0.5, 2, 6, 8, 15])}
                  className="px-2.5 py-1 rounded-lg border text-xs font-semibold hover:border-[var(--song-accent)] transition-all"
                  style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                >
                  Default (0.5s → 15s)
                </button>
                <button
                  type="button"
                  onClick={() => handleTemplateSelect([1, 2, 4, 8, 15])}
                  className="px-2.5 py-1 rounded-lg border text-xs font-semibold hover:border-[var(--song-accent)] transition-all"
                  style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                >
                  Standard (1s → 15s)
                </button>
                <button
                  type="button"
                  onClick={() => handleTemplateSelect([3, 5, 10, 15])}
                  className="px-2.5 py-1 rounded-lg border text-xs font-semibold hover:border-[var(--song-accent)] transition-all"
                  style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                >
                  Relaxed (3s → 15s)
                </button>
                <button
                  type="button"
                  onClick={() => handleTemplateSelect([0.2, 0.5, 1.2, 3, 6])}
                  className="px-2.5 py-1 rounded-lg border text-xs font-semibold hover:border-[var(--song-accent)] transition-all"
                  style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                >
                  Pro (0.2s → 6s)
                </button>
              </div>
            </div>

            {/* Comma-Separated Input */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--song-muted)' }}>
                ใส่ตัวเลขคั่นด้วย comma:
              </label>
              <input
                type="text"
                value={rawCommaInput}
                onChange={(e) => {
                  setRawCommaInput(e.target.value);
                  const parsed = e.target.value
                    .split(',')
                    .map((s) => parseFloat(s.trim()))
                    .filter((n) => !isNaN(n) && n > 0 && n <= 15);
                  if (parsed.length >= 2) {
                    setCustomDraft(Array.from(new Set(parsed)).sort((a, b) => a - b));
                  }
                  setValidationError(null);
                }}
                placeholder="เช่น 0.5, 1.5, 3, 6, 10"
                className="w-full px-3 py-2 rounded-xl border text-sm font-mono focus:outline-none focus:border-[var(--song-accent)]"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              />
            </div>

            {/* Stage Sliders List */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
                <span>ปรับค่าแต่ละขั้น ({customDraft.length} ขั้น):</span>
                {customDraft.length < 8 && (
                  <button
                    type="button"
                    onClick={handleAddStage}
                    className="flex items-center gap-1 text-[11px] font-bold hover:underline"
                    style={{ color: 'var(--song-accent-text)' }}
                  >
                    <Plus className="w-3.5 h-3.5" /> เพิ่มสเตจ
                  </button>
                )}
              </div>

              {customDraft.map((sec, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                  }}
                >
                  <span className="text-xs font-bold w-12 shrink-0" style={{ color: 'var(--song-muted)' }}>
                    ขั้นที่ {idx + 1}
                  </span>
                  <input
                    type="range"
                    min="0.1"
                    max="15.0"
                    step="0.1"
                    value={sec}
                    onChange={(e) => handleSliderChange(idx, parseFloat(e.target.value))}
                    className="flex-1 accent-[var(--song-accent)] cursor-pointer"
                  />
                  <span
                    className="text-xs font-mono font-extrabold w-12 text-right shrink-0"
                    style={{ color: 'var(--song-accent-text)' }}
                  >
                    {sec}s
                  </span>
                  {customDraft.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveStage(idx)}
                      className="p-1 text-red-400 hover:text-red-300 transition-colors"
                      title="ลบขั้นนี้"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Live Progress Preview */}
            <div className="p-3 rounded-xl border space-y-1.5" style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
                ตัวอย่างแถบเวลาที่จะแสดงในเกม:
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${customDraft.length}, minmax(0, 1fr))` }}>
                {customDraft.map((sec, idx) => (
                  <div
                    key={idx}
                    className="py-1 px-1 rounded-lg border text-center text-[10px] font-mono font-bold"
                    style={{
                      backgroundColor: idx === 0 ? 'var(--song-accent)' : 'var(--song-surface)',
                      borderColor: 'var(--song-border)',
                      color: idx === 0 ? 'var(--song-accent-on)' : 'var(--song-text)',
                    }}
                  >
                    {sec}s
                  </div>
                ))}
              </div>
            </div>

            {/* Validation Error Message */}
            {validationError && (
              <div className="text-xs font-semibold text-red-400 bg-red-950/40 border border-red-800/60 px-3 py-2 rounded-xl">
                ⚠️ {validationError}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--song-border)]">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border text-xs font-bold hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-muted)',
                }}
              >
                ยกเลิก (Cancel)
              </button>
              <button
                type="button"
                onClick={handleApplyCustom}
                className="px-5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 hover:brightness-110 transition-all shadow-md"
                style={{
                  backgroundColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }}
              >
                <Check className="w-3.5 h-3.5" />
                บันทึกและเริ่มเล่น (Save & Apply)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

