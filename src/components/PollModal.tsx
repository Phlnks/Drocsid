import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { question: string, options: string[], multipleChoices: boolean, anonymous: boolean }) => void;
  initialData?: {
    question: string;
    options: string[];
    multipleChoices?: boolean;
    anonymous?: boolean;
  };
}

export default function PollModal({ isOpen, onClose, onSubmit, initialData }: PollModalProps) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState(initialData?.question || '');
  const [options, setOptions] = useState(initialData?.options || ['', '']);
  const [multipleChoices, setMultipleChoices] = useState(initialData?.multipleChoices || false);
  const [anonymous, setAnonymous] = useState(initialData?.anonymous || false);

  const [resetVotes, setResetVotes] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      setQuestion(initialData.question);
      setOptions(initialData.options);
      setMultipleChoices(initialData.multipleChoices || false);
      setAnonymous(initialData.anonymous || false);
      setResetVotes(false);
    } else if (isOpen && !initialData) {
      setQuestion('');
      setOptions(['', '']);
      setMultipleChoices(false);
      setAnonymous(false);
      setResetVotes(false);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const filteredOptions = options.map(o => o.trim()).filter(o => o !== '');
    if (filteredOptions.length < 2) return;
    
    onSubmit({
      question: question.trim(),
      options: filteredOptions,
      multipleChoices,
      anonymous,
      resetVotes: initialData ? resetVotes : false
    } as any);
    
    setQuestion('');
    setOptions(['', '']);
    setMultipleChoices(false);
    setAnonymous(false);
    setResetVotes(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">
            {initialData ? t('chatArea.editMessage') : t('polls.createPoll')}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              {t('polls.question')}
            </label>
            <input
              autoFocus
              type="text"
              placeholder={t('polls.questionPlaceholder')}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-zinc-600"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              {t('polls.options')}
            </label>
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('polls.optionPlaceholder', { index: index + 1 })}
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  className="flex-1 bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-zinc-700 text-sm"
                  required={index < 2}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(index)}
                    className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            
            {options.length < 10 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors p-1"
              >
                <Plus className="w-4 h-4" />
                {t('polls.addOption')}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={multipleChoices}
                onChange={(e) => setMultipleChoices(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
              />
              <span className="text-sm text-zinc-300 group-hover:text-zinc-200 transition-colors">{t('polls.multipleResponses')}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
              />
              <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">{t('polls.anonymousPoll')}</span>
            </label>
            {initialData && (
              <label className="flex items-center gap-3 cursor-pointer group mt-2 pt-2 border-t border-zinc-800">
                <input 
                  type="checkbox" 
                  checked={resetVotes}
                  onChange={(e) => setResetVotes(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-red-500 focus:ring-red-500"
                />
                <span className="text-sm text-red-400 group-hover:text-red-300 transition-colors font-medium">{t('polls.resetVotes')}</span>
              </label>
            )}
          </div>

          <div className="pt-2 flex flex-col gap-3">
             <button
              type="submit"
              disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
              className="w-full bg-indigo-600 text-white rounded-md py-2.5 font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {initialData ? t('modals.userSettings.saveChanges') : t('polls.sendPoll')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-zinc-800 text-zinc-300 rounded-md py-2.5 font-medium hover:bg-zinc-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
