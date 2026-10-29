export function StudyLoadError({ error }: { error: unknown }) {
  return (
    <div role="alert" className="p-8 space-y-3 text-center">
      <p className="text-destructive">
        {error instanceof Error ? error.message : "Não foi possível carregar o material do seu curso."}
      </p>
      <button type="button" onClick={() => window.location.reload()}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Tentar novamente
      </button>
    </div>
  );
}
