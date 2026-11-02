export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-bad/25 bg-bad-tint px-3 py-2 text-sm font-medium text-bad">
      {message}
    </p>
  );
}
