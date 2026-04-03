type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  loading?: boolean;
};

const ConfirmModal = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
}: ConfirmModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-(--color-primary)/25 bg-(--color-surface) p-4 shadow-lg">
        <h3 className="text-lg font-semibold text-(--color-primary)">{title}</h3>
        <p className="mt-2 text-sm text-(--color-primary)/80">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-(--color-primary)/30 px-3 py-2 text-sm text-(--color-primary)/85 hover:bg-(--color-cream)"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              destructive
                ? 'bg-(--color-primary) hover:bg-(--color-primary)/90'
                : 'bg-(--color-primary) hover:bg-(--color-primary)/90'
            }`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

