// Links zu Datenschutzerklärung und Nutzungsbedingungen (statische Seiten unter public/, ohne Anmeldung und offline erreichbar).
export function RechtLinks({ className = 'rechtlinks' }: { className?: string }) {
  const basis = import.meta.env.BASE_URL
  return (
    <p className={`neben ${className}`}>
      <a href={`${basis}datenschutz.html`}>Datenschutzerklärung</a>
      {' · '}
      <a href={`${basis}nutzungsbedingungen.html`}>Nutzungsbedingungen</a>
    </p>
  )
}
