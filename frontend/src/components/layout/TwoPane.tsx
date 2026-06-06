import { LeftPane } from './LeftPane';
import { RightPane } from './RightPane';

const demoSteps = [
  'Load profile',
  'Annotate context',
  'Approve updates',
  'Paste job URL',
];

export function TwoPane() {
  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-bg text-ink">
      <header className="border-b border-border bg-bg px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
                co
              </span>
              <div>
                <h1 className="text-xl font-bold leading-tight">career-ops</h1>
                <p className="text-sm text-muted">Onboard a job-search agent that knows your context.</p>
              </div>
            </div>
          </div>

          <nav
            aria-label="Demo flow"
            className="flex flex-wrap items-center gap-1.5 text-sm text-muted"
          >
            {demoSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-1.5">
                <span
                  className={
                    index === 0
                      ? 'rounded-full bg-primary-subtle px-2.5 py-1 font-medium text-primary'
                      : 'rounded-full bg-surface px-2.5 py-1 font-medium text-muted'
                  }
                >
                  {step}
                </span>
                {index < demoSteps.length - 1 && (
                  <span aria-hidden="true" className="text-border">/</span>
                )}
              </div>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 grid-cols-1 overflow-auto lg:grid-cols-[minmax(360px,0.92fr)_minmax(440px,1.08fr)] lg:overflow-hidden">
        <LeftPane />
        <RightPane />
      </main>
    </div>
  );
}
