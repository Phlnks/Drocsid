import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  description?: string;
  inputLabel: string;
  placeholder?: string;
  submitText?: string;
}

export default function PromptModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  title, 
  description, 
  inputLabel, 
  placeholder, 
  submitText = 'Create' 
}: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (isOpen) setValue('');
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-zinc-800 rounded-xl w-full max-w-md p-6 shadow-xl border border-zinc-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        {description && <p className="text-zinc-400 text-sm mb-4">{description}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-xs font-bold text-zinc-300 uppercase mb-2">
              {inputLabel}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-950 rounded p-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder={placeholder}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-zinc-300 hover:underline">
              Cancel
            </button>
            <button type="submit" disabled={!value.trim()} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
