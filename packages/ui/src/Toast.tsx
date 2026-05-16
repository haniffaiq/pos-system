type Tone = "primary" | "secondary" | "accent";
const tones: Record<Tone, string> = { primary: "bg-primary", secondary: "bg-secondary", accent: "bg-accent" };

export function Toast({ tone = "primary", message }: { tone?: Tone; message: string }) {
  return (
    <div role="status" aria-live="polite" className={`fixed bottom-4 right-4 z-50 border-2 border-fg rounded-md shadow-brutal px-4 py-2 font-display font-bold text-fg ${tones[tone]}`}>
      {message}
    </div>
  );
}
